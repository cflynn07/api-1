/**
 * @module unit/workers/isolation.kill
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var clone = require('101/clone')
var objectId = require('objectid')
var Code = require('code')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var Worker = require('workers/isolation.kill')
var Isolation = require('models/mongo/isolation')
var IsolationService = require('models/services/isolation-service')
var Instance = require('models/mongo/instance')
var InstanceService = require('models/services/instance-service')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

describe('Workers: Isolation Kill', function () {
  var testIsolationId = '5633e9273e2b5b0c0077fd41'
  var testData = {
    isolationId: testIsolationId,
    triggerRedeploy: true
  }
  var instancesToStop = [
    {
      id: '456',
      container: {
        inspect: {
          State: {
            Starting: false
          }
        }
      }
    }, {
      id: '789',
      container: {
        inspect: {
          State: {
            Starting: false
          }
        }
      }
    }
  ]
  beforeEach(function (done) {
    sinon.stub(Isolation, 'findOneAndUpdateAsync').resolves({})
    sinon.stub(InstanceService, 'killInstance').resolves()
    sinon.stub(IsolationService, 'redeployIfAllKilled').resolves()
    sinon.stub(Instance, 'findAsync').returns(Promise.resolve(instancesToStop))
    done()
  })

  afterEach(function (done) {
    Isolation.findOneAndUpdateAsync.restore()
    Instance.findAsync.restore()
    InstanceService.killInstance.restore()
    IsolationService.redeployIfAllKilled.restore()
    done()
  })

  it('should fail if findOneAndUpdateAsync failed', function (done) {
    var error = new Error('Mongo error')
    Isolation.findOneAndUpdateAsync.rejects(error)
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should fail if findInstanceAsync failed', function (done) {
    var error = new Error('Mongo error')
    Instance.findAsync.rejects(error)
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should fail if killInstance failed', function (done) {
    var error = new Error('instance kill error')
    InstanceService.killInstance.rejects(error)
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should fail if IsolationService.redeployIfAllKilled failed', function (done) {
    var error = new Error('Mongo error')
    IsolationService.redeployIfAllKilled.rejects(error)
    Worker.task(testData).asCallback(function (err) {
      expect(err).to.exist()
      expect(err.message).to.equal(error.message)
      done()
    })
  })

  it('should update the isolation with the state of killing', function (done) {
    Worker.task(testData)
      .then(function () {
        sinon.assert.calledOnce(Isolation.findOneAndUpdateAsync)
        sinon.assert.calledWith(Isolation.findOneAndUpdateAsync, {
          _id: objectId(testData.isolationId)
        }, {
          $set: {
            state: 'killing'
          }
        })
      })
      .asCallback(done)
  })

  it('should not update the isolation with the state of killing if triggerRedeploy=false', function (done) {
    var data = clone(testData)
    data.triggerRedeploy = false
    Worker.task(data)
      .then(function () {
        sinon.assert.notCalled(Isolation.findOneAndUpdateAsync)
      })
      .asCallback(done)
  })

  it('should should call Instance.findAsync with the right parameters', function (done) {
    Worker.task(testData)
      .then(function () {
        sinon.assert.calledOnce(Instance.findAsync)
        sinon.assert.calledWith(Instance.findAsync, {
          isolated: testData.isolationId,
          'container.inspect.State.Stopping': {
            $ne: true
          },
          'container.inspect.State.Running': true,
          'container.inspect.State.Starting': {
            $ne: true
          }
        })
      })
      .asCallback(done)
  })

  it('should call kill on all instances', function (done) {
    Worker.task(testData)
      .then(function () {
        sinon.assert.calledTwice(InstanceService.killInstance)
        sinon.assert.calledWith(InstanceService.killInstance, instancesToStop[0])
        sinon.assert.calledWith(InstanceService.killInstance, instancesToStop[1])
      })
      .asCallback(done)
  })

  it('should call IsolationService.redeployIfAllKilled', function (done) {
    Worker.task(testData)
      .then(function () {
        sinon.assert.calledOnce(IsolationService.redeployIfAllKilled)
        sinon.assert.calledWith(IsolationService.redeployIfAllKilled, objectId(testIsolationId))
      })
      .asCallback(done)
  })
})
