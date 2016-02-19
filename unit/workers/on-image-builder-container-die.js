/**
 * @module unit/workers/on-image-builder-container-die
 */
'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()

var Code = require('code')
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

var Promise = require('bluebird')
var Build = require('models/mongo/build')
var ContextVersion = require('models/mongo/context-version')
var Instance = require('models/mongo/instance')
var User = require('models/mongo/user')
var Docker = require('models/apis/docker')
var messenger = require('socket/messenger.js')
var rabbitMQ = require('models/rabbitmq')
var keypather = require('keypather')()
var put = require('101/put')

var OnImageBuilderContainerDie = require('workers/on-image-builder-container-die')

var afterEach = lab.afterEach
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it
var expectErr = function (expectedErr, done) {
  return function (err) {
    expect(err).to.exist()
    expect(err.message).to.equal(expectedErr.message)
    done()
  }
}

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('OnImageBuilderContainerDie: ' + moduleName, function () {
  var ctx

  beforeEach(function (done) {
    ctx = {}
    ctx.data = keypather.expand({
      from: '34565762',
      host: 'http://runnable.io',
      id: '3225',
      time: 234234,
      uuid: '12343',
      dockerHost: '0.0.0.0',
      'inspectData.Name': '/123456789012345678901111',
      'inspectData.Config.Labels.sessionUserGithubId': 1,
      'inspectData.Config.Labels.ownerUsername': 'thejsj'
    })
    ctx.mockContextVersion = {
      _id: 123,
      toJSON: function () { return {} }
    }
    done()
  })

  describe('_getBuildInfo', function () {
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'getBuildInfo').yieldsAsync(null, {})
        sinon.stub(OnImageBuilderContainerDie, '_handleBuildError', function (data, cb) {
          expect(data).to.be.an.object()
          return Promise.resolve()
        })
        sinon.stub(OnImageBuilderContainerDie, '_handleBuildComplete', function (data, cb) {
          expect(data).to.be.an.object()
          return Promise.resolve()
        })
        done()
      })
      afterEach(function (done) {
        Docker.prototype.getBuildInfo.restore()
        OnImageBuilderContainerDie._handleBuildError.restore()
        OnImageBuilderContainerDie._handleBuildComplete.restore()
        done()
      })
      it('should fetch build info and update success', function (done) {
        OnImageBuilderContainerDie._getBuildInfo({ id: 1 }).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(OnImageBuilderContainerDie._handleBuildComplete)
          sinon.assert.notCalled(OnImageBuilderContainerDie._handleBuildError)
          done()
        })
      })
    })
    describe('build failure', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'getBuildInfo').yields(null, {})
        sinon.stub(OnImageBuilderContainerDie, '_handleBuildError', function (data, cb) {
          expect(data).to.be.an.object()
          return Promise.resolve()
        })
        sinon.stub(OnImageBuilderContainerDie, '_handleBuildComplete', function (data, cb) {
          expect(data).to.be.an.object()
          return Promise.resolve()
        })
        done()
      })
      afterEach(function (done) {
        Docker.prototype.getBuildInfo.restore()
        OnImageBuilderContainerDie._handleBuildError.restore()
        OnImageBuilderContainerDie._handleBuildComplete.restore()
        done()
      })
      it('should fetch build info and update build failure', function (done) {
        OnImageBuilderContainerDie._getBuildInfo({ id: 2 }).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledOnce(OnImageBuilderContainerDie._handleBuildComplete)
          sinon.assert.notCalled(OnImageBuilderContainerDie._handleBuildError)
          done()
        })
      })
    })
    describe('fetch failure', function () {
      beforeEach(function (done) {
        sinon.stub(Docker.prototype, 'getBuildInfoAsync').rejects(new Error('docker error'))
        sinon.stub(OnImageBuilderContainerDie, '_handleBuildError', function (data, cb) {
          expect(data).to.be.an.object()
          return Promise.resolve()
        })
        sinon.stub(OnImageBuilderContainerDie, '_handleBuildComplete', function (data, cb) {
          expect(data).to.be.an.object()
          return Promise.resolve()
        })
        done()
      })
      afterEach(function (done) {
        Docker.prototype.getBuildInfoAsync.restore()
        OnImageBuilderContainerDie._handleBuildError.restore()
        OnImageBuilderContainerDie._handleBuildComplete.restore()
        done()
      })
      it('should fetch build info and update fetch failure', function (done) {
        OnImageBuilderContainerDie._getBuildInfo({ id: 3 }).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.notCalled(OnImageBuilderContainerDie._handleBuildComplete)
          sinon.assert.calledOnce(OnImageBuilderContainerDie._handleBuildError)
          done()
        })
      })
    })
  })

  describe('_handleBuildError', function () {
    beforeEach(function (done) {
      ctx.contextVersions = [ctx.mockContextVersion]
      sinon.stub(ContextVersion, 'updateBuildErrorByContainerAsync').resolves([ctx.mockContextVersion])
      sinon.stub(Build, 'updateFailedByContextVersionIdsAsync').resolves()
      done()
    })
    afterEach(function (done) {
      ContextVersion.updateBuildErrorByContainerAsync.restore()
      Build.updateFailedByContextVersionIdsAsync.restore()
      done()
    })
    it('it should handle errored build', function (done) {
      OnImageBuilderContainerDie._handleBuildError(ctx.data, {}).asCallback(function () {
        sinon.assert.calledWith(ContextVersion.updateBuildErrorByContainerAsync, ctx.data.id)
        sinon.assert.calledWith(Build.updateFailedByContextVersionIdsAsync, [ctx.mockContextVersion._id])
        done()
      })
    })
  })

  describe('_handleBuildComplete', function () {
    beforeEach(function (done) {
      ctx.instanceStub = {
        updateCvAsync: sinon.stub()
      }
      ctx.contextVersions = [ctx.mockContextVersion]
      ctx.buildInfo = {}
      ctx.job = {}
      sinon.stub(ContextVersion, 'updateBuildCompletedByContainerAsync')
      sinon.stub(Build, 'updateFailedByContextVersionIdsAsync')
      sinon.stub(Build, 'updateCompletedByContextVersionIdsAsync')
      sinon.stub(Instance, 'findByContextVersionIdsAsync').resolves([ctx.instanceStub])
      done()
    })
    afterEach(function (done) {
      ContextVersion.updateBuildCompletedByContainerAsync.restore()
      Build.updateFailedByContextVersionIdsAsync.restore()
      Build.updateCompletedByContextVersionIdsAsync.restore()
      Instance.findByContextVersionIdsAsync.restore()
      done()
    })
    describe('success', function () {
      beforeEach(function (done) {
        ContextVersion.updateBuildCompletedByContainerAsync.resolves([ctx.mockContextVersion])
        Build.updateCompletedByContextVersionIdsAsync.resolves()
        done()
      })

      it('it should handle successful build', function (done) {
        OnImageBuilderContainerDie._handleBuildComplete(ctx.data, ctx.buildInfo)
          .asCallback(function () {
            sinon.assert.calledOnce(Instance.findByContextVersionIdsAsync)
            sinon.assert.calledWith(Instance.findByContextVersionIdsAsync, [ctx.mockContextVersion._id])
            sinon.assert.calledOnce(ctx.instanceStub.updateCvAsync)
            sinon.assert.calledWith(
              ContextVersion.updateBuildCompletedByContainerAsync,
              ctx.data.id,
              ctx.buildInfo
            )
            sinon.assert.calledWith(
              Build.updateCompletedByContextVersionIdsAsync,
              [ctx.mockContextVersion._id]
            )
            done()
          })
      })
    })

    describe('errors', function () {
      describe('build failed w/ exit code', function () {
        beforeEach(function (done) {
          ctx.buildInfo.failed = true
          ContextVersion.updateBuildCompletedByContainerAsync.resolves([ctx.mockContextVersion])
          done()
        })
        describe('Build.updateFailedByContextVersionIds success', function () {
          beforeEach(function (done) {
            Build.updateFailedByContextVersionIdsAsync.resolves()
            done()
          })
          it('it should handle failed build', function (done) {
            OnImageBuilderContainerDie._handleBuildComplete(ctx.data, ctx.buildInfo)
              .asCallback(function (err) {
                if (err) { return done(err) }
                sinon.assert.calledOnce(Instance.findByContextVersionIdsAsync)
                sinon.assert.calledWith(Instance.findByContextVersionIdsAsync, [ctx.mockContextVersion._id])
                sinon.assert.calledOnce(ctx.instanceStub.updateCvAsync)
                sinon.assert.calledWith(
                  ContextVersion.updateBuildCompletedByContainerAsync,
                  ctx.data.id,
                  ctx.buildInfo
                )
                sinon.assert.calledWith(
                  Build.updateFailedByContextVersionIdsAsync,
                  [ctx.mockContextVersion._id]
                )
                done()
              })
          })
        })
        describe('Build.updateFailedByContextVersionIds error', function () {
          beforeEach(function (done) {
            ctx.err = new Error('boom0')
            Build.updateFailedByContextVersionIdsAsync.rejects(ctx.err)
            done()
          })
          it('should callback the error', function (done) {
            OnImageBuilderContainerDie._handleBuildComplete(ctx.data, ctx.buildInfo)
              .asCallback(function (err) {
                sinon.assert.calledOnce(Instance.findByContextVersionIdsAsync)
                sinon.assert.calledWith(Instance.findByContextVersionIdsAsync, [ctx.mockContextVersion._id])
                sinon.assert.calledOnce(ctx.instanceStub.updateCvAsync)
                expectErr(ctx.err, done)(err)
              })
          })
        })
      })
      describe('CV.updateBuildCompletedByContainerAsync error', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom1')
          ContextVersion.updateBuildCompletedByContainerAsync.rejects(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          OnImageBuilderContainerDie._handleBuildComplete(ctx.job, ctx.buildInfo)
            .asCallback(function (err) {
              sinon.assert.notCalled(Instance.findByContextVersionIdsAsync)
              sinon.assert.notCalled(ctx.instanceStub.updateCvAsync)
              expectErr(ctx.err, done)(err)
            })
        })
      })
      describe('Build.updateCompletedByContextVersionIds error', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom2')
          ContextVersion.updateBuildCompletedByContainerAsync.resolves([ctx.mockContextVersion])
          Build.updateCompletedByContextVersionIdsAsync.rejects(ctx.err)
          done()
        })
        it('should callback the error', function (done) {
          OnImageBuilderContainerDie._handleBuildComplete(ctx.job, ctx.buildInfo)
            .asCallback(function (err) {
              sinon.assert.calledOnce(Instance.findByContextVersionIdsAsync)
              sinon.assert.calledWith(Instance.findByContextVersionIdsAsync, [ctx.mockContextVersion._id])
              sinon.assert.calledOnce(ctx.instanceStub.updateCvAsync)
              expectErr(ctx.err, done)(err)
            })
        })
      })
    })
  })

  describe('_emitInstanceUpdateEvents', function () {
    beforeEach(function (done) {
      ctx.mockUser = {}
      ctx.mockInstances = [{}, {}, {}]
      sinon.stub(User, 'findByGithubId').yieldsAsync(null, ctx.mockUser)
      sinon.stub(Instance, 'emitInstanceUpdatesAsync').resolves(ctx.mockInstances)
      sinon.stub(ContextVersion, 'findAsync').resolves([ctx.mockContextVersion])
      sinon.stub(messenger, 'emitInstanceUpdate')
      done()
    })
    afterEach(function (done) {
      User.findByGithubId.restore()
      Instance.emitInstanceUpdatesAsync.restore()
      ContextVersion.findAsync.restore()
      messenger.emitInstanceUpdate.restore()
      done()
    })

    it('should emit instance update events', function (done) {
      OnImageBuilderContainerDie._emitInstanceUpdateEvents(ctx.data).asCallback(function (err) {
        if (err) { return done(err) }
        sinon.assert.calledWith(User.findByGithubId, ctx.data.inspectData.Config.Labels.sessionUserGithubId)
        sinon.assert.calledWith(
          Instance.emitInstanceUpdatesAsync,
          ctx.mockUser,
          {
            'contextVersion._id': { $in: [ctx.mockContextVersion._id] }
          },
          'patch'
        )
        done()
      })
    })

    describe('No Instances Found', function () {
      it('should report to Rollbar if there are no instances to create containers for but not throw an error', function (done) {
        Instance.emitInstanceUpdatesAsync.resolves([])

        OnImageBuilderContainerDie._emitInstanceUpdateEvents(ctx.data).asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledWith(User.findByGithubId, ctx.data.inspectData.Config.Labels.sessionUserGithubId)
          sinon.assert.calledWith(
            Instance.emitInstanceUpdatesAsync,
            ctx.mockUser,
            {
              'contextVersion._id': { $in: [ctx.mockContextVersion._id] }
            },
            'patch'
          )
          done()
        })
      })
    })
  })

  describe('_createContainersIfSuccessful ', function () {
    var contextVersionId = 2
    var instanceId = 3
    var sessionUserGithubId = '789'
    var ownerUsername = 'thejsj'
    var job
    beforeEach(function (done) {
      ctx.instance = {
        contextVersion: {
          _id: {
            toString: sinon.stub().returns(contextVersionId)
          }
        },
        _id: {
          toString: sinon.stub().returns(instanceId)
        }
      }
      job = put(ctx.data, {
        inspectData: {
          Config: {
            Labels: {
              sessionUserGithubId: sessionUserGithubId,
              ownerUsername: ownerUsername
            }
          }
        }
      })
      sinon.stub(rabbitMQ, 'createInstanceContainer')
      done()
    })

    afterEach(function (done) {
      rabbitMQ.createInstanceContainer.restore()
      done()
    })

    it('should publish jobs to RabbitMQ if the build was succesful', function (done) {
      OnImageBuilderContainerDie._createContainersIfSuccessful(job, [ctx.instance], { failed: false })
      sinon.assert.calledOnce(rabbitMQ.createInstanceContainer)
      sinon.assert.calledWith(rabbitMQ.createInstanceContainer, {
        contextVersionId: contextVersionId,
        instanceId: instanceId,
        ownerUsername: ownerUsername,
        sessionUserGithubId: sessionUserGithubId
      })
      done()
    })

    it('should not publish jobs to RabbitMQ if the build was unsuccesful', function (done) {
      OnImageBuilderContainerDie._createContainersIfSuccessful(job, [ctx.instance], { failed: true })
      sinon.assert.notCalled(rabbitMQ.createInstanceContainer)
      done()
    })
  })
})
