/**
 * @module unit/workers/instance.start
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var omit = require('101/omit')
var Code = require('code')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var Docker = require('models/apis/docker')
var Worker = require('workers/instance.start')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')

var TaskFatalError = require('ponos').TaskFatalError
var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('Workers: Instance Start', function () {
  var testInstanceId = '5633e9273e2b5b0c0077fd41'
  var dockerContainer = '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
  var testSessionUserGithubId = 123123
  var testCvId = '507f191e810c19729de860ea'
  var testData = {
    instanceId: testInstanceId,
    containerId: dockerContainer,
    sessionUserGithubId: testSessionUserGithubId,
    tid: 'some-tid-id'
  }
  var testCV = new ContextVersion({
    _id: testCvId
  })
  var testInstance = new Instance({
    _id: testInstanceId,
    name: 'name1',
    shortHash: 'asd51a1',
    masterPod: true,
    owner: {
      github: 124,
      username: 'codenow',
      gravatar: ''
    },
    createdBy: {
      github: 125,
      username: 'runnabear',
      gravatar: ''
    },
    container: {
      dockerContainer: dockerContainer
    },
    network: {
      hostIp: '0.0.0.0'
    },
    build: '507f191e810c19729de860e2',
    contextVersion: {
      _id: testCvId,
      appCodeVersions: [
        {
          lowerBranch: 'develop',
          additionalRepo: false
        }
      ]
    }
  })
  beforeEach(function (done) {
    sinon.stub(Instance, 'findOneStartingAsync').resolves(testInstance)
    sinon.stub(ContextVersion, 'findByIdAsync').resolves(testCV)
    sinon.stub(Docker.prototype, 'startUserContainerAsync').resolves()
    sinon.stub(InstanceService, 'emitInstanceUpdate').resolves()
    done()
  })

  afterEach(function (done) {
    Instance.findOneStartingAsync.restore()
    ContextVersion.findByIdAsync.restore()
    Docker.prototype.startUserContainerAsync.restore()
    InstanceService.emitInstanceUpdate.restore()
    done()
  })

  describe('validation', function () {
    it('should fatally fail if job is null', function (done) {
      Worker(null).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.start: Invalid Job')
        done()
      })
    })
    it('should fatally fail if job is {}', function (done) {
      Worker({}).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.start: Invalid Job')
        done()
      })
    })
    it('should fatally fail if job has no instanceId', function (done) {
      var data = omit(testData, 'instanceId')
      Worker(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.start: Invalid Job')
        done()
      })
    })
    it('should fatally fail if job has no containerId', function (done) {
      var data = omit(testData, 'containerId')
      Worker(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.start: Invalid Job')
        done()
      })
    })
    it('should fatally fail if job has no sessionUserGithubId', function (done) {
      var data = omit(testData, 'sessionUserGithubId')
      Worker(data).asCallback(function (err) {
        expect(err).to.exist()
        expect(err).to.be.an.instanceOf(TaskFatalError)
        expect(err.message).to.equal('instance.start: Invalid Job')
        done()
      })
    })
  })
  it('should fail if findOneStartingAsync failed', function (done) {
    var error = new Error('Mongo error')
    Instance.findOneStartingAsync.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })
  it('should fail fatally if findOneStartingAsync returned no instance', function (done) {
    Instance.findOneStartingAsync.resolves(null)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err).to.be.instanceOf(TaskFatalError)
      expect(err.message).to.equal('instance.start: Instance not found')
      done()
    })
  })
  it('should fail fatally if ContextVersion.findByIdAsync returned no cv', function (done) {
    ContextVersion.findByIdAsync.resolves(null)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err).to.be.instanceOf(TaskFatalError)
      expect(err.message).to.equal('instance.start: ContextVersion not found')
      done()
    })
  })
  it('should fail if docker startContainer failed', function (done) {
    var error = new Error('Docker error')
    Docker.prototype.startUserContainerAsync.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })
  it('should fail if sending events failed', function (done) {
    var error = new Error('Primus error')
    InstanceService.emitInstanceUpdate.rejects(error)
    Worker(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })
  it('should call findOneStartingAsync', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(Instance.findOneStartingAsync)
      sinon.assert.calledWith(Instance.findOneStartingAsync, testInstanceId, dockerContainer)
      done()
    })
  })
  it('should call ContextVersion.findByIdAsync', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(ContextVersion.findByIdAsync)
      sinon.assert.calledWith(ContextVersion.findByIdAsync, testCvId)
      done()
    })
  })
  it('should call startContainer', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(Docker.prototype.startUserContainerAsync)
      sinon.assert.calledWith(Docker.prototype.startUserContainerAsync, dockerContainer, testCV)
      done()
    })
  })
  it('should call emitInstanceUpdate', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.calledOnce(InstanceService.emitInstanceUpdate)
      sinon.assert.calledWith(InstanceService.emitInstanceUpdate, testInstance, testSessionUserGithubId, 'starting', true)
      done()
    })
  })
  it('should call out to various models and helper methods in the correct order', function (done) {
    Worker(testData).asCallback(function (err) {
      expect(err).to.not.exist()
      sinon.assert.callOrder(
        Instance.findOneStartingAsync,
        ContextVersion.findByIdAsync,
        InstanceService.emitInstanceUpdate,
        Docker.prototype.startUserContainerAsync)
      done()
    })
  })
})