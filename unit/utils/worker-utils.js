'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var Code = require('code')
var expect = Code.expect

var joi = require('utils/joi')
var workerUtils = require('utils/worker-utils')
var WorkerStopError = require('error-cat/errors/worker-stop-error')

describe('worker utils unit test', function () {
  describe('validateJob', function () {
    it('should not fail if job is valid', function (done) {
      var schema = joi.object({
        instanceId: joi.string().required()
      }).required().label('instance.start job')
      workerUtils.validateJob({
        instanceId: 'cool-instance-id-1'
      }, schema)
      .then(function (result) {
        expect(result).to.not.exist()
        done()
      })
      .catch(done)
    })

    it('should throw WorkerStopError if job is invalid', function (done) {
      var schema = joi.object({
        instanceId: joi.string().required()
      }).required().label('instance.start job')
      var job = {
        instanceId: 1
      }
      workerUtils.validateJob(job, schema)
      .then(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err).to.be.instanceOf(WorkerStopError)
        expect(err.message).to.equal('Invalid Job')
        expect(err.data.validationError.message).to.equal('"instanceId" must be a string')
        done()
      })
    })
  })

  describe('assertFound', function () {
    it('should not fail if model is defined', function (done) {
      var job = {
        instanceId: 1
      }
      var instance = {
        _id: 1,
        name: 'good-instance'
      }
      workerUtils.assertFound(job, 'Instance')(instance)
      done()
    })

    it('should throw WorkerStopError if model is not defined', function (done) {
      var job = {
        instanceId: 1
      }
      var query = {
        _id: 1
      }
      try {
        workerUtils.assertFound(job, 'Instance', query)(null)
        done(new Error('Should never happen'))
      } catch (err) {
        expect(err).to.be.instanceOf(WorkerStopError)
        expect(err.message).to.equal('Instance not found')
        expect(err.data.query).to.equal(query)
        done()
      }
    })
  })
})
