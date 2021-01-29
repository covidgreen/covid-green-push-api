const crypto = require('crypto')
const cryptoRandomString = require('crypto-random-string')
const fetch = require('node-fetch')
const fp = require('fastify-plugin')
const phone = require('phone')
const schema = require('./schema')
const util = require('util')
const { BadRequest } = require('http-errors')
const { SQS } = require('aws-sdk')
const { addMinutes, subHours, format } = require('date-fns')
const { metricsInsert } = require('../metrics/query')
const { verificationInsert } = require('./query')

/**
 * This endpoint allows the caller to request a verification code and share that code
 * with the end user. This is called by a contact tracer when a user has tested
 * positive for Covid and the tracer is asking that user to upload their TEKs to the
 * system. The verification code generated in this endpoint is the first step of
 * sharing TEKs.
 *
 * If a mobile number is provided then this endpoint will also add a message to the
 * SQS queue requesting that this verification code be sent via SMS to the mobile
 * number provided in input.
 *
 * Upon a request this endpoint will
 * 1. If a mobile is provided it will be parsed
 * 2. Generate a verification code and save it to the database
 * 3. If a mobile is provided a message will be added to the SQS queue to initiate an
 *    SMS to the provided mobile number. If unable to post to the SQS queue the code
 *    will still be returned but with smsSent = false
 * 4. A response of { code, smsSent: true/false} will be returned to the caller
 *
 * Metrics Written:
 *  SMS_FAIL: Valid mobile provided but failure adding to the SQS queue
 *  VERIFICATION_CODE_GENERATED: generated and returned verification code
 *  VERIFICATION_CODE_FAIL: unhandled error, verification code not returned
 *
 * Responses:
 *  200: Code generated and SMS potentially sent
 *       {
 *         "code": "verification_code",
 *         "error": "description of potential error",
 *         "expiresAt": "timestamp of when code expires, eg 2020-08-21T18:48:26.862Z"
 *         "expiresAtTimestamp: Unix timestamp of expiration, eg 1598035706
 *         "smsSent": true/false
 *       }
 *  400: Bad request including invalid mobile number
 *  500: Internal error
 */
