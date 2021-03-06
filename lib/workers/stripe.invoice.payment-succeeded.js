'use strict'
require('loadenv')()
const joi = require('joi')
const messenger = require('socket/messenger')
const BigPoppaClient = require('@runnable/big-poppa-client')
const bigPoppaClient = new BigPoppaClient(process.env.BIG_POPPA_HOST)

module.exports.jobSchema = joi.object({
  id: joi.string().required() // big poppa id
}).unknown().required()

module.exports.task = (job) => {
  let bigPoppaId = job.id.toString()
  let task = 'stripe.invoice.payment-succeeded'
  return bigPoppaClient.getOrganization(bigPoppaId)
    .then((org) => {
      let githubId = org.githubId
      let data = {task: task}
      return messenger.messageRoom('org', githubId, data)
    })
}
