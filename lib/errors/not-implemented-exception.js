'use strict'

var util = require('util')
var defaults = require('101/defaults')
var isObject = require('101/is-object')

/**
 * Exception for when a certain functionality hasn't been enabled, and should exit from
 * the promise chain.
 * @class
 * @param {string} methodName Name of the method that encountered the error.
 * @param {string} message Message for the task error.
 * @param {object} [data] Extra data to include with the error, optional.
 */
function NotImplementedException (methodName, message, data) {
  Error.call(this)
  this._setMessageAndData(methodName, message, data)
}
util.inherits(NotImplementedException, Error)

/**
 * Sets the message and data for the error. This abstraction makes it easy to
 * test that subclasses are being initialized correctly.
 * @private
 * @param {string} methodName Name of the methodName that encountered the error.
 * @param {string} message Message for the task error.
 * @param {object} [data] Extra data to include with the error, optional.
 */
NotImplementedException.prototype._setMessageAndData = function (methodName, message, data) {
  this.message = message
  var errorData = { methodName: methodName }
  if (isObject(data)) {
    defaults(errorData, data)
  }
  this.data = errorData
}

/**
 * Normal exception for when a promise chain should be broken due to a feature being
 * turned off or is unimplemented
 */
module.exports = NotImplementedException
