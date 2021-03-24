const getConfig = require('./config')

describe('server', () => {
  it('starts a mock server and register plugins', async () => {
    const server = { register: jest.fn() }
    server.register.mockReturnValue(server)
    require('./server')(server, await getConfig())
    expect(server.register).toHaveBeenCalledTimes(5)
  })

  it('starts a real server and hits an authenticated route successfully', async () => {
    const fastify = require('fastify')()

    await fastify.register(require('./server'), await getConfig())

    const [date] = new Date().toISOString().split('T')

    const response = await fastify.inject({
      url: '/metrics',
      query: {
        startDate: date,
        endDate: date
      }
    })

    expect(response.statusCode).toBe(401)
  })
})
