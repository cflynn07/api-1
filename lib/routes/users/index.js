/**
 * @module lib/routes/users/index
 */
'use strict'

const Boom = require('dat-middleware').Boom
const errors = require('errors')
var express = require('express')
var mw = require('dat-middleware')

var app = module.exports = express()
var keypather = require('keypather')()

var checkFound = require('middlewares/check-found')
var flow = require('middleware-flow')
var me = require('middlewares/me')
const OrganizationService = require('models/services/organization-service')
const Promise = require('bluebird')
var requestTrace = require('middlewares/request-trace')
var requireWhitelist = require('middlewares/auth').requireWhitelist
var transformations = require('middlewares/transformations')
var utils = require('middlewares/utils')
var User = require('models/mongo/user')
const UserService = require('models/services/user-service')
var validations = require('middlewares/validations')

var or = flow.or
var series = flow.series
var replaceMeWithUserId = transformations.replaceMeWithUserId

app.get('/users/',
  requestTrace('GET_USERS'),
  mw.query({or: ['githubUsername', 'githubOrgName']}).pick().require(),
  function (req, res, next) {
    const opts = req.query
    return Promise
      .try(function () {
        if (opts.githubOrgName) {
          return OrganizationService.getUsersByOrgName(opts.githubOrgName)
        } else if (opts.githubUsername) {
          return User.findByGithubUsernameAsync(opts.githubUsername)
        } else {
          throw Boom.badRequest('Query object must contain only one of the' +
            ' following properties: `githubUsername`, `githubOrgName`', opts)
        }
      })
      .tap(function (users) {
        res.status(200).json(users)
      })
      .catch(errors.OrganizationNotFoundError, function (err) {
        throw Boom.notFound('Organization could not be found', {
          originalError: err
        })
      })
      .catch(function (err) {
        next(err)
      })
  })

app.get('/users/me',
  requestTrace('GET_USERS_USERID'),
  function (req, res, next) {
    Promise.try(function () {
      if (!req.sessionUser) {
        return next(Boom.forbidden('Access Denied. You are not a logged in or not a Runnable user'))
      }
      req.user = req.sessionUser.toJSON()
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  function (req, res, next) {
    if (req.session.beingModerated) {
      req.user._beingModerated = req.session.beingModerated
    }
    next()
  },
  mw.res.json('user'))

app.delete('/users/:userId',
  mw.params('userId').mapValues(replaceMeWithUserId),
  or(me.isUser, me.isModerator),
  requireWhitelist,
  function (req, res, next) {
    User.removeAsync(keypather.get(req, 'params.userId'))
    .asCallback(function (err) {
      next(err)
    })
  },
  utils.message('user deleted'))

var updateUser = series(
  requireWhitelist,
  mw.params('userId').mapValues(replaceMeWithUserId),
  or(me.isUser, me.isModerator),
  mw.body(
    'name', 'company',
    'show_email', 'initial_referrer',
    'email', 'password',
    'userOptions.uiState.demo.explanationUi',
    'userOptions.uiState.shownCoachMarks.editButton',
    'userOptions.uiState.shownCoachMarks.explorer',
    'userOptions.uiState.shownCoachMarks.repoList',
    'userOptions.uiState.shownCoachMarks.boxName',
    'userOptions.uiState.previousLocation.org',
    'userOptions.uiState.previousLocation.instance'
  ).pick(),
  mw.body({
    or: [
      'name',
      'company',
      'show_email',
      'initial_referrer',
      'email',
      'password',
      '["userOptions.uiState.demo.explanationUi"]',
      '["userOptions.uiState.shownCoachMarks.boxName"]',
      '["userOptions.uiState.shownCoachMarks.editButton"]',
      '["userOptions.uiState.shownCoachMarks.explorer"]',
      '["userOptions.uiState.shownCoachMarks.repoList"]',
      '["userOptions.uiState.previousLocation.org"]',
      '["userOptions.uiState.previousLocation.instance"]'
    ]
  }).require(),
  mw.body(
    '["userOptions.uiState.demo.explanationUi"]',
    '["userOptions.uiState.shownCoachMarks.boxName"]',
    '["userOptions.uiState.shownCoachMarks.editButton"]',
    '["userOptions.uiState.shownCoachMarks.explorer"]',
    '["userOptions.uiState.shownCoachMarks.repoList"]'
  ).validate(validations.isBooleanIfExists),
  function (req, res, next) {
    User.findByIdAndUpdateAsync(req.params.userId, { $set: req.body })
      .then(function () {
        return UserService.getCompleteUserById(req.params.userId)
      })
      .tap(function (user) {
        req.user = user
      })
      .asCallback(function (err) {
        next(err)
      })
  },
  checkFound('user'),
  mw.res.json('user'))

app.patch('/users/:userId', updateUser)
