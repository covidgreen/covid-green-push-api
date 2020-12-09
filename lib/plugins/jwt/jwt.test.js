const getConfig = require('../../../lib/config')
const faker = require('faker')
const jwt = require('jsonwebtoken')

describe('jwt plugin', () => {
  let server, options

  beforeAll(async () => {
    options = await getConfig()

    server = require('fastify')()
    server.register(require('.'), options)
    server.register(require('../../plugins/pg'), options)

    // route that will attempt to authenticate
    server.route({
      method: 'GET',
      url: '/authenticate',
      handler: async request => {
        return request.authenticate(['test'])
      }
    })

    await server.ready()
  })

  beforeEach(() => {
    jest.setTimeout(10e4)
    jest.resetAllMocks()
  })

  afterAll(() => server.close())

  it('should return data from a valid token', async () => {
    const result = {
      id: faker.lorem.word(),
      type: 'test'
    }

    const mockSelect = jest
      .fn()
      .mockResolvedValue({ rowCount: 1, rows: [result] })

    server.pg.read.query = mockSelect

    const response = await server.inject({
      method: 'GET',
      url: '/authenticate',
      headers: {
        Authorization: `Bearer ${jwt.sign(result, options.jwt.secret)}`
      }
    })

    expect(response.statusCode).toEqual(200)
    expect(JSON.parse(response.payload)).toEqual(
      expect.objectContaining(result)
    )
  })

  it('should return a 401 code when a token is missing or invalid', async () => {
    const result = {
      id: faker.lorem.word(),
      type: 'test'
    }

    const mockSelect = jest.fn().mockResolvedValue({ rowCount: 0 })

    server.pg.read.query = mockSelect

    const response = await server.inject({
      method: 'GET',
      url: '/authenticate',
      headers: {
        Authorization: `Bearer ${jwt.sign(result, options.jwt.secret)}`
      }
    })

    expect(response.statusCode).toEqual(401)
  })
})
