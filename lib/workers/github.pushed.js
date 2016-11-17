'use strict'
require('loadenv')()
const joi = require('joi')
const WebhookService = require('models/services/webhook-service')

module.exports.jobSchema = joi.object({
  deliveryId: joi.string().required(),
  payload: joi.object({
    repository: joi.object().required(),
    ref: joi.string().required()
  }).unknown().required()
}).unknown().required()

module.exports.task = (job) => {
  return WebhookService.processGithookEvent(job.payload)
}