async function notify(server, options, done) {
  const sqs = new SQS({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
  })

  const randomBytes = util.promisify(crypto.randomBytes)

  const encrypt = async value => {
    const key = Buffer.from(options.security.encryptKey)
    const iv = await randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    const buffer = cipher.update(value.toString())
    const encrypted = Buffer.concat([buffer, cipher.final()])
    return `${iv.toString('hex')}${encrypted.toString('hex')}`
  }

  const hash = value => {
    const sha512 = crypto.createHash('sha512')
    const data = sha512.update(value, 'utf8')

    return data.digest('hex')
  }

  const writeMetric = async (log, event) => {
    try {
      await server.pg.write.query(
        metricsInsert({
          event,
          os: 'push',
          version: '',
          timeZone: options.timeZone
        })
      )
    } catch (error) {
      log.error(`Failure writing metric ${event}`, error)
    }
  }

  const parsePhone = async (log, phoneNumber) => {
    let value = phoneNumber
    let region = ''

    if (value.substr(0, 2) === '00') {
      value = `+${value.substr(2)}`
    } else if (value.substr(0, 1) === '0') {
      region = options.sms.defaultCountryCode
    } else if (value.substr(0, 1) !== '+') {
      for (const country of phone.iso3166_data) {
        if (
          value.substr(0, country.country_code.length) === country.country_code
        ) {
          value = `+${value}`
          break
        }
      }
    }

    const result = phone(value, region)

    if (!result || result.length === 0) {
      throw new BadRequest('Invalid mobile')
    }

    return result[0]
  }

  const sendSms = async (
    log,
    code,
    parsedMobile,
    onsetDate,
    testDate,
    jobId
  ) => {
    if (jobId) {
      log.error({ jobId }, 'Posting message to SMS queue')
    } else {
      log.error('Posting message to SMS queue - unknown jobId')
    }

    try {
      const message = {
        QueueUrl: options.sms.queueUrl,
        MessageBody: JSON.stringify({
          code,
          mobile: parsedMobile,
          onsetDate,
          testDate,
          jobId,
          sendCount: 1
        })
      }

      await sqs.sendMessage(message).promise()

      return true
    } catch (error) {
      if (jobId) {
        log.error({ jobId }, 'Failed posting message to SMS queue')
      } else {
        log.error('Failed posting message to SMS queue - unknown jobId')
      }

      await writeMetric(log, 'SMS_FAIL')
      return false
    }
  }

  const generateVerificationCode = async (log, onsetDate, testType, mobile) => {
    try {
      const control = cryptoRandomString({
        length: Math.floor(options.sms.codeLength / 2),
        characters: options.sms.codeCharset
      })

      const random = cryptoRandomString({
        length: Math.ceil(options.sms.codeLength / 2),
        characters: options.sms.codeCharset
      })

      const code = `${control}${random}`
      let encryptedMobile = null
      if (options.sms.schedulingEnabled && mobile) {
        encryptedMobile = await encrypt(mobile)
      }

      await server.pg.write.query(
        verificationInsert({
          control: hash(control),
          code: hash(code),
          onsetDate,
          testType,
          mobile: encryptedMobile
        })
      )

      await writeMetric(log, 'VERIFICATION_CODE_GENERATED')
      return code
    } catch (error) {
      await writeMetric(log, 'VERIFICATION_CODE_FAIL')
      throw error
    }
  }

  const proxyRequest = async (response, path, body) => {
    const result = await fetch(`${options.issueProxy.url}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': options.issueProxy.apiKey
      },
      body: JSON.stringify(body)
    })

    response.status(result.status)

    return await result.json()
  }

  const handler = async (request, response) => {
    await request.authenticate(['push'])

    const {
      jobId,
      mobile,
      phone,
      onsetDate,
      symptomDate,
      testDate,
      testType
    } = request.body

    const resolvedPhone = mobile || phone || null
    const resolvedTestDate = testDate || null
    const resolvedTestType = testType || 'confirmed'

    const resolvedSymptomDate =
      onsetDate ||
      symptomDate ||
      (options.sms.useTestDateAsOnsetDate ? resolvedTestDate : null)

    if (options.sms.onsetDateMandatory && !resolvedSymptomDate) {
      throw new BadRequest('Onset date must be provided')
    }

    const offsetSymptomDate = resolvedSymptomDate
      ? subHours(new Date(resolvedSymptomDate), options.sms.symptomDateOffset)
      : null

    // If the mobile is provided but not valid a BadRequest will be thrown
    const parsedMobile = resolvedPhone
      ? await parsePhone(request.log, resolvedPhone)
      : null

    if (options.issueProxy.url !== '') {
      const result = await proxyRequest(response, '/api/issue', {
        phone: resolvedPhone,
        symptomDate: resolvedSymptomDate,
        testDate: resolvedTestDate,
        testType: resolvedTestType
      })

      await writeMetric(
        request.log,
        result.error ? 'VERIFICATION_CODE_FAIL' : 'VERIFICATION_CODE_GENERATED'
      )

      return result
    } else {
      const code = await generateVerificationCode(
        request.log,
        offsetSymptomDate,
        resolvedTestType,
        parsedMobile
      )
      const codeExpiration = addMinutes(new Date(), options.sms.codeLifetime)

      // Only try to send an SMS if the mobile value has been provided
      const smsSent = parsedMobile
        ? await sendSms(
            request.log,
            code,
            parsedMobile,
            offsetSymptomDate,
            resolvedTestDate,
            jobId
          )
        : false

      return {
        code,
        error: '',
        expiresAt: codeExpiration,
        expiresAtTimestamp: format(codeExpiration, 't'),
        smsSent
      }
    }
  }

  server.route({
    method: 'POST',
    url: '/notify/positive',
    schema: schema.positive,
    handler
  })

  server.route({
    method: 'POST',
    url: '/issue',
    schema: schema.positive,
    handler
  })

  done()
}

module.exports = fp(notify)
