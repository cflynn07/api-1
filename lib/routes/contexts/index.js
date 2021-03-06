'use strict'

/**
 * Context API
 * @module rest/contexts
 */

var express = require('express')
var app = module.exports = express()
var mw = require('dat-middleware')

var Context = require('models/mongo/context')
var ContextService = require('models/services/context-service')
var checkFound = require('middlewares/check-found')
var PermissionService = require('models/services/permission-service')

var findContext = function (checkPermissions) {
  return function (req, res, next) {
    ContextService.findContext(req.params.id)
    .tap(function (context) {
      req.context = context
    })
    .tap(function (context) {
      if (checkPermissions) {
        return checkPermissions(req.sessionUser, context)
      }
    })
    .asCallback(function (err) {
      next(err)
    })
  }
}

/*  List {@link module:models/context Contexts}
 *  @event GET rest/contexts
 *  @memberof module:rest/contexts */
app.get('/contexts/',
  // TODO: we will probably need this...
  // TODO: What is this supposed to do?  Should it list all of the contexts owned by the user?
  // All contexts that the user (or is part of a group that) owns or moderates, or is Public?
  mw.query('isSource').pick().require(),
  function (req, res, next) {
    Context.findAsync(req.query)
    .tap(function (contexts) {
      req.contexts = contexts
    })
    .asCallback(function (err) {
      next(err)
    })
  },
  checkFound('contexts'),
  mw.res.json('contexts'))

/** Get a {@link module:models/context Context}
 *  @param {ObjectId} id ID of the Context
 *  @returns {object} The Context
 *  @event GET rest/contexts/:id
 *  @memberof module:rest/contexts */
app.get('/contexts/:id',
  findContext(PermissionService.ensureModelAccess),
  mw.res.json('context')
)

/** Update a {@link module:models/contexts Context}
 *  @param {ObjectId} id Id of the Context to update
 *  @returns {object} The {@link module:models/contexts context}
 *  @event PATCH rest/contexts/:id
 *  @memberof module:rest/contexts */
app.patch('/contexts/:id',
  findContext(PermissionService.ensureModelAccess),
  // FIXME: do not allow source edits
  mw.body({ or: ['name', 'public', 'source'] }).pick().require(),
  mw.body('source').require().then(mw.log('WARNING: PATCHING SOURCE')),
  function (req, res, next) {
    req.context.updateAsync({ $set: req.body })
    .asCallback(function (err) {
      next(err)
    })
  },
  findContext(),
  mw.res.json('context')
)

/** Delete a {@link module:models/context Context}
 *  @param {ObjectId} id Id of the Context to delete
 *  @returns 204 (w/ no content)
 *  @event DELETE rest/contexts/:id
 *  @memberof module:rest/contexts */
app.delete('/contexts/:id',
  findContext(PermissionService.ensureOwnerOrModerator),
  function (req, res, next) {
    Context.removeById(req.params.id)
    .asCallback(function (err) {
      next(err)
    })
  },
  mw.res.send(204))

/*  @returns {error} 405 - not allowed
 *  @event POST rest/contexts
 *  @param {object} body
 *  @param {string} body.name Name of the context to create
 *  @param {string} [body.owner] Owner of the context to create (an org the user may belong to)
 *  @memberof module:rest/contexts */
app.post('/contexts/',
  function (req, res, next) {
    ContextService.createNew(req.sessionUser, req.body)
      .then(function (context) {
        req.context = context
        next()
      })
      .catch(next)
  },
  mw.res.send(201, 'context'))
