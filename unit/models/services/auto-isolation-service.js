'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const beforeEach = lab.beforeEach
const afterEach = lab.afterEach

const Code = require('code')
const expect = Code.expect
const objectId = require('objectid')
const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const AutoIsolationConfig = require('models/mongo/auto-isolation-config')
const AutoIsolationService = require('models/services/auto-isolation-service')
const Instance = require('models/mongo/instance')

const rabbitMQ = require('models/rabbitmq')
const octobear = require('@runnable/octobear')

require('sinon-as-promised')(Promise)


describe('AutoIsolationService', () => {
  const ownedByOrg = 10000
  const createdByUser = 2000
  const instance = objectId('007f191e810c19729de860ef')
  const requestedDependencies = [
    {
      instance: objectId('107f191e810c19729de860ef')
    },
    {
      instance: objectId('207f191e810c19729de860ef')
    }
  ]
  describe('createOrUpdateAndEmit', () => {
    let configProps = {
      instance,
      requestedDependencies,
      createdByUser,
      ownedByOrg
    }
    let notFoundError
    let autoIsolationConfig
    beforeEach((done) => {
      notFoundError = new AutoIsolationConfig.NotFoundError('nope')
      autoIsolationConfig = new AutoIsolationConfig(configProps)
      done()
    })
    beforeEach((done) => {
      sinon.stub(AutoIsolationConfig, 'createAsync').resolves(autoIsolationConfig)
      sinon.stub(AutoIsolationConfig, 'findActiveByInstanceId').rejects(notFoundError)
      sinon.stub(rabbitMQ, 'autoIsolationConfigCreated').returns()
      done()
    })
    afterEach((done) => {
      AutoIsolationConfig.createAsync.restore()
      AutoIsolationConfig.findActiveByInstanceId.restore()
      rabbitMQ.autoIsolationConfigCreated.restore()
      done()
    })
    describe('errors', () => {
      it('should fail if AutoIsolationConfig.createAsync failed', (done) => {
        const error = new Error('Some error')
        AutoIsolationConfig.createAsync.rejects(error)
        AutoIsolationService.createOrUpdateAndEmit(configProps)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should fail if rabbit failed', (done) => {
        const error = new Error('Some error')
        rabbitMQ.autoIsolationConfigCreated.throws(error)
        AutoIsolationService.createOrUpdateAndEmit(configProps)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })
    describe('success', () => {
      it('should be successful and return saved model', (done) => {
        AutoIsolationService.createOrUpdateAndEmit(configProps)
        .tap((config) => {
          expect(config._id).to.exist()
          expect(config.created).to.exist()
          expect(config.createdByUser).to.equal(configProps.createdByUser)
          expect(config.ownedByOrg).to.equal(configProps.ownedByOrg)
          expect(config.instance).to.equal(configProps.instance)
          expect(config.requestedDependencies.length).to.equal(2)
        })
        .asCallback(done)
      })

      it('should call AutoIsolationConfig.createAsync properly', (done) => {
        AutoIsolationService.createOrUpdateAndEmit(configProps)
        .tap(() => {
          sinon.assert.calledOnce(AutoIsolationConfig.createAsync)
          sinon.assert.calledWithExactly(AutoIsolationConfig.createAsync, configProps)
        })
        .asCallback(done)
      })

      it('should call rabbitMQ.autoIsolationConfigCreated properly', (done) => {
        AutoIsolationService.createOrUpdateAndEmit(configProps)
        .tap((config) => {
          sinon.assert.calledOnce(rabbitMQ.autoIsolationConfigCreated)
          const newEvent = {
            autoIsolationConfig: { id: config._id.toString() },
            user: {
              id: createdByUser
            },
            organization: {
              id: ownedByOrg
            }
          }
          sinon.assert.calledWithExactly(rabbitMQ.autoIsolationConfigCreated, newEvent)
        })
        .asCallback(done)
      })

      it('should call in order', (done) => {
        AutoIsolationService.createOrUpdateAndEmit(configProps)
        .tap(() => {
          sinon.assert.callOrder(AutoIsolationConfig.createAsync, rabbitMQ.autoIsolationConfigCreated)
        })
        .asCallback(done)
      })
    })
    describe('Updating', () => {
      beforeEach((done) => {
        AutoIsolationConfig.findActiveByInstanceId.resolves(autoIsolationConfig)
        done()
      })
      beforeEach((done) => {
        sinon.stub(autoIsolationConfig, 'saveAsync').resolves(autoIsolationConfig)
        sinon.stub(autoIsolationConfig, 'set').returns()
        done()
      })
      it('should update the model if it already exists', (done) => {
        AutoIsolationService.createOrUpdateAndEmit(configProps)
          .tap((autoIsolationConfig) => {
            sinon.assert.calledOnce(AutoIsolationConfig.findActiveByInstanceId)
            sinon.assert.calledOnce(autoIsolationConfig.set)
            sinon.assert.calledWithExactly(autoIsolationConfig.set, configProps)
            sinon.assert.calledOnce(autoIsolationConfig.saveAsync)
          })
          .asCallback(done)
      })
      it('should call in order', (done) => {
        AutoIsolationService.createOrUpdateAndEmit(configProps)
          .tap(() => {
            sinon.assert.callOrder(
              AutoIsolationConfig.findActiveByInstanceId,
              autoIsolationConfig.set,
              autoIsolationConfig.saveAsync,
              rabbitMQ.autoIsolationConfigCreated
            )
          })
          .asCallback(done)
      })
      it('should call rabbitMQ.autoIsolationConfigCreated properly', (done) => {
        AutoIsolationService.createOrUpdateAndEmit(configProps)
          .tap((config) => {
            sinon.assert.calledOnce(rabbitMQ.autoIsolationConfigCreated)
            const newEvent = {
              autoIsolationConfig: { id: config._id.toString() },
              user: {
                id: createdByUser
              },
              organization: {
                id: ownedByOrg
              }
            }
            sinon.assert.calledWithExactly(rabbitMQ.autoIsolationConfigCreated, newEvent)
          })
          .asCallback(done)
      })
    })
  })

  describe('fetchIsolationInstanceModel', () => {
    let mockAutoIsolationConfig = {
      instance,
      requestedDependencies,
      createdByUser,
      ownedByOrg
    }
    const mainInstance = {
      _id: objectId('007f191e810c19729de86011'),
      isolated: '23e123123sdaqsd'
    }
    const mainConfigInstance = {
      _id: instance,
      isolated: 'asdasdasdasd'
    }
    const depInstance = {
      _id: objectId('007f191e810c19729de860ef')
    }
    const childInstance = {
      _id: objectId('007f191e810c19729de860ff')
    }
    beforeEach((done) => {
      sinon.stub(Instance, 'findInstanceById').resolves(depInstance)
      sinon.stub(Instance, 'findIsolatedChildOfParentInstance').resolves(childInstance)
      done()
    })
    afterEach((done) => {
      Instance.findInstanceById.restore()
      Instance.findIsolatedChildOfParentInstance.restore()
      done()
    })
    describe('errors', () => {
      it('should resolve null if findInstance couldn\'t find the instance', () => {
        const error = new Instance.NotFoundError('Some error')
        Instance.findInstanceById.rejects(error)
        return AutoIsolationService.fetchIsolationInstanceModel(depInstance._id, mainInstance, mockAutoIsolationConfig)
          .then(instanceValue => {
            expect(instanceValue).to.be.null()
          })
      })
      it('should fail if findInstance failed for some other reason', (done) => {
        const error = new Error('Some error')
        Instance.findInstanceById.rejects(error)
        AutoIsolationService.fetchIsolationInstanceModel(depInstance._id, mainInstance, mockAutoIsolationConfig)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
      it('should resolve null if findIsolatedChildOfParentInstance couldn\'t find the instance', () => {
        const error = new Instance.NotFoundError('Some error')
        Instance.findIsolatedChildOfParentInstance.rejects(error)
        return AutoIsolationService.fetchIsolationInstanceModel(depInstance._id, mainInstance, mockAutoIsolationConfig)
          .then(instanceValue => {
            expect(instanceValue).to.be.null()
          })
      })
      it('should fail if Instance.findIsolatedChildOfParentInstance failed', (done) => {
        const error = new Error('Some error')
        Instance.findIsolatedChildOfParentInstance.rejects(error)
        AutoIsolationService.fetchIsolationInstanceModel(depInstance._id, mainInstance, mockAutoIsolationConfig)
          .asCallback(function (err) {
            expect(err).to.exist()
            expect(err.message).to.equal(error.message)
            done()
          })
      })
    })

    describe('success', () => {
      it('should pass without failure', () => {
        return AutoIsolationService.fetchIsolationInstanceModel(depInstance._id, mainInstance, mockAutoIsolationConfig)
      })
      it('should resolve with an instance model that contains the dep and the master', () => {
        return AutoIsolationService.fetchIsolationInstanceModel(depInstance._id, mainInstance, mockAutoIsolationConfig)
          .then(function (instanceModel) {
            sinon.assert.calledOnce(Instance.findInstanceById)
            sinon.assert.calledWith(Instance.findInstanceById, depInstance._id)
            sinon.assert.calledOnce(Instance.findIsolatedChildOfParentInstance)
            sinon.assert.calledWith(Instance.findIsolatedChildOfParentInstance, depInstance, mainInstance.isolated)
            expect(instanceModel).to.equal({
              instance: childInstance,
              master: depInstance
            })
          })
      })
      it('should resolve with an instance model that contains just the dep', () => {
        return AutoIsolationService.fetchIsolationInstanceModel(depInstance._id, mainConfigInstance, mockAutoIsolationConfig)
          .then(function (instanceModel) {
            sinon.assert.calledOnce(Instance.findInstanceById)
            sinon.assert.calledWith(Instance.findInstanceById, depInstance._id)
            sinon.assert.notCalled(Instance.findIsolatedChildOfParentInstance)
            expect(instanceModel).to.equal({ instance: depInstance })
          })
      })
    })
  })
  describe('fetchDependentInstances', () => {
    let mockAutoIsolationConfig = {
      instance,
      requestedDependencies,
      createdByUser,
      ownedByOrg
    }
    const mainInstance = {
      _id: instance,
      isolated: '23e123123sdaqsd'
    }
    const depInstance = {
      _id: objectId('007f191e810c19729de860ef')
    }
    const childInstance = {
      _id: objectId('007f191e810c19729de860ff')
    }
    beforeEach((done) => {
      sinon.stub(AutoIsolationService, 'fetchIsolationInstanceModel').resolves(depInstance)
      done()
    })
    afterEach((done) => {
      AutoIsolationService.fetchIsolationInstanceModel.restore()
      done()
    })

    describe('success', () => {
      it('should pass without failure', () => {
        return AutoIsolationService.fetchDependentInstances(mainInstance, mockAutoIsolationConfig)
      })
      it('should call fetchIsolationInstanceModel for each dep', () => {
        return AutoIsolationService.fetchDependentInstances(mainInstance, mockAutoIsolationConfig)
          .then(() => {
            sinon.assert.calledTwice(AutoIsolationService.fetchIsolationInstanceModel)
            sinon.assert.calledWith(
              AutoIsolationService.fetchIsolationInstanceModel,
              requestedDependencies[0].instance,
              mainInstance,
              mockAutoIsolationConfig
            )
            sinon.assert.calledWith(
              AutoIsolationService.fetchIsolationInstanceModel,
              requestedDependencies[1].instance,
              mainInstance,
              mockAutoIsolationConfig
            )
          })
      })
      it('should filter out a dep without an instanceId', (done) => {
        mockAutoIsolationConfig.requestedDependencies.push({})
        return AutoIsolationService.fetchDependentInstances(mainInstance, mockAutoIsolationConfig)
          .then(instances => {
            sinon.assert.calledTwice(AutoIsolationService.fetchIsolationInstanceModel)
            expect(instances.length).to.equal(2)
          })
      })
      it('should filter out a dep that fails to be found', () => {
        AutoIsolationService.fetchIsolationInstanceModel.onCall(0).resolves(null) //
        return AutoIsolationService.fetchDependentInstances(mainInstance, mockAutoIsolationConfig)
          .then(instances => {
            expect(instances.length).to.equal(1)
          })
      })
    })
  })
})

