/**
 * @module unit/workers/instance.delete
 */
'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()

const afterEach = lab.afterEach
const beforeEach = lab.beforeEach
const describe = lab.describe
const expect = require('code').expect
const it = lab.it

const Promise = require('bluebird')
const WorkerStopError = require('error-cat/errors/worker-stop-error')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const Instance = require('models/mongo/instance')
const Worker = require('workers/instance.delete')
const messenger = require('socket/messenger')
const rabbitMQ = require('models/rabbitmq')

describe('Instance Delete Worker', function () {
  describe('worker', function () {
    const testInstanceId = '5633e9273e2b5b0c0077fd41'
    const testData = {
      instanceId: testInstanceId
    }
    const testInstance = new Instance({
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
        dockerContainer: '46080d6253c8db55b8bbb9408654896964b86c63e863f1b3b0301057d1ad92ba'
      },
      network: {
        hostIp: '0.0.0.0'
      },
      build: '507f191e810c19729de860e2',
      contextVersion: {
        appCodeVersions: [
          {
            lowerBranch: 'develop',
            additionalRepo: false
          }
        ]
      }
    })

    beforeEach(function (done) {
      sinon.stub(Instance, 'findByIdAsync').resolves(testInstance)
      sinon.stub(rabbitMQ, 'deleteContainer').returns()
      sinon.stub(Instance.prototype, 'removeSelfFromGraph').resolves()
      sinon.stub(Instance.prototype, 'removeAsync').resolves()
      sinon.stub(messenger, 'emitInstanceDelete').returns()
      done()
    })

    afterEach(function (done) {
      Instance.findByIdAsync.restore()
      rabbitMQ.deleteContainer.restore()
      Instance.prototype.removeSelfFromGraph.restore()
      Instance.prototype.removeAsync.restore()
      messenger.emitInstanceDelete.restore()
      done()
    })

    describe('errors', function () {
      it('should reject with any findById error', function (done) {
        const mongoError = new Error('Mongo failed')
        Instance.findByIdAsync.rejects(mongoError)

        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(mongoError)
          done()
        })
      })

      it('should reject when instance not found with WorkerStopError', function (done) {
        Instance.findByIdAsync.resolves(null)

        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.be.instanceOf(WorkerStopError)
          expect(err.message).to.match(/instance not found/i)
          done()
        })
      })

      it('should reject with any removeSelfFromGraph error', function (done) {
        const neoError = new Error('Neo failed')
        Instance.prototype.removeSelfFromGraph.rejects(neoError)

        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(neoError.message)
          done()
        })
      })

      it('should reject with any remove error', function (done) {
        const mongoError = new Error('Mongo failed')
        Instance.prototype.removeAsync.rejects(mongoError)

        Worker.task(testData).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(mongoError)
          done()
        })
      })
    })

    it('should return no error', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        done()
      })
    })

    it('should find an instance by id', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findByIdAsync)
        sinon.assert.calledWithExactly(Instance.findByIdAsync, testInstanceId)
        done()
      })
    })

    it('should remove the instance from the graph', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.prototype.removeSelfFromGraph)
        done()
      })
    })

    it('should remove the mongo model', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.prototype.removeAsync)
        done()
      })
    })

    it('should enqueue a job to remove the container', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(rabbitMQ.deleteContainer)
        sinon.assert.calledWithExactly(rabbitMQ.deleteContainer, {
          containerId: testInstance.container.dockerContainer
        })
        done()
      })
    })

    it('should emit events about the instance deletion', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(messenger.emitInstanceDelete)
        sinon.assert.calledWithExactly(messenger.emitInstanceDelete, testInstance)
        done()
      })
    })

    describe('no container', function () {
      it('should not delete container if there is no container', function (done) {
        testInstance.container = null
        Instance.findByIdAsync.resolves(testInstance)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(rabbitMQ.deleteContainer)
          done()
        })
      })

      it('should not delete container if there is no container.dockerContainer', function (done) {
        testInstance.container = {
          dockerContainer: null
        }
        Instance.findByIdAsync.resolves(testInstance)
        Worker.task(testData).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(rabbitMQ.deleteContainer)
          done()
        })
      })
    })

    it('should perform all these tasks in order', function (done) {
      Worker.task(testData).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.callOrder(
          Instance.findByIdAsync,
          Instance.prototype.removeSelfFromGraph,
          Instance.prototype.removeAsync,
          rabbitMQ.deleteContainer,
          messenger.emitInstanceDelete
        )
        done()
      })
    })
  })
})
