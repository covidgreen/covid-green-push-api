const AWS = require('aws-sdk')
const crypto = require('crypto')
const fp = require('fastify-plugin')
const phone = require('phone')
const schema = require('./schema')
const twilio = require('twilio')
const { BadRequest } = require('http-errors')
const { verificationInsert } = require('./query')

async function notify(server, options, done) {
  const hash = value => {
    const sha512 = crypto.createHash('sha512')
    const data = sha512.update(value, 'utf8')

    return data.digest('hex')
  }

  const createCode = length => {
    const bytes = crypto.randomBytes(length)
    const code = bytes.readUIntBE(0, length).toString()

    return code.substr(0, length).padEnd(length, '0')
  }

  const parsePhone = phoneNumber => {
    let value = phoneNumber
    let region = ''

    if (value.substr(0, 2) === '00') {
      value = `+${value.substr(2)}`
    }

    if (value.substr(0, 1) === '0') {
      region = options.phone.defaultCountryCode
    }

    const result = phone(value, region)

    if (!result || result.length === 0) {
      throw new BadRequest('Invalid mobile')
    }

    return result[0]
  }

  const parseTemplate = (template, values) => {
    return template.replace(/\${([^}]*)}/g, (result, key) => values[key])
  }

  server.route({
    method: 'POST',
    url: '/notify/positive',
    schema: schema.positive,
    handler: async request => {
      await request.authenticate()

      const { mobile, onsetDate } = request.body
      const parsed = parsePhone(mobile)
      const control = createCode(3)
      const code = `${control}${createCode(3)}`
      const message = parseTemplate(options.phone.smsTemplate, { code })

      await server.pg.write.query(
        verificationInsert({
          control: hash(control),
          code: hash(code),
          onsetDate
        })
      )

      if (options.phone.enableSns) {
        const params = {
          MessageStructure: 'text',
          Message: message,
          PhoneNumber: parsed
        }

        const sns = new AWS.SNS({
          apiVersion: '2010-03-31',
          region: options.phone.smsRegion
        })

        sns.setSMSAttributes({
          attributes: {
            DefaultSMSType: 'Transactional',
            DefaultSenderID: options.phone.smsSender
          }
        })

        const { MessageId } = await sns.publish(params).promise()
        server.log.info(`Sent SMS Successfully with id ${MessageId}`)
      } else {
        const client = twilio(
          options.twilio.accountSid,
          options.twilio.authToken
        )

        await client.messages.create({
          messagingServiceSid: options.twilio.messagingServiceSid,
          to: parsed,
          body: message
        })
      }

      return { code }
    }
  })

  done()
}

module.exports = fp(notify)
