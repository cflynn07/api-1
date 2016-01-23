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
var keypather = require('keypather')()

var Graph = require('models/apis/graph')
var Hashids = require('hashids')
var Neo4j = require('runna4j')
var async = require('async')
var createCount = require('callback-count')
var error = require('error')
var find = require('101/find')
var hasProps = require('101/has-properties')
var mongoose = require('mongoose')
var noop = require('101/noop')
var pick = require('101/pick')
var pluck = require('101/pluck')
var toObjectId = require('utils/to-object-id')

var Instance = require('models/mongo/instance')
var Version = require('models/mongo/context-version')
var pubsub = require('models/redis/pubsub')
var validation = require('../../fixtures/validation')(lab)
var expectErr = function (expectedErr, done) {
  return function (err) {
    expect(err).to.equal(expectedErr)
    done()
  }
}

var id = 0
function getNextId () {
  id++
  return id
}
function getNextHash () {
  var hashids = new Hashids(process.env.HASHIDS_SALT, process.env.HASHIDS_LENGTH)
  return hashids.encrypt(getNextId()).toLowerCase()
}
function newObjectId () {
  return new mongoose.Types.ObjectId()
}

function createNewVersion (opts) {
  return new Version({
    message: 'test',
    owner: { github: validation.VALID_GITHUB_ID },
    createdBy: { github: validation.VALID_GITHUB_ID },
    config: validation.VALID_OBJECT_ID,
    created: Date.now(),
    context: validation.VALID_OBJECT_ID,
    files: [{
      Key: 'test',
      ETag: 'test',
      VersionId: validation.VALID_OBJECT_ID
    }],
    build: {
      dockerImage: 'testing',
      dockerTag: 'adsgasdfgasdf'
    },
    appCodeVersions: [
      {
        additionalRepo: false,
        repo: opts.repo || 'bkendall/flaming-octo-nemisis._',
        lowerRepo: opts.repo || 'bkendall/flaming-octo-nemisis._',
        branch: opts.branch || 'master',
        defaultBranch: opts.defaultBranch || 'master',
        commit: 'deadbeef'
      },
      {
        additionalRepo: true,
        commit: '4dd22d12b4b3b846c2e2bbe454b89cb5be68f71d',
        branch: 'master',
        lowerBranch: 'master',
        repo: 'Nathan219/yash-node',
        lowerRepo: 'nathan219/yash-node',
        _id: '5575f6c43074151a000e8e27',
        privateKey: 'Nathan219/yash-node.key',
        publicKey: 'Nathan219/yash-node.key.pub',
        defaultBranch: 'master',
        transformRules: { rename: [], replace: [], exclude: [] }
      }
    ]
  })
}

