const envSchema = require('env-schema')
const S = require('fluent-schema')
const AWS = require('aws-sdk')
const { version } = require('../../package.json')

async function getConfig() {
  const env = envSchema({
    dotenv: true,
    schema: S.object()
      .prop('CONFIG_VAR_PREFIX', S.string())
      .prop('NODE_ENV', S.string())
      .prop('API_HOST', S.string())
      .prop('API_PORT', S.string())
      .prop('CORS_ORIGIN', S.string())
      .prop('DB_HOST', S.string())
      .prop('DB_READ_HOST', S.string())
      .prop('DB_PORT', S.string())
      .prop('DB_USER', S.string())
      .prop('DB_PASSWORD', S.string())
      .prop('DB_DATABASE', S.string())
      .prop('DB_SSL', S.boolean())
      .prop('JWT_SECRET', S.string())
      .prop(
        'LOG_LEVEL',
        S.string()
          .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
          .default('info')
      )
      .prop('TWILIO_ACCOUNT_SID', S.string())
      .prop('TWILIO_AUTH_TOKEN', S.string())
      .prop('TWILIO_MESSAGING_SERVICE_SID', S.string())
      .prop('DEFAULT_COUNTRY_CODE', S.string())
      .prop('SMS_TEMPLATE', S.string())
      .prop('ENABLE_SNS', S.boolean())
      .prop('SMS_SENDER', S.string().default('NOTICE'))
      .prop('SMS_REGION', S.string().default('eu-west-1'))
  })

  const isProduction = /^\s*production\s*$/i.test(env.NODE_ENV)
  const config = {
    isProduction,
    fastify: {
      host: env.API_HOST,
      port: +env.API_PORT
    },
    fastifyInit: {
      trustProxy: 2,
      logger: {
        level: env.LOG_LEVEL
      }
    },
    underPressure: {},
    cors: { origin: /true/i.test(env.CORS_ORIGIN) },
    pgPlugin: {
      read: env.DB_READ_HOST,
      write: env.DB_HOST,
      config: {
        port: +env.DB_PORT,
        ssl: env.DB_SSL,
        database: env.DB_DATABASE,
        user: env.DB_USER,
        password: env.DB_PASSWORD
      }
    },
    swagger: {
      routePrefix: '/docs',
      exposeRoute: true,
      swagger: {
        info: {
          title: 'COVID Tracker Push Service',
          description: 'Notification service for COVID Tracker Ireland',
          version
        }
      }
    },
    jwt: {
      secret: env.JWT_SECRET
    },
    twilio: {
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID
    },
    phone: {
      enableSns: env.ENABLE_SNS,
      defaultCountryCode: env.DEFAULT_COUNTRY_CODE,
      smsTemplate: env.SMS_TEMPLATE,
      smsRegion: env.SMS_REGION,
      smsSender: env.SMS_SENDER
    }
  }

  if (isProduction) {
    const ssm = new AWS.SSM({ region: env.AWS_REGION })
    const secretsManager = new AWS.SecretsManager({ region: env.AWS_REGION })

    const getParameter = async id => {
      const response = await ssm
        .getParameter({ Name: `${env.CONFIG_VAR_PREFIX}${id}` })
        .promise()

      return response.Parameter.Value
    }

    const getSecret = async id => {
      const response = await secretsManager
        .getSecretValue({ SecretId: `${env.CONFIG_VAR_PREFIX}${id}` })
        .promise()

      return JSON.parse(response.SecretString)
    }

    const rdsSecret = await getSecret('rds')
    const jwtSecret = await getSecret('jwt')

    config.fastify.host = await getParameter('push_host')
    config.fastify.port = Number(await getParameter('push_port'))
    config.fastifyInit.logger.level = await getParameter('log_level')
    config.cors.origin = /true/i.test(await getParameter('cors_origin'))

    config.pgPlugin.read = await getParameter('db_reader_host')
    config.pgPlugin.write = await getParameter('db_host')
    config.pgPlugin.config.port = Number(await getParameter('db_port'))
    config.pgPlugin.config.ssl = /true/i.test(await getParameter('db_ssl'))
    config.pgPlugin.config.database = await getParameter('db_database')
    config.phone.defaultCountryCode = await getParameter('default_country_code')
    config.phone.smsTemplate = await getParameter('sms_template')
    config.phone.enableSns = /true/i.test(
      await getParameter('push_enable_sns_for_sms')
    )
    config.phone.smsRegion = await getParameter('sms_region')
    config.phone.smsSender = await getParameter('sms_sender')

    config.pgPlugin.config.user = rdsSecret.username
    config.pgPlugin.config.password = rdsSecret.password
    config.jwt.secret = jwtSecret.key

    if (!config.phone.enableSns) {
      const twilioSecret = await getSecret('twilio')

      config.twilio.accountSid = twilioSecret.twilio_account
      config.twilio.authToken = twilioSecret.twilio_token
      config.twilio.messagingServiceSid = twilioSecret.twilio_sid
    }
  }

  return config
}

module.exports = getConfig
