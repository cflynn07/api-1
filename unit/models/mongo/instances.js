'use strict'
var assign = require('101/assign')
var Code = require('code')
var error = require('error')
var keypather = require('keypather')()
var Lab = require('lab')
var mongoose = require('mongoose')
var objectId = require('objectid')
var Promise = require('bluebird')
var sinon = require('sinon')

var Build = require('models/mongo/build')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var mongoFactory = require('../../factories/mongo')
var pubsub = require('models/redis/pubsub')
var Version = require('models/mongo/context-version')
const ClusterDataService = require('models/services/cluster-data-service')
require('sinon-as-promised')(Promise)
var lab = exports.lab = Lab.script()

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it

var expectErr = function (expectedErr, done) {
  return function (err) {
    expect(err).to.equal(expectedErr)
    done()
  }
}

function newObjectId () {
  return new mongoose.Types.ObjectId()
}

describe('Instance Model Tests', function () {
  var ownerCreatedByKeypaths = ['owner.username', 'owner.gravatar', 'createdBy.username', 'createdBy.gravatar']
  // jshint maxcomplexity:5
  var ctx

  beforeEach(function (done) {
    ctx = {}
    done()
  })
  describe('assertNotStartingOrStopping', function () {
    it('should error if no container', function (done) {
      var instance = mongoFactory.createNewInstance('no-container')
      instance.container = {}
      Instance.assertNotStartingOrStopping(instance)
      .tap(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Instance does not have a container')
        done()
      })
    })

    it('should error if container starting', function (done) {
      var instance = mongoFactory.createNewInstance('container-starting')
      instance.container.inspect.State.Starting = true
      Instance.assertNotStartingOrStopping(instance)
      .tap(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Instance is already starting')
        done()
      })
    })

    it('should error if container stopping', function (done) {
      var instance = mongoFactory.createNewInstance('container-stopping')
      instance.container.inspect.State.Stopping = true
      Instance.assertNotStartingOrStopping(instance)
      .tap(function () {
        done(new Error('Should never happen'))
      })
      .catch(function (err) {
        expect(err.message).to.equal('Instance is already stopping')
        done()
      })
    })

    it('should return instance itself', function (done) {
      var instance = mongoFactory.createNewInstance('container-stopping')
      Instance.assertNotStartingOrStopping(instance)
      .tap(function (result) {
        expect(result.toJSON()).to.equal(instance.toJSON())
      })
      .asCallback(done)
    })
  })

  describe('findOneStarting', function () {
    var mockInstance = {
      _id: '507f1f77bcf86cd799439011',
      container: {
        inspect: {
          State: {
            Status: 'starting'
          }
        }
      }
    }

    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAsync')
      done()
    })

    afterEach(function (done) {
      Instance.findOneAsync.restore()
      done()
    })

    it('should throw not found if not exist', function (done) {
      Instance.findOneAsync.resolves()
      Instance.findOneStarting(mockInstance._id, 'container-id').asCallback(function (err, instance) {
        expect(err).to.be.an.instanceOf(Instance.NotFoundError)
        done()
      })
    })

    it('should throw IncorrectStateError if not in the right state', function (done) {
      var invalidState = {
        _id: '507f1f77bcf86cd799439011',
        container: {
          inspect: {
            State: {
              Status: 'jumping'
            }
          }
        }
      }
      Instance.findOneAsync.resolves(invalidState)
      Instance.findOneStarting(mockInstance._id, 'container-id').asCallback(function (err, instance) {
        expect(err).to.be.an.instanceOf(Instance.IncorrectStateError)
        done()
      })
    })

    it('should find starting instance', function (done) {
      Instance.findOneAsync.resolves(mockInstance)
      Instance.findOneStarting(mockInstance._id, 'container-id').asCallback(function (err, instance) {
        if (err) { return done(err) }
        expect(instance).to.equal(mockInstance)
        sinon.assert.calledOnce(Instance.findOneAsync)
        var query = {
          _id: mockInstance._id,
          'container.dockerContainer': 'container-id'
        }
        sinon.assert.calledWith(Instance.findOneAsync, query)
        done()
      })
    })

    it('should return an error if mongo call failed', function (done) {
      var mongoError = new Error('Mongo error')
      Instance.findOneAsync.rejects(mongoError)
      Instance.findOneStarting(mockInstance._id, 'container-id').asCallback(function (err, instance) {
        expect(err).to.equal(mongoError)
        sinon.assert.calledOnce(Instance.findOneAsync)
        done()
      })
    })
  })

  describe('setContainerError', function () {
    var testInstance = 'tester'
    var instanceId = '12312341234'
    var containerId = '12412424235'
    var testErr = 'something bad happened'
    beforeEach(function (done) {
      sinon.stub(Instance, '_updateAndCheck')
      done()
    })

    afterEach(function (done) {
      Instance._updateAndCheck.restore()
      done()
    })

    it('should set error on instance', function (done) {
      Instance._updateAndCheck.resolves(testInstance)
      Instance.setContainerError(instanceId, containerId, testErr).asCallback(function (err, instance) {
        if (err) { return done(err) }
        expect(instance).to.equal(testInstance)
        sinon.assert.calledOnce(Instance._updateAndCheck)
        sinon.assert.calledWith(Instance._updateAndCheck, {
          _id: instanceId,
          'container.dockerContainer': containerId
        }, {
          $set: {
            'container.error.message': testErr,
            'container.inspect.State.Dead': false,
            'container.inspect.State.Error': testErr,
            'container.inspect.State.OOMKilled': false,
            'container.inspect.State.Paused': false,
            'container.inspect.State.Restarting': false,
            'container.inspect.State.Running': false,
            'container.inspect.State.Starting': false,
            'container.inspect.State.Status': 'error',
            'container.inspect.State.Stopping': false
          }
        })
        done()
      })
    })
  })

  describe('setContainerCreateError', function () {
    var testInstance = 'tester'
    var instanceId = '57a3c46463a7e9110027e423'
    var contextVersionId = '57a3c46463a7e9110027e422'
    var testErr = 'something bad happened'
    beforeEach(function (done) {
      sinon.stub(Instance, '_updateAndCheck')
      done()
    })

    afterEach(function (done) {
      Instance._updateAndCheck.restore()
      done()
    })

    it('should set error on instance', function (done) {
      Instance._updateAndCheck.resolves(testInstance)
      Instance.setContainerCreateError(instanceId, contextVersionId, testErr).asCallback(function (err, instance) {
        if (err) { return done(err) }
        expect(instance).to.equal(testInstance)
        sinon.assert.calledOnce(Instance._updateAndCheck)
        sinon.assert.calledWith(Instance._updateAndCheck, {
          _id: instanceId,
          'contextVersion._id': objectId(contextVersionId),
          'container': {
            $exists: false
          }
        }, {
          $set: {
            'container.error.message': testErr,
            'container.inspect.State.Dead': false,
            'container.inspect.State.Error': testErr,
            'container.inspect.State.OOMKilled': false,
            'container.inspect.State.Paused': false,
            'container.inspect.State.Restarting': false,
            'container.inspect.State.Running': false,
            'container.inspect.State.Starting': false,
            'container.inspect.State.Status': 'error',
            'container.inspect.State.Stopping': false
          }
        })
        done()
      })
    })
  })

  describe('_updateAndCheck', function () {
    var testQuery = {
      _id: '123213',
      'container.dockerContainer': '123123123'
    }

    var testUpdate = {
      $set: { 'container.inspect.State.Dead': false }
    }

    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAndUpdateAsync')
      done()
    })

    afterEach(function (done) {
      Instance.findOneAndUpdateAsync.restore()
      done()
    })

    it('should call mongo correctly', function (done) {
      Instance.findOneAndUpdateAsync.resolves({})
      Instance._updateAndCheck(testQuery, testUpdate).asCallback(function (err, instance) {
        if (err) { return done(err) }
        sinon.assert.calledOnce(Instance.findOneAndUpdateAsync)
        sinon.assert.calledWith(Instance.findOneAndUpdateAsync, testQuery, testUpdate)
        done()
      })
    })

    it('should return an error if mongo call failed', function (done) {
      var mongoError = new Error('Mongo error')
      Instance.findOneAndUpdateAsync.rejects(mongoError)
      Instance._updateAndCheck(testQuery, testUpdate).asCallback(function (err, instance) {
        expect(err).to.equal(mongoError)
        sinon.assert.calledOnce(Instance.findOneAndUpdateAsync)
        done()
      })
    })

    it('should return 404 if instance was not found', function (done) {
      Instance.findOneAndUpdateAsync.resolves(null, null)
      Instance._updateAndCheck(testQuery, testUpdate).asCallback(function (err, instance) {
        expect(err.output.statusCode).to.equal(404)
        sinon.assert.calledOnce(Instance.findOneAndUpdateAsync)
        done()
      })
    })
  }) // end _updateAndCheck

  describe('markAsStarting', function () {
    var mockInstance = {
      _id: '507f1f77bcf86cd799439011'
    }

    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, mockInstance)
      done()
    })

    afterEach(function (done) {
      Instance.findOneAndUpdate.restore()
      done()
    })

    it('should mark instance as starting', function (done) {
      Instance.markAsStarting(mockInstance._id, 'container-id', function (err, instance) {
        expect(err).to.be.null()
        expect(instance).to.equal(mockInstance)
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        var query = {
          _id: mockInstance._id,
          'container.dockerContainer': 'container-id',
          'container.inspect.State.Stopping': {
            $exists: false
          }
        }
        var $set = {
          $set: {
            'container.inspect.State.Starting': true,
            'container.inspect.State.Status': 'starting'
          }
        }
        sinon.assert.calledWith(Instance.findOneAndUpdate, query, $set)
        done()
      })
    })

    it('should return an error if mongo call failed', function (done) {
      var mongoError = new Error('Mongo error')
      Instance.findOneAndUpdate.yieldsAsync(mongoError)
      Instance.markAsStarting(mockInstance._id, 'container-id', function (err, instance) {
        expect(err).to.equal(mongoError)
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        done()
      })
    })

    it('should return an error if instance was not found', function (done) {
      Instance.findOneAndUpdate.yieldsAsync(null, null)
      Instance.markAsStarting(mockInstance._id, 'container-id', function (err, instance) {
        expect(err.message).to.equal('Instance container has changed')
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        done()
      })
    })
  })

  describe('findOneStopping', function () {
    var mockInstance = {
      _id: '507f1f77bcf86cd799439011'
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOne').yieldsAsync(null, mockInstance)
      done()
    })
    afterEach(function (done) {
      Instance.findOne.restore()
      done()
    })
    it('should find stopping instance', function (done) {
      Instance.findOneStopping(mockInstance._id, 'container-id', function (err, instance) {
        expect(err).to.be.null()
        expect(instance).to.equal(mockInstance)
        sinon.assert.calledOnce(Instance.findOne)
        var query = {
          _id: mockInstance._id,
          'container.dockerContainer': 'container-id',
          'container.inspect.State.Stopping': true
        }
        sinon.assert.calledWith(Instance.findOne, query)
        done()
      })
    })
    it('should return an error if mongo call failed', function (done) {
      var mongoError = new Error('Mongo error')
      Instance.findOne.yieldsAsync(mongoError)
      Instance.findOneStopping(mockInstance._id, 'container-id', function (err) {
        expect(err).to.equal(mongoError)
        sinon.assert.calledOnce(Instance.findOne)
        done()
      })
    })
    it('should return null if instance was not found', function (done) {
      Instance.findOne.yieldsAsync(null, null)
      Instance.findOneStopping(mockInstance._id, 'container-id', function (err, instance) {
        expect(err).to.not.exist()
        expect(instance).to.be.null()
        sinon.assert.calledOnce(Instance.findOne)
        done()
      })
    })
  })

  describe('markAsStopping', function () {
    var mockInstance = {
      _id: '507f1f77bcf86cd799439011'
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, mockInstance)
      done()
    })
    afterEach(function (done) {
      Instance.findOneAndUpdate.restore()
      done()
    })
    it('should mark instance as stopping', function (done) {
      Instance.markAsStopping(mockInstance._id, 'container-id', function (err, instance) {
        expect(err).to.be.null()
        expect(instance).to.equal(mockInstance)
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        var query = {
          _id: mockInstance._id,
          'container.dockerContainer': 'container-id',
          'container.inspect.State.Starting': {
            $exists: false
          }
        }
        var $set = {
          $set: {
            'container.inspect.State.Stopping': true
          }
        }
        sinon.assert.calledWith(Instance.findOneAndUpdate, query, $set)
        done()
      })
    })
    it('should return an error if mongo call failed', function (done) {
      var mongoError = new Error('Mongo error')
      Instance.findOneAndUpdate.yieldsAsync(mongoError)
      Instance.markAsStopping(mockInstance._id, 'container-id', function (err, instance) {
        expect(err).to.equal(mongoError)
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        done()
      })
    })
    it('should return an error if instance was not found', function (done) {
      Instance.findOneAndUpdate.yieldsAsync(null, null)
      Instance.markAsStopping(mockInstance._id, 'container-id', function (err, instance) {
        expect(err.message).to.equal('Instance container has changed')
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        done()
      })
    })
  })

  describe('#findInstancesBuiltByDockerHost', function () {
    var testHost = 'http://10.0.0.1:4242'
    var instances = [
      {
        _id: 1
      },
      {
        _id: 2
      }
    ]
    beforeEach(function (done) {
      sinon.stub(Instance, 'findAsync').resolves(instances)
      done()
    })
    afterEach(function (done) {
      Instance.findAsync.restore()
      done()
    })
    it('should get all instances from testHost', function (done) {
      Instance.findInstancesBuiltByDockerHost(testHost).asCallback(function (err, foundInstances) {
        expect(err).to.be.null()
        expect(foundInstances).to.equal(instances)
        sinon.assert.calledOnce(Instance.findAsync)
        sinon.assert.calledWith(Instance.findAsync, {
          'container.dockerHost': testHost,
          'contextVersion.build.completed': { $exists: true }
        })
        done()
      })
    })
    it('should return an error if mongo fails', function (done) {
      var error = new Error('Mongo Error')
      Instance.findAsync.rejects(error)
      Instance.findInstancesBuiltByDockerHost(testHost).asCallback(function (err, foundInstances) {
        sinon.assert.calledOnce(Instance.findAsync)
        expect(err).to.equal(error)
        expect(foundInstances).to.not.exist()
        done()
      })
    })
  }) // end findInstancesBuiltByDockerHost

  describe('getMainBranchName', function () {
    it('should return null when there is no main AppCodeVersion', function (done) {
      var instance = mongoFactory.createNewInstance('no-main-app-code-version')
      instance.contextVersion.appCodeVersions[0].additionalRepo = true
      expect(Instance.getMainBranchName(instance)).to.be.null()
      done()
    })

    it('should return the main AppCodeVersion', function (done) {
      var expectedBranchName = 'somebranchomg'
      var instance = mongoFactory.createNewInstance('no-main-app-code-version', {
        branch: expectedBranchName
      })
      expect(Instance.getMainBranchName(instance)).to.equal(expectedBranchName)
      done()
    })
  })

  describe('#updateContextVersion', function () {
    var id = '1234'
    var updateObj = {
      dockRemoved: false
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'update').yieldsAsync(null)
      done()
    })
    afterEach(function (done) {
      Instance.update.restore()
      done()
    })
    it('should call the update command in mongo', function (done) {
      Instance.updateContextVersion(id, updateObj, function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.update)
        sinon.assert.calledWith(Instance.update, {
          'contextVersion.id': id
        }, {
          $set: {
            'contextVersion.dockRemoved': false
          }
        }, {
          multi: true
        }, sinon.match.func)
        done()
      })
    })

    describe('when mongo fails', function () {
      var error = new Error('Mongo Error')
      beforeEach(function (done) {
        Instance.update.yieldsAsync(error)
        done()
      })
      it('should return the error', function (done) {
        Instance.updateContextVersion(id, updateObj, function (err) {
          expect(err).to.equal(error)
          done()
        })
      })
    })
  })

  describe('invalidateContainerDNS', function () {
    var instance

    beforeEach(function (done) {
      instance = mongoFactory.createNewInstance('a', {})
      sinon.stub(pubsub, 'publish')
      done()
    })

    afterEach(function (done) {
      pubsub.publish.restore()
      done()
    })

    it('should not invalidate without a elasticHostname', function (done) {
      delete instance._doc.elasticHostname
      instance.invalidateContainerDNS()
      sinon.assert.notCalled(pubsub.publish)
      done()
    })

    it('should publish the correct invalidation event via redis', function (done) {
      var elasticHostname = 'the-host.com'
      instance.elasticHostname = elasticHostname
      instance.invalidateContainerDNS()
      sinon.assert.calledOnce(pubsub.publish)
      sinon.assert.calledWith(pubsub.publish,
        process.env.REDIS_DNS_INVALIDATION_KEY,
        elasticHostname
      )
      done()
    })
  })

  describe('fetchMatchingInstancesForDepChecking', function () {
    var ownerName = 'someowner'
    var isolationId = newObjectId()
    var instance

    beforeEach(function (done) {
      instance = mongoFactory.createNewInstance('wooosh', {
        isolated: isolationId
      })
      done()
    })

    afterEach(function (done) {
      Instance.find.restore()
      done()
    })

    describe('Error testing', function () {
      it('should be fine with an empty array result', function (done) {
        sinon.stub(Instance, 'find').yieldsAsync(null, [])
        instance.fetchMatchingInstancesForDepChecking(ownerName)
          .then(function (instances) {
            expect(instances.length).to.equal(0)
            sinon.assert.calledWith(
              Instance.find,
              {
                'owner.github': instance.owner.github,
                masterPod: true
              }
            )
          })
          .asCallback(done)
      })
      it('should throw error from Mongo', function (done) {
        var error = new Error('error')
        sinon.stub(Instance, 'find').yieldsAsync(error)
        instance.fetchMatchingInstancesForDepChecking(ownerName, true)
          .asCallback(function (err) {
            expect(err.message).to.equal(error.message)
            done()
          })
      })
    })

    describe('Test query creation', function () {
      beforeEach(function (done) {
        sinon.stub(Instance, 'find').yieldsAsync(null, [instance])
        done()
      })

      it('should query for masterpods', function (done) {
        instance.fetchMatchingInstancesForDepChecking(ownerName)
          .then(function (instances) {
            var expected = assign(instance, {
              hostname: instance.getElasticHostname(ownerName)
            }).toJSON()
            expect(instances[0].toJSON()).to.equal(expected)
            sinon.assert.calledWith(
              Instance.find,
              {
                'owner.github': instance.owner.github,
                masterPod: true
              }
            )
          })
          .asCallback(done)
      })

      it('should query for isolated containers', function (done) {
        instance.fetchMatchingInstancesForDepChecking(ownerName, true)
          .then(function (instances) {
            var expected = assign(instance, {
              hostname: instance.getElasticHostname(ownerName)
            }).toJSON()
            expect(instances[0].toJSON()).to.equal(expected)
            sinon.assert.calledWith(Instance.find,
              {
                'owner.github': instance.owner.github,
                isolated: isolationId
              }
            )
          })
          .asCallback(done)
      })
    })
  })

  describe('getHostnamesFromEnvsAndFnr', function () {
    var ownerName = 'someowner'

    it('should be fine with an empty array result', function (done) {
      var instanceWithOnlyEnvs = mongoFactory.createNewInstance('instanceWithOnlyEnvs', {
        env: [
          'as=hello-staging-' + ownerName + '.runnableapp.com',
          'df=adelle-staging-' + ownerName + '.runnableapp.com'
        ]
      })
      var hostnames = instanceWithOnlyEnvs.getHostnamesFromEnvsAndFnr()
      expect(hostnames).to.equal([
        'hello-staging-' + ownerName + '.runnableapp.com',
        'adelle-staging-' + ownerName + '.runnableapp.com'
      ])
      done()
    })
    it('should be fine with an empty array result', function (done) {
      var instanceWithOnlyFnR = mongoFactory.createNewInstance('instanceWithOnlyFnR')
      keypather.set(instanceWithOnlyFnR, 'contextVersion.appCodeVersions[0].transformRules.replace', [
        {
          find: 'hello',
          replace: 'hello-staging-' + ownerName + '.runnableapp.com'
        },
        {
          find: 'youthere',
          replace: 'adelle-staging-' + ownerName + '.runnableapp.com'
        }
      ])
      var hostnames = instanceWithOnlyFnR.getHostnamesFromEnvsAndFnr()
      expect(hostnames).to.equal([
        'hello-staging-' + ownerName + '.runnableapp.com',
        'adelle-staging-' + ownerName + '.runnableapp.com'
      ])
      done()
    })

    it('should grab hostnames from both envs and FnR', function (done) {
      var instanceWithBoth = mongoFactory.createNewInstance('instanceWithBoth', {
        env: [
          'as=hello-staging-' + ownerName + '.runnableapp.com',
          'df=adelle-staging-' + ownerName + '.runnableapp.com'
        ]
      })
      keypather.set(instanceWithBoth, 'contextVersion.appCodeVersions[0].transformRules.replace', [
        {
          find: 'hello',
          replace: 'hello2-staging-' + ownerName + '.runnableapp.com'
        },
        {
          find: 'youthere',
          replace: 'adelle-staging-' + ownerName + '.runnableapp.com'
        }
      ])

      var hostnames = instanceWithBoth.getHostnamesFromEnvsAndFnr()
      expect(hostnames).to.equal([
        'hello2-staging-' + ownerName + '.runnableapp.com',
        'adelle-staging-' + ownerName + '.runnableapp.com',
        'hello-staging-' + ownerName + '.runnableapp.com',
        'adelle-staging-' + ownerName + '.runnableapp.com' // repeat hosts are expected
      ])
      done()
    })
  })

  describe('setDependenciesFromEnvironment', function () {
    var ownerName = 'someowner'
    var instance

    beforeEach(function (done) {
      instance = mongoFactory.createNewInstance('wooosh', { hostname: 'wooosh-staging-' + ownerName + '.runnableapp.com' })
      sinon.spy(instance, 'invalidateContainerDNS')
      done()
    })

    afterEach(function (done) {
      instance.invalidateContainerDNS.restore()
      instance.getDependencies.restore()
      Instance.find.restore()
      done()
    })

    describe('Test invalidating cache entries', function () {
      beforeEach(function (done) {
        sinon.stub(instance, 'getDependencies').yieldsAsync(null, [])
        sinon.stub(Instance, 'find').yieldsAsync(null, [])
        done()
      })

      it('should invalidate dns cache entries', function (done) {
        instance.setDependenciesFromEnvironment(ownerName, function (err) {
          if (err) {
            done(err)
          }
          expect(instance.invalidateContainerDNS.calledOnce).to.be.true()
          done()
        })
      })
    })

    describe('Testing changes in connections', function () {
      var masterInstances
      beforeEach(function (done) {
        masterInstances = [
          mongoFactory.createNewInstance('hello', {
            masterPod: true,
            hostname: 'hello-staging-' + ownerName + '.runnableapp.com'
          }),
          mongoFactory.createNewInstance('adelle', {
            masterPod: true,
            hostname: 'adelle-staging-' + ownerName + '.runnableapp.com'
          })
        ]
        sinon.stub(Instance, 'find').yieldsAsync(null, masterInstances)
        sinon.stub(instance, 'addDependency').resolves()
        sinon.stub(instance, 'removeDependency').resolves()
        done()
      })
      afterEach(function (done) {
        instance.addDependency.restore()
        instance.removeDependency.restore()
        done()
      })
      describe('Envs', function () {
        it('should add a new dep for each env, when starting with none', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, [])
          instance.env = [
            'as=hello-staging-' + ownerName + '.runnableapp.com',
            'df=adelle-staging-' + ownerName + '.runnableapp.com'
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash)
            )
            sinon.assert.calledWith(instance.addDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[1].shortHash)
            )
            sinon.assert.notCalled(instance.removeDependency)
            done()
          })
        })
        it('should not allow it to add itself', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, [])
          instance.env = [
            'as=' + instance.elasticHostname
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.notCalled(instance.addDependency)
            done()
          })
        })
        it('should add 1 new dep, and keep the existing one', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, [masterInstances[1]])
          instance.env = [
            'as=hello-staging-' + ownerName + '.runnableapp.com',
            'df=adelle-staging-' + ownerName + '.runnableapp.com'
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledOnce(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash)
            )
            sinon.assert.notCalled(instance.removeDependency)
            done()
          })
        })
        it('should remove one of the existing, but leave the other', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, masterInstances)
          instance.env = [
            'df=adelle-staging-' + ownerName + '.runnableapp.com' // Keep masterInstance[1]
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledOnce(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              masterInstances[0]._id
            )
            sinon.assert.notCalled(instance.addDependency)
            done()
          })
        })
        it('should remove both of the existing', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, masterInstances)
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              masterInstances[0]._id
            )
            sinon.assert.calledWith(instance.removeDependency.getCall(1),
              masterInstances[1]._id
            )
            sinon.assert.notCalled(instance.addDependency)
            done()
          })
        })
        it('should remove the existing one, and add the new one', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, [masterInstances[1]])
          instance.env = [
            'df=hello-staging-' + ownerName + '.runnableapp.com' // Add masterInstance[0]
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledOnce(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
               masterInstances[1]._id
            )
            sinon.assert.calledOnce(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash)
            )
            done()
          })
        })
        it('should remove the existing one, and add the new one', function (done) {
          masterInstances.push(mongoFactory.createNewInstance('cheese', {
            masterPod: true,
            hostname: 'cheese-staging-' + ownerName + '.runnableapp.com'
          }))   // 2
          masterInstances.push(mongoFactory.createNewInstance('chicken', {
            masterPod: true,
            hostname: 'chicken-staging-' + ownerName + '.runnableapp.com'
          }))  // 3
          masterInstances.push(mongoFactory.createNewInstance('beef', {
            masterPod: true,
            hostname: 'beef-staging-' + ownerName + '.runnableapp.com'
          }))     // 4
          masterInstances.push(mongoFactory.createNewInstance('potatoes', {
            masterPod: true,
            hostname: 'potatoes-staging-' + ownerName + '.runnableapp.com'
          })) // 5
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, masterInstances.slice(0, 3))
          instance.env = [
            'df=hello-staging-' + ownerName + '.runnableapp.com', // keep masterInstance[0]
            'asd=chicken-staging-' + ownerName + '.runnableapp.com', // add masterInstance[3]
            'asfgas=potatoes-staging-' + ownerName + '.runnableapp.com' // add masterInstance[5]
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
             masterInstances[1]._id
            )
            sinon.assert.calledWith(instance.removeDependency.getCall(1),
              masterInstances[2]._id
            )
            sinon.assert.calledTwice(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[3].shortHash)
            )
            sinon.assert.calledWith(instance.addDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[5].shortHash)
            )
            done()
          })
        })
      })
      describe('FnR', function () {
        it('should add a new dep for each replace rule, when starting with none', function (done) {
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, [])
          var firstAppCodeVersion = keypather.get(instance, 'contextVersion.appCodeVersions[0]')
          firstAppCodeVersion.transformRules.replace = [
            {
              action: 'Replace',
              search: 'hello',
              replace: 'http://hello-staging-' + ownerName + '.runnableapp.com',
              exclude: []
            },
            {
              action: 'Replace',
              search: 'chicken',
              replace: 'adelle-staging-' + ownerName + '.runnableapp.com',
              exclude: []
            }
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[0].shortHash)
            )
            sinon.assert.calledWith(instance.addDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[1].shortHash)
            )
            sinon.assert.notCalled(instance.removeDependency)
            done()
          })
        })
        it('should remove the existing one, and add the new one', function (done) {
          masterInstances.push(mongoFactory.createNewInstance('cheese', {
            masterPod: true,
            hostname: 'cheese-staging-' + ownerName + '.runnableapp.com'
          }))   // 2
          masterInstances.push(mongoFactory.createNewInstance('chicken', {
            masterPod: true,
            hostname: 'chicken-staging-' + ownerName + '.runnableapp.com'
          }))  // 3
          masterInstances.push(mongoFactory.createNewInstance('beef', {
            masterPod: true,
            hostname: 'beef-staging-' + ownerName + '.runnableapp.com'
          }))     // 4
          masterInstances.push(mongoFactory.createNewInstance('potatoes', {
            masterPod: true,
            hostname: 'potatoes-staging-' + ownerName + '.runnableapp.com'
          })) // 5
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, masterInstances.slice(0, 3))
          instance.contextVersion.appCodeVersions[0].transformRules.replace = [
            {
              action: 'Replace',
              search: 'hello',
              replace: 'http://hello-staging-' + ownerName + '.runnableapp.com', // keep masterInstance[0]
              exclude: []
            },
            {
              action: 'Replace',
              search: 'chicken',
              replace: 'chicken-staging-' + ownerName + '.runnableapp.com', // add masterInstance[3]
              exclude: []
            }
          ]
          instance.contextVersion.appCodeVersions[1].transformRules.replace = [
            {
              action: 'Replace',
              search: 'potatoes',
              replace: 'http://potatoes-staging-' + ownerName + '.runnableapp.com', // add masterInstance[5]
              exclude: []
            }
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              masterInstances[1]._id
            )
            sinon.assert.calledWith(instance.removeDependency.getCall(1),
              masterInstances[2]._id
            )
            sinon.assert.calledTwice(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[3].shortHash)
            )
            sinon.assert.calledWith(instance.addDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[5].shortHash)
            )
            done()
          })
        })
      })
      describe('Working with both envs and FnR', function () {
        it('should remove the existing one, and add the new one', function (done) {
          masterInstances.push(mongoFactory.createNewInstance('cheese', {
            masterPod: true,
            hostname: 'cheese-staging-' + ownerName + '.runnableapp.com'
          }))   // 2
          masterInstances.push(mongoFactory.createNewInstance('chicken', {
            masterPod: true,
            hostname: 'chicken-staging-' + ownerName + '.runnableapp.com'
          }))  // 3
          masterInstances.push(mongoFactory.createNewInstance('beef', {
            masterPod: true,
            hostname: 'beef-staging-' + ownerName + '.runnableapp.com'
          }))     // 4
          masterInstances.push(mongoFactory.createNewInstance('potatoes', {
            masterPod: true,
            hostname: 'potatoes-staging-' + ownerName + '.runnableapp.com'
          })) // 5
          sinon.stub(instance, 'getDependencies').yieldsAsync(null, masterInstances.slice(0, 3))
          instance.contextVersion.appCodeVersions[0].transformRules.replace = [
            {
              action: 'Replace',
              search: 'hello',
              replace: 'http://hello-staging-' + ownerName + '.runnableapp.com', // keep masterInstance[0]
              exclude: []
            }
          ]
          instance.contextVersion.appCodeVersions[1].transformRules.replace = [
            {
              action: 'Replace',
              search: 'potatoes',
              replace: 'http://potatoes-staging-' + ownerName + '.runnableapp.com', // add masterInstance[5]
              exclude: []
            }
          ]
          instance.env = [
            'asd=chicken-staging-' + ownerName + '.runnableapp.com' // add masterInstance[3]
          ]
          instance.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              done(err)
            }
            sinon.assert.calledOnce(instance.invalidateContainerDNS)
            sinon.assert.calledTwice(instance.removeDependency)
            sinon.assert.calledWith(instance.removeDependency.getCall(0),
              masterInstances[1]._id
            )
            sinon.assert.calledWith(instance.removeDependency.getCall(1),
              masterInstances[2]._id
            )
            sinon.assert.calledTwice(instance.addDependency)
            sinon.assert.calledWith(instance.addDependency.getCall(0),
              sinon.match.has('shortHash', masterInstances[5].shortHash)
            )
            sinon.assert.calledWith(instance.addDependency.getCall(1),
              sinon.match.has('shortHash', masterInstances[3].shortHash)
            )
            done()
          })
        })
      })
    })
  })

  describe('removeDependency', function () {
    var instance = mongoFactory.createNewInstance('boooush')
    var dependant = mongoFactory.createNewInstance('mighty')

    beforeEach(function (done) {
      sinon.spy(instance, 'invalidateContainerDNS')
      sinon.stub(Instance, 'findByIdAndUpdateAsync').resolves(instance)
      done()
    })

    afterEach(function (done) {
      instance.invalidateContainerDNS.restore()
      Instance.findByIdAndUpdateAsync.restore()
      done()
    })

    it('should invalidate dns cache entries', function (done) {
      instance.removeDependency(dependant._id)
        .asCallback(function (err) {
          if (err) { done(err) }
          expect(instance.invalidateContainerDNS.calledOnce).to.be.true()
          done()
        })
    })
  })

  describe('addDefaultIsolationOpts', function () {
    it('should add default options for Isolation', function (done) {
      var opts = {}
      expect(Instance.addDefaultIsolationOpts(opts)).to.equal({
        $or: [
          { isolated: { $exists: false } },
          { isIsolationGroupMaster: true }
        ]
      })
      // enforce the function returns a new object, not the same one
      expect(opts).to.equal({})
      opts = { isolated: 4 }
      expect(Instance.addDefaultIsolationOpts(opts)).to.equal({ isolated: 4 })
      opts = { isIsolationGroupMaster: true }
      expect(Instance.addDefaultIsolationOpts(opts)).to.equal({
        isIsolationGroupMaster: true
      })
      opts = { $or: [{ value: 4 }] }
      expect(Instance.addDefaultIsolationOpts(opts)).to.equal({
        $or: [
          { value: 4 },
          { isolated: { $exists: false } },
          { isIsolationGroupMaster: true }
        ]
      })
      done()
    })

    it('should not add them when looking up by lowerName', function (done) {
      var opts = {}
      expect(Instance.addDefaultIsolationOpts(opts)).to.equal({
        $or: [
          { isolated: { $exists: false } },
          { isIsolationGroupMaster: true }
        ]
      })
      // enforce the function returns a new object, not the same one
      expect(opts).to.equal({})
      // check by lowerName
      opts = { lowerName: 'foobar' }
      expect(Instance.addDefaultIsolationOpts(opts)).to.equal({
        lowerName: 'foobar'
      })
      done()
    })
  })

  describe('populateOwnerAndCreatedBy', function () {
    beforeEach(function (done) {
      ctx.mockSessionUser = {
        accounts: {
          github: {
            id: 1234
          }
        }
      }
      ctx.instance = mongoFactory.createNewInstance()
      sinon.stub(ctx.instance, 'update').yieldsAsync(null)
      ctx.mockSessionUser.findGithubUserByGithubId = sinon.stub().yieldsAsync(null, {
        login: 'TEST-login',
        avatar_url: 'TEST-avatar_url'
      })
      done()
    })
    afterEach(function (done) {
      ctx.instance.update.restore()
      done()
    })
    describe('when owner and created by don\'t exist', function () {
      beforeEach(function (done) {
        keypather.set(ctx.instance, 'owner.github', 1234)
        keypather.set(ctx.instance, 'createdBy.github', 5678)
        done()
      })
      it('should populate the owner and created by', function (done) {
        ctx.instance.populateOwnerAndCreatedBy(ctx.mockSessionUser, function (err) {
          expect(err).to.not.exist()
          expect(ctx.instance.owner.username).to.equal('TEST-login')
          expect(ctx.instance.createdBy.username).to.equal('TEST-login')
          expect(ctx.instance.owner.gravatar).to.equal('TEST-avatar_url')
          expect(ctx.instance.createdBy.gravatar).to.equal('TEST-avatar_url')
          sinon.assert.calledTwice(ctx.mockSessionUser.findGithubUserByGithubId)
          sinon.assert.calledWith(ctx.mockSessionUser.findGithubUserByGithubId, ctx.instance.owner.github)
          sinon.assert.calledWith(ctx.mockSessionUser.findGithubUserByGithubId, ctx.instance.createdBy.github)
          done()
        })
      })
    })
    describe('when there is an error fetching github user by github id', function () {
      var testErr = new Error('Test Error!')
      beforeEach(function (done) {
        ctx.mockSessionUser.findGithubUserByGithubId.yieldsAsync(testErr)
        done()
      })
      it('should pass through the error', function (done) {
        ctx.instance.populateOwnerAndCreatedBy(ctx.mockSessionUser, function (err) {
          expect(err).to.exist()
          expect(err).to.equal(testErr)
          done()
        })
      })
    })
    describe('when owner and created by exist', function () {
      beforeEach(function (done) {
        ownerCreatedByKeypaths.forEach(function (path) {
          keypather.set(ctx.instance, path, 'TEST-' + path)
        })
        keypather.set(ctx.instance, 'owner.github', 1234)
        keypather.set(ctx.instance, 'createdBy.github', 5678)
        done()
      })
      it('should do nothing!', function (done) {
        ctx.instance.populateOwnerAndCreatedBy(ctx.mockSessionUser, function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(ctx.mockSessionUser.findGithubUserByGithubId)
          done()
        })
      })
    })
  })

  describe('#populateOwnerAndCreatedByForInstances', function () {
    beforeEach(function (done) {
      ctx.instance1 = mongoFactory.createNewInstance()
      ctx.instance2 = mongoFactory.createNewInstance()
      ctx.instances = [ctx.instance1, ctx.instance2]
      ctx.mockSessionUser = {
        findGithubUserByGithubId: sinon.stub().yieldsAsync(null, {
          login: 'TEST-login',
          avatar_url: 'TEST-avatar_url'
        }),
        accounts: {
          github: {
            id: 1234
          }
        }
      }
      done()
    })

    describe('when instances are all populated', function () {
      beforeEach(function (done) {
        ownerCreatedByKeypaths.forEach(function (path) {
          keypather.set(ctx.instance1, path, 'TEST-' + path)
          keypather.set(ctx.instance2, path, 'TEST-' + path)
        })
        keypather.set(ctx.instance1, 'owner.github', 1234)
        keypather.set(ctx.instance1, 'createdBy.github', 5678)
        keypather.set(ctx.instance2, 'owner.github', 1234)
        keypather.set(ctx.instance2, 'createdBy.github', 5678)
        done()
      })
      it('should do nothing!', function (done) {
        Instance.populateOwnerAndCreatedByForInstances(ctx.mockSessionUser, ctx.instances, function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(ctx.mockSessionUser.findGithubUserByGithubId)
          done()
        })
      })
    })

    describe('when instances are not all populated', function () {
      beforeEach(function (done) {
        keypather.set(ctx.instance1, 'owner.github', 1234)
        keypather.set(ctx.instance1, 'createdBy.github', 5678)
        keypather.set(ctx.instance2, 'owner.github', 1234)
        keypather.set(ctx.instance2, 'createdBy.github', 5678)
        done()
      })
      it('should fetch github user and populate', function (done) {
        Instance.populateOwnerAndCreatedByForInstances(ctx.mockSessionUser, ctx.instances, function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledTwice(ctx.mockSessionUser.findGithubUserByGithubId)
          sinon.assert.calledWith(ctx.mockSessionUser.findGithubUserByGithubId, ctx.instance1.owner.github)
          sinon.assert.calledWith(ctx.mockSessionUser.findGithubUserByGithubId, ctx.instance1.createdBy.github)

          expect(ctx.instance1.owner.username).to.equal('TEST-login')
          expect(ctx.instance2.owner.username).to.equal('TEST-login')
          expect(ctx.instance1.createdBy.username).to.equal('TEST-login')
          expect(ctx.instance2.createdBy.username).to.equal('TEST-login')
          expect(ctx.instance1.owner.gravatar).to.equal('TEST-avatar_url')
          expect(ctx.instance2.owner.gravatar).to.equal('TEST-avatar_url')
          expect(ctx.instance1.createdBy.gravatar).to.equal('TEST-avatar_url')
          expect(ctx.instance2.createdBy.gravatar).to.equal('TEST-avatar_url')
          done()
        })
      })
    })

    describe('when there is an error fetching github user by github id', function () {
      var testErr = new Error('Test Error!')
      beforeEach(function (done) {
        ctx.mockSessionUser.findGithubUserByGithubId.yieldsAsync(testErr)
        done()
      })
      it('should ignore the error completely and just keep going', function (done) {
        Instance.populateOwnerAndCreatedByForInstances(ctx.mockSessionUser, ctx.instances, function (err) {
          expect(err).to.not.exist()
          done()
        })
      })
    })
  })

  describe('updateCv', function () {
    beforeEach(function (done) {
      ctx.instance = mongoFactory.createNewInstance()
      ctx.mockCv = mongoFactory.createNewVersion({})
      sinon.stub(Version, 'findByIdAsync').resolves(ctx.mockCv)
      sinon.stub(Instance, 'findOneAndUpdateAsync').resolves(ctx.instance)
      done()
    })

    afterEach(function (done) {
      Version.findByIdAsync.restore()
      Instance.findOneAndUpdateAsync.restore()
      done()
    })

    it('should update the context version', function (done) {
      var originalCvId = ctx.instance.contextVersion._id.toString()
      ctx.instance.updateCv().asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Version.findByIdAsync)
        sinon.assert.calledWith(Version.findByIdAsync, originalCvId, {'build.log': 0})
        sinon.assert.calledOnce(Instance.findOneAndUpdateAsync)
        sinon.assert.calledWith(Instance.findOneAndUpdateAsync, {
          _id: ctx.instance._id,
          'contextVersion._id': objectId(originalCvId)
        }, {
          $set: {
            contextVersion: ctx.mockCv.toJSON()
          }
        }, { new: true })
        done()
      })
    })

    describe('when the db fails', function () {
      var TestErr = new Error('Test Err')
      beforeEach(function (done) {
        Version.findByIdAsync.rejects(TestErr)
        done()
      })
      it('should pass the error through', function (done) {
        ctx.instance.updateCv().asCallback(function (err) {
          expect(err).to.equal(TestErr)
          sinon.assert.notCalled(Instance.findOneAndUpdateAsync)
          done()
        })
      })
    })

    describe('when there are not found context versions', function () {
      beforeEach(function (done) {
        Version.findByIdAsync.resolves(null)
        done()
      })
      it('should throw the error', function (done) {
        ctx.instance.updateCv().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/no.context.version.found/i)
          sinon.assert.notCalled(Instance.findOneAndUpdateAsync)
          done()
        })
      })
    })
  })

  describe('.isolate', function () {
    var mockIsolationId = 'deadbeefdeadbeefdeadbeef'
    var mockInstance = {}
    var instance

    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, mockInstance)
      instance = mongoFactory.createNewInstance('sample')
      done()
    })

    afterEach(function (done) {
      Instance.findOneAndUpdate.restore()
      done()
    })

    describe('errors', function () {
      it('should require isolationId', function (done) {
        instance.isolate().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/isolate requires isolationid/i)
          done()
        })
      })

      it('should require an object ID for isolationId', function (done) {
        instance.isolate('hi').asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.match(/isolate.+objectid.+isolationid/i)
          done()
        })
      })

      it('should reject with any update error', function (done) {
        var error = new Error('pugsly')
        Instance.findOneAndUpdate.yieldsAsync(error)
        instance.isolate(mockIsolationId).asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })

    it('should update the instance to the database', function (done) {
      instance.isolate(mockIsolationId).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        sinon.assert.calledWithExactly(
          Instance.findOneAndUpdate,
          { _id: instance._id },
          sinon.match.object,
          sinon.match.func
        )
        done()
      })
    })

    it('should update the instance w/ master false by default', function (done) {
      instance.isolate(mockIsolationId).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        sinon.assert.calledWithExactly(
          Instance.findOneAndUpdate,
          { _id: instance._id },
          {
            $set: {
              isolated: mockIsolationId,
              isIsolationGroupMaster: false
            }
          },
          sinon.match.func
        )
        done()
      })
    })

    it('should update the instance w/ master true if supplied', function (done) {
      instance.isolate(mockIsolationId, true).asCallback(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        sinon.assert.calledWithExactly(
          Instance.findOneAndUpdate,
          { _id: instance._id },
          {
            $set: {
              isolated: mockIsolationId,
              isIsolationGroupMaster: true
            }
          },
          sinon.match.func
        )
        done()
      })
    })

    it('should return the updated instance from the update', function (done) {
      instance.isolate(mockIsolationId).asCallback(function (err, updatedInstance) {
        expect(err).to.not.exist()
        expect(updatedInstance).to.equal(mockInstance)
        done()
      })
    })
  })

  describe('unsetContainer', function () {
    var mockInstance = {}
    var instance

    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, mockInstance)
      instance = mongoFactory.createNewInstance('sample')
      instance.container = 'deadbeefdeadbeefdeadbeef'
      done()
    })

    afterEach(function (done) {
      Instance.findOneAndUpdate.restore()
      done()
    })

    describe('errors', function () {
      it('should reject with update errors', function (done) {
        var error = new Error('Mongo Error')
        Instance.findOneAndUpdate.yieldsAsync(error)
        instance.unsetContainer().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })

    it('should update the instance', function (done) {
      instance.unsetContainer().asCallback(function (err, updatedInstance) {
        expect(err).to.not.exist()
        expect(updatedInstance).to.equal(mockInstance)
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        sinon.assert.calledWithExactly(
          Instance.findOneAndUpdate,
          { _id: instance._id },
          {
            $unset: {
              container: true
            }
          },
          sinon.match.func
        )
        done()
      })
    })
  })
  describe('.deIsolate', function () {
    var mockInstance = {}
    var instance

    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, mockInstance)
      instance = mongoFactory.createNewInstance('sample')
      instance.isolated = 'deadbeefdeadbeefdeadbeef'
      instance.isIsolationGroupMaster = true
      done()
    })

    afterEach(function (done) {
      Instance.findOneAndUpdate.restore()
      done()
    })

    describe('errors', function () {
      it('should reject with update errors', function (done) {
        var error = new Error('pugsly')
        Instance.findOneAndUpdate.yieldsAsync(error)
        instance.deIsolate().asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })

    it('should update the instance', function (done) {
      instance.deIsolate().asCallback(function (err, updatedInstance) {
        expect(err).to.not.exist()
        expect(updatedInstance).to.equal(mockInstance)
        sinon.assert.calledOnce(Instance.findOneAndUpdate)
        sinon.assert.calledWithExactly(
          Instance.findOneAndUpdate,
          { _id: instance._id },
          {
            $unset: {
              isolated: true,
              isIsolationGroupMaster: true
            }
          },
          sinon.match.func
        )
        done()
      })
    })
  })

  describe('markAsStopping', function () {
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, { _id: 'some-id' })
      done()
    })
    afterEach(function (done) {
      Instance.findOneAndUpdate.restore()
      done()
    })
    it('should return found instance', function (done) {
      var query = {
        _id: 'some-id',
        'container.dockerContainer': 'container-id',
        'container.inspect.State.Starting': {
          $exists: false
        }
      }
      var update = {
        $set: {
          'container.inspect.State.Stopping': true
        }
      }
      Instance.markAsStopping('some-id', 'container-id', function (err, instance) {
        expect(err).to.not.exist()
        sinon.assert.calledWith(Instance.findOneAndUpdate, query, update)
        done()
      })
    })
    it('should return error if query failed', function (done) {
      var mongoError = new Error('Mongo error')
      Instance.findOneAndUpdate.yieldsAsync(mongoError)
      var query = {
        _id: 'some-id',
        'container.dockerContainer': 'container-id',
        'container.inspect.State.Starting': {
          $exists: false
        }
      }
      var update = {
        $set: {
          'container.inspect.State.Stopping': true
        }
      }
      Instance.markAsStopping('some-id', 'container-id', function (err, instance) {
        expect(err).to.equal(mongoError)
        sinon.assert.calledWith(Instance.findOneAndUpdate, query, update)
        done()
      })
    })
  })

  describe('findIsolationMaster', function () {
    var id = '571b39b9d35173300021667d'
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOne').yieldsAsync(null)
      done()
    })
    afterEach(function (done) {
      Instance.findOne.restore()
      done()
    })

    it('should query the database', function (done) {
      Instance.findIsolationMaster(id, function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.findOne)
        sinon.assert.calledWith(
          Instance.findOne,
          {
            isolated: id,
            isIsolationGroupMaster: true
          }
        )
        done()
      })
    })

    it('should return any errors', function (done) {
      var dbErr = new Error('MongoErr')
      Instance.findOne.yieldsAsync(dbErr)
      Instance.findIsolationMaster(id, function (err) {
        expect(err).to.exist()
        expect(err).to.equal(dbErr)
        done()
      })
    })
  })

  describe('#findInstancesInIsolationWithSameRepoAndBranch', function () {
    var id = '571b39b9d35173300021667d'
    var repo = 'repoName'
    var branch = 'brancName'
    beforeEach(function (done) {
      sinon.stub(Instance, 'find').yieldsAsync(null)
      done()
    })
    afterEach(function (done) {
      Instance.find.restore()
      done()
    })

    it('should query the database', function (done) {
      Instance.findInstancesInIsolationWithSameRepoAndBranch(id, repo, branch, function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.find)
        sinon.assert.calledWith(
          Instance.find,
          {
            isolated: id,
            'contextVersion.appCodeVersions': {
              $elemMatch: {
                lowerRepo: repo.toLowerCase(),
                lowerBranch: branch.toLowerCase(),
                additionalRepo: { $ne: true }
              }
            }
          }
        )
        done()
      })
    })

    it('should throw any database errors', function (done) {
      var dbErr = new Error('MongoErr')
      Instance.find.yieldsAsync(dbErr)
      Instance.findInstancesInIsolationWithSameRepoAndBranch(id, repo, branch, function (err) {
        expect(err).to.exist()
        expect(err).to.equal(dbErr)
        done()
      })
    })
  })

  describe('findInstancesLinkedToBranch', function () {
    var repo = 'repoName'
    var branch = 'branchName'
    beforeEach(function (done) {
      sinon.stub(Instance, 'find').yieldsAsync(null)
      done()
    })
    afterEach(function (done) {
      Instance.find.restore()
      done()
    })

    it('should query the database', function (done) {
      Instance.findInstancesLinkedToBranch(repo, branch, function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.find)
        sinon.assert.calledWith(
          Instance.find,
          {
            'contextVersion.appCodeVersions': {
              $elemMatch: {
                lowerRepo: repo.toLowerCase(),
                lowerBranch: branch.toLowerCase(),
                additionalRepo: { $ne: true }
              }
            }
          }
        )
        done()
      })
    })

    it('should not add the context ID if not passed', function (done) {
      Instance.findInstancesLinkedToBranch(repo, branch, function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Instance.find)
        sinon.assert.calledWith(
          Instance.find,
          {
            'contextVersion.appCodeVersions': {
              $elemMatch: {
                lowerRepo: repo.toLowerCase(),
                lowerBranch: branch.toLowerCase(),
                additionalRepo: { $ne: true }
              }
            }
          }
        )
        done()
      })
    })

    it('should throw any database errors', function (done) {
      var dbErr = new Error('MongoErr')
      Instance.find.yieldsAsync(dbErr)
      Instance.findInstancesLinkedToBranch(repo, branch, function (err) {
        expect(err).to.exist()
        expect(err).to.equal(dbErr)
        done()
      })
    })
  })

  describe('findInstancesForBranchAndBuildHash', function () {
    var repo = 'repoName'
    var branch = 'branchName'
    var contextId = newObjectId()
    var buildHash = 'build-hash'
    beforeEach(function (done) {
      sinon.stub(Instance, 'find').yieldsAsync(null)
      done()
    })
    afterEach(function (done) {
      Instance.find.restore()
      done()
    })

    it('should query the database', function (done) {
      Instance.findInstancesForBranchAndBuildHash(repo, branch, contextId, buildHash)
        .tap(function () {
          sinon.assert.calledOnce(Instance.find)
          sinon.assert.calledWith(
            Instance.find,
            {
              'contextVersion.context': contextId,
              'contextVersion.build.hash': buildHash,
              'contextVersion.appCodeVersions': {
                $elemMatch: {
                  lowerRepo: repo.toLowerCase(),
                  lowerBranch: branch.toLowerCase(),
                  additionalRepo: { $ne: true }
                }
              }
            }
          )
        })
        .asCallback(done)
    })

    it('should query the database without build hash if null', function (done) {
      Instance.findInstancesForBranchAndBuildHash(repo, branch, contextId, null)
        .tap(function () {
          sinon.assert.calledOnce(Instance.find)
          sinon.assert.calledWith(
            Instance.find,
            {
              'contextVersion.context': contextId,
              'contextVersion.build.hash': { $exists: false },
              'contextVersion.appCodeVersions': {
                $elemMatch: {
                  lowerRepo: repo.toLowerCase(),
                  lowerBranch: branch.toLowerCase(),
                  additionalRepo: { $ne: true }
                }
              }
            }
          )
        })
        .asCallback(done)
    })

    it('should query the database without build hash if is mirroring Dockerfile', function (done) {
      Instance.findInstancesForBranchAndBuildHash(repo, branch, contextId, buildHash, true)
        .tap(function () {
          sinon.assert.calledOnce(Instance.find)
          sinon.assert.calledWith(
            Instance.find,
            {
              'contextVersion.context': contextId,
              'contextVersion.appCodeVersions': {
                $elemMatch: {
                  lowerRepo: repo.toLowerCase(),
                  lowerBranch: branch.toLowerCase(),
                  additionalRepo: { $ne: true }
                }
              }
            }
          )
        })
        .asCallback(done)
    })

    it('should throw any database errors', function (done) {
      var dbErr = new Error('MongoErr')
      Instance.find.yieldsAsync(dbErr)
      Instance.findInstancesForBranchAndBuildHash(repo, branch, contextId, buildHash)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(dbErr.message)
          done()
        })
    })
  })

  describe('markAsCreating', function () {
    const testInstanceId = '123'
    const testContextVersionId = '456'
    const testContainerId = '678'
    const testContainerInfo = {
      test: 'data'
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAndUpdateAsync')
      done()
    })

    afterEach(function (done) {
      Instance.findOneAndUpdateAsync.restore()
      done()
    })

    it('should throw NotFound', (done) => {
      Instance.findOneAndUpdateAsync.resolves()
      Instance.markAsCreating(
        testInstanceId,
        testContextVersionId,
        testContainerId,
        testContainerInfo
      ).asCallback(err => {
        expect(err).to.be.an.instanceOf(Instance.NotFoundError)
        done()
      })
    })

    it('should markAsCreating', (done) => {
      Instance.findOneAndUpdateAsync.resolves({})
      Instance.markAsCreating(
        testInstanceId,
        testContextVersionId,
        testContainerId,
        testContainerInfo
      ).asCallback(err => {
        if (err) { return done(err) }
        sinon.assert.calledOnce(Instance.findOneAndUpdateAsync)
        sinon.assert.calledWith(Instance.findOneAndUpdateAsync, {
          _id: testInstanceId,
          'contextVersion.id': testContextVersionId,
          $or: [{
            'container.dockerContainer': testContainerId
          }, {
            container: {
              $exists: false
            }
          }]
        }, {
          $set: {
            container: testContainerInfo
          }
        })
        done()
      })
    })
  }) // end markAsCreating

  describe('convertAliasToDependency', function () {
    let instance
    const key = 'hello'
    const base64Key = new Buffer(key).toString('base64')
    const contextId = 'asdasasdasd'
    const isolatedId = '12312312=321'

    beforeEach(function (done) {
      instance = mongoFactory.createNewInstance()
      instance._doc.aliases[base64Key] = {
        id: key,
        contextId: contextId
      }
      instance._doc.masterPod = true
      sinon.stub(Instance, 'findOneAsync').resolves()
      done()
    })

    afterEach(function (done) {
      Instance.findOneAsync.restore()
      done()
    })
    describe('errors', function () {
      describe('NotFound', function () {
        it('should throw when no alias given', (done) => {
          instance.convertAliasToDependency()
            .catch(err => {
              expect(err).to.be.an.instanceOf(Instance.NotFoundError)
            })
            .asCallback(done)
        })
        it('should throw when alias not in instance', (done) => {
          instance.convertAliasToDependency('asdasdas')
            .catch(err => {
              expect(err).to.be.an.instanceOf(Instance.NotFoundError)
              expect(err.data.aliases).to.equal(instance._doc.aliases)
            })
            .asCallback(done)
        })
        it('should throw when instance not masterPod nor isolated', (done) => {
          delete instance._doc.masterPod
          delete instance._doc.isolated
          instance.convertAliasToDependency(key)
            .catch(err => {
              expect(err).to.be.an.instanceOf(Instance.IncorrectStateError)
            })
            .asCallback(done)
        })
        it('should throw when instance not returned from Mongo', (done) => {
          instance.convertAliasToDependency(key)
            .catch(err => {
              expect(err).to.be.an.instanceOf(Instance.NotFoundError)
            })
            .asCallback(done)
        })
      })
    })
    describe('Success', function () {
      let depInstance
      beforeEach(function (done) {
        depInstance = mongoFactory.createNewInstance('dep')
        Instance.findOneAsync.resolves(depInstance)
        done()
      })
      describe('masterPod', function () {
        it('should return instance when alias matches', (done) => {
          instance.convertAliasToDependency(key)
            .then(dep => {
              expect(dep._id).to.equal(depInstance._id)
              sinon.assert.calledOnce(Instance.findOneAsync)
              sinon.assert.calledWith(Instance.findOneAsync, {
                'contextVersion.context': contextId,
                masterPod: true
              })
            })
            .asCallback(done)
        })
      })
      describe('isolated', function () {
        beforeEach(function (done) {
          delete instance._doc.masterPod
          instance._doc.isolated = isolatedId
          done()
        })
        it('should return instance when alias matches', (done) => {
          instance.convertAliasToDependency(key)
            .then(dep => {
              expect(dep._id).to.equal(depInstance._id)
              sinon.assert.calledOnce(Instance.findOneAsync)
              sinon.assert.calledWith(Instance.findOneAsync, {
                'contextVersion.context': contextId,
                isolated: isolatedId
              })
            })
            .asCallback(done)
        })
      })
    })
  })
  describe('findParentByChildId', function () {
    let mockInstance
    let mockInstance2
    beforeEach(done => {
      mockInstance = {
        _id: '507f1f77bcf86cd799439011',
        contextVersion: {
          context: 'asdasd1we132er2dadf'
        }
      }
      mockInstance2 = {
        _id: 'rewrerh23oh3o3hi333ddfsdfe',
        contextVersion: {
          context: 'asdasd1we132er2dadf'
        }
      }
      done()
    })
    beforeEach(done => {
      sinon.stub(Instance, 'findByIdAsync')
      sinon.stub(Instance, 'findOneAsync')
      done()
    })
    afterEach(done => {
      Instance.findByIdAsync.restore()
      Instance.findOneAsync.restore()
      done()
    })
    describe('errors', function () {
      let error
      beforeEach(done => {
        error = new Error('sdasdsa')
        done()
      })
      it('should throw when instance isn\'t found', done => {
        Instance.findByIdAsync.rejects(error)
        Instance.findParentByChildId('asdas')
          .asCallback(err => {
            expect(err).to.equal(error)
            done()
          })
      })
      it('should throw when instance isn\'t found', done => {
        Instance.findByIdAsync.resolves(mockInstance)
        Instance.findOneAsync.rejects(error)
        Instance.findParentByChildId('asdas')
          .asCallback(err => {
            expect(err).to.equal(error)
            done()
          })
      })
    })
    describe('masterPod', function () {
      it('should call findOneAsync with the contextId from the parent', () => {
        Instance.findByIdAsync.resolves(mockInstance)
        Instance.findOneAsync.resolves(mockInstance2)
        return Instance.findParentByChildId('asdas')
          .then(parent => {
            expect(parent).to.equal(mockInstance2)
            sinon.assert.calledWithExactly(
              Instance.findOneAsync,
              {
                'contextVersion.context': mockInstance.contextVersion.context,
                masterPod: true
              }
            )
          })
      })
    })
  })

  describe('findInstancesByClusterUUID', function () {
    const data = {
      githubId: 'phi slamma jamma',
      clusterCreateId: 'UB40'
    }
    beforeEach(function (done) {
      sinon.stub(Instance, 'aggregateAsync').resolves({})
      done()
    })

    afterEach(function (done) {
      Instance.aggregateAsync.restore()
      done()
    })

    it('should query for instances', function (done) {
      Instance.findInstancesByClusterUUID(data.githubId, data.clusterCreateId)
        .then(() => {
          sinon.assert.calledOnce(Instance.aggregateAsync)
          sinon.assert.calledWithExactly(
            Instance.aggregateAsync,
            [{
              '$match': {
                'owner.github': data.githubId,
                'clusterCreateId': data.clusterCreateId
              }
            }]
          )
          done()
        })
    })
  })
})