function createNewInstance (name, opts) {
  // jshint maxcomplexity:10
  opts = opts || {}
  var container = {
    dockerContainer: opts.containerId || validation.VALID_OBJECT_ID,
    dockerHost: opts.dockerHost || 'http://localhost:4243',
    inspect: {
      State: {
        ExitCode: 0,
        FinishedAt: '0001-01-01T00:00:00Z',
        Paused: false,
        Pid: 889,
        Restarting: false,
        Running: true,
        StartedAt: '2014-11-25T22:29:50.23925175Z'
      },
      NetworkSettings: {
        IPAddress: opts.IPAddress || '172.17.14.2'
      }
    }
  }
  return new Instance({
    name: name || 'name',
    shortHash: getNextHash(),
    locked: opts.locked || false,
    'public': false,
    masterPod: opts.masterPod || false,
    parent: opts.parent,
    autoForked: opts.autoForked || false,
    owner: { github: validation.VALID_GITHUB_ID },
    createdBy: { github: validation.VALID_GITHUB_ID },
    build: validation.VALID_OBJECT_ID,
    created: Date.now(),
    contextVersion: createNewVersion(opts),
    container: container,
    containers: [],
    network: {
      hostIp: '1.1.1.100'
    },
    imagePull: opts.imagePull || null
  })
}

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Instance Model Tests ' + moduleName, function () {
  var ownerCreatedByKeypaths = ['owner.username', 'owner.gravatar', 'createdBy.username', 'createdBy.gravatar']
  // jshint maxcomplexity:5
  var ctx
  before(require('../../fixtures/mongo').connect)
  before(require('../../../test/functional/fixtures/clean-mongo').removeEverything)

  beforeEach(function (done) {
    ctx = {}
    done()
  })
  afterEach(require('../../../test/functional/fixtures/clean-mongo').removeEverything)

  describe('starting or stopping state detection', function () {
    it('should not error if container is not starting or stopping', function (done) {
      var instance = createNewInstance('container-not-starting-or-stopping')
      instance.isNotStartingOrStopping(function (err) {
        expect(err).to.be.null()
        done()
      })
    })
    it('should error if no container', function (done) {
      var instance = createNewInstance('no-container')
      instance.container = {}
      instance.isNotStartingOrStopping(function (err) {
        expect(err.message).to.equal('Instance does not have a container')
        done()
      })
    })
    it('should error if container starting', function (done) {
      var instance = createNewInstance('container-starting')
      instance.container.inspect.State.Starting = true
      instance.isNotStartingOrStopping(function (err) {
        expect(err.message).to.equal('Instance is already starting')
        done()
      })
    })
    it('should error if container stopping', function (done) {
      var instance = createNewInstance('container-stopping')
      instance.container.inspect.State.Stopping = true
      instance.isNotStartingOrStopping(function (err) {
        expect(err.message).to.equal('Instance is already stopping')
        done()
      })
    })
  })

  describe('#findInstancesRunningOrStartingByDockerHost', function () {
    var instance1
    var instance2
    var instance3
    var instance4
    var testHost = 'http://10.0.0.1:4242'
    var testHost2 = 'http://10.0.0.2:4242'

    beforeEach(function (done) {
      instance1 = createNewInstance('one', {
        dockerHost: testHost
      })
      instance1.container.inspect.State.Starting = false
      instance1.container.inspect.State.Running = false
      instance2 = createNewInstance('two', {
        dockerHost: testHost
      })
      instance2.container.inspect.State.Starting = true
      instance3 = createNewInstance('three', {
        dockerHost: testHost
      })
      instance3.container.inspect.State.Running = true
      instance4 = createNewInstance('four', {
        dockerHost: testHost2
      })
      done()
    })
    beforeEach(function (done) {
      instance1.save(done)
    })
    beforeEach(function (done) {
      instance2.save(done)
    })
    beforeEach(function (done) {
      instance3.save(done)
    })
    beforeEach(function (done) {
      instance4.save(done)
    })
    it('should get all instances from testHost', function (done) {
      Instance.findInstancesRunningOrStartingByDockerHost(testHost, function (err, instances) {
        expect(err).to.be.null()
        expect(instances.length).to.equal(2)
        instances.forEach(function (instance) {
          expect(instance._id).to.not.equal(instance1._id)
          expect(instance._id).to.not.equal(instance4._id)
        })
        done()
      })
    })
    it('should get an [] if no instances were found', function (done) {
      Instance.findInstancesRunningOrStartingByDockerHost('http://10.0.0.3:4242', function (err, instances) {
        expect(err).to.be.null()
        expect(instances.length).to.equal(0)
        done()
      })
    })
  }) // end findInstancesRunningOrStartingByDockerHost

  describe('#setStoppingAsStoppedByDockerHost', function () {
    var dockerHost = 'http://10.0.0.1:4242'
    beforeEach(function (done) {
      sinon.stub(Instance, 'update')
      done()
    })
    afterEach(function (done) {
      Instance.update.restore()
      done()
    })
    describe('if mongo passes', function () {
      beforeEach(function (done) {
        Instance.update.yieldsAsync()
        done()
      })

      it('should call update with the right parameters', function (done) {
        Instance.setStoppingAsStoppedByDockerHost(dockerHost, function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(Instance.update)
          sinon.assert.calledWith(Instance.update,
            {
              'container.dockerHost': dockerHost,
              'container.inspect.State.Stopping': true
            }, {
              $set: {
                'container.inspect.State.Pid': 0,
                'container.inspect.State.Running': false,
                'container.inspect.State.Restarting': false,
                'container.inspect.State.Paused': false,
                'container.inspect.State.FinishedAt': sinon.match.string,
                'container.inspect.State.ExitCode': 0
              },
              $unset: {
                'container.inspect.State.Stopping': ''
              }
            }, {
              multi: true
            }
          )
          done()
        })
      })
    })

    describe('on mongoError', function () {
      var error = 'heaters'
      beforeEach(function (done) {
        Instance.update.yieldsAsync(error)
        done()
      })
      it('should propegate the error to the cb function', function (done) {
        Instance.setStoppingAsStoppedByDockerHost(dockerHost, function (err) {
          expect(err).to.equal(error)
          sinon.assert.calledOnce(Instance.update)
          done()
        })
      })
    })
  })

  describe('atomic set container state', function () {
    it('should not set container state to Starting if container on instance has changed', function (done) {
      var instance = createNewInstance('container-stopping')
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
          instance.setContainerStateToStarting(function (err, result) {
            expect(err.message).to.equal('instance container has changed')
            expect(result).to.be.undefined()
            done()
          })
        })
      })
    })

    it('should not set container state to Stopping if container on instance has changed', function (done) {
      var instance = createNewInstance('container-stopping')
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
          instance.setContainerStateToStopping(function (err, result) {
            expect(err.message).to.equal('instance container has changed')
            expect(result).to.be.undefined()
            done()
          })
        })
      })
    })
  })

  describe('save', function () {
    it('should not save an instance with the same (lower) name and owner', function (done) {
      var instance = createNewInstance('hello')
      instance.save(function (err, instance) {
        if (err) { return done(err) }
        expect(instance).to.exist()
        var newInstance = createNewInstance('Hello')
        newInstance.save(function (err, instance) {
          expect(instance).to.not.exist()
          expect(err).to.exist()
          expect(err.code).to.equal(11000)
          done()
        })
      })
    })
  }) // end save

  describe('getMainBranchName', function () {
    it('should return null when there is no main AppCodeVersion', function (done) {
      var instance = createNewInstance('no-main-app-code-version')
      instance.contextVersion.appCodeVersions[0].additionalRepo = true
      expect(Instance.getMainBranchName(instance)).to.be.null()
      done()
    })

    it('should return the main AppCodeVersion', function (done) {
      var expectedBranchName = 'somebranchomg'
      var instance = createNewInstance('no-main-app-code-version', {
        branch: expectedBranchName
      })
      expect(Instance.getMainBranchName(instance)).to.equal(expectedBranchName)
      done()
    })
  })

  describe('modifyContainerCreateErr', function () {
    var savedInstance = null
    var instance = null
    beforeEach(function (done) {
      sinon.spy(error, 'log')
      instance = createNewInstance()
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
      var cvId = toObjectId(savedInstance.contextVersion._id)
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
        expect(savedInstance).to.deep.equal(inst)
        expect(error.log.callCount).to.equal(1)
        var errArg = error.log.getCall(0).args[0]
        expect(errArg.output.statusCode).to.equal(409)
        done()
      })
    })
  })

  describe('modifyContainerInspect', function () {
    var instance

    beforeEach(function (done) {
      instance = createNewInstance('testy', {})
      sinon.spy(instance, 'invalidateContainerDNS')
      sinon.stub(Instance, 'findOneAndUpdate')
      done()
    })

    afterEach(function (done) {
      instance.invalidateContainerDNS.restore()
      Instance.findOneAndUpdate.restore()
      done()
    })

    it('should invalidate the instance container DNS', function (done) {
      instance.modifyContainerInspect('some-id', {}, noop)
      expect(instance.invalidateContainerDNS.calledOnce).to.be.true()
      done()
    })
  })

  describe('modifyContainerInspectErr', function () {
    var savedInstance = null
    var instance = null
    before(function (done) {
      instance = createNewInstance()
      instance.save(function (err, instance) {
        if (err) { return done(err) }
        expect(instance).to.exist()
        savedInstance = instance
        done()
      })
    })

    it('should pick message, stack and data fields', function (done) {
      var fakeError = {
        message: 'random message',
        data: 'random data',
        stack: 'random stack',
        field: 'random field'
      }
      var dockerContainer = savedInstance.container.dockerContainer
      savedInstance.modifyContainerInspectErr(dockerContainer, fakeError, function (err, newInst) {
        if (err) { return done(err) }
        expect(newInst.container.inspect.error.message).to.equal(fakeError.message)
        expect(newInst.container.inspect.error.data).to.equal(fakeError.data)
        expect(newInst.container.inspect.error.stack).to.equal(fakeError.stack)
        expect(newInst.container.inspect.error.field).to.not.exist()
        done()
      })
    })

    describe('conflict error', function () {
      var origErrorLog = error.log
      after(function (done) {
        error.log = origErrorLog
        done()
      })

      it('should conflict if the container has changed', function (done) {
        var fakeError = {
          message: 'random message',
          data: 'random data',
          stack: 'random stack',
          field: 'random field'
        }
        var count = createCount(3, done)
        error.log = function (err) {
          // first call
          if (err === fakeError) { return count.next() }
          // second call
          expect(err).to.exist()
          expect(err.output.statusCode).to.equal(409)
          count.next()
        }
        var dockerContainer = 'fac985124d0f0060006af52f2d5a9098c9b4796811597b45c0f44494cb02b452'
        savedInstance.modifyContainerInspectErr(dockerContainer, fakeError, count.next)
      })
    })
  })

  describe('find instance by container id', function () {
    var savedInstance = null
    var instance = null
    before(function (done) {
      instance = createNewInstance()
      instance.save(function (err, instance) {
        if (err) { return done(err) }
        expect(instance).to.exist()
        savedInstance = instance
        done()
      })
    })

    it('should find an instance', function (done) {
      Instance.findOneByContainerId(savedInstance.container.dockerContainer, function (err, fetchedInstance) {
        if (err) { return done(err) }
        expect(fetchedInstance._id.toString()).to.equal(instance._id.toString())
        expect(fetchedInstance.name).to.equal(instance.name)
        expect(fetchedInstance.container.dockerContainer).to.equal(instance.container.dockerContainer)
        expect(fetchedInstance.public).to.equal(instance.public)
        expect(fetchedInstance.lowerName).to.equal(instance.lowerName)
        expect(fetchedInstance.build.toString()).to.equal(instance.build.toString())
        done()
      })
    })
  })

  describe('find by repo and branch', function () {
    before(function (done) {
      var instance = createNewInstance('instance1')
      instance.save(done)
    })
    before(function (done) {
      var instance = createNewInstance('instance2', { locked: false })
      instance.save(done)
    })
    before(function (done) {
      var instance = createNewInstance('instance3', { locked: true, repo: 'podviaznikov/hello' })
      instance.save(done)
    })

    it('should find instances using repo name and branch', function (done) {
      Instance.findInstancesLinkedToBranch('bkendall/flaming-octo-nemisis._', 'master', function (err, insts) {
        if (err) { return done(err) }
        expect(insts.length).to.equal(2)
        insts.forEach(function (inst) {
          expect([ 'instance1', 'instance2' ]).to.include(inst.name)
        })
        done()
      })
    })

    it('should not find instance using repo name and branch if it was locked', function (done) {
      Instance.findInstancesLinkedToBranch('podviaznikov/hello', 'master', function (err, insts) {
        if (err) { return done(err) }
        expect(insts.length).to.equal(0)
        done()
      })
    })
  })

  describe('#updateContextVersion', function () {
    var id = '1234'
    var updateObj = {
      dockRemovedNeedsUserConfirmation: false
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
            'contextVersion.dockRemovedNeedsUserConfirmation': false
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
      var instance = createNewInstance('instance-name-325', opts)
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
      var instance = createNewInstance('instance-name-324', opts)
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

  describe('#findForkableMasterInstances', function () {
    it('should return empty [] for repo that has no instances', function (done) {
      Instance.findForkableMasterInstances('anton/node', 'master', function (err, instances) {
        expect(err).to.be.null()
        expect(instances.length).to.equal(0)
        done()
      })
    })

    describe('non-masterPod instances', function () {
      var ctx = {}
      before(function (done) {
        var instance = createNewInstance('instance-name', { locked: true, repo: 'podviaznikov/hello' })
        instance.save(function (err, instance) {
          if (err) { return done(err) }
          expect(instance).to.exist()
          ctx.savedInstance = instance
          done()
        })
      })
      it('should return empty [] for repo that has no master instances', function (done) {
        var repo = 'podviaznikov/hello'
        Instance.findForkableMasterInstances(repo, 'develop', function (err, instances) {
          expect(err).to.be.null()
          expect(instances.length).to.equal(0)
          done()
        })
      })
    })

    describe('masterPod instances', function () {
      var ctx = {}
      beforeEach(function (done) {
        var opts = {
          locked: true,
          masterPod: true,
          repo: 'podviaznikov/hello-2',
          branch: 'master',
          defaultBranch: 'master'
        }
        var instance = createNewInstance('instance-name-2', opts)
        instance.save(function (err, instance) {
          if (err) { return done(err) }
          expect(instance).to.exist()
          ctx.savedInstance = instance
          done()
        })
      })
      it('should return array with instance that has masterPod=true', function (done) {
        var repo = 'podviaznikov/hello-2'
        Instance.findForkableMasterInstances(repo, 'feature1', function (err, instances) {
          expect(err).to.be.null()
          expect(instances.length).to.equal(1)
          expect(instances[0].shortHash).to.equal(ctx.savedInstance.shortHash)
          done()
        })
      })
      it('should return [] when branch equals masterPod branch', function (done) {
        var repo = 'podviaznikov/hello-2'
        Instance.findForkableMasterInstances(repo, 'master', function (err, instances) {
          expect(err).to.be.null()
          expect(instances.length).to.equal(0)
          done()
        })
      })
      it('should return array with instances that has masterPod=true', function (done) {
        var repo = 'podviaznikov/hello-2'
        var opts = {
          locked: true,
          masterPod: true,
          repo: repo
        }
        var instance2 = createNewInstance('instance-name-3', opts)
        instance2.save(function (err, instance) {
          if (err) { return done(err) }
          Instance.findForkableMasterInstances(repo, 'feature1', function (err, instances) {
            expect(err).to.be.null()
            expect(instances.length).to.equal(2)
            expect(instances.map(pluck('shortHash'))).to.only.contain([
              ctx.savedInstance.shortHash,
              instance.shortHash
            ])
            done()
          })
        })
      })
    })
  })

  describe('dependencies', { timeout: 10000 }, function () {
    var instances = []
    beforeEach(function (done) {
      var names = [ 'A', 'B', 'C' ]
      while (instances.length < names.length) {
        instances.push(createNewInstance(names[instances.length]))
      }
      done()
    })

    beforeEach(function (done) {
      // this deletes all the things out of the graph
      var graph = new Graph()
      graph.graph
        .cypher('MATCH (n) OPTIONAL MATCH (n)-[r]-() DELETE n, r')
        .on('end', done)
        .resume()
    })

    it('should be able to generate a graph node data structure', function (done) {
      var generated = instances[0].generateGraphNode()
      var expected = {
        label: 'Instance',
        props: {
          id: instances[0].id.toString(),
          shortHash: instances[0].shortHash.toString(),
          name: instances[0].name,
          lowerName: instances[0].lowerName,
          'owner_github': instances[0].owner.github, // eslint-disable-line quote-props
          'contextVersion_context': // eslint-disable-line quote-props
          instances[0].contextVersion.context.toString()
        }
      }
      expect(generated).to.deep.equal(expected)
      done()
    })

    it('should be able to put an instance in the graph db', function (done) {
      var i = instances[0]
      i.upsertIntoGraph(function (err) {
        expect(err).to.be.null()
        i.getSelfFromGraph(function (err, selfNode) {
          expect(err).to.be.null()
          expect(selfNode.id).to.equal(i.id.toString())
          done()
        })
      })
    })

    it('should upsert, not created duplicate', function (done) {
      var graph = new Graph()
      var i = instances[0]
      i.upsertIntoGraph(function (err) {
        expect(err).to.be.null()
        i.lowerName = 'new-' + i.lowerName
        i.upsertIntoGraph(function (err) {
          expect(err).to.be.null()
          // have to manually check the db
          var nodes = {}
          graph.graph
            .cypher('MATCH (n:Instance) RETURN n')
            .on('data', function (d) {
              if (!nodes[d.n.id]) {
                nodes[d.n.id] = d.n
              } else {
                err = new Error('duplicate node ' + d.n.id)
              }
            })
            .on('end', function () {
              expect(err).to.be.null()
              expect(Object.keys(nodes)).to.have.length(1)
              expect(nodes[i.id.toString()].lowerName).to.equal('new-a')
              done()
            })
            .on('error', done)
        })
      })
    })

    describe('with instances in the graph', function () {
      var nodeFields = [
        'contextVersion',
        'hostname',
        'id',
        'lowerName',
        'name',
        'owner',
        'shortHash'
      ]
      beforeEach(function (done) {
        async.forEach(
          instances,
          function (i, cb) { i.upsertIntoGraph(cb) },
          done)
      })

      it('should give us the count of instance in the graph', function (done) {
        Instance.getGraphNodeCount(function (err, count) {
          expect(err).to.be.null()
          expect(count).to.equal(3)
          done()
        })
      })

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
        var shortD = pick(d.toJSON(), nodeFields)
        shortD.hostname = 'somehostname'
        shortD.contextVersion = {
          context: shortD.contextVersion.context.toString()
        }
        i.addDependency(d, 'somehostname', function (err, limitedInstance) {
          expect(err).to.be.null()
          expect(limitedInstance).to.exist()
          expect(Object.keys(limitedInstance)).to.only.contain(nodeFields)
          expect(limitedInstance).to.deep.equal(shortD)
          i.getDependencies(function (err, deps) {
            expect(err).to.be.null()
            expect(deps).to.be.an.array()
            expect(deps).to.have.length(1)
            expect(Object.keys(deps[0])).to.contain(nodeFields)
            expect(deps[0]).to.deep.equal(shortD)
            done()
          })
        })
      })

      describe('with a dependency attached', function () {
        beforeEach(function (done) {
          instances[0].addDependency(instances[1], 'somehostname', done)
        })

        it('should give the network for a dependency', function (done) {
          var network = { hostIp: '1.2.3.4' }
          sinon.stub(Instance, 'findById').yieldsAsync(null, { network: network })
          var i = instances[0]
          i.getDependencies(function (err, deps) {
            if (err) { return done(err) }
            expect(deps[0].network).to.deep.equal(network)
            Instance.findById.restore()
            done()
          })
        })

        it('should allow us to remove the dependency', function (done) {
          var i = instances[0]
          var d = instances[1]
          i.removeDependency(d, function (err) {
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
          var shortD = pick(d.toJSON(), nodeFields)
          shortD.contextVersion = {
            context: shortD.contextVersion.context.toString()
          }
          shortD.hostname = 'somehostname'
          i.addDependency(d, 'somehostname', function (err, limitedInstance) {
            expect(err).to.be.null()
            expect(limitedInstance).to.exist()
            expect(Object.keys(limitedInstance)).to.contain(nodeFields)
            expect(limitedInstance).to.deep.equal(shortD)
            i.getDependencies(function (err, deps) {
              expect(err).to.be.null()
              expect(deps).to.be.an.array()
              expect(deps).to.have.length(2)
              expect(Object.keys(deps[1])).to.contain(nodeFields)
              expect(deps).to.deep.contain(shortD)
              done()
            })
          })
        })

        it('should be able to get dependent', function (done) {
          var dependent = instances[0]
          var dependency = instances[1]
          var shortD = pick(dependent.toJSON(), nodeFields)
          shortD.contextVersion = {
            context: shortD.contextVersion.context.toString()
          }
          shortD.hostname = 'somehostname'
          dependency.getDependents(function (err, dependents) {
            expect(err).to.be.null()
            expect(dependents).to.be.an.array()
            expect(dependents).to.have.length(1)
            expect(Object.keys(dependents[0])).to.contain(nodeFields)
            expect(shortD).to.deep.contain(dependents[0])
            done()
          })
        })

        it('should be able to chain dependencies', function (done) {
          var i = instances[1]
          var d = instances[2]
          var shortD = pick(d, nodeFields)
          shortD.contextVersion = {
            context: shortD.contextVersion.context.toString()
          }
          shortD.hostname = 'somehostname'
          i.addDependency(d, 'somehostname', function (err, limitedInstance) {
            expect(err).to.be.null()
            expect(limitedInstance).to.exist()
            expect(Object.keys(limitedInstance)).to.contain(nodeFields)
            expect(limitedInstance).to.deep.equal(shortD)
            i.getDependencies(function (err, deps) {
              expect(err).to.be.null()
              expect(deps).to.be.an.array()
              expect(deps).to.have.length(1)
              expect(Object.keys(deps[0])).to.contain(nodeFields)
              expect(deps[0]).to.deep.equal(shortD)
              instances[0].getDependencies(function (err, deps) {
                expect(err).to.be.null()
                expect(deps).to.be.an.array()
                expect(deps).to.have.length(1)
                done()
              })
            })
          })
        })

        describe('instance with 2 dependents', function () {
          beforeEach(function (done) {
            instances[2].addDependency(instances[1], 'somehostname', done)
          })
          it('should be able to get dependents', function (done) {
            var dependent1 = instances[0]
            var dependent2 = instances[2]
            var dependency = instances[1]
            var shortD1 = pick(dependent1.toJSON(), nodeFields)
            shortD1.contextVersion = {
              context: shortD1.contextVersion.context.toString()
            }
            shortD1.hostname = 'somehostname'
            var shortD2 = pick(dependent2.toJSON(), nodeFields)
            shortD2.contextVersion = {
              context: shortD2.contextVersion.context.toString()
            }
            shortD2.hostname = 'somehostname'
            dependency.getDependents(function (err, dependents) {
              expect(err).to.be.null()
              expect(dependents).to.be.an.array()
              expect(dependents).to.have.length(2)
              expect(Object.keys(dependents[0])).to.contain(nodeFields)
              expect(Object.keys(dependents[1])).to.contain(nodeFields)
              expect(dependents).to.deep.contain(shortD1)
              expect(dependents).to.deep.contain(shortD2)
              done()
            })
          })
        })

        describe('with chained depedencies', function () {
          beforeEach(function (done) {
            instances[1].addDependency(instances[2], 'somehostname2', done)
          })

          it('should be able to recurse dependencies', function (done) {
            var i = instances[0]
            i.getDependencies({ recurse: true }, function (err, deps) {
              if (err) { return done(err) }
              expect(deps).to.be.an.array()
              expect(deps).to.have.length(1)
              expect(deps[0].id).to.equal(instances[1].id.toString())
              expect(deps[0].dependencies).to.be.an.array()
              expect(deps[0].dependencies).to.have.length(1)
              expect(deps[0].dependencies[0].id).to.equal(instances[2].id.toString())
              done()
            })
          })

          it('should be able to flatten recursed dependencies', function (done) {
            var i = instances[0]
            i.getDependencies({ recurse: true, flatten: true }, function (err, deps) {
              if (err) { return done(err) }
              expect(deps).to.be.an.array()
              expect(deps).to.have.length(2)
              expect(deps.map(pluck('id'))).to.only.include([
                instances[1].id.toString(),
                instances[2].id.toString()
              ])
              var dep1 = find(deps, hasProps({ id: instances[1].id.toString() }))
              var dep2 = find(deps, hasProps({ id: instances[2].id.toString() }))
              expect(dep1.dependencies).to.have.length(1)
              expect(dep1.dependencies[0].id).to.equal(instances[2].id.toString())
              expect(dep2.dependencies).to.have.length(0)
              done()
            })
          })

          it('should not follow circles while flattening', function (done) {
            async.series([
              function (cb) {
                instances[2].addDependency(instances[0], 'circlehost', cb)
              },
              function (cb) {
                var i = instances[0]
                i.getDependencies({ recurse: true, flatten: true }, function (err, deps) {
                  if (err) { return done(err) }
                  expect(deps).to.be.an.array()
                  expect(deps).to.have.length(3)
                  expect(deps.map(pluck('id'))).to.only.include(instances.map(pluck('id')))
                  cb()
                })
              }
            ], done)
          })

          it('should not follow circles', function (done) {
            async.series([
              function (cb) {
                instances[2].addDependency(instances[0], 'circlehost', cb)
              },
              function (cb) {
                var i = instances[0]
                i.getDependencies({ recurse: true }, function (err, deps) {
                  if (err) { return done(err) }
                  expect(deps).to.be.an.array()
                  expect(deps).to.have.length(1)
                  expect(deps[0].id).to.equal(instances[1].id.toString())
                  expect(deps[0].dependencies).to.be.an.array()
                  expect(deps[0].dependencies).to.have.length(1)
                  expect(deps[0].dependencies[0].id).to.equal(instances[2].id.toString())
                  expect(deps[0].dependencies[0].dependencies)
                    .to.be.an.array(instances[0].id.toString())
                  cb()
                })
              }
            ], done)
          })
        })
      })
    })
  })

  describe('invalidateContainerDNS', function () {
    var instance

    beforeEach(function (done) {
      instance = createNewInstance('a', {})
      sinon.stub(pubsub, 'publish')
      done()
    })

    afterEach(function (done) {
      pubsub.publish.restore()
      done()
    })

    it('should not invalidate without a docker host', function (done) {
      delete instance.container.dockerHost
      instance.invalidateContainerDNS()
      expect(pubsub.publish.callCount).to.equal(0)
      done()
    })

    it('should not invalidate without a local ip address', function (done) {
      delete instance.container.inspect.NetworkSettings.IPAddress
      instance.invalidateContainerDNS()
      expect(pubsub.publish.callCount).to.equal(0)
      done()
    })

    it('should not invalidate with a malformed docker host ip', function (done) {
      instance.container.dockerHost = 'skkfksrandom'
      instance.invalidateContainerDNS()
      expect(pubsub.publish.callCount).to.equal(0)
      done()
    })

    it('should publish the correct invalidation event via redis', function (done) {
      var hostIp = '10.20.128.1'
      var localIp = '172.17.14.55'
      var instance = createNewInstance('b', {
        dockerHost: 'http://' + hostIp + ':4242',
        IPAddress: localIp
      })
      instance.invalidateContainerDNS()
      expect(pubsub.publish.calledOnce).to.be.true()
      expect(pubsub.publish.calledWith(
        process.env.REDIS_DNS_INVALIDATION_KEY + ':' + hostIp,
        localIp
      )).to.be.true()
      done()
    })
  })

  describe('setDependenciesFromEnvironment', function () {
    var ownerName = 'someowner'
    var instance

    beforeEach(function (done) {
      instance = createNewInstance('wooosh')
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

    describe('Testing changes in envs', function () {
      var masterInstances
      beforeEach(function (done) {
        masterInstances = [
          createNewInstance('hello', {masterPod: true}),
          createNewInstance('adelle', {masterPod: true})
        ]
        sinon.stub(Instance, 'find').yieldsAsync(null, masterInstances)
        sinon.stub(instance, 'addDependency').yieldsAsync()
        sinon.stub(instance, 'removeDependency').yieldsAsync()
        done()
      })
      afterEach(function (done) {
        instance.addDependency.restore()
        instance.removeDependency.restore()
        done()
      })
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
            sinon.match.has('shortHash', masterInstances[0].shortHash),
            'hello-staging-' + ownerName + '.runnableapp.com',
            sinon.match.func
          )
          sinon.assert.calledWith(instance.addDependency.getCall(1),
            sinon.match.has('shortHash', masterInstances[1].shortHash),
            'adelle-staging-' + ownerName + '.runnableapp.com',
            sinon.match.func
          )
          sinon.assert.notCalled(instance.removeDependency)
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
            sinon.match.has('shortHash', masterInstances[0].shortHash),
            'hello-staging-' + ownerName + '.runnableapp.com',
            sinon.match.func
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
            sinon.match.has('shortHash', masterInstances[0].shortHash),
            sinon.match.func
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
            sinon.match.has('shortHash', masterInstances[0].shortHash),
            sinon.match.func
          )
          sinon.assert.calledWith(instance.removeDependency.getCall(1),
            sinon.match.has('shortHash', masterInstances[1].shortHash),
            sinon.match.func
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
            sinon.match.has('shortHash', masterInstances[1].shortHash),
            sinon.match.func
          )
          sinon.assert.calledOnce(instance.addDependency)
          sinon.assert.calledWith(instance.addDependency.getCall(0),
            sinon.match.has('shortHash', masterInstances[0].shortHash),
            'hello-staging-' + ownerName + '.runnableapp.com',
            sinon.match.func
          )
          done()
        })
      })
      it('should remove the existing one, and add the new one', function (done) {
        masterInstances.push(createNewInstance('cheese', {masterPod: true}))   // 2
        masterInstances.push(createNewInstance('chicken', {masterPod: true}))  // 3
        masterInstances.push(createNewInstance('beef', {masterPod: true}))     // 4
        masterInstances.push(createNewInstance('potatoes', {masterPod: true})) // 5
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
            sinon.match.has('shortHash', masterInstances[1].shortHash),
            sinon.match.func
          )
          sinon.assert.calledWith(instance.removeDependency.getCall(1),
            sinon.match.has('shortHash', masterInstances[2].shortHash),
            sinon.match.func
          )
          sinon.assert.calledTwice(instance.addDependency)
          sinon.assert.calledWith(instance.addDependency.getCall(0),
            sinon.match.has('shortHash', masterInstances[3].shortHash),
            'chicken-staging-' + ownerName + '.runnableapp.com',
            sinon.match.func
          )
          sinon.assert.calledWith(instance.addDependency.getCall(1),
            sinon.match.has('shortHash', masterInstances[5].shortHash),
            'potatoes-staging-' + ownerName + '.runnableapp.com',
            sinon.match.func
          )
          done()
        })
      })
    })
  })

  describe('addDependency', function () {
    var instance = createNewInstance('goooush')
    var dependant = createNewInstance('splooosh')

    beforeEach(function (done) {
      sinon.spy(instance, 'invalidateContainerDNS')
      sinon.stub(async, 'series').yieldsAsync()
      done()
    })

    afterEach(function (done) {
      instance.invalidateContainerDNS.restore()
      async.series.restore()
      done()
    })

    it('should invalidate dns cache entries', function (done) {
      instance.addDependency(dependant, 'wooo.com', function (err) {
        if (err) { done(err) }
        expect(instance.invalidateContainerDNS.calledOnce).to.be.true()
        done()
      })
    })
  })

  describe('removeDependency', function () {
    var instance = createNewInstance('boooush')
    var dependant = createNewInstance('mighty')

    beforeEach(function (done) {
      sinon.spy(instance, 'invalidateContainerDNS')
      sinon.stub(Neo4j.prototype, 'deleteConnection').yieldsAsync()
      done()
    })

    afterEach(function (done) {
      instance.invalidateContainerDNS.restore()
      Neo4j.prototype.deleteConnection.restore()
      done()
    })

    it('should invalidate dns cache entries', function (done) {
      instance.removeDependency(dependant, function (err) {
        if (err) { done(err) }
        expect(instance.invalidateContainerDNS.calledOnce).to.be.true()
        done()
      })
    })
  })

  describe('remove', function () {
    it('should not throw error if instance does not exist in db', function (done) {
      var inst = createNewInstance('api-anton-1')
      inst.remove(function (err) {
        expect(err).to.be.null()
        done()
      })
    })
  })

  describe('addDefaultIsolationOpts', function () {
    it('should add default options for Isolation', function (done) {
      var opts = {}
      expect(Instance.addDefaultIsolationOpts(opts)).to.deep.equal({
        $or: [
          { isolated: { $exists: false } },
          { isIsolationGroupMaster: true }
        ]
      })
      // enforce the function returns a new object, not the same one
      expect(opts).to.deep.equal({})
      opts = { isolated: 4 }
      expect(Instance.addDefaultIsolationOpts(opts)).to.deep.equal({ isolated: 4 })
      opts = { isIsolationGroupMaster: true }
      expect(Instance.addDefaultIsolationOpts(opts)).to.deep.equal({
        isIsolationGroupMaster: true
      })
      opts = { $or: [{ value: 4 }] }
      expect(Instance.addDefaultIsolationOpts(opts)).to.deep.equal({
        $or: [
          { value: 4 },
          { isolated: { $exists: false } },
          { isIsolationGroupMaster: true }
        ]
      })
      done()
    })
  })

  describe('#emitInstanceUpdates', function () {
    function createMockInstance () {
      return new Instance()
    }
    beforeEach(function (done) {
      ctx.query = {}
      ctx.mockSessionUser = {}
      ctx.mockInstances = [
        createMockInstance(),
        createMockInstance(),
        createMockInstance()
      ]
      sinon.stub(Instance, 'find')
      sinon.stub(Instance.prototype, 'emitInstanceUpdate')
      done()
    })
    afterEach(function (done) {
      Instance.find.restore()
      Instance.prototype.emitInstanceUpdate.restore()
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        var mockInstances = ctx.mockInstances
        Instance.find.yieldsAsync(null, mockInstances)
        Instance.prototype.emitInstanceUpdate
          .onCall(0).yieldsAsync(null, mockInstances[0])
          .onCall(1).yieldsAsync(null, mockInstances[1])
          .onCall(2).yieldsAsync(null, mockInstances[2])
        done()
      })
      it('should emit instance updates', function (done) {
        Instance.emitInstanceUpdates(ctx.mockSessionUser, ctx.query, 'update', function (err, instances) {
          if (err) { return done(err) }
          sinon.assert.calledWith(
            Instance.find,
            ctx.query,
            sinon.match.func
          )
          ctx.mockInstances.forEach(function (mockInstance) {
            sinon.assert.calledOn(
              Instance.prototype.emitInstanceUpdate,
              mockInstance
            )
          })
          sinon.assert.calledWith(
            Instance.prototype.emitInstanceUpdate,
            ctx.mockSessionUser,
            'update'
          )
          expect(instances).to.deep.equal(ctx.mockInstances)
          done()
        })
      })
    })

    describe('errors', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom')
        done()
      })
      describe('find errors', function () {
        beforeEach(function (done) {
          Instance.find.yieldsAsync(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          Instance.emitInstanceUpdates(ctx.mockSessionUser, ctx.query, 'update', expectErr(ctx.err, done))
        })
      })
      describe('emitInstanceUpdate errors', function () {
        beforeEach(function (done) {
          Instance.find.yieldsAsync(null, ctx.mockInstances)
          Instance.prototype.emitInstanceUpdate.yieldsAsync(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          Instance.emitInstanceUpdates(ctx.mockSessionUser, ctx.query, 'update', expectErr(ctx.err, done))
        })
      })
    })
  })

  describe('populateOwnerAndCreatedBy', function () {
    beforeEach(function (done) {
      ctx.instance = createNewInstance()
      sinon.stub(ctx.instance, 'update').yieldsAsync(null)
      ctx.mockSessionUser = {
        findGithubUserByGithubId: sinon.stub().yieldsAsync(null, {
          login: 'TEST-login',
          avatar_url: 'TEST-avatar_url'
        })
      }
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
      ctx.instance1 = createNewInstance()
      ctx.instance2 = createNewInstance()
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
      ctx.instance = createNewInstance()
      ctx.mockCv = createNewVersion({})
      sinon.stub(Version, 'findById').yieldsAsync(null, ctx.mockCv)
      sinon.stub(ctx.instance, 'update').yieldsAsync(null)
      done()
    })

    afterEach(function (done) {
      Version.findById.restore()
      done()
    })

    it('should update the context version', function (done) {
      var originalCvId = ctx.instance.contextVersion._id
      ctx.instance.updateCv(function (err) {
        expect(err).to.not.exist()
        sinon.assert.calledOnce(Version.findById)
        sinon.assert.calledWith(Version.findById, originalCvId, {'build.log': 0}, sinon.match.func)
        sinon.assert.calledOnce(ctx.instance.update)
        sinon.assert.calledWith(ctx.instance.update, {
          $set: {
            contextVersion: ctx.mockCv.toJSON()
          }
        }, sinon.match.func)
        done()
      })
    })

    describe('when the db fails', function () {
      var TestErr = new Error('Test Err')
      beforeEach(function (done) {
        Version.findById.yieldsAsync(TestErr)
        done()
      })
      it('should pass the error through', function (done) {
        ctx.instance.updateCv(function (err) {
          expect(err).to.equal(TestErr)
          sinon.assert.notCalled(ctx.instance.update)
          done()
        })
      })
    })
  })
})
