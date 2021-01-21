const S = require('fluent-schema')

const positive = {
  description:
    'Generate a verification code and potentially send it to a user requesting they upload their TEKs',
  body: S.object()
    .dependencies({
      mobile: S.not(S.required(['phone'])),
      phone: S.not(S.required(['mobile'])),
      onsetDate: S.not(S.required(['symptomDate'])),
      symptomDate: S.not(S.required(['onsetDate']))
    })
    .prop(
      'mobile',
      S.anyOf([
        S.string()
          .minLength(5)
          .maxLength(50),
        S.null()
      ])
    )
    .prop(
      'phone',
      S.anyOf([
        S.string()
          .minLength(5)
          .maxLength(50),
        S.null()
      ])
    )
    .prop('testType', S.string().enum(['confirmed', 'likely', 'negative']))
    .prop('onsetDate', S.string().format('date'))
    .prop('symptomDate', S.string().format('date'))
    .prop('testDate', S.string().format('date'))
    .prop('jobId', S.string()),
  response: {
    200: S.object()
      .prop('code', S.string().required())
      .prop('error', S.string())
      .prop('expiresAt', S.string().required())
      .prop('expiresAtTimestamp', S.string().required())
      .prop('padding', S.string())
      .prop('smsSent', S.boolean())
      .prop('uuid', S.string())
  }
}

module.exports = { positive }
