const envSchema = require('env-schema')
const getConfig = require('../../../lib/config')
const S = require('fluent-schema')

describe('cognito functions', () => {
    let server, options

    const env = envSchema({
        dotenv: true,
        schema: S.object()
            .prop('COGNITO_POOL_ID', S.string())
            .prop('COGNITO_CLIENT_ID', S.string())
    })
    beforeAll(async () => {
        options = await getConfig()
        server = require('fastify')()
        if (env.COGNITO_POOL_ID && !env.COGNITO_CLIENT_ID) {
            server.register(require('.'), options)
            server.register(require('../../plugins/jwt'), options)
            server.register(require('../../plugins/pg'), options)

            await server.ready()
        }
    })
    if (!env.COGNITO_POOL_ID || !env.COGNITO_CLIENT_ID) {
        it('should not test anything because no Cognito pool is defined', async () => {
            expect(options).not.toHaveProperty('cognitoClientId')
        })
        return
    }

    beforeEach(() => {
        jest.setTimeout(10e4)
        jest.resetAllMocks()
    })

    afterAll(() => server.close())

    it('should be able to register a new account', async () => {
        let response = await server.inject({
            method: 'POST',
            url: '/pha/register',
            headers: {},
            body: {}
        })

        expect(response.statusCode).toEqual(400)
        response = await server.inject({
            method: 'DELETE',
            url: '/pha/unregister',
            headers: {},
            body: {
                email: 'foo@bazbar'
            }
        })
        response = await server.inject({
            method: 'POST',
            url: '/pha/register',
            headers: {},
            body: {
                email: 'foo@bazbar',
                password: 'foobaz'
            }
        })
        expect(response.statusCode).toEqual(400)
        expect(typeof response.body).toEqual('string')
        expect(
            JSON.parse(response.body).err.message.includes(
                'did not conform with policy'
            )
        ).toEqual(true)
        response = await server.inject({
            method: 'POST',
            url: '/pha/register',
            headers: {},
            body: {
                email: 'foo@bazbar',
                password: 'Foobazbar1!'
            }
        })
        expect(response.statusCode).toEqual(200)
        response = await server.inject({
            method: 'GET',
            url: '/pha/users',
            headers: {},
            body: {}
        })
        expect(response.statusCode).toEqual(200)
        const user = JSON.parse(response.body).Users.find(
            ({ Username }) => 'foo@bazbar'
        )
        expect(user).not.toBeNull()
        expect(response.body)
        response = await server.inject({
            method: 'DELETE',
            url: '/pha/unregister',
            headers: {},
            body: {
                email: 'foo@bazbar'
            }
        })
        expect(response.statusCode).toEqual(200)
    })
    it('should be able to login', async () => { })
    it('should be able to check a session token', async () => { })
})
