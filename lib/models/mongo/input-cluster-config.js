/**
 * @module lib/models/mongo/input-cluster-config
 */
'use strict'

const Promise = require('bluebird')
const logger = require('logger').child({ module: 'InputClusterConfig' })
const mongoose = require('mongoose')
const objectId = require('objectid')

const auditPlugin = require('./audit-plugin')
const BaseSchema = require('models/mongo/schemas/base')
const InputClusterConfigSchema = require('models/mongo/schemas/input-cluster-config')

InputClusterConfigSchema.plugin(auditPlugin, {
  modelName: 'InputClusterConfig'
})

/**
 * Find active (not deleted) InputClusterConfig by `autoIsolationId`
 *
 * @param {ObjectId} autoIsolationId - _id of the autoIsolation
 *
 * @resolves {InputClusterConfig} input-cluster-config config model
 * @rejects {InputClusterConfig.NotFoundError}  if active model wasn't found
 */
InputClusterConfigSchema.statics.findActiveByAutoIsolationId = function (autoIsolationId) {
  const log = logger.child({
    method: 'findActiveByAutoIsolationId',
    autoIsolationId
  })
  log.info('called')
  const query = {
    autoIsolationConfigId: objectId(autoIsolationId)
  }
  return InputClusterConfig.findOneActive(query)
}

/**
 * Find active (not deleted) InputClusterConfig by parent
 *
 * @param {ObjectId} icc - input cluster config to fetch the parent of
 * @param {ObjectId} icc.parentInputClusterConfigId - parent icc id
 *
 * @resolves {InputClusterConfig} input-cluster-config config model
 * @rejects {InputClusterConfig.NotFoundError}  if active model wasn't found
 */
InputClusterConfigSchema.statics.findActiveParentIcc = function (icc) {
  const log = logger.child({
    method: 'findActiveByAutoIsolationId',
    parentInputClusterConfigId: icc.parentInputClusterConfigId
  })
  log.info('called')
  const query = {
    _id: icc.parentInputClusterConfigId
  }
  return InputClusterConfig.findOneActive(query)
}

/**
 * Find active (not deleted) InputClusterConfig by similar icc
 *
 * @param {ObjectId} inputClusterConfig - a parent cluster config
 *
 * @resolves {InputClusterConfig} input-cluster-config config model
 * @rejects {InputClusterConfig.NotFoundError}  if active model wasn't found
 */
InputClusterConfigSchema.statics.findSimilarActive = function (inputClusterConfig) {
  const log = logger.child({
    method: 'findSimilarActive',
    inputClusterConfig
  })
  log.info('called')
  const query = {
    repo: inputClusterConfig.repo,
    branch: inputClusterConfig.branch,
    isTesting: inputClusterConfig.isTesting,
    'files.path': {
      '$all': inputClusterConfig.files.map((file) => file.path)
    },
    'files': {
      '$size': inputClusterConfig.files.length
    }
  }
  return InputClusterConfig.findAllActive(query)
}

/**
 * Find active (not deleted) InputClusterConfig by similar icc
 *
 * @param {inputClusterConfig[]} inputClusterConfigs - an array of parent cluster config
 *
 * @resolves {InputClusterConfig} input-cluster-config config model
 * @rejects {InputClusterConfig.NotFoundError}  if active model wasn't found
 */
InputClusterConfigSchema.statics.findAllChildren = function (inputClusterConfigs) {
  const log = logger.child({
    method: 'findAllChildren',
    inputClusterConfigs
  })
  log.info('called')
  const query = {
    parentInputClusterConfigId: {
      '$in': inputClusterConfigs.map((icc) => icc._id)
    }
  }
  return InputClusterConfig.findAllActive(query)
}

/**
 *
 * @param {AutoIsolationConfig} autoIsolationConfig
 * @param {ObjectId}            autoIsolationConfig._id
 * @param {Object}              clusterOpts
 * @param {Object[]}            clusterOpts.files
 * @param {String=}             clusterOpts.clusterName
 * @param {String}              clusterOpts.repo                       - full repo where the ICC exists(user/repo)
 * @param {String}              clusterOpts.branch                     - branch where this ICC exists
 * @param {String=}             clusterOpts.createdByUser
 * @param {String=}             clusterOpts.ownedByOrg
 * @param {Boolean=}            clusterOpts.isTesting
 * @param {ObjectId=}           clusterOpts.parentInputClusterConfigId - cluster id of the staging master
 * @param {Object=}             masterClusterOpts                      - cluster model of masterpod
 * @param {String}              masterClusterOpts._id                  - cluster model of masterpod
 * @param {String}              masterClusterOpts.clusterName          - Name of the cluster
 * @param {String}              masterClusterOpts.parentInputClusterConfigId - Config Id for master staging
 *
 * @resolves {InputClusterConfig} updated cluster model
 */
InputClusterConfigSchema.statics.createOrUpdateConfig = function (autoIsolationConfig, clusterOpts, masterClusterOpts) {
  const log = logger.child({
    method: 'createOrUpdateConfig',
    autoIsolationConfig, clusterOpts, masterClusterOpts
  })
  log.trace('called')
  const opts = {
    autoIsolationConfigId: autoIsolationConfig._id,
    files: clusterOpts.files
  }

  return InputClusterConfig.findActiveByAutoIsolationId(autoIsolationConfig._id)
    .tap(inputClusterConfig => inputClusterConfig.set(opts))
    .then(inputClusterConfig => inputClusterConfig.saveAsync())
    .catch(InputClusterConfig.NotFoundError, () => {
      // ICC couldn't be found to update, so we need to create a new one.
      const masterOpts = {
        branch: clusterOpts.branch,
        repo: clusterOpts.repo
      }
      if (masterClusterOpts) { // Newly created masters don't have this
        masterOpts.parentInputClusterConfigId = masterClusterOpts.parentInputClusterConfigId || masterClusterOpts._id
        masterOpts.clusterName = masterClusterOpts.clusterName
      }
      const newOpts = Object.assign({}, clusterOpts, opts, masterOpts)
      log.trace({ newOpts }, 'Creating an ICC with these opts')
      return InputClusterConfig.createAsync(newOpts)
    })
    .catch(err => {
      log.error({ err, opts }, 'Failed to create or update the ICC')
      throw err
    })
}

const InputClusterConfig = module.exports = mongoose.model('InputClusterConfig', InputClusterConfigSchema)

Promise.promisifyAll(InputClusterConfig)
Promise.promisifyAll(InputClusterConfig.prototype)

/**
 * Error thrown instance failed to create
 * @param {string} opts - data object given to the instance creation
 */
InputClusterConfig.NotChangedError = class extends BaseSchema.NotChangedError {
  constructor (opts) {
    super('InputClusterConfig', opts, 'debug')
  }
}
