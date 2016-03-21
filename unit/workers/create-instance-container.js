require('loadenv')()
var path = require('path')

var Lab = require('lab')
var Boom = require('dat-middleware').Boom
var Code = require('code')
var ContextVersion = require('models/mongo/context-version')
var createInstanceContainer = require('workers/create-instance-container')
var InstanceService = require('models/services/instance-service')
var moment = require('moment')
var rabbitmq = require('models/rabbitmq')
var sinon = require('sinon')
var error = require('error')

var expect = Code.expect
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var moduleName = path.relative(process.cwd(), __filename)

describe('Worker: create-instance-container: ' + moduleName, function () {
  var ctx
  beforeEach(function (done) {
    ctx = {}
    // valid job
    ctx.job = {
      contextVersionId: '123456789012345678901234',
      instanceId: '123456789012345678901234',
      ownerUsername: 'runnable'
    }
    sinon.stub(InstanceService, 'createContainer')
    done()
  })
  afterEach(function (done) {
    InstanceService.createContainer.restore()
    done()
  })

  describe('success', function () {
    beforeEach(function (done) {
      InstanceService.createContainer.yieldsAsync()
      done()
    })

    it('should call InstanceService.createContainer', function (done) {
      createInstanceContainer(ctx.job)
        .asCallback(function (err) {
          expect(err).to.not.exist()
          sinon.assert.calledWith(InstanceService.createContainer, ctx.job)
          done()
        })
    })
  })

  describe('error', function () {
    describe('unknown error', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom')
        InstanceService.createContainer.yieldsAsync(ctx.err)
        done()
      })

      it('should call InstanceService.createContainer', function (done) {
        createInstanceContainer(ctx.job)
          .asCallback(function (err) {
            expect(err.cause).to.equal(ctx.err)
            done()
          })
      })
    })

    describe('4XX err', function () {
      beforeEach(function (done) {
        ctx.err = Boom.notFound('boom')
        InstanceService.createContainer.yieldsAsync(ctx.err)
        done()
      })

      it('should call InstanceService.createContainer', function (done) {
        createInstanceContainer(ctx.job)
          .asCallback(function (err) {
            expect(err.data.originalError.cause).to.equal(ctx.err)
            done()
          })
      })
    })

    describe('when the build completed 3 seconds ago and we cannot find resources', function () {
      beforeEach(function (done) {
        ctx.err = new Error('Unable to find dock with required resources')
        ctx.contextVersion = {
          build: {
            completed: moment().subtract(3, 'minutes').format()
          }
        }
        sinon.stub(error, 'log')
        sinon.stub(ContextVersion, 'findById').yieldsAsync(null, ctx.contextVersion)
        sinon.stub(rabbitmq, 'publishInstanceRebuild')
        InstanceService.createContainer.yieldsAsync(ctx.err)
        done()
      })
      afterEach(function (done) {
        error.log.restore()
        ContextVersion.findById.restore()
        rabbitmq.publishInstanceRebuild.restore()
        done()
      })
      it('should not trigger a re-build', function (done) {
        createInstanceContainer(ctx.job)
          .asCallback(function (err) {
            expect(err.cause).to.equal(ctx.err)
            sinon.assert.notCalled(ContextVersion.findById)
            sinon.assert.notCalled(rabbitmq.publishInstanceRebuild)
            sinon.assert.notCalled(error.log)
            done()
          })
      })
    })

    describe('Image not found create err', function () {
      beforeEach(function (done) {
        ctx.err = new Error('image 1234 not found')
        ctx.contextVersion = {
          build: {
            completed: moment().subtract(3, 'minutes').format()
          }
        }
        sinon.stub(error, 'log')
        sinon.stub(ContextVersion, 'findById').yieldsAsync(null, ctx.contextVersion)
        sinon.stub(rabbitmq, 'publishInstanceRebuild')
        InstanceService.createContainer.yieldsAsync(ctx.err)
        done()
      })
      afterEach(function (done) {
        error.log.restore()
        ContextVersion.findById.restore()
        rabbitmq.publishInstanceRebuild.restore()
        done()
      })

      it('should trigger a re-build of the instance', function (done) {
        createInstanceContainer(ctx.job)
          .asCallback(function (err) {
            expect(err).to.not.exist()
            sinon.assert.calledOnce(ContextVersion.findById)
            sinon.assert.calledWith(ContextVersion.findById, ctx.job.contextVersionId)
            sinon.assert.calledOnce(rabbitmq.publishInstanceRebuild)
            sinon.assert.calledWith(rabbitmq.publishInstanceRebuild, {
              instanceId: ctx.job.instanceId
            })
            sinon.assert.calledOnce(error.log)
            // Can't do a direct calledWith here because bluebird wraps errors thrown
            sinon.assert.calledWith(
              error.log,
              sinon.match.has(
                'message',
                sinon.match(/publishing.*instance.*failed.*two.*minutes/))
            )
            done()
          })
      })

      describe('when the build completed less than 30 seconds ago', function () {
        beforeEach(function (done) {
          ctx.contextVersion.build.completed = moment().subtract(29, 'seconds')
          done()
        })
        it('should not trigger a re-build', function (done) {
          createInstanceContainer(ctx.job)
            .asCallback(function (err) {
              expect(err.cause).to.equal(ctx.err)
              sinon.assert.calledOnce(ContextVersion.findById)
              sinon.assert.calledWith(ContextVersion.findById, ctx.job.contextVersionId)
              sinon.assert.notCalled(rabbitmq.publishInstanceRebuild)
              sinon.assert.notCalled(error.log)
              done()
            })
        })
      })
    })
  })
})
