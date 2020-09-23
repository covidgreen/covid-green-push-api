const fp = require('fastify-plugin')
const schema = require('./schema')
const { format } = require('date-fns')
const { metricsSelect, payloadsSelect } = require('./query')

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

/**
 * Allows callers to request a dump of all metrics of the desired type collected
 * between start and end dates. The user can request raw metric or sum the values (summary=true).
 * See schema.js/list for a full description of input/output structure. Note that if asking
 * for summary the output schema may not apply.
 *
 * The caller must have a JWT containing a token that gives them access to read metrics.
 *
 * If the accept header asks for 'text/csv' the metrics will be returned in CSV format,
 * otherwise they will be returned in standard JSON.
 *
 * Responses:
 *  200: With metrics data
 *  204: No metric data available during period of desired type
 */
async function metrics(server, options, done) {
  server.route({
    method: 'GET',
    url: '/metrics',
    schema: schema.list,
    handler: async (request, response) => {
      await request.authenticate('metrics')

      const { metrics, startDate, endDate, summary, daily } = request.query
      const { accept } = request.headers

      const { rowCount, rows } = await server.pg.write.query(
        metricsSelect({
          startDate,
          endDate,
          metrics: metrics ? metrics.split(',') : [],
          summary,
          daily
        })
      )

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

  server.route({
    method: 'GET',
    url: '/payloads',
    schema: schema.payloads,
    handler: async (request, response) => {
      await request.authenticate('metrics')

      const { startDate, endDate, limit, offset } = request.query
      const { accept } = request.headers

      const resolvedLimit = limit || 100
      const resolvedOffset = offset || 0

      const { rowCount, rows } = await server.pg.write.query(
        payloadsSelect({
          startDate,
          endDate,
          limit: resolvedLimit,
          offset: resolvedOffset
        })
      )

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
