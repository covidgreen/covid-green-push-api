const S = require('fluent-schema')

const list = {
  description: 'Retrieve metrics between given dates',
  query: S.object()
    .dependencies({
      daily: S.not(S.required(['summary'])),
      summary: S.not(S.required(['daily'])),
      period: S.not(S.required(['startDate', 'endDate']))
    })
    .prop('startDate', S.string().format('date'))
    .prop('endDate', S.string().format('date'))
    .prop('metrics', S.string().pattern(/^[A-Z_0-9]+(,[A-Z_0-9]+)*$/))
    .prop('period', S.number())
    .prop('daily', S.boolean())
    .prop('summary', S.boolean()),
  response: {
    200: S.array().items(
      S.object()
        .prop('date', S.string().format('date'))
        .prop('event', S.string().required())
        .prop('os', S.string())
        .prop('version', S.string())
        .prop('value', S.number().required())
    )
  }
}

const payloads = {
  description: 'Retrieve payloads between given dates',
  query: S.object()
    .dependencies({
      period: S.not(S.required(['startDate', 'endDate']))
    })
    .prop('startDate', S.string().format('date'))
    .prop('endDate', S.string().format('date'))
    .prop('metrics', S.string().pattern(/^[A-Z_0-9]+(,[A-Z_0-9]+)*$/))
    .prop('period', S.number())
    .prop('limit', S.number())
    .prop('offset', S.number()),
  response: {
    200: S.array().items(
      S.object()
        .prop('created', S.string().format('date-time'))
        .prop('event', S.string().required())
        .prop('payload', S.object().additionalProperties(true).required())
    )
  }
}

const metricsENX = {
  description: 'Retrieve enx requests between given dates',
  query: S.object()
    .dependencies({
      period: S.not(S.required(['startDate', 'endDate']))
    })
    .prop('startDate', S.string().format('date'))
    .prop('endDate', S.string().format('date'))
    .prop('period', S.number())
    .prop('limit', S.number())
    .prop('offset', S.number()),
  response: {
    200: S.array().items(
      S.object()
        .prop('date', S.string().format('date-time'))
        .prop('all', S.number().required())
        .prop('success', S.number().required())
        .prop('settings', S.number().required())
        .prop('enbuddy', S.number().required())
        .prop('healthenbuddy', S.number().required())
    )
  }
}

module.exports = { list, payloads, metricsENX }
