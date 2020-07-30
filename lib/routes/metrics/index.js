const fp = require('fastify-plugin')
const schema = require('./schema')
const { format } = require('date-fns')
const { metricsSelect } = require('./query')

function toCsv(data) {
  const results = []

  for (let i = 0; i < data.length; i++) {
    const header = []
    const result = []

    for (const key of Object.keys(data[i])) {
      const value = data[i][key]

      if (i === 0) {
        header.push(`"${key}"`)
      }

      if (value instanceof Date) {
        result.push(`"${format(value, 'yyyy-MM-dd')}"`)
      } else if (typeof value === 'number') {
        result.push(value)
      } else {
        result.push(`"${value}"`)
      }
    }

    if (i === 0) {
      results.push(header)
    }

    results.push(result)
  }

  return results.join('\n')
}

async function metrics(server, options, done) {
  server.route({
    method: 'GET',
    url: '/metrics',
    schema: schema.list,
    handler: async (request, response) => {
      await request.authenticate('metrics')

      const { metrics, startDate, endDate, summary } = request.query
      const { accept } = request.headers

      const { rowCount, rows } = await server.pg.write.query(metricsSelect({
        startDate,
        endDate,
        metrics: metrics ? metrics.split(',') : [],
        summary
      }))

      if (rowCount === 0) {
        response.status(204)
      } else if (accept === 'text/csv') {
        response.type(accept)

        return toCsv(rows)
      } else {
        return rows
      }
    }
  })

  done()
}

module.exports = fp(metrics)
