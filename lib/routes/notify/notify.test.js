const getConfig = require('../../../lib/config')
const jwt = require('jsonwebtoken')
const { SQS } = require('aws-sdk')
const phone = require('phone')

jest.mock('aws-sdk')
jest.mock('phone')

const mockSend = jest.fn().mockResolvedValue({})

SQS.mockImplementation(() => ({
  sendMessage: () => ({
    promise: mockSend
  })
}))

describe('notify via sqs', () => {
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

  it('should return invalid request due to invalid mobile', async () => {
    const token = jwt.sign({ id: '' }, options.jwt.secret)
    const mobile = '+353111111111'
    const testType = 'confirmed'
    const onsetDate = '2020-01-01'
    const testDate = '2020-01-01'
    const jobId = '123456'

    const mockSelect = jest.fn().mockResolvedValue({ rowCount: 1 })
    const mockInsert = jest.fn().mockResolvedValue({})

    phone.mockImplementation(() => [])

    server.pg.read.query = mockSelect
    server.pg.write.query = mockInsert

    const response = await server.inject({
      method: 'POST',
      url: '/notify/positive',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: { mobile, onsetDate, testDate, jobId, testType }
    })

    expect(response.statusCode).toEqual(400)
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(mockInsert).toHaveBeenCalledTimes(0)
    expect(mockSend).toHaveBeenCalledTimes(0)
  })

  it('should create a verification code and send an sms via sqs', async () => {
    const token = jwt.sign({ id: '' }, options.jwt.secret)
    const mobile = '+353111111111'
    const testType = 'confirmed'
    const onsetDate = '2020-01-01'
    const testDate = '2020-01-01'
    const jobId = '123456'

    const mockSelect = jest.fn().mockResolvedValue({ rowCount: 1 })
    const mockInsert = jest.fn().mockResolvedValue({})

    phone.mockImplementation(() => [mobile])

    server.pg.read.query = mockSelect
    server.pg.write.query = mockInsert

    const response = await server.inject({
      method: 'POST',
      url: '/notify/positive',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: { mobile, onsetDate, testDate, jobId, testType }
    })

    const payload = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(200)
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(mockInsert).toHaveBeenCalledTimes(2)
    expect(mockSend).toHaveBeenCalledTimes(1)

    expect(payload).toEqual(
      expect.objectContaining({
        code: expect.any(String),
        smsSent: true
      })
    )
  })

  it('should create a verification code and not send an sms due to null mobile', async () => {
    const token = jwt.sign({ id: '' }, options.jwt.secret)
    const mobile = null
    const onsetDate = '2020-01-01'
    const testDate = '2020-01-01'
    const jobId = '123456'

    const mockSelect = jest.fn().mockResolvedValue({ rowCount: 1 })
    const mockInsert = jest.fn().mockResolvedValue({})

    phone.mockImplementation(() => [mobile])

    server.pg.read.query = mockSelect
    server.pg.write.query = mockInsert

    const response = await server.inject({
      method: 'POST',
      url: '/notify/positive',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: { mobile, onsetDate, testDate, jobId }
    })

    const payload = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(200)
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(mockInsert).toHaveBeenCalledTimes(2)
    expect(mockSend).toHaveBeenCalledTimes(0)

    expect(payload).toEqual(
      expect.objectContaining({
        code: expect.any(String),
        smsSent: false
      })
    )
  })

  it('should create a verification code and not send an sms due to empty mobile', async () => {
    const token = jwt.sign({ id: '' }, options.jwt.secret)
    const mobile = ''
    const onsetDate = '2020-01-01'
    const testDate = '2020-01-01'
    const jobId = '123456'

    const mockSelect = jest.fn().mockResolvedValue({ rowCount: 1 })
    const mockInsert = jest.fn().mockResolvedValue({})

    phone.mockImplementation(() => [mobile])

    server.pg.read.query = mockSelect
    server.pg.write.query = mockInsert

    const response = await server.inject({
      method: 'POST',
      url: '/notify/positive',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: { mobile, onsetDate, testDate, jobId }
    })

    const payload = JSON.parse(response.payload)

    expect(response.statusCode).toEqual(200)
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(mockInsert).toHaveBeenCalledTimes(2)
    expect(mockSend).toHaveBeenCalledTimes(0)

    expect(payload).toEqual(
      expect.objectContaining({
        code: expect.any(String),
        smsSent: false
      })
    )
  })
})
