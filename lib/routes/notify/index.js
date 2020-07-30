const crypto = require('crypto')
const cryptoRandomString = require('crypto-random-string')
const fp = require('fastify-plugin')
const phone = require('phone')
const schema = require('./schema')
const { BadRequest } = require('http-errors')
const { SQS } = require('aws-sdk')
const { metricsInsert } = require('../metrics/query')
const { verificationInsert } = require('./query')

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
        if (value.substr(0, country.country_code.length) === country.country_code) {
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

  server.route({
    method: 'POST',
    url: '/notify/positive',
    schema: schema.positive,
    handler: async request => {
      await request.authenticate('push')

      const { mobile, onsetDate, testDate, jobId } = request.body

      try {
        const parsed = parsePhone(mobile)

        const control = cryptoRandomString({
          length: Math.floor(options.sms.codeLength / 2),
          characters: options.sms.codeCharset
        })

        const random = cryptoRandomString({
          length: Math.ceil(options.sms.codeLength / 2),
          characters: options.sms.codeCharset
        })

        const code = `${control}${random}`

        await server.pg.write.query(
          verificationInsert({
            control: hash(control),
            code: hash(code),
            onsetDate
          })
        )

        const message = {
          QueueUrl: options.sms.queueUrl,
          MessageBody: JSON.stringify({ code, mobile: parsed, onsetDate, testDate, jobId })
        }

        await sqs.sendMessage(message).promise()

        if (jobId) {
          request.log.info({ jobId }, 'request sent to sms queue')
        }

        return { code }
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
  })

  done()
}

module.exports = fp(notify)
