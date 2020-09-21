const S = require('fluent-schema')

const list = {
  description: 'Retrieve metrics between given dates',
  query: S.object()
    .dependencies({
      daily: S.not(S.required(['summary'])),
      summary: S.not(S.required(['daily']))
    })
    .prop(
      'startDate',
      S.string()
        .format('date')
        .required()
    )
    .prop(
      'endDate',
      S.string()
        .format('date')
        .required()
    )
    .prop('metrics', S.string().pattern(/^[A-Z_]+(,[A-Z_]+)*$/))
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
    .prop(
      'startDate',
      S.string()
        .format('date')
        .required()
    )
    .prop(
      'endDate',
      S.string()
        .format('date')
        .required()
    )
    .prop('limit', S.number())
    .prop('offset', S.number()),
  response: {
    200: S.array().items(
      S.object()
        .prop('created', S.string().format('date-time'))
        .prop('event', S.string().required())
        .prop(
          'payload',
          S.object()
            .additionalProperties(true)
            .required()
        )
    )
  }
}

module.exports = { list, payloads }
