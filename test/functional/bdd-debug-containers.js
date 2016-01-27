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

var api = require('./fixtures/api-control')
var dock = require('./fixtures/dock')
var multi = require('./fixtures/multi-factory')
var mockGetUserById = require('./fixtures/mocks/github/getByUserId')
var primus = require('./fixtures/primus')
var Docker = require('models/apis/docker')
var sinon = require('sinon')
var krain = require('krain')
var path = require('path')
var rimraf = require('rimraf')
var fs = require('fs')
var uuid = require('uuid')

function containerRoot (inspect) {
  // this is dumb that we have to save it in krain's node_module folder
  return path.join(
    __dirname,
    '../../node_modules/krain/test',
    inspect.Id)
}

describe('BDD - Debug Containers', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  before(require('./fixtures/mocks/api-client').setup)
  before(primus.connect)
  after(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))

  after(require('./fixtures/mocks/api-client').clean)
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-ctx')(ctx))
  afterEach(require('./fixtures/clean-nock'))
  beforeEach(
    mockGetUserById.stubBefore(function () {
      return []
    })
  )
  afterEach(mockGetUserById.stubAfter)
  beforeEach(function (done) {
    multi.createAndTailInstance(
      primus,
      { name: 'web-instance' },
      function (err, instance, build, user) {
        if (err) { return done(err) }
        ctx.webInstance = instance
        ctx.user = user
        ctx.build = build
        // boy this is a bummer... let's cheat a little bit
        require('./fixtures/mocks/github/user')(ctx.user)
        require('./fixtures/mocks/github/user')(ctx.user)
        require('./fixtures/mocks/github/user')(ctx.user)
        ctx.instance = ctx.user.createInstance({
          name: 'api-instance',
          build: ctx.build.id(),
          masterPod: true
        }, function (err) {
          if (err) { return done(err) }
          primus.expectAction('start', {}, function () {
            ctx.instance.fetch(done)
          })
        })
      })
  })

  describe('creation', function () {
    beforeEach(function (done) {
      sinon.spy(Docker.prototype, 'createContainer')
      done()
    })
    afterEach(function (done) {
      Docker.prototype.createContainer.restore()
      done()
    })

    it('should let us make a debug container', function (done) {
      // this layer ID is fake b/c we are just going to validate it's usage
      var layer = uuid()
      var opts = {
        instance: ctx.instance.attrs._id.toString(),
        layerId: layer,
        contextVersion: ctx.instance.attrs.contextVersion._id.toString(),
        cmd: 'echo your mom'
      }
      ctx.user.createDebugContainer(opts, function (err, dc) {
        if (err) { return done(err) }
        expect(dc).to.exist()
        expect(dc).to.deep.contain({
          instance: opts.instance,
          contextVersion: opts.contextVersion,
          layerId: layer
        })
        expect(dc.inspect).to.exist()
        expect(dc.inspect).to.deep.contain({
          dockerHost: ctx.instance.attrs.contextVersion.dockerHost,
          Cmd: [ 'sleep', '28800' ],
          State: { Running: true }
        })
        expect(Docker.prototype.createContainer.calledOnce).to.be.true()
        expect(Docker.prototype.createContainer.getCall(0).args[0]).to.deep.contain({
          Cmd: [ 'sleep', '28800' ],
          Image: layer
        })
        expect(Docker.prototype.createContainer.getCall(0).args[1])
          .to.be.a.function()
        done()
      })
    })
  })

  describe('container files', function () {
    beforeEach(function (done) {
      // this layer ID is fake b/c we are just going to validate it's usage
      var layer = uuid()
      var opts = {
        instance: ctx.instance.attrs._id.toString(),
        layerId: layer,
        contextVersion: ctx.instance.attrs.contextVersion._id.toString(),
        cmd: 'echo your dad'
      }
      ctx.dc = ctx.user.createDebugContainer(opts, done)
    })
    var inspectToDelete
    var krainServer
    beforeEach(function (done) {
      krainServer = krain.listen(process.env.KRAIN_PORT)
      fs.mkdirSync(containerRoot(ctx.dc.attrs.inspect))
      fs.mkdirSync(containerRoot(ctx.dc.attrs.inspect) + '/foo/')
      fs.writeFileSync(
        containerRoot(ctx.dc.attrs.inspect) + '/foo/que.txt',
        'Que Pasa!')
      fs.mkdirSync(containerRoot(ctx.dc.attrs.inspect) + '/bar/')
      fs.writeFileSync(
        containerRoot(ctx.dc.attrs.inspect) + '/baz.txt',
        'Hello World!')
      inspectToDelete = ctx.dc.attrs.inspect
      ctx.dc.fetch(done)
    })

    afterEach(function (done) {
      rimraf.sync(containerRoot(inspectToDelete))
      krainServer.close()
      done()
    })

    it('should allow us access to the fs of the container', function (done) {
      ctx.dc.rootDir.contents.fetch(function (err, body, code) {
        if (err) { return done(err) }
        expect(code).to.equal(200)
        expect(body).to.be.an.array()
        expect(body).to.have.length(3)
        expect(body).to.deep.include([
          { name: 'foo', path: '/', isDir: true },
          { name: 'bar', path: '/', isDir: true },
          { name: 'baz.txt', path: '/', isDir: false }
        ])
        done()
      })
    })
  })
})
