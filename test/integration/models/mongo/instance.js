'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect
var sinon = require('sinon')
var error = require('error')
var objectId = require('objectid')
var pick = require('101/pick')
var pluck = require('101/pluck')
var mongoose = require('mongoose')
var Promise = require('bluebird')

var Instance = require('models/mongo/instance')
var mongoFactory = require('../../fixtures/factory')
var mongooseControl = require('models/mongo/mongoose-control.js')
require('sinon-as-promised')

function newObjectId () {
  return new mongoose.Types.ObjectId()
}

function makeGraphNodeFromInstance (instance) {
  return {
    instanceId: instance._id,
    elasticHostname: instance.elasticHostname,
    name: instance.name
  }
}

describe('Instance Model Integration Tests', function () {
  before(mongooseControl.start)
  var ctx
  beforeEach(function (done) {
    ctx = {}
    done()
  })

  beforeEach(require('../../../functional/fixtures/clean-mongo').removeEverything)
  afterEach(require('../../../functional/fixtures/clean-mongo').removeEverything)
  after(mongooseControl.stop)

  describe('remove', function () {
    it('should not throw error if instance does not exist in db', function (done) {
      var inst = mongoFactory.createNewInstance('api-anton-1')
      inst.remove(function (err) {
        expect(err).to.be.null()
        done()
      })
    })
  })

  describe('save', function () {
    it('should not save an instance with the same (lower) name and owner', function (done) {
      var instance = mongoFactory.createNewInstance('hello')
      instance.save(function (err, instance) {
        if (err) { return done(err) }
        expect(instance).to.exist()
        var newInstance = mongoFactory.createNewInstance('Hello')
        newInstance.save(function (err, instance) {
          expect(instance).to.not.exist()
          expect(err).to.exist()
          expect(err.code).to.equal(11000)
          done()
        })
      })
    })
  }) // end save

  describe('modifyContainerCreateErr', function () {
    var savedInstance = null
    var instance = null
    beforeEach(function (done) {
      sinon.spy(error, 'log')
      instance = mongoFactory.createNewInstance()
      instance.save(function (err, instance) {
        if (err) { return done(err) }
        expect(instance).to.exist()
        savedInstance = instance
        done()
      })
    })
    afterEach(function (done) {
      error.log.restore()
      done()
    })
    it('should fail if error was not provided', function (done) {
      var cvId = savedInstance.contextVersion._id
      savedInstance.modifyContainerCreateErr(cvId, null, function (err) {
        expect(err.output.statusCode).to.equal(500)
        expect(err.message).to.equal('Create container error was not defined')
        done()
      })
    })

    it('should fail if error was empty object', function (done) {
      var cvId = savedInstance.contextVersion._id
      savedInstance.modifyContainerCreateErr(cvId, {}, function (err) {
        expect(err.output.statusCode).to.equal(500)
        expect(err.message).to.equal('Create container error was not defined')
        done()
      })
    })

    it('should pick message, stack and data fields if cvId is ObjectId', function (done) {
      var appError = {
        message: 'random message',
        data: 'random data',
        stack: 'random stack',
        field: 'random field'
      }
      var cvId = objectId(savedInstance.contextVersion._id)
      savedInstance.modifyContainerCreateErr(cvId, appError, function (err, newInst) {
        if (err) { return done(err) }
        expect(newInst.container.error.message).to.equal(appError.message)
        expect(newInst.container.error.data).to.equal(appError.data)
        expect(newInst.container.error.stack).to.equal(appError.stack)
        expect(newInst.container.error.field).to.not.exist()
        expect(error.log.callCount).to.equal(0)
        done()
      })
    })

    it('should pick message, stack and data fields if cvId is string', function (done) {
      var appError = {
        message: 'random message',
        data: 'random data',
        stack: 'random stack',
        field: 'random field'
      }
      var cvId = savedInstance.contextVersion._id
      savedInstance.modifyContainerCreateErr(cvId.toString(), appError, function (err, newInst) {
        if (err) { return done(err) }
        expect(newInst.container.error.message).to.equal(appError.message)
        expect(newInst.container.error.data).to.equal(appError.data)
        expect(newInst.container.error.stack).to.equal(appError.stack)
        expect(newInst.container.error.field).to.not.exist()
        expect(error.log.callCount).to.equal(0)
        done()
      })
    })

    it('should conflict if the contextVersion has changed and return same instance', function (done) {
      var appError = {
        message: 'random message',
        data: 'random data',
        stack: 'random stack',
        field: 'random field'
      }
      var cvId = newObjectId()
      savedInstance.modifyContainerCreateErr(cvId, appError, function (err, inst) {
        expect(err).to.not.exist()
        expect(savedInstance.container.error).to.not.exist()
        expect(inst.container.error).to.not.exist()
        expect(savedInstance.toJSON()).to.equal(inst.toJSON())
        expect(error.log.callCount).to.equal(1)
        var errArg = error.log.getCall(0).args[0]
        expect(errArg.output.statusCode).to.equal(409)
        done()
      })
    })
  })

  describe('.findMasterPodsToAutoFork', function () {
    /**
     * This test must verify all of these scenarios
     * (m) - master branch    (fb) - feature branch
     * update master
     * 2 masterPod 1(m) 2(fb), 1 child 1(fb) , 1 isolated 2(m) - fetch 2
     *
     * update fb
     * 2 masterPod 1(m) 2(m)                                    - fetch 1, 2
     * 2 masterPod 1(m) 2(m),  1 child 1(fb)                    - fetch 2
     * 2 masterPod 1(m) 2(fb), 1 child 1(fb) , 1 isolated 2(m) - fetch 1
     * 2 masterPod 1(m) 2(m),  1 isolated 2(fb)                 - fetch 1, 2
     */

    var mockSessionUser
    var ownerId
    var mockOwner
    var masterBranch = 'master'
    var branch = 'featureBranch'
    var repo = 'owner/api'
    var api
    var worker
    beforeEach(function clearApiAndWorker (done) {
      api = {
        context: null,
        masterPod: null,
        child: null,
        isolated: null
      }
      worker = {
        context: null,
        masterPod: null,
        child: null,
        isolated: null
      }
      done()
    })
    beforeEach(function makeUserStuff (done) {
      mockSessionUser = {
        findGithubUserByGithubId: sinon.spy(function (id, cb) {
          var login = (id === mockSessionUser.accounts.github.id) ? 'user' : 'owner'
          return cb(null, {
            login: login,
            avatar_url: 'sdasdasdasdasdasd'
          })
        }),
        gravatar: 'sdasdasdasdasdasd',
        accounts: {
          github: {
            id: 1234,
            username: 'user'
          }
        }
      }
      ownerId = 11111
      mockOwner = {
        gravatar: 'sdasdasdasdasdasd',
        accounts: {
          github: {
            id: ownerId,
            username: 'owner'
          }
        }
      }
      done()
    })
    function createCv (opts) {
      return mongoFactory.createCompletedCvAsync(ownerId, {
        context: opts.context._id,
        appCodeVersions: [{
          additionalRepo: false,
          repo: opts.repo || 'bkendall/flaming-octo-nemisis._',
          lowerRepo: opts.repo.toLowerCase() || 'bkendall/flaming-octo-nemisis._',
          branch: opts.branch || 'master',
          lowerBranch: opts.branch.toLowerCase() || 'master',
          commit: 'deadbeef'
        }]
      })
    }
    beforeEach(function createContexts (done) {
      Promise.props({
        api: mongoFactory.createContextAsync(mockOwner),
        worker: mongoFactory.createContextAsync(mockOwner)
      })
        .then(function (results) {
          api.context = results.api
          worker.context = results.worker
        })
        .asCallback(done)
    })
    /**
     * update fb
     * 2 masterPod 1(m) 2(m)                                   - fetch 1, 2
     * 2 masterPod 1(m) 2(m),  1 child 1(fb)                   - fetch 2
     * 2 masterPod 1(fb) 2(m), 1 child 1(m), 1 isolated 2(fb)  - fetch 2
     * 2 masterPod 1(m) 2(m),  1 isolated 2(fb)                - fetch 1, 2
     */
    describe('2 masterPod api(m) worker(m)', function () {
      beforeEach(function (done) {
        Promise.props({
          api: createCv({
            repo: repo,
            branch: masterBranch,
            context: api.context
          }),
          worker: createCv({
            repo: repo,
            branch: masterBranch,
            context: worker.context
          })
        })
          .then(function (results) {
            api.cv = results.api
            worker.cv = results.worker
            return Promise.props({
              api: mongoFactory.createInstanceWithPropsAsync(mockOwner, {
                masterPod: true,
                branch: masterBranch,
                cv: api.cv,
                shouldNotAutofork: false
              }),
              worker: mongoFactory.createInstanceWithPropsAsync(mockOwner, {
                masterPod: true,
                branch: masterBranch,
                cv: worker.cv,
                shouldNotAutofork: false
              })
            })
          })
          .then(function (results) {
            api.masterPod = results.api
            worker.masterPod = results.worker
          })
          .asCallback(done)
      })
      describe('Updating fb', function () {
        it('should fetch both masterPods', function (done) {
          var autoDeployedInstances = []

          Instance.findMasterPodsToAutoFork(repo, branch, autoDeployedInstances)
            .then(function (instances) {
              expect(instances).to.exist()
              expect(instances.length).to.equal(2)
              var instanceIds = instances.map(pluck('_id.toString()'))
              expect(instanceIds).to.contains(worker.masterPod._id.toString())
              expect(instanceIds).to.contains(api.masterPod._id.toString())
            })
            .asCallback(done)
        })
      })
    })
    describe('2 masterPod api(m) worker(m), api.child(fb)', function () {
      beforeEach(function (done) {
        Promise.props({
          api: createCv({
            repo: repo,
            branch: masterBranch,
            context: api.context
          }),
          childApi: createCv({
            repo: repo,
            branch: branch,
            context: api.context
          }),
          worker: createCv({
            repo: repo,
            branch: masterBranch,
            context: worker.context
          })
        })
          .then(function (results) {
            return Promise.props({
              api: mongoFactory.createInstanceWithPropsAsync(mockOwner, {
                masterPod: true,
                branch: masterBranch,
                cv: results.api,
                shouldNotAutofork: false
              }),
              childApi: mongoFactory.createInstanceWithPropsAsync(mockOwner, {
                branch: branch,
                cv: results.childApi,
                shouldNotAutofork: false
              }),
              worker: mongoFactory.createInstanceWithPropsAsync(mockOwner, {
                masterPod: true,
                branch: masterBranch,
                cv: results.worker,
                shouldNotAutofork: false
              })
            })
          })
          .then(function (results) {
            api.masterPod = results.api
            api.child = results.childApi
            worker.masterPod = results.worker
          })
          .asCallback(done)
      })
      describe('Updating fb', function () {
        it('should fetch worker masterPod', function (done) {
          var autoDeployedInstances = [
            api.child
          ]
          Instance.findMasterPodsToAutoFork(repo, branch, autoDeployedInstances)
            .then(function (instances) {
              expect(instances).to.exist()
              expect(instances.length).to.equal(1)
              expect(instances[0]._id.toString()).to.equal(worker.masterPod._id.toString())
            })
            .asCallback(done)
        })
      })
    })
    describe('2 masterPod api(m) worker(fb1), worker.child(m), api.isolated(fb)', function () {
      beforeEach(function (done) {
        Promise.props({
          api: createCv({
            repo: repo,
            branch: masterBranch,
            context: api.context
          }),
          isolatedApi: createCv({
            repo: repo,
            branch: branch,
            context: api.context
          }),
          worker: createCv({
            repo: repo,
            branch: branch,
            context: worker.context
          }),
          workerChild: createCv({
            repo: repo,
            branch: masterBranch,
            context: worker.context
          })
        })
          .then(function (results) {
            return Promise.props({
              api: mongoFactory.createInstanceWithPropsAsync(mockOwner, {
                masterPod: true,
                branch: masterBranch,
                cv: results.api,
                shouldNotAutofork: false
              }),
              isolatedApi: mongoFactory.createInstanceWithPropsAsync(mockOwner, {
                cv: results.isolatedApi,
                branch: branch,
                isolated: 'asdsadasdasdasd',
                shouldNotAutofork: false
              }),
              worker: mongoFactory.createInstanceWithPropsAsync(mockOwner, {
                masterPod: true,
                branch: branch,
                cv: results.worker,
                shouldNotAutofork: false
              }),
              workerChild: mongoFactory.createInstanceWithPropsAsync(mockOwner, {
                branch: masterBranch,
                cv: results.workerChild,
                shouldNotAutofork: false
              })
            })
          })
          .then(function (results) {
            api.masterPod = results.api
            api.isolated = results.isolatedApi
            worker.masterPod = results.worker
            worker.child = results.workerChild
          })
          .asCallback(done)
      })
      describe('Updating master branch ( api(m), worker.child(m) )', function () {
        it('should fetch nothing', function (done) {
          var autoDeployedInstances = [
            api.masterPod,
            worker.child
          ]
          Instance.findMasterPodsToAutoFork(repo, masterBranch, autoDeployedInstances)
            .then(function (instances) {
              expect(instances).to.exist()
              expect(instances.length).to.equal(0)
            })
            .asCallback(done)
        })
      })

      describe('Updating fb ( worker(fb), api.isolated(fb) )', function () {
        it('should fetch the api masterPod', function (done) {
          var autoDeployedInstances = [
            worker.masterPod,
            api.isolated
          ]
          Instance.findMasterPodsToAutoFork(repo, branch, autoDeployedInstances)
            .then(function (instances) {
              expect(instances).to.exist()
              expect(instances.length).to.equal(1)
              expect(instances[0]._id.toString()).to.equal(api.masterPod._id.toString())
            })
            .asCallback(done)
        })
      })
    })
    describe('2 masterPod api(m) worker(m), 1 isolated api(fb)', function () {
      beforeEach(function (done) {
        Promise.props({
          api: createCv({
            repo: repo,
            branch: masterBranch,
            context: api.context
          }),
          isolatedApi: createCv({
            repo: repo,
            branch: branch,
            context: api.context
          }),
          worker: createCv({
            repo: repo,
            branch: masterBranch,
            context: worker.context
          })
        })
          .then(function (results) {
            return Promise.props({
              api: mongoFactory.createInstanceWithPropsAsync(mockOwner, {
                masterPod: true,
                branch: masterBranch,
                cv: results.api,
                shouldNotAutofork: false
              }),
              isolatedApi: mongoFactory.createInstanceWithPropsAsync(mockOwner, {
                branch: branch,
                cv: results.isolatedApi,
                isolated: 'asdsadasdasdasd',
                shouldNotAutofork: false
              }),
              worker: mongoFactory.createInstanceWithPropsAsync(mockOwner, {
                masterPod: true,
                branch: masterBranch,
                cv: results.worker,
                shouldNotAutofork: false
              })
            })
          })
          .then(function (results) {
            api.masterPod = results.api
            api.isolated = results.isolatedApi
            worker.masterPod = results.worker
            worker.child = results.workerChild
          })
          .asCallback(done)
      })
      describe('Updating fb ( api.isolated(fb) )', function () {
        it('should fetch both masterPods', function (done) {
          var autoDeployedInstances = [
            api.isolated
          ]
          Instance.findMasterPodsToAutoFork(repo, branch, autoDeployedInstances)
            .then(function (instances) {
              expect(instances).to.exist()
              expect(instances.length).to.equal(2)
              var instanceIds = instances.map(pluck('_id.toString()'))
              expect(instanceIds).to.contains(worker.masterPod._id.toString())
              expect(instanceIds).to.contains(api.masterPod._id.toString())
            })
            .asCallback(done)
        })
      })
    })
  })

  describe('findByContextVersionIds', function () {
    var instance = null
    var contextVersionId = newObjectId()
    beforeEach(function (done) {
      instance = mongoFactory.createNewInstance()
      instance.save(function (err, instance) {
        if (err) { return done(err) }
        expect(instance).to.exist()
        done()
      })
    })
    beforeEach(function (done) {
      var instance = mongoFactory.createNewInstance('instance2')
      instance.save(done)
    })
    beforeEach(function (done) {
      var instance = mongoFactory.createNewInstance('instance3', { contextVersion: { _id: contextVersionId } })
      instance.save(done)
    })
    it('should pass the array of contextVersion Ids to find', function (done) {
      Instance.findByContextVersionIds([contextVersionId], function (err, results) {
        expect(err).to.not.exist()
        expect(results).to.be.an.array()
        expect(results.length).to.equal(1)
        expect(results[0]).to.be.an.object()
        expect(results[0].name).to.equal('instance3')
        expect(results[0].contextVersion._id.toString()).to.equal(contextVersionId.toString())
        done()
      })
    })
    it('should return an empty array if no contextVersions are found', function (done) {
      Instance.findByContextVersionIds([newObjectId()], function (err, results) {
        expect(err).to.not.exist()
        expect(results).to.be.an.array()
        expect(results.length).to.equal(0)
        done()
      })
    })
  })

  describe('#findInstancesByParent', function () {
    it('should return empty [] for if no children were found', function (done) {
      Instance.findInstancesByParent('a5agn3', function (err, instances) {
        expect(err).to.be.null()
        expect(instances.length).to.equal(0)
        done()
      })
    })

    it('should return empty [] for if no autoForked was false', function (done) {
      var repo = 'podviaznikov/hello-2'
      var opts = {
        autoForked: false,
        masterPod: false,
        repo: repo,
        parent: 'a1b2c4'
      }
      var instance = mongoFactory.createNewInstance('instance-name-325', opts)
      instance.save(function (err) {
        if (err) { return done(err) }
        Instance.findInstancesByParent('a1b2c4', function (err, instances) {
          expect(err).to.be.null()
          expect(instances.length).to.equal(0)
          done()
        })
      })
    })

    it('should return array with instance that has matching parent', function (done) {
      var repo = 'podviaznikov/hello-2'
      var opts = {
        autoForked: true,
        masterPod: false,
        repo: repo,
        parent: 'a1b2c3'
      }
      var instance = mongoFactory.createNewInstance('instance-name-324', opts)
      instance.save(function (err) {
        if (err) { return done(err) }
        Instance.findInstancesByParent('a1b2c3', function (err, instances) {
          expect(err).to.be.null()
          expect(instances.length).to.equal(1)
          done()
        })
      })
    })
  })

  describe('markAsStopping', function () {
    it('should not set container state to Stopping if container on instance has changed', function (done) {
      var instance = mongoFactory.createNewInstance('container-stopping')
      instance.save(function (err) {
        if (err) { throw err }
        // change model data in DB without going through model
        Instance.findOneAndUpdate({
          _id: instance._id
        }, {
          $set: {
            'container.dockerContainer': 'fooo'
          }
        }, function (err) {
          if (err) { throw err }
          Instance.markAsStopping(instance._id, instance.container.dockerContainer, function (err, result) {
            expect(err.message).to.equal('Instance container has changed')
            expect(result).to.be.undefined()
            done()
          })
        })
      })
    })

    it('should not set container state to Stopping if container on instance is starting', function (done) {
      var instance = mongoFactory.createNewInstance('container-stopping')
      instance.save(function (err) {
        if (err) { throw err }
        // change model data in DB without going through model
        Instance.findOneAndUpdate({
          _id: instance._id
        }, {
          $set: {
            'container.inspect.State.Starting': 'true'
          }
        }, function (err) {
          if (err) { throw err }
          Instance.markAsStopping(instance._id, instance.container.dockerContainer, function (err, result) {
            expect(err.message).to.equal('Instance container has changed')
            expect(result).to.be.undefined()
            done()
          })
        })
      })
    })
  })

  describe('markAsStarting', function () {
    it('should not set container state to Starting if container on instance has changed', function (done) {
      var instance = mongoFactory.createNewInstance('container-stopping')
      instance.save(function (err) {
        if (err) { throw err }
        // change model data in DB without going through model
        Instance.findOneAndUpdate({
          _id: instance._id
        }, {
          $set: {
            'container.dockerContainer': 'fooo'
          }
        }, function (err) {
          if (err) { throw err }
          Instance.markAsStarting(instance._id, instance.container.dockerContainer, function (err, result) {
            expect(err.message).to.equal('Instance container has changed')
            expect(result).to.be.undefined()
            done()
          })
        })
      })
    })

    it('should not set container state to Starting if container on instance is starting', function (done) {
      var instance = mongoFactory.createNewInstance('container-stopping')
      instance.save(function (err) {
        if (err) { throw err }
        // change model data in DB without going through model
        Instance.findOneAndUpdate({
          _id: instance._id
        }, {
          $set: {
            'container.inspect.State.Stopping': 'true'
          }
        }, function (err) {
          if (err) { throw err }
          Instance.markAsStarting(instance._id, instance.container.dockerContainer, function (err, result) {
            expect(err.message).to.equal('Instance container has changed')
            expect(result).to.be.undefined()
            done()
          })
        })
      })
    })
  })
  function createNewInstance (name, opts) {
    return function (done) {
      mongoFactory.createInstanceWithProps(ctx.mockSessionUser, opts, function (err, instance) {
        if (err) {
          return done(err)
        }
        ctx[name] = instance
        done(null, instance)
      })
    }
  }

  describe('setDependenciesFromEnvironment', function () {
    var ownerName = 'TEST-login'
    beforeEach(function (done) {
      ctx.mockUsername = ownerName
      ctx.mockSessionUser = {
        _id: 1234,
        findGithubUserByGithubId: sinon.stub().yieldsAsync(null, {
          login: ctx.mockUsername,
          avatar_url: 'TEST-avatar_url'
        }),
        accounts: {
          github: {
            id: 1234,
            username: ctx.mockUsername
          }
        }
      }
      ctx.deps = {}
      done()
    })

    describe('Testing changes in connections', function () {
      beforeEach(createNewInstance('hello', {
        name: 'hello',
        masterPod: true,
        env: [
          'df=adelle-staging-' + ownerName + '.runnableapp.com'
        ]
      }))
      beforeEach(createNewInstance('adelle', {
        name: 'adelle',
        masterPod: true
      }))
      beforeEach(createNewInstance('goodbye', {
        name: 'goodbye',
        masterPod: true
      }))
      describe('Masters', function () {
        beforeEach(function (done) {
          ctx.hello.setDependenciesFromEnvironment(ownerName, done)
        })
        it('should add a new dep for each env, when starting with none', function (done) {
          ctx.hello.getDependencies(function (err, dependencies) {
            expect(dependencies).to.be.array()
            expect(dependencies.length).to.equal(1)
            expect(dependencies[0]._id).to.equal(ctx['adelle']._id)
            done(err)
          })
        })
        it('should add 1 new dep, and keep the existing one', function (done) {
          ctx.hello.env.push([
            'as=goodbye-staging-' + ownerName + '.runnableapp.com'
          ])
          ctx.hello.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              return done(err)
            }
            ctx.hello.getDependencies(function (err, dependencies) {
              expect(dependencies).to.be.array()
              expect(dependencies.length).to.equal(2)
              var ids = dependencies.map(pluck('_id.toString()'))
              expect(ids).to.include(ctx.goodbye._id.toString())
              expect(ids).to.include(ctx.adelle._id.toString())
              done(err)
            })
          })
        })
        it('should remove the only dependency', function (done) {
          ctx.hello.env = []
          ctx.hello.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              return done(err)
            }
            ctx.hello.getDependencies(function (err, dependencies) {
              expect(dependencies).to.be.array()
              expect(dependencies.length).to.equal(0)
              done(err)
            })
          })
        })
      })
      describe('connecting to branches', function () {
        beforeEach(function (done) {
          createNewInstance('fb1-adelle', {
            name: 'fb1-adelle',
            masterPod: false,
            branch: 'fb1',
            cv: ctx.adelle.contextVersion
          })(done)
        })
        beforeEach(function (done) {
          createNewInstance('fb1-goodbye', {
            name: 'fb1-goodbye',
            masterPod: false,
            branch: 'fb1',
            cv: ctx.goodbye.contextVersion
          })(done)
        })
        beforeEach(function (done) {
          // Set the dep to a branch
          ctx.hello.addDependency(ctx['fb1-adelle']).asCallback(done)
        })
        it('should not remove the existing dep, when not adding any new ones', function (done) {
          ctx.hello.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              return done(err)
            }
            ctx.hello.getDependencies(function (err, dependencies) {
              expect(dependencies).to.be.array()
              expect(dependencies.length).to.equal(1)
              expect(dependencies[0]._id).to.equal(ctx['fb1-adelle']._id)
              expect(dependencies[0].elasticHostname).to.equal(ctx['fb1-adelle'].elasticHostname)
              done(err)
            })
          })
        })
        it('should add 1 new dep, and keep the existing one', function (done) {
          ctx.hello.env.push([
            'as=goodbye-staging-' + ownerName + '.runnableapp.com'
          ])
          ctx.hello.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              return done(err)
            }
            ctx.hello.getDependencies(function (err, dependencies) {
              expect(dependencies).to.be.array()
              expect(dependencies.length).to.equal(2)
              var ids = dependencies.map(pluck('_id.toString()'))
              expect(ids).to.include(ctx.goodbye._id.toString())
              expect(ids).to.include(ctx['fb1-adelle']._id.toString())
              done(err)
            })
          })
        })
        it('should remove the only dependency', function (done) {
          ctx.hello.env = []
          ctx.hello.setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              return done(err)
            }
            ctx.hello.getDependencies(function (err, dependencies) {
              expect(dependencies).to.be.array()
              expect(dependencies.length).to.equal(0)
              done(err)
            })
          })
        })
      })

      describe('being isolated', function () {
        beforeEach(function (done) {
          createNewInstance('fb1-hello', {
            name: 'fb1-hello',
            branch: 'fb1',
            masterPod: false,
            env: [
              'df=goodbye-staging-' + ownerName + '.runnableapp.com'
            ],
            cv: ctx.hello.contextVersion
          })(function () {
            Instance.findOneAndUpdate({
              _id: ctx['fb1-hello']._id
            }, {
              $set: {
                isolated: ctx['fb1-hello']._id,
                isIsolationGroupMaster: true
              }
            }, function (err, instance) {
              ctx['fb1-hello'] = instance
              done(err)
            })
          })
        })
        beforeEach(function (done) {
          createNewInstance('fb1-adelle', {
            name: 'fb1-adelle',
            branch: 'fb1',
            masterPod: false,
            cv: ctx.adelle.contextVersion
          })(done)
        })

        var fb1GoodbyeName = null

        beforeEach(function (done) {
          fb1GoodbyeName = ctx['fb1-hello'].shortHash + '--goodbye'
          createNewInstance(fb1GoodbyeName, {
            name: fb1GoodbyeName,
            masterPod: false,
            isolated: ctx['fb1-hello']._id,
            cv: ctx.goodbye.contextVersion
          })(done)
        })
        beforeEach(function (done) {
          ctx['fb1-hello'].setDependenciesFromEnvironment(ownerName, done)
        })
        it('should add the isolated branch as the dep from the start', function (done) {
          ctx['fb1-hello'].getDependencies(function (err, dependencies) {
            if (err) {
              return done(err)
            }
            expect(dependencies).to.be.array()
            expect(dependencies.length).to.equal(1)
            expect(dependencies[0]._id).to.equal(ctx[fb1GoodbyeName]._id)
            done()
          })
        })
        it('should add 1 new dep, and keep the existing one', function (done) {
          ctx['fb1-hello'].env.push([
            'as=adelle-staging-' + ownerName + '.runnableapp.com'
          ])
          ctx['fb1-hello'].setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              return done(err)
            }
            ctx['fb1-hello'].getDependencies(function (err, dependencies) {
              if (err) {
                return done(err)
              }
              expect(dependencies).to.be.array()
              expect(dependencies.length).to.equal(2)
              var ids = dependencies.map(pluck('_id.toString()'))
              expect(ids).to.include(ctx[fb1GoodbyeName]._id.toString())
              expect(ids).to.include(ctx.adelle._id.toString())
              done()
            })
          })
        })
        it('should remove the only dependency', function (done) {
          ctx['fb1-hello'].env = []
          ctx['fb1-hello'].setDependenciesFromEnvironment(ownerName, function (err) {
            if (err) {
              return done(err)
            }
            ctx['fb1-hello'].getDependencies(function (err, dependencies) {
              if (err) {
                return done(err)
              }
              expect(dependencies).to.be.array()
              expect(dependencies.length).to.equal(0)
              done()
            })
          })
        })
      })
    })
  })

  describe('dependencies', { timeout: 1000 }, function () {
    beforeEach(function (done) {
      ctx = {}
      ctx.mockUsername = 'TEST-login'
      ctx.mockSessionUser = {
        _id: 1234,
        findGithubUserByGithubId: sinon.stub().yieldsAsync(null, {
          login: ctx.mockUsername,
          avatar_url: 'TEST-avatar_url'
        }),
        accounts: {
          github: {
            id: 1234,
            username: ctx.mockUsername
          }
        }
      }
      ctx.deps = {}
      done()
    })
    var instances = []
    beforeEach(createNewInstance('A', {
      name: 'A',
      masterPod: true
    }))
    beforeEach(createNewInstance('B', {
      name: 'B',
      masterPod: true
    }))
    beforeEach(createNewInstance('C', {
      name: 'C',
      masterPod: true
    }))
    beforeEach(function (done) {
      instances = []
      var names = [ 'A', 'B', 'C' ]
      names.forEach(function (name) {
        instances.push(ctx[name])
      })
      done()
    })

    it('should be able to generate a graph node data structure', function (done) {
      var generated = instances[0].generateGraphNode()
      var expected = makeGraphNodeFromInstance(instances[0])
      expect(generated).to.equal(expected)
      done()
    })

    describe('with instances in the graph', function () {
      it('should give us no dependencies when none are defined', function (done) {
        var i = instances[0]
        i.getDependencies(function (err, deps) {
          expect(err).to.be.null()
          expect(deps).to.be.an.array()
          expect(deps).to.have.length(0)
          done()
        })
      })

      it('should allow us to add first dependency', function (done) {
        var i = instances[0]
        var d = instances[1]

        i.addDependency(d)
          .asCallback(function (err, limitedInstance) {
            expect(err).to.be.null()
            expect(limitedInstance).to.exist()
            expect(limitedInstance.instanceId).to.equal(d._id)
            i.getDependencies(function (err, deps) {
              expect(err).to.be.null()
              expect(deps).to.be.an.array()
              expect(deps).to.have.length(1)
              // getDeps adds networking to the result
              expect(deps[0]._id).to.equal(d._id)
              expect(deps[0].elasticHostname).to.equal(d.elasticHostname)
              done()
            })
          })
      })

      describe('with a dependency attached', function () {
        beforeEach(function (done) {
          instances[0].addDependency(instances[1])
            .asCallback(done)
        })

        it('should give the network for a dependency', function (done) {
          var i = instances[0]
          i.getDependencies(function (err, deps) {
            if (err) { return done(err) }
            expect(deps[0].network).to.equal(instances[1].network)
            done()
          })
        })

        it('should allow us to remove the dependency', function (done) {
          var i = instances[0]
          var d = instances[1]
          i.removeDependency(d._id)
            .asCallback(function (err) {
              expect(err).to.be.null()
              i.getDependencies(function (err, deps) {
                expect(err).to.be.null()
                expect(deps).to.be.an.array()
                expect(deps).to.have.length(0)
                done()
              })
            })
        })

        it('should be able to add a second dependency', function (done) {
          var i = instances[0]
          var d = instances[2]
          i.addDependency(d)
            .asCallback(function (err, limitedInstance) {
              expect(err).to.be.null()
              expect(limitedInstance).to.exist()
              expect(limitedInstance.instanceId).to.equal(d._id)
              i.getDependencies(function (err, deps) {
                expect(err).to.be.null()
                expect(deps).to.be.an.array()
                expect(deps).to.have.length(2)
                var ids = deps.map(pluck('_id.toString()'))
                expect(ids).to.include(instances[2]._id.toString())
                expect(ids).to.include(instances[1]._id.toString())
                done()
              })
            })
        })

        it('should be able to get dependent', function (done) {
          var dependent = instances[0]
          var dependency = instances[1]
          dependency.getDependents()
            .asCallback(function (err, dependents) {
              expect(err).to.be.null()
              expect(dependents).to.be.an.array()
              expect(dependents).to.have.length(1)
              expect(dependents[0]._id).to.equal(dependent._id)
              done()
            })
        })

        describe('instance with 2 dependents', function () {
          beforeEach(function (done) {
            instances[2].addDependency(instances[1])
              .asCallback(done)
          })
          it('should be able to get dependents', function (done) {
            var dependent1 = instances[0]
            var dependent2 = instances[2]
            var dependency = instances[1]
            dependency.getDependents()
              .asCallback(function (err, dependents) {
                expect(err).to.be.null()
                expect(dependents).to.be.an.array()
                expect(dependents).to.have.length(2)
                var ids = dependents.map(pluck('_id.toString()'))
                expect(ids).to.include(dependent1._id.toString())
                expect(ids).to.include(dependent2._id.toString())
                done()
              })
          })
        })
      })
    })

    describe('addDependency', function () {
      beforeEach(createNewInstance('goooush', {
        name: 'goooush',
        masterPod: true
      }))
      beforeEach(createNewInstance('splooosh', {
        name: 'splooosh',
        masterPod: true
      }))

      beforeEach(function (done) {
        sinon.spy(ctx.goooush, 'invalidateContainerDNS')
        done()
      })

      afterEach(function (done) {
        ctx.goooush.invalidateContainerDNS.restore()
        done()
      })

      it('should invalidate dns cache entries', function (done) {
        ctx.goooush.addDependency(ctx.splooosh)
          .asCallback(function (err) {
            if (err) { done(err) }
            expect(ctx.goooush.invalidateContainerDNS.calledOnce).to.be.true()
            done()
          })
      })
    })

    describe('removeSelfFromGraph', function () {
      beforeEach(createNewInstance('api', {
        name: 'api',
        masterPod: true
      }))
      beforeEach(function (done) {
        createNewInstance('web', {
          name: 'web',
          masterPod: true,
          dependencies: [
            ctx.api.generateGraphNode()
          ]
        })(done)
      })
      beforeEach(function (done) {
        createNewInstance('fb1-api', {
          name: 'fb1-api',
          masterPod: false,
          branch: 'fb1',
          parent: ctx.api.shortHash
        })(done)
      })
      beforeEach(function (done) {
        createNewInstance('charon', {
          name: 'charon',
          masterPod: true,
          dependencies: [
            ctx['fb1-api'].generateGraphNode()
          ]
        })(done)
      })
      beforeEach(function (done) {
        createNewInstance('link', {
          name: 'link',
          masterPod: true,
          dependencies: [
            ctx['fb1-api'].generateGraphNode()
          ]
        })(done)
      })

      beforeEach(function (done) {
        done()
      })

      afterEach(function (done) {
        done()
      })

      it('should remove api from web', function (done) {
        ctx.api.removeSelfFromGraph()
          .then(function () {
            return Instance.findByIdAsync(ctx.web._id)
          })
          .then(function (updatedWeb) {
            expect(updatedWeb.dependencies.length).to.equal(0)
          })
          .asCallback(done)
      })

      var depFields = ['instanceId', 'name', 'elasticHostname']
      //
      it('should replace fb1-api with api in charon and link', function (done) {
        ctx['fb1-api'].removeSelfFromGraph()
          .then(function () {
            return Promise.props({
              charon: Instance.findByIdAsync(ctx.charon._id),
              link: Instance.findByIdAsync(ctx.link._id)
            })
          })
          .then(function (results) {
            expect(results.charon.dependencies[0]).to.exist()
            var apiNode = ctx.api.generateGraphNode()
            var charonDeps = pick(results.charon.dependencies[0], depFields)
            var linkDeps = pick(results.link.dependencies[0], depFields)
            expect(charonDeps).to.equal(apiNode)
            expect(linkDeps).to.equal(apiNode)
          })
          .asCallback(done)
      })
    })
  })
})
