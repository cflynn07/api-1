/**
 * Manage starting a build container (and save it to the context version)
 *
 * @module lib/workers/build.container.created
 */
'use strict'
require('loadenv')()
const keypather = require('keypather')()
const moment = require('moment')
const pluck = require('101/pluck')
const Promise = require('bluebird')
const WorkerError = require('error-cat/errors/worker-error')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const ContextVersion = require('models/mongo/context-version')
const Docker = require('models/apis/docker')
const InstanceService = require('models/services/instance-service')
const joi = require('utils/joi')
const logger = require('logger')
const messenger = require('socket/messenger')

/** @type {Number} max 98% of all created calls to date 09-2016 */
module.exports.msTimeout = 10000

/** @type {Number} database should be updated within 30 seconds */
module.exports.maxNumRetries = 5

module.exports.jobSchema = joi.object({
  host: joi.string().uri({ scheme: 'http' }).required(),
  inspectData: joi.object({
    Config: joi.object({
      Labels: joi.object({
        'contextVersion.build._id': joi.string().required(),
        dockerTag: joi.string().required()
      }).unknown().required()
    }).unknown().required(),
    Id: joi.string().required()
  }).unknown().required()
}).unknown().required()

/**
 * start image builder container in response to the image builder container created event
 * 1. validate job
 * 2. find cv with desired state and update
 * 3. validate cv was updated (if not, cv was in incorrect state to move forward)
 * 4. attempt to start image builder container
 * @param  {Object} job worker job
 * @return {Promise} worker task promise
 */
module.exports.task = (job) => {
  const log = logger.child({ method: 'BuildContainerCreated' })
  const contextVersionBuildId = job.inspectData.Config.Labels['contextVersion.build._id']
  const dockerContainerId = job.inspectData.Id
  const dockerTag = job.inspectData.Config.Labels.dockerTag
  return Promise
    .try(function updateContextVersion () {
      const query = {
        'build._id': contextVersionBuildId,
        'build.finished': {
          $exists: false
        },
        'build.started': {
          $exists: true
        },
        state: { $ne: ContextVersion.states.buildStarted }
      }
      const update = {
        $set: {
          state: ContextVersion.states.buildStarting,
          dockerHost: job.host,
          'build.dockerContainer': dockerContainerId,
          'build.dockerTag': dockerTag
        }
      }
      log.trace({ query: query, update: update }, 'updateContextVersion')
      // need to update all cv's with this build for dedupe logic to work
      return ContextVersion.updateAsync(query, update, { multi: true })
    })
    .then(function validateUpdate (updatedCount) {
      log.trace({ updatedCount: updatedCount }, 'validateUpdate')

      if (updatedCount === 0) {
        throw new WorkerStopError(
          'no valid ContextVersion found to start',
          { job: job })
      }
    })
    .then(function startImageBuilderContainer () {
      log.trace('startImageBuilderContainer')

      const docker = new Docker()

      return docker.startContainerAsync(dockerContainerId)
        .catch(function (err) {
          if (keypather.get(err, 'output.statusCode') === 404) {
            const created = keypather.get(job, 'inspectData.Created')
            if (created && moment(created) < moment().subtract(5, 'minutes')) {
              throw new WorkerStopError(
                'container does not exist after 5 minutes',
                { job: job })
            }
            throw new WorkerError(
              'container does not exist',
              { job: job, err: err }
            )
          }
          throw err
        })
    })
    .then(function findContextVersions () {
      const query = {
        'build._id': contextVersionBuildId,
        'state': ContextVersion.states.buildStarting
      }
      return ContextVersion.findAsync(query)
    })
    .then(function emitContextVersionUpdate (contextVersions) {
      log.trace({ contextVersions: contextVersions.map(pluck('_id')) }, 'emitContextVersionUpdate')

      contextVersions.forEach(function (contextVersion) {
        messenger.emitContextVersionUpdate(contextVersion, 'build_started')
      })
    })
    .then(function emitInstanceUpdate () {
      return InstanceService.emitInstanceUpdateByCvBuildId(contextVersionBuildId, 'build_started')
    })
}
