const startServer = require('./lib/server')
const getConfig = require('./lib/config')

const main = async () => {
  process.on('unhandledRejection', err => {
    console.error(err)
    process.exit(1)
  })

  const config = await getConfig()
  const server = require('fastify')(config.fastifyInit)
  server.register(startServer, config)

  const address = await server.listen(config.fastify)
  server.log.info(`Server running at: ${address}`)

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () =>
      server.close().then(err => {
        console.log(`close application on ${signal}`)
        process.exit(err ? 1 : 0)
      })
    )
  }
}

main()
