const S = require('fluent-schema')

const positive = {
  description:
    'Send a notification to a user to request they upload their contact data',
  body: S.object()
    .dependencies({
      mobile: S.not(S.required(['phone'])),
      phone: S.not(S.required(['mobile'])),
      onsetDate: S.not(S.required(['symptomDate'])),
      symptomDate: S.not(S.required(['onsetDate']))
    })
    .prop(
      'mobile',
      S.string()
        .minLength(5)
        .maxLength(50)
    )
    .prop(
      'phone',
      S.string()
        .minLength(5)
        .maxLength(50)
    )
    .prop('testType', S.string().enum(['confirmed', 'likely', 'negative']))
    .prop('onsetDate', S.string().format('date'))
    .prop('symptomDate', S.string().format('date'))
    .prop('testDate', S.string().format('date'))
    .prop('jobId', S.string()),
  response: {
    200: S.object()
      .prop('code', S.string().required())
      .prop('error', S.string().required())
      .prop('expiresAt', S.string().required())
      .prop('expiresAtTimestamp', S.string().required())
  }
}

module.exports = { positive }
