const S = require('fluent-schema')

const positive = {
  description:
    'Send a notification to a user to request they upload their contact data',
  body: S.object()
    .description('Mobile number')
    .prop(
      'mobile',
      S.string()
        .minLength(5)
        .maxLength(50)
        .required()
    )
    .prop(
      'onsetDate',
      S.string()
        .format('date')
        .required()
    ),
  response: {
    200: S.object().prop('code', S.number().required())
  }
}

module.exports = { positive }
