const getConfig = require('../../../lib/config')

describe('cognito functions', () => {
  let server, options

  beforeAll(async () => {
    options = await getConfig()
    server = require('fastify')()
    server.register(require('.'), options)
    server.register(require('../../plugins/jwt'), options)
    server.register(require('../../plugins/pg'), options)

    await server.ready()
  })

  beforeEach(() => {
    jest.setTimeout(10e4)
    jest.resetAllMocks()
  })

  afterAll(() => server.close())

  it('should be able to register a new account', async () => {
    let response = await server.inject({
      method: 'POST',
      url: '/pha/register',
      headers: {},
      body: {}
    })

    expect(response.statusCode).toEqual(400)
    response = await server.inject({
      method: 'DELETE',
      url: '/pha/unregister',
      headers: {},
      body: {
        email: 'foo@bazbar'
      }
    })
    response = await server.inject({
      method: 'POST',
      url: '/pha/register',
      headers: {},
      body: {
        email: 'foo@bazbar',
        password: 'foobaz'
      }
    })
    expect(response.statusCode).toEqual(400)
    expect(typeof response.body).toEqual('string')
    expect(
      JSON.parse(response.body).err.message.includes(
        'did not conform with policy'
      )
    ).toEqual(true)
    response = await server.inject({
      method: 'POST',
      url: '/pha/register',
      headers: {},
      body: {
        email: 'foo@bazbar',
        password: 'Foobazbar1!'
      }
    })
    expect(response.statusCode).toEqual(200)
    response = await server.inject({
      method: 'GET',
      url: '/pha/users',
      headers: {},
      body: {}
    })
    expect(response.statusCode).toEqual(200)
    const user = JSON.parse(response.body).Users.find(
      ({ Username }) => 'foo@bazbar'
    )
    expect(user).not.toBeNull()
    expect(response.body)
    response = await server.inject({
      method: 'DELETE',
      url: '/pha/unregister',
      headers: {},
      body: {
        email: 'foo@bazbar'
      }
    })
    expect(response.statusCode).toEqual(200)
  })
  it('should be able to login', async () => {})
  it('should be able to check a session token', async () => {})
})
