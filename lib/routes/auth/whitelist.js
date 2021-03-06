'use strict'

/** @module lib/routes/auth/whitelist */

const errors = require('errors')
const errorMessages = require('errors/frontend-error-messages')
const Boom = require('dat-middleware').Boom
const express = require('express')
const keypather = require('keypather')()
const mw = require('dat-middleware')
const omit = require('101/omit')
const pick = require('101/pick')

const app = module.exports = express()
const OrganizationService = require('models/services/organization-service')
const Users = require('models/mongo/user')
const UserService = require('models/services/user-service')

function addUnderscoreIdToOrg (org) {
  org._id = org.id
  return omit(org, [
    'pivot_user_id',
    'pivot_org_id'
  ])
}

/** a route to get all whitelisted orgs for a specific user
 *  @event GET rest/auth/whitelist/
 *  @memberof module:lib/routes/auth/whitelist */
app.get('/auth/whitelist/',
  function (req, res, next) {
    UserService.getUsersOrganizationsWithGithubModel(req.sessionUser)
      .map(addUnderscoreIdToOrg)
      .then(function (orgs) {
        res.status(200).json(orgs)
      })
      .catch(Users.NotFoundError, function (err) {
        next(Boom.notFound(errorMessages.user.notFound.default, {
          originalError: err
        }))
      })
      // TODO: Nathan, is going to remove this stupid function
      .catch(function (err) {
        next(err)
      })
  })

/** add a name to the whitelist
 *  @params body.name name of the user or org
 *  @event POST rest/auth/whitelist
 *  @memberof module:lib/routes/auth/whitelist */

app.post('/auth/whitelist',
  function (req, res, next) {
    var orgName = keypather.get(req, 'body.name')
    OrganizationService.create(orgName, req.sessionUser)
      .then(function () {
        res.status(201).json({ success: true }) // Enqueues worker
      })
      // TODO: Nathan, is going to remove this stupid function
      .catch(function (err) {
        next(err)
      })
  }
)

/**
 * Updates the flags on an org
 *
 * @param {Object} req
 * @param {Number} req.params.id              - BigPoppa Id for an org to update
 * @param {Object} req.body.metadata          - Flags for org specific tutorial progression
 * @param {Boolean} req.body.prBotEnabled     - Flag for runnabot enabled
 * @param {Object} res
 *
 * @resolves {Organization}   updated org
 * @throws   {Boom.notFound}  when the org isn't in our system
 * @throws   {Boom.notFound}  when the sessionUser isn't in our system
 * @throws   {Boom.forbidden} when the user isn't allowed access to the org
 */
module.exports.updateFlags = function (req, res) {
  const bigPoppaId = keypather.get(req, 'params.id')
  const body = pick(keypather.get(req, 'body'), ['metadata', 'prBotEnabled'])
  return OrganizationService.updateFlagsOnOrg(bigPoppaId, req.sessionUser, body)
    .tap(function (updatedOrg) {
      return res.status(200).json(updatedOrg)
    })
    .catch(errors.OrganizationNotFoundError, function (err) {
      throw Boom.notFound('Organization could not be found', {
        originalError: err
      })
    })
    .catch(errors.UserNotAllowedError, function (err) {
      throw Boom.forbidden('Access denied (!owner)', { originalError: err })
    })
}
/**
 * Currently only used to update certain flags on an org
 *
 *  @params {Number} params.id              - BigPoppa Id for an org to update
 *  @params {Number} body.hasConfirmedSetup - Flag for when the org has confirmed setup
 *  @params {Number} body.hasAha            - Flag for when the org has finished aha
 *
 *  @event PATCH rest/auth/whitelist/:id
 *  @memberof module:lib/routes/auth/whitelist
 */
app.patch('/auth/whitelist/:id',
  mw.params('id').mapValues(parseInt),
  function (req, res, next) {
    module.exports.updateFlags(req, res)
      // TODO: Nathan, is going to remove this stupid function
      .catch(function (err) {
        next(err)
      })
  }
)

/** a route to check if a name exists
 *  (so we don't have to go to the database or do weird things)
 *  @params params.name name of the user or org
 *  @event GET rest/auth/whitelist/:name
 *  @memberof module:lib/routes/auth/whitelist */
app.get('/auth/whitelist/:name',
  mw.params('name').pick().require().string(),
  function (req, res, next) {
    UserService.getUsersOrganizations(req.sessionUser)
      .then(function (orgs) {
        return orgs.find(function (org) {
          return org.lowerName === 'runnable' || org.lowerName === 'codenow'
        })
      })
      .then(function (isRunnable) {
        if (!isRunnable) { throw Boom.unauthorized('You are not allowed to access this route') }
        var name = keypather.get(req, 'params.name')
        return OrganizationService.getByGithubUsername(name)
      })
      .then(function () {
        res.status(204).send()
      })
      .catch(errors.OrganizationNotFoundError, function (err) {
        throw Boom.notFound('Organization could not be found', {
          originalError: err
        })
      })
      // TODO: Nathan, is going to remove this stupid function
      .catch(function (err) {
        next(err)
      })
  })

