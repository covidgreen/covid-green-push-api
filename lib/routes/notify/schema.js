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
    .prop('onsetDate', S.string().format('date'))
    .prop('testDate', S.string().format('date'))
    .prop('jobId', S.string()),
  response: {
    200: S.object().prop('code', S.string().required())
  }
}

module.exports = { positive }
