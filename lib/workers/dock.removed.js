/**
 * Handle `dock.removed` event from
 *  - get all instance on the dock
 *  - redeploy those instances
 * @module lib/workers/dock.removed
 */
'use strict'
require('loadenv')()
const ContextVersion = require('models/mongo/context-version')
const errors = require('errors')
const Promise = require('bluebird')
const keypather = require('keypather')()
const rabbitMQ = require('models/rabbitmq')
const url = require('url')
const uuid = require('node-uuid')

const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const PermissionService = require('models/services/permission-service')
const joi = require('utils/joi')
const logger = require('logger')

module.exports.jobSchema = joi.object({
  host: joi.string().uri({ scheme: 'http' }).required(),
  githubOrgId: joi.number().required()
}).unknown().required()

/**
 * Main handler for docker unhealthy event
 * Should mark the dock removed on every context version that runs on that dock
 * Should mark stopping instances as stopped on that dock since the instances are technically stopped now
 * Should redeploy all running or starting containers on unhealthy dock
 * Should rebuild all building containers
 * @param {Object} job - Job info
 * @returns {Promise}
 */
module.exports.task = function (job) {
  job.deploymentUuid = uuid.v4()
  return ContextVersion.markDockRemovedByDockerHost(job.host)
    .then(function () {
      // These 2 tasks can run in parallel
      return Promise.all([ redeploy(job), rebuild(job) ])
    })
    .finally(function () {
      rabbitMQ.dockPurged({
        ipAddress: url.parse(job.host).hostname,
        githubOrgId: parseInt(job.githubOrgId, 10)
      })
    })
}
const checkInstance = function (instance) {
  const ownerGithubId = keypather.get(instance, 'owner.github')
  const log = logger.child({ method: 'checkInstance', instance, ownerGithubId })
  log.info('called')
  return PermissionService.checkOwnerAllowed(instance)
    .catch(errors.OrganizationNotAllowedError, (err) => {
      log.error({ ownerGithubId, instance, err }, 'Organization is not allowed, no need to redeploy/rebuild')
      return instance.unsetContainer()
    })
    .catch(errors.OrganizationNotFoundError, (err) => {
      log.error({ ownerGithubId, instance, err }, 'Organization is not whitelisted, no need to redeploy/rebuild')
      return instance.unsetContainer()
    })
}

/**
 * Find all instances that should be redeployed (built but not stopped or crashed) and create new job for each of them
 * @param {Object} job job data
 * @returns {Promise}
 */
const redeploy = function (job) {
  const log = logger.child({ method: 'redeploy', job })
  log.info('called')
  return Instance.findInstancesBuiltByDockerHost(job.host)
    .each(function (instance) {
      return checkInstance(instance)
        .then(function () {
          rabbitMQ.redeployInstanceContainer({
            instanceId: keypather.get(instance, '._id.toString()'),
            sessionUserGithubId: process.env.HELLO_RUNNABLE_GITHUB_ID,
            deploymentUuid: job.deploymentUuid
          })
          return instance
        })
    })
    .tap(function (instances) {
      log.info({ count: instances.length }, 'redeploy finished')
    })
    .then(updateFrontendInstances)
}

/**
 * Find all instances that should be rebuild and create new job for each of them
 * @param {Object} job job data
 * @returns {Promise}
 */
const rebuild = function (job) {
  const log = logger.child({ method: 'rebuild', job })
  log.info('called')
  return Instance.findInstancesBuildingOnDockerHost(job.host)
    .each(function (instance) {
      return checkInstance(instance)
        .then(function () {
          const payload = {
            instanceId: keypather.get(instance, '._id.toString()'),
            deploymentUuid: job.deploymentUuid
          }
          rabbitMQ.publishInstanceRebuild(payload)
          return instance
        })
    })
    .tap(function (instances) {
      log.info({ count: instances.length }, 'rebuild finished')
    })
    .then(updateFrontendInstances)
}

/**
 * send events to update frontend instances
 * @param {Array} instances array of instances that were updated
 * @returns {Promise}
 * @private
 */
const updateFrontendInstances = function (instances) {
  const log = logger.child({ count: instances.length, method: 'updateFrontendInstances' })
  log.info('called')
  return Promise.all(
    instances
      .map(function (instance) {
        return InstanceService.emitInstanceUpdate(instance, null, 'update')
      })
  )
}
