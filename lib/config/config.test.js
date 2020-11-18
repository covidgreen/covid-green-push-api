jest.mock('aws-sdk')

const { SecretsManager, SSM } = require('aws-sdk')
const faker = require('faker')
const getConfig = require('.')

SecretsManager.mockImplementation(() => ({
  getSecretValue: () => ({
    promise: () =>
      Promise.resolve({
        SecretString: JSON.stringify({})
      })
  })
}))

SSM.mockImplementation(() => ({
  getParameter: ({ Name }) => ({
    promise: () => Promise.resolve({ Parameter: { Value: Name } })
  })
}))

describe('configuration', () => {
  const currentEnv = Object.assign({}, process.env)

  beforeAll(() => {
    jest.resetModules()
  })

  afterEach(() => {
    // restore previous environment, and reset configuration
    jest.resetModules()
    Object.assign(process.env, currentEnv)
  })

  it('returns values according to environment variables', async () => {
    const NODE_ENV = 'development'
    const CONFIG_VAR_PREFIX = ''
    const API_HOST = faker.internet.ip()
    const API_PORT = faker.random.number()
    const CORS_CREDENTIALS = faker.random.boolean()
    const CORS_ORIGIN = faker.random.boolean()
    const DB_HOST = faker.lorem.word()
    const DB_READ_HOST = faker.lorem.word()
    const DB_PORT = faker.random.number()
    const DB_USER = faker.lorem.word()
    const DB_PASSWORD = faker.lorem.word()
    const DB_DATABASE = faker.lorem.word()
    const DB_SSL = faker.random.boolean()
    const JWT_SECRET = faker.lorem.word()
    const LOG_LEVEL = faker.random.arrayElement(['debug', 'warn', 'silent'])

    Object.assign(process.env, {
      NODE_ENV,
      CONFIG_VAR_PREFIX,
      API_HOST,
      API_PORT,
      CORS_CREDENTIALS,
      CORS_ORIGIN,
      DB_HOST,
      DB_READ_HOST,
      DB_PORT,
      DB_USER,
      DB_PASSWORD,
      DB_DATABASE,
      DB_SSL,
      JWT_SECRET,
      LOG_LEVEL
    })

    const config = await getConfig()

    expect(config.isProduction).toEqual(false)

    expect(config.fastify).toEqual({
      host: API_HOST,
      port: API_PORT
    })

    expect(config.fastifyInit.logger).toEqual({
      level: LOG_LEVEL
    })

    expect(config.cors).toEqual({
      credentials: CORS_CREDENTIALS,
      origin: CORS_ORIGIN
    })

    expect(config.pgPlugin).toEqual({
      read: DB_READ_HOST,
      write: DB_HOST,
      config: {
        port: DB_PORT,
        database: DB_DATABASE,
        user: DB_USER,
        password: DB_PASSWORD,
        ssl: DB_SSL ? { rejectUnauthorized: false } : false
      }
    })

    expect(config.jwt).toEqual({
      secret: JWT_SECRET
    })
  })

  it('loads config from aws in production', async () => {
    process.env.NODE_ENV = 'production'

    const config = await getConfig()

    expect(config.isProduction).toEqual(true)

    expect(config.fastify).toEqual(
      expect.objectContaining({
        host: 'push_host'
      })
    )

    expect(config.fastifyInit.logger).toEqual({
      level: 'log_level'
    })

    expect(config.pgPlugin).toEqual(
      expect.objectContaining({
        read: 'db_reader_host',
        write: 'db_host'
      })
    )
  })
})
