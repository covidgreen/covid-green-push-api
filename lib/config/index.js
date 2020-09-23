const envSchema = require('env-schema')
const fetch = require('node-fetch')
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
      .prop('CODE_CHARSET', S.string())
      .prop('CODE_LENGTH', S.string())
      .prop('CODE_LIFETIME_MINS', S.number())
      .prop('DEFAULT_COUNTRY_CODE', S.string())
      .prop('SMS_QUEUE_URL', S.string())
      .prop('SYMPTOM_DATE_OFFSET', S.string())
      .prop('USE_TEST_DATE_AS_ONSET_DATE', S.boolean())
      .prop('ONSET_DATE_MANDATORY', S.boolean())
  })

  const isProduction = /^\s*production\s*$/i.test(env.NODE_ENV)
  const config = {
    isProduction,
    fastify: {
      host: env.API_HOST,
      port: Number(env.API_PORT)
    },
    fastifyInit: {
      trustProxy: 2,
      logger: {
        level: env.LOG_LEVEL
      }
    },
    cors: { origin: /true/i.test(env.CORS_ORIGIN) },
    pgPlugin: {
      read: env.DB_READ_HOST,
      write: env.DB_HOST,
      config: {
        port: Number(env.DB_PORT),
        database: env.DB_DATABASE,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        ssl: env.DB_SSL ? { rejectUnauthorized: false } : false
      }
    },
    swagger: {
      routePrefix: '/docs',
      exposeRoute: true,
      swagger: {
        info: {
          title: 'COVID Tracker Push Service',
          description: 'Notification service for COVID Tracker',
          version
        }
      }
    },
    jwt: {
      secret: env.JWT_SECRET
    },
    sms: {
      codeCharset: env.CODE_CHARSET,
      codeLifetime: env.CODE_LIFETIME_MINS,
      codeLength: Number(env.CODE_LENGTH),
      defaultCountryCode: env.DEFAULT_COUNTRY_CODE,
      onsetDateMandatory: env.ONSET_DATE_MANDATORY,
      symptomDateOffset: Number(env.SYMPTOM_DATE_OFFSET),
      queueUrl: env.SMS_QUEUE_URL,
      useTestDateAsOnsetDate: env.USE_TEST_DATE_AS_ONSET_DATE
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

    const rdsSecret = await getSecret('rds-read-write')
    const jwtSecret = await getSecret('jwt')

    config.fastify.host = await getParameter('push_host')
    config.fastify.port = Number(await getParameter('push_port'))
    config.fastifyInit.logger.level = await getParameter('log_level')
    config.cors.origin = /true/i.test(await getParameter('cors_origin'))

    config.pgPlugin.read = await getParameter('db_reader_host')
    config.pgPlugin.write = await getParameter('db_host')
    config.pgPlugin.config.port = Number(await getParameter('db_port'))
    config.pgPlugin.config.database = await getParameter('db_database')

    if (/true/i.test(await getParameter('db_ssl'))) {
      const certResponse = await fetch(
        'https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem'
      )
      const certBody = await certResponse.text()

      config.pgPlugin.config.ssl = {
        ca: [certBody],
        rejectUnauthorized: true
      }
    }

    config.sms.codeCharset = await getParameter('security_code_charset')
    config.sms.codeLength = Number(await getParameter('security_code_length'))
    config.sms.codeLifetime = Number(
      await getParameter('security_code_lifetime_mins')
    )
    config.sms.defaultCountryCode = await getParameter('default_country_code')
    config.sms.onsetDateMandatory = /true/i.test(
      await getParameter('onset_date_mandatory')
    )
    config.sms.symptomDateOffset = Number(
      await getParameter('symptom_date_offset')
    )
    config.sms.queueUrl = await getParameter('sms_url')
    config.sms.useTestDateAsOnsetDate = /true/i.test(
      await getParameter('use_test_date_as_onset_date')
    )

    config.pgPlugin.config.user = rdsSecret.username
    config.pgPlugin.config.password = rdsSecret.password
    config.jwt.secret = jwtSecret.key
  }

  return config
}

module.exports = getConfig
