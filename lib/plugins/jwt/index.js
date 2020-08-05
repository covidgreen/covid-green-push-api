const fp = require('fastify-plugin')
const SQL = require('@nearform/sql')
const { Unauthorized } = require('http-errors')

/**
 * Plugin applied to all requests. An endpoint can invoke this check to ensure
 * the request contains a header 'Authentication: Bearer <token>' where the
 * token value is a valid JWT containing a claim 'id'. The 'id' is the
 * identifier of the token in the database, and using that ID we can look up
 * if that token exists with the passed in type.
 */
async function jwt(server, options) {
  async function authenticate(type) {
    try {
      const data = server.jwt.verify(
        this.headers.authorization.replace(/^Bearer /, '')
      )
      const query = SQL`SELECT id FROM tokens WHERE id = ${data.id} AND type = ${type}`
      const { rowCount } = await server.pg.read.query(query)

      if (rowCount === 0) {
        throw new Error()
      }

      this.log.info({ data }, 'authorised user')

      return data
    } catch (err) {
      this.log.info({ err }, 'error verifying jwt')

      throw new Unauthorized()
    }
  }

  server.register(require('fastify-jwt'), options.jwt)
  server.decorateRequest('authenticate', authenticate)
}

module.exports = fp(jwt)
