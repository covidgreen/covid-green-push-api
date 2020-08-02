const S = require('fluent-schema')

const list = {
  description: 'Retrieve metrics between given dates',
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
    .prop('metrics', S.string().pattern(/^[A-Z_]+(,[A-Z_]+)*$/))
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

module.exports = { list }
