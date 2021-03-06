/**
 * @module lib/models/mongo/schemas/build
 */
'use strict'

/**
 * Versions of a Context!
 */

var extend = require('extend')
var keypather = require('keypather')()
var mongoose = require('mongoose')
var mongooseHidden = require('mongoose-hidden')({ defaultHidden: {} })
var BaseSchema = require('models/mongo/schemas/base')
var validators = require('models/mongo/schemas/schema-validators').commonValidators

var ObjectId = mongoose.Schema.ObjectId
var Schema = mongoose.Schema

/** @alias module:models/version */
var BuildSchema = module.exports = new Schema({
  buildNumber: { // assigned when build is started
    type: Number
  },
  disabled: {
    type: Boolean
  },
  /** type: ObjectId */
  contexts: {
    type: [{
      type: ObjectId,
      ref: 'Contexts',
      required: 'Builds require a Context',
      validate: validators.objectId({model: 'Builds', literal: 'Context'})
    }]
  },
  /** type: ObjectId */
  contextVersions: {
    type: [{
      type: ObjectId,
      ref: 'ContextVersions',
      required: 'Builds require a Context Version',
      validate: validators.objectId({model: 'Builds', literal: 'Version', passIfEmpty: true})
    }],
    index: true
  },
  /** type: date */
  created: {
    type: Date,
    'default': Date.now,
    index: true,
    validate: validators.beforeNow({model: 'Builds', literal: 'Created'})
  },
  /** type: date */
  started: {
    type: Date,
    index: true,
    validate: validators.beforeNow({model: 'Builds', literal: 'Started'})
  },
  /** type: date */
  completed: {
    type: Date,
    index: true,
    validate: validators.beforeNow({model: 'Builds', literal: 'Completed'})
  },
  /** The Github userId of the entity which triggered this build
   * type: Number */
  createdBy: {
    required: 'Builds require an createdBy',
    type: {
      github: {
        type: Number
      // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
      }
    } // set when build is started
  },
  /** @type ObjectId */
  owner: {
    required: 'Builds require an Owner',
    type: {
      github: {
        type: Number
      // validate: validators.number({ model: 'Owner', literal: 'Github Owner' })
      },
      username: String // dynamic field for filling in
    }
  },
  failed: {
    type: Boolean,
    default: false
  }
})
BuildSchema.virtual('contextVersion').get(function () {
  return keypather.get(this, 'contextVersions[0]')
})
BuildSchema.virtual('successful').get(function () {
  return this.completed && !this.failed
})
BuildSchema.virtual('duration').get(function () {
  if (this.completed) {
    return this.completed - this.started
  }
})

extend(BuildSchema.methods, BaseSchema.methods)
extend(BuildSchema.statics, BaseSchema.statics)

BuildSchema.set('toJSON', { getters: true, virtuals: true })
// This hides the contextVersion virtual from being added to the toJSON result
BuildSchema.plugin(mongooseHidden, { virtuals: { contextVersion: 'hideJSON' } })

function numberRequirement (key) { return key && key.github && typeof key.github === 'number' }
BuildSchema.path('createdBy').validate(numberRequirement, 'Invalid CreatedBy')
BuildSchema.path('owner').validate(numberRequirement, 'Invalid owner')
