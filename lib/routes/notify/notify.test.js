const getConfig = require('../../../lib/config')
const jwt = require('jsonwebtoken')
const twilio = require('twilio')
const AWS = require('aws-sdk')
const phone = require('phone')

jest.mock('twilio')
jest.mock('aws-sdk')
jest.mock('phone')

describe('notify via Twilio', () => {
  let server, options

  beforeAll(async () => {
    options = await getConfig()
    server = require('fastify')()
    server.register(require('.'), options)
    server.register(require('../../plugins/jwt'), options)
    server.register(require('../../plugins/pg'), options)

    await server.ready()
  })

  beforeEach(() => {
    jest.setTimeout(10e4)
    jest.resetAllMocks()
  })

  afterAll(() => server.close())

  it('should create a verification hash and send an sms via Twilio', async () => {
    const token = jwt.sign({ id: '' }, options.jwt.secret)
    const mobile = '+353111111111'
    const onsetDate = '2020-01-01'

    const mockSelect = jest.fn().mockResolvedValue({ rowCount: 1 })
    const mockInsert = jest.fn().mockResolvedValue({})
    const mockSend = jest.fn().mockResolvedValue({})

    phone.mockImplementation(() => [mobile])
    twilio.mockImplementation(() => ({ messages: { create: mockSend } }))

    server.pg.read.query = mockSelect
    server.pg.write.query = mockInsert

    const response = await server.inject({
      method: 'POST',
      url: '/notify/positive',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: { mobile, onsetDate }
    })

    const payload = JSON.parse(response.payload)

    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(twilio).toHaveBeenCalledWith(
      options.twilio.accountSid,
      options.twilio.authToken
    )
    expect(payload).toEqual(
      expect.objectContaining({
        code: expect.any(Number)
      })
    )
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messagingServiceSid: options.twilio.messagingServiceSid,
        to: mobile,
        body: expect.stringContaining(payload.code.toString())
      })
    )
  })
})

describe('notify via AWS SNS', () => {
  let server, options

  beforeAll(async () => {
    options = await getConfig()
    options.phone.enableSns = true
    options.phone.smsRegion = 'eu-west-1'
    options.phone.smsSender = 'TEST'

    server = require('fastify')()
    server.register(require('.'), options)
    server.register(require('../../plugins/jwt'), options)
    server.register(require('../../plugins/pg'), options)

    await server.ready()
  })

  beforeEach(() => {
    jest.setTimeout(10e4)
    jest.resetAllMocks()
  })

  afterAll(() => server.close())

  it('should create a verification hash and send an sms via SNS', async () => {
    const token = jwt.sign({ id: '' }, options.jwt.secret)
    const mobile = '+353111111111'
    const onsetDate = '2020-01-01'

    const mockSelect = jest.fn().mockResolvedValue({ rowCount: 1 })
    const mockInsert = jest.fn().mockResolvedValue({})
    const mockSetAttributes = jest.fn().mockResolvedValue({})
    const mockPublish = jest.fn(() => ({
      promise: jest.fn().mockResolvedValue({ MessageId: '1234' })
    }))

    phone.mockImplementation(() => [mobile])
    AWS.SNS.mockImplementation(() => ({
      setSMSAttributes: mockSetAttributes,
      publish: mockPublish
    }))

    server.pg.read.query = mockSelect
    server.pg.write.query = mockInsert

    const response = await server.inject({
      method: 'POST',
      url: '/notify/positive',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: { mobile, onsetDate }
    })

    const payload = JSON.parse(response.payload)

    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockSetAttributes).toHaveBeenCalledWith({
      attributes: {
        DefaultSMSType: 'Transactional',
        DefaultSenderID: options.phone.smsSender
      }
    })
    expect(payload).toEqual(
      expect.objectContaining({
        code: expect.any(Number)
      })
    )
    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        MessageStructure: 'text',
        PhoneNumber: mobile,
        Message: expect.stringContaining(payload.code.toString())
      })
    )
  })
})
