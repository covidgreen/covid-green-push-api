const fp = require('fastify-plugin')
const schema = require('./schema')
const { format } = require('date-fns')
const { metricsSelect, payloadsSelect, enxOnboarding } = require('./query')

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
  const toCsv = (data, useDateTime) => {
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
          if (useDateTime) {
            result.push(`"${format(value, 'yyyy-MM-dd HH:mm:ss')}"`)
          } else {
            result.push(`"${format(value, 'yyyy-MM-dd')}"`)
          }
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

  const applyFilter = (type, metrics) => {
    const requestedMetrics = metrics ? metrics.split(',') : []

    if (type !== 'metrics_limited') {
      return requestedMetrics
    } else if (requestedMetrics.length === 0) {
      return options.metrics.reducedWhitelist
    }

    return requestedMetrics.filter((metric) =>
      options.metrics.reducedWhitelist.includes(metric)
    )
  }

  const setDateRange = (period) => {
    const startDate = new Date()
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date()
    endDate.setHours(0, 0, 0, 0)

    startDate.setDate(startDate.getDate() - period)
    endDate.setDate(endDate.getDate() + 1)

    return { start: startDate, end: endDate }
  }

  server.route({
    method: 'GET',
    url: '/metrics',
    schema: schema.list,
    handler: async (request, response) => {
      const { type } = await request.authenticate([
        'metrics',
        'metrics_limited'
      ])
      const { metrics, startDate, endDate, summary, daily, period } =
        request.query
      const { accept } = request.headers
      let resolvedSummary = summary

      if (type === 'metrics_limited' && !summary && !daily) {
        resolvedSummary = true
      }

      let beginTime = startDate || format(new Date(), 'yyyy-MM-dd')
      let endTime = endDate || format(new Date(), 'yyyy-MM-dd')

      if (period) {
        const range = setDateRange(period)
        beginTime = range.start
        endTime = range.end
      }

      const { rowCount, rows } = await server.pg.write.query(
        metricsSelect({
          startDate: beginTime,
          endDate: endTime,
          metrics: applyFilter(type, metrics),
          summary: resolvedSummary,
          daily,
          optimiseContacts: type === 'metrics_limited'
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
      const { type } = await request.authenticate(['metrics'])
      const { metrics, startDate, endDate, limit, offset, period } =
        request.query
      const { accept } = request.headers

      const resolvedLimit = limit || 100
      const resolvedOffset = offset || 0

      let beginTime = startDate || format(new Date(), 'yyyy-MM-dd')
      let endTime = endDate || format(new Date(), 'yyyy-MM-dd')

      if (period) {
        const range = setDateRange(period)
        beginTime = range.start
        endTime = range.end
      }

      const { rowCount, rows } = await server.pg.write.query(
        payloadsSelect({
          startDate: beginTime,
          endDate: endTime,
          metrics: applyFilter(type, metrics),
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

  server.route({
    method: 'GET',
    url: '/metrics/enx',
    schema: schema.metricsENX,
    handler: async (request, response) => {
      await request.authenticate(['metrics'])
      const { startDate, endDate, limit, offset, period } = request.query
      const { accept } = request.headers

      const resolvedLimit = limit || 500
      const resolvedOffset = offset || 0

      let beginTime = startDate || format(new Date(), 'yyyy-MM-dd')
      let endTime = endDate || format(new Date(), 'yyyy-MM-dd')

      if (period) {
        const range = setDateRange(period)
        beginTime = range.start
        endTime = range.end
      }

      const { rowCount, rows } = await server.pg.write.query(
        enxOnboarding({
          startDate: beginTime,
          endDate: endTime,
          limit: resolvedLimit,
          offset: resolvedOffset
        })
      )

      if (rowCount === 0) {
        response.status(204)
      } else if (accept === 'text/csv') {
        response.type(accept)

        return toCsv(rows, true)
      } else {
        return rows
      }
    }
  })

  done()
}

module.exports = fp(metrics)
