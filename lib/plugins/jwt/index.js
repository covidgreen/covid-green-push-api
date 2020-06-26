const fp = require('fastify-plugin')
const SQL = require('@nearform/sql')
const { Unauthorized } = require('http-errors')

async function jwt(server, options) {
  async function authenticate() {
    try {
      const data = server.jwt.verify(
        this.headers.authorization.replace(/^Bearer /, '')
      )
      const query = SQL`SELECT id FROM tokens WHERE id = ${data.id} AND type = 'push'`
      const { rowCount } = await server.pg.read.query(query)

      if (rowCount === 0) {
        throw new Error()
      }

      this.log.info(data, 'authorised user')

      return data
    } catch (error) {
      this.log.info(error, 'error verifying jwt')

      throw new Unauthorized()
    }
  }

  server.register(require('fastify-jwt'), options.jwt)
  server.decorateRequest('authenticate', authenticate)
}

module.exports = fp(jwt)
