'use strict'

var Promise = require('bluebird')
var mongoose = require('mongoose')
var SettingsSchema = require('models/mongo/schemas/settings')
var Settings

Settings = module.exports = mongoose.model('Settings', SettingsSchema)

Promise.promisifyAll(Settings)
Promise.promisifyAll(Settings.prototype)
