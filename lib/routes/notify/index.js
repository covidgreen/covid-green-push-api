const crypto = require('crypto')
const cryptoRandomString = require('crypto-random-string')
const fp = require('fastify-plugin')
const phone = require('phone')
const schema = require('./schema')
const { BadRequest } = require('http-errors')
const { SQS } = require('aws-sdk')
const { addMinutes, format } = require('date-fns')
const { metricsInsert } = require('../metrics/query')
const { verificationInsert } = require('./query')

/**
 * This endpoint allows the caller to request a verification code and share that code
 * with the end user. This is called by a contact tracer when a user has tested
 * positive for Covid and the tracer is asking that user to upload their TEKs to the
 * system. The verification code generated in this endpoint is the first step of
 * sharing TEKs.
 *
 * This endpoint also adds a message to the SQS queue requesting that this verification
 * code be sent via SMS to the phone number provided in input.
 *
 * Upon a request this endpoint will verify the provided phone number, then generate a
 * new verification code and write a hash of the code and the symptom onset date to the
 * database. It will then add a message to the SQS queue requesting the verification
 * code be sent via SMS to the phone number provided in input.
 */
async function notify(server, options, done) {
  const sqs = new SQS({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
  })

  const hash = value => {
    const sha512 = crypto.createHash('sha512')
    const data = sha512.update(value, 'utf8')

    return data.digest('hex')
  }

  const parsePhone = phoneNumber => {
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

  const handler = async request => {
    await request.authenticate('push')

    const {
      jobId,
      mobile,
      onsetDate,
      phone,
      symptomDate,
      testDate,
      testType
    } = request.body

    const resolvedPhone = mobile || phone || null
    const resolvedOnsetDate = onsetDate || symptomDate || null
    const resolvedTestType = testType || 'confirmed'

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
      const expiration = addMinutes(new Date(), options.sms.codeLifetime)

      await server.pg.write.query(
        verificationInsert({
          control: hash(control),
          code: hash(code),
          onsetDate: resolvedOnsetDate,
          testType: resolvedTestType
        })
      )

      if (resolvedPhone) {
        const message = {
          QueueUrl: options.sms.queueUrl,
          MessageBody: JSON.stringify({
            code,
            mobile: parsePhone(resolvedPhone),
            onsetDate: resolvedOnsetDate,
            testDate,
            jobId
          })
        }

        await sqs.sendMessage(message).promise()

        if (jobId) {
          request.log.info({ jobId }, 'request sent to sms queue')
        }
      }

      return {
        code,
        error: '',
        expiresAt: expiration,
        expiresAtTimestamp: format(expiration, 't')
      }
    } catch (error) {
      await server.pg.write.query(
        metricsInsert({
          event: 'SMS_FAIL',
          os: 'push',
          version: ''
        })
      )

      if (jobId) {
        request.log.info({ jobId }, 'error processing request')
      }

      throw error
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
