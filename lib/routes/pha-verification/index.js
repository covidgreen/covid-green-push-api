const axios = require('axios')
const aws = require('aws-sdk')
require('cross-fetch/polyfill')
const fp = require('fastify-plugin')
const jwkToPem = require('jwk-to-pem')
const notify = require('../notify')
const jwt = require('jsonwebtoken')
// TODO: Can this be replaced by AWS.CognitoIdentityServiceProvider???
var AmazonCognitoIdentity = require('amazon-cognito-identity-js')
var CognitoUserPool = AmazonCognitoIdentity.CognitoUserPool
exports.cognito = new aws.CognitoIdentityServiceProvider()
const {
  BadRequest,
  InternalServerError,
  Unauthorized,
  Forbidden
} = require('http-errors')

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
          return BadRequest('Must supply email and password in POST body.')
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
                resolve({
                  err
                })
                return
              }
              resolve(result)
            }
          )
        })
        if (!res.err) {
          await new Promise(resolve => {
            exports.cognito.adminConfirmSignUp(
              {
                UserPoolId: options.cognitoPoolId,
                Username: email
              },
              (err, data) => {
                if (err) {
                  resolve({
                    err
                  })
                  return
                }
                resolve(data)
              }
            )
          })
        }
        return res
      }
    })
    server.route({
      method: 'GET',
      url: '/pha/users',
      handler: async (request, response) => {
        const res = new Promise(resolve => {
          exports.cognito.listUsers(
            {
              UserPoolId: options.cognitoPoolId,
              Limit: 60
            },
            (err, data) => {
              if (err) {
                resolve({
                  err
                })
                return
              }
              resolve(data)
            }
          )
        })
        return res
      }
    })
    server.route({
      method: 'DELETE',
      url: '/pha/unregister',
      handler: async (request, response) => {
        let email
        try {
          email = request.body.email
        } catch (e) {
          return BadRequest('Must supply email in request body.')
        }
        const res = await new Promise(resolve => {
          exports.cognito.adminDeleteUser(
            {
              UserPoolId: options.cognitoPoolId,
              Username: email
            },
            (err, result) => {
              if (err) {
                resolve({
                  err
                })
                return
              }
              resolve({
                message: 'Success'
              })
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
        return BadRequest('Must supply email and password in POST body.')
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
          onFailure: () => {
            resolve(new Forbidden('Login failed.'))
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
        return BadRequest('Must supply token in POST body.')
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
        return BadRequest({
          err: 'Invalid session token.'
        })
      }

      const pem = pems[decoded.header.kid]
      if (!pem) {
        return BadRequest({
          err: 'Invalid session token.'
        })
      }

      return new Promise(resolve => {
        jwt.verify(token, pem, (err, payload) => {
          if (err) {
            resolve(
              BadRequest({
                err: 'Invalid session token.'
              })
            )
          } else {
            resolve(true)
          }
        })
      })
    } catch (e) {
      return InternalServerError({
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
        return BadRequest('Must supply token in POST body.')
      }
      const isValidSession = await checkSession(token)
      if (isValidSession !== true) {
        return Unauthorized({
          err: 'Not authorized'
        })
      }

      return notify.notifyPositive(request, ...args)
    }
  })
}

module.exports = fp(phaVerification)
