'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var expect = require('code').expect
var pick = require('101/pick')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var Bunyan = require('bunyan')
var Instance = require('models/mongo/instance')
var InstanceForkService = require('models/services/instance-fork-service')
var Isolation = require('models/mongo/isolation')

var IsolationService = require('models/services/isolation-service')

describe('Isolation Services Model', function () {
  describe('#forkNonRepoChild', function () {
    var mockInstanceId = 'mockInstanceId'
    var mockIsolationId = 'mockIsolationId'
    var mockSessionUser = {}
    var mockInstance = { _id: mockInstanceId }
    var mockNewInstance = { _id: 'newInstance' }

    beforeEach(function (done) {
      sinon.stub(Instance, 'findById').yieldsAsync(null, mockInstance)
      sinon.stub(InstanceForkService, '_forkNonRepoInstance').resolves(mockNewInstance)
      done()
    })

    afterEach(function (done) {
      Instance.findById.restore()
      InstanceForkService._forkNonRepoInstance.restore()
      done()
    })

    describe('errors', function () {
      describe('validation', function () {
        it('should require instanceId', function (done) {
          IsolationService.forkNonRepoChild()
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/instanceid.+required/i)
              done()
            })
        })

        it('should require isolationId', function (done) {
          IsolationService.forkNonRepoChild(mockInstanceId)
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/isolationid.+required/i)
              done()
            })
        })

        it('should require sessionUser', function (done) {
          IsolationService.forkNonRepoChild(mockInstanceId, mockIsolationId)
            .asCallback(function (err) {
              expect(err).to.exist()
              expect(err.message).to.match(/sessionuser.+required/i)
              done()
            })
        })
      })

      it('should reject with any findOne error', function (done) {
        var error = new Error('pugsly')
        Instance.findById.yieldsAsync(error)
        IsolationService.forkNonRepoChild(mockInstanceId, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should reject with any _forkNonRepoInstance error', function (done) {
        var error = new Error('pugsly')
        InstanceForkService._forkNonRepoInstance.rejects(error)
        IsolationService.forkNonRepoChild(mockInstanceId, mockIsolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })
    })

    it('should find the instance', function (done) {
      IsolationService.forkNonRepoChild(mockInstanceId, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findById)
          sinon.assert.calledWithExactly(
            Instance.findById,
            mockInstanceId,
            sinon.match.func
          )
          done()
        })
    })

    it('should fork the instance', function (done) {
      IsolationService.forkNonRepoChild(mockInstanceId, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(InstanceForkService._forkNonRepoInstance)
          sinon.assert.calledWithExactly(
            InstanceForkService._forkNonRepoInstance,
            mockInstance,
            mockIsolationId,
            mockSessionUser
          )
          done()
        })
    })

    it('should search then fork', function (done) {
      IsolationService.forkNonRepoChild(mockInstanceId, mockIsolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.callOrder(
            Instance.findById,
            InstanceForkService._forkNonRepoInstance
          )
          done()
        })
    })

    it('should return the new forked instance', function (done) {
      IsolationService.forkNonRepoChild(mockInstanceId, mockIsolationId, mockSessionUser)
        .asCallback(function (err, newInstance) {
          expect(err).to.not.exist()
          expect(newInstance).to.equal(mockNewInstance)
          done()
        })
    })
  })

  describe('#createIsolationAndEmitInstanceUpdates', function () {
    var mockNonRepoInstance = { instance: 'childNonRepo' }
    var mockInstance = {}
    var mockNewIsolation = { _id: 'newIsolationId' }
    var mockSessionUser = {}
    var data

    beforeEach(function (done) {
      data = {
        master: 'masterInstanceId',
        children: []
      }
      mockInstance.isolate = sinon.stub().resolves(mockInstance)
      mockInstance.emitInstanceUpdateAsync = sinon.stub().resolves()
      sinon.stub(Isolation, '_validateMasterNotIsolated').resolves(mockInstance)
      sinon.stub(Isolation, '_validateCreateData').resolves()
      sinon.stub(Isolation, 'createIsolation').resolves(mockNewIsolation)
      sinon.stub(IsolationService, 'forkNonRepoChild').resolves()
      sinon.spy(Bunyan.prototype, 'warn')
      done()
    })

    afterEach(function (done) {
      Isolation._validateMasterNotIsolated.restore()
      Isolation._validateCreateData.restore()
      Isolation.createIsolation.restore()
      IsolationService.forkNonRepoChild.restore()
      Bunyan.prototype.warn.restore()
      done()
    })

    describe('errors', function () {
      it('should require data', function (done) {
        IsolationService.createIsolationAndEmitInstanceUpdates().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/data.+required/i)
          done()
        })
      })

      it('should require sessionUser', function (done) {
        IsolationService.createIsolationAndEmitInstanceUpdates(data).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/user.+required/i)
          done()
        })
      })

      it('should reject with any data validation error', function (done) {
        var error = new Error('pugsly')
        Isolation._validateCreateData.rejects(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(data, mockSessionUser).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(error)
          done()
        })
      })

      it('should reject with any master validation error', function (done) {
        var error = new Error('pugsly')
        Isolation._validateMasterNotIsolated.rejects(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(data, mockSessionUser).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(error)
          done()
        })
      })

      it('should reject with any isolation create error', function (done) {
        var error = new Error('pugsly')
        Isolation.createIsolation.rejects(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(data, mockSessionUser).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(error)
          done()
        })
      })

      it('should reject with any master instance update error', function (done) {
        var error = new Error('pugsly')
        mockInstance.isolate.rejects(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(data, mockSessionUser).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(error)
          done()
        })
      })

      it('should reject with any forkNonRepoChild error', function (done) {
        var error = new Error('pugsly')
        IsolationService.forkNonRepoChild.rejects(error)
        data.children.push(mockNonRepoInstance)
        IsolationService.createIsolationAndEmitInstanceUpdates(data, mockSessionUser).asCallback(function (err) {
          expect(err).to.exist()
          expect(err).to.equal(error)
          done()
        })
      })

      it('should silence errors from instance events but log', function (done) {
        var error = new Error('pugsly')
        mockInstance.emitInstanceUpdateAsync.rejects(error)
        IsolationService.createIsolationAndEmitInstanceUpdates(data, mockSessionUser).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Bunyan.prototype.warn)
          sinon.assert.calledWithExactly(
            Bunyan.prototype.warn,
            sinon.match.object,
            'isolation service create failed to emit instance updates'
          )
          done()
        })
      })
    })

    it('should validate the isolation data', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(data, mockSessionUser).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Isolation._validateCreateData)
        sinon.assert.calledWithExactly(
          Isolation._validateCreateData,
          pick(data, [ 'master', 'children' ])
        )
        done()
      })
    })

    it('should validate the master instance', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(data, mockSessionUser).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Isolation._validateMasterNotIsolated)
        sinon.assert.calledWithExactly(
          Isolation._validateMasterNotIsolated,
          'masterInstanceId'
        )
        done()
      })
    })

    it('should create a new isolation', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(data, mockSessionUser).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Isolation.createIsolation)
        sinon.assert.calledWithExactly(
          Isolation.createIsolation,
          pick(data, [ 'master', 'children' ])
        )
        done()
      })
    })

    it('should update the master instance', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(data, mockSessionUser).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(mockInstance.isolate)
        sinon.assert.calledWithExactly(
          mockInstance.isolate,
          mockNewIsolation._id,
          true // markes as isolation group master
        )
        done()
      })
    })

    it('should not fork any child instance if none provide', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(data, mockSessionUser).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.notCalled(IsolationService.forkNonRepoChild)
        done()
      })
    })

    it('should fork any non-repo child instances provided', function (done) {
      data.children.push(mockNonRepoInstance)
      IsolationService.createIsolationAndEmitInstanceUpdates(data, mockSessionUser).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(IsolationService.forkNonRepoChild)
        sinon.assert.calledWithExactly(
          IsolationService.forkNonRepoChild,
          mockNonRepoInstance.instance,
          mockNewIsolation._id,
          mockSessionUser
        )
        done()
      })
    })

    it('should emit events for the master instance', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(data, mockSessionUser).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(mockInstance.emitInstanceUpdateAsync)
        sinon.assert.calledWithExactly(
          mockInstance.emitInstanceUpdateAsync,
          mockSessionUser,
          'isolation'
        )
        done()
      })
    })

    it('should return the new isolation', function (done) {
      IsolationService.createIsolationAndEmitInstanceUpdates(data, mockSessionUser).asCallback(function (err, newIsolation) {
        expect(err).to.not.exist()
        expect(newIsolation).to.equal(mockNewIsolation)
        done()
      })
    })
  })

  describe('#deleteIsolationAndEmitInstanceUpdates', function () {
    var isolationId = 'deadbeefdeadbeefdeadbeef'
    var mockIsolation = {}
    var mockInstance = { _id: 'foobar' }
    var mockSessionUser = { accounts: {} }

    beforeEach(function (done) {
      mockInstance.deIsolate = sinon.stub().resolves(mockInstance)
      mockInstance.emitInstanceUpdateAsync = sinon.stub().resolves()
      sinon.stub(Instance, 'findOne').yieldsAsync(null, mockInstance)
      sinon.stub(Isolation, 'findOneAndRemove').yieldsAsync(null, mockIsolation)
      sinon.stub(Bunyan.prototype, 'warn')
      done()
    })

    afterEach(function (done) {
      Instance.findOne.restore()
      Isolation.findOneAndRemove.restore()
      Bunyan.prototype.warn.restore()
      done()
    })

    describe('errors', function () {
      it('should require isolationId', function (done) {
        IsolationService.deleteIsolationAndEmitInstanceUpdates().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/isolationId.+required/i)
          done()
        })
      })

      it('should require sessionUser', function (done) {
        IsolationService.deleteIsolationAndEmitInstanceUpdates(isolationId).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/sessionUser.+required/i)
          done()
        })
      })

      it('should reject with any findOne errors', function (done) {
        var error = new Error('pugsly')
        Instance.findOne.yieldsAsync(error)
        IsolationService.deleteIsolationAndEmitInstanceUpdates(isolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should reject if it cannot find the instance', function (done) {
        Instance.findOne.yieldsAsync(null, null)
        IsolationService.deleteIsolationAndEmitInstanceUpdates(isolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.match(/no instance found/i)
            done()
          })
      })

      it('should reject with any deIsolate errors', function (done) {
        var error = new Error('pugsly')
        mockInstance.deIsolate.rejects(error)
        IsolationService.deleteIsolationAndEmitInstanceUpdates(isolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err).to.equal(error)
            done()
          })
      })

      it('should reject with any findOneAndRemove errors', function (done) {
        var error = new Error('pugsly')
        Isolation.findOneAndRemove.yieldsAsync(error)
        IsolationService.deleteIsolationAndEmitInstanceUpdates(isolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })

      it('should catch and log errors on emitting updates', function (done) {
        var error = new Error('pugsly')
        mockInstance.emitInstanceUpdateAsync.rejects(error)
        IsolationService.deleteIsolationAndEmitInstanceUpdates(isolationId, mockSessionUser)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledOnce(Bunyan.prototype.warn)
            sinon.assert.calledWithExactly(
              Bunyan.prototype.warn,
              sinon.match.object,
              'isolation service delete failed to emit instance updates'
            )
            done()
          })
      })
    })

    it('should find the instance that is isolated by the given id', function (done) {
      IsolationService.deleteIsolationAndEmitInstanceUpdates(isolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.findOne)
          sinon.assert.calledWithExactly(
            Instance.findOne,
            { isolated: isolationId },
            sinon.match.func
          )
          done()
        })
    })

    it('should deisolate the instance', function (done) {
      IsolationService.deleteIsolationAndEmitInstanceUpdates(isolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(mockInstance.deIsolate)
          sinon.assert.calledWithExactly(mockInstance.deIsolate)
          done()
        })
    })

    it('should remove the isolation', function (done) {
      IsolationService.deleteIsolationAndEmitInstanceUpdates(isolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Isolation.findOneAndRemove)
          sinon.assert.calledWithExactly(
            Isolation.findOneAndRemove,
            { _id: isolationId },
            sinon.match.func
          )
          done()
        })
    })

    it('should emit events for the updated instance', function (done) {
      IsolationService.deleteIsolationAndEmitInstanceUpdates(isolationId, mockSessionUser)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(mockInstance.emitInstanceUpdateAsync)
          sinon.assert.calledWithExactly(
            mockInstance.emitInstanceUpdateAsync,
            mockSessionUser,
            'isolation'
          )
          done()
        })
    })
  })
})
