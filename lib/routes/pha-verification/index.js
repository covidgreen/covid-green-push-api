const axios = require('axios')
require('cross-fetch/polyfill')
const fp = require('fastify-plugin')
const jwkToPem = require('jwk-to-pem')
const { notifyPositive } = require('../notify')
const jwt = require('jsonwebtoken')
var AmazonCognitoIdentity = require('amazon-cognito-identity-js')
var CognitoUserPool = AmazonCognitoIdentity.CognitoUserPool
const { BadRequest, InternalServerError, Unauthorized } = require('http-errors')

/**
 * Handlers for PHA user to report positive COVID cases.  This includes
 * authenticating a PHA user with Cognito such that the PHA user can accses
 * the notification API with the correct authorization (to create multiple
 * notifications of positive cases).
 */
async function phaVerification(server, options, done) {
  const userPool = new CognitoUserPool({
    UserPoolId: options.cognitoPoolId,
    ClientId: options.cognitoClientId
  })
  if (!options.isProduction) {
    server.route({
      method: 'POST',
      url: '/pha/register',
      handler: async (request, response) => {
        // TODO: Password should be encrypted with a public key where public
        // key and private key are stored in secrets manager.  Frontend
        // app should likewise use jsonwebtoken library to encrypt password
        // before send.
        let email, password
        try {
          email = request.body.email
          password = request.body.password
        } catch (e) {
          throw new BadRequest('Must supply email and password in POST body.')
        }
        const attributeList = []
        attributeList.push(
          new AmazonCognitoIdentity.CognitoUserAttribute({
            Name: 'email',
            Value: email
          })
        )

        const res = await new Promise(resolve => {
          userPool.signUp(
            email,
            password,
            attributeList,
            null,
            (err, result) => {
              if (err) {
                response.status(400)
                resolve(err)
                return
              }
              resolve(result)
            }
          )
        })
        return res
      }
    })
  }

  /**
   * Logs in to the
   */
  server.route({
    method: 'POST',
    url: '/pha/login',
    handler: async (request, response) => {
      // TODO: Password should be encrypted with a public key where public
      // key and private key are stored in secrets manager.  Frontend
      // app should likewise use jsonwebtoken library to encrypt password
      // before send.
      let email, password
      try {
        email = request.body.email
        password = request.body.password
      } catch (e) {
        throw new BadRequest('Must supply email and password in POST body.')
      }
      const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(
        {
          Username: email,
          Password: password
        }
      )

      const userData = {
        Username: email,
        Pool: userPool
      }
      const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData)
      const res = await new Promise(resolve => {
        cognitoUser.authenticateUser(authenticationDetails, {
          onSuccess: result => {
            resolve({
              accessToken: result.getAccessToken().getJwtToken(),
              token: result.getIdToken().getJwtToken(),
              refreshToken: result.getRefreshToken().getToken()
            })
          },
          onFailure: err => {
            // TODO: If production, then squelch error.
            resolve({
              err
            })
          }
        })
      })

      return res
    }
  })

  /**
   * Helper route for checking the status of a token.
   */
  server.route({
    method: 'POST',
    url: '/pha/check',
    handler: async (request, response) => {
      let token
      try {
        token = request.body.token
      } catch (e) {
        throw new BadRequest('Must supply token in POST body.')
      }
      const res = await checkSession(token)
      return res
    }
  })

  /**
   * Checks a session token against the existing session information stored
   * within cognito.
   * @param {*} token
   */
  const checkSession = async token => {
    let data
    try {
      data = (
        await axios({
          url: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${options.cognitoPoolId}/.well-known/jwks.json`,
          json: true
        })
      ).data

      const pems = {}
      const { keys } = data
      keys.forEach(({ kid, n, e, kty }) => {
        pems[kid] = jwkToPem({
          kty,
          n,
          e
        })
      })

      // Validate.
      const decoded = jwt.decode(token, { complete: true })
      if (!decoded) {
        throw new BadRequest({
          err: 'Invalid session token.'
        })
      }

      const pem = pems[decoded.header.kid]
      if (!pem) {
        throw new BadRequest({
          err: 'Invalid session token.'
        })
      }

      return new Promise(resolve => {
        jwt.verify(token, pem, (err, payload) => {
          if (err) {
            throw new BadRequest({
              err: 'Invalid session token.'
            })
          } else {
            resolve(true)
          }
        })
      })
    } catch (e) {
      throw new InternalServerError({
        err: 'An unknown error occured'
      })
    }
  }

  /**
   * Proxies a request to the notification API provided the PHA user can be
   * authenticated with Cognito.
   */
  server.route({
    method: 'POST',
    url: '/pha/notify',
    handler: async (request, ...args) => {
      let token
      try {
        token = request.body.token
      } catch (e) {
        throw new BadRequest('Must supply token in POST body.')
      }
      const isValidSession = await checkSession(token)
      if (isValidSession !== true) {
        throw new Unauthorized({
          err: 'Not authorized'
        })
      }

      return notifyPositive(request, ...args)
    }
  })
}

module.exports = fp(phaVerification)
