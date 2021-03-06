'use strict'

var bluebird = require('bluebird')
var Boom = require('dat-middleware').Boom
var isFunction = require('101/is-function')
var joi = require('joi')
var keypather = require('keypather')()
var last = require('101/last')
var logger = require('logger')
var noop = require('101/noop')
var ObjectId = require('mongoose').Types.ObjectId

/**
 * validate json using joi and cast errors to boom
 * @param  {Object}   value    value to validate
 * @param  {Object}   schema   joi validation schema
 * @param  {Object}   [options]  joi.validate opts
 * @param  {Function} [callback] callback (sync)
 */
joi.validateOrBoom = function (value /*, schema, options, callback */) {
  var args = Array.prototype.slice.call(arguments)
  var log = logger.child({ method: 'joi.validateOrBoom', args: args[0] })
  log.info('joi.validateOrBoom called')

  var lastArg = last(args)
  var origCb = isFunction(lastArg) ? args.pop() : noop
  args.push(callback)
  joi.validate.apply(joi, args)
  function callback (err, _value) {
    var message
    if (err) {
      log.error({ err: err }, 'joi validate returned error')
      var detail = keypather.get(err, 'details[0]')
      if (detail) {
        message = detail.message
      }
      if (detail && detail.path) {
        // ensure keypath is in err message
        message = message.replace(/^"[^"]+"/, '"' + detail.path + '"')
      }
      message = message || 'Invalid data' // backup
      err = Boom.badRequest(message, {
        err: err,
        value: value
      })
    } else {
      log.trace('success')
    }
    origCb(err, _value)
  }
}

/**
 * mongo objectId string validator
 * @return {joiValidator} joi validator object
 */
joi.objectIdString = function () {
  return joi
    .string()
    .regex(/^[0-9a-f]{24}$/i, 'ObjectId')
}

/**
 * mongo objectId validator
 * @return {joiValidator} joi validator object
 */
joi.objectId = function () {
  return joi.alternatives().try(
    joi.object().type(ObjectId),
    joi.objectIdString()
  )
}

/**
 * OrgId validator - Verifies it's a valid number
 * @returns {joiValidator} joi validator object
 */
joi.orgId = function () {
  return joi.string().regex(/^[0-9]*$/, ['orgId'])
}

bluebird.promisifyAll(joi)
module.exports = joi
