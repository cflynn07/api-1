/**
 * @module test/functional/fixtures/multi-factory
 */
'use strict'

var async = require('async')
var PermissionService = require('models/services/permission-service')
var createCount = require('callback-count')
var defaults = require('101/defaults')
var EventEmitter = require('events').EventEmitter
var generateKey = require('./key-factory')
var isFunction = require('101/is-function')
var isObject = require('101/is-object')
var logger = require('middlewares/logger')(__filename)
var MongoUser = require('models/mongo/user')
var Promise = require('bluebird')
var randStr = require('randomstring').generate
var sinon = require('sinon')
var uuid = require('uuid')
const sessionUser = require('./mocks/big-poppa').sessionUser

var log = logger.log

module.exports = {
  findUser: function (userId, cb) {
    log.trace({}, 'findUser')
    var host = require('./host')
    var User = require('@runnable/api-client')
    var opts = { userContentDomain: process.env.USER_CONTENT_DOMAIN }
    var user = new User(host, opts)
    MongoUser.findOne({'accounts.github.id': userId}, function (err, userDoc) {
      if (err) { return cb(err) }
      if (!userDoc) {
        return cb(null, null)
      }
      var token = userDoc.accounts.github.accessToken
      var name = userDoc.accounts.github.username
      require('./mocks/github/action-auth')(token, userId, name)
      user.githubLogin(token, function (err) {
        if (err) {
          return cb(err)
        } else {
          user.attrs.accounts.github.accessToken = token
          user.attrs.accounts.github.username = name
          log.trace({
            token: token,
            name: name,
            userId: userId
          }, 'foundUser')
          cb(null, user)
        }
      })
    })
    return user
  },
  createUser: function (opts, cb) {
    if (isFunction(opts)) {
      cb = opts
      opts = {}
    }
    log.trace({}, 'createUser')
    var host = require('./host')
    var token = uuid()
    var name = opts.username || randStr(5)
    require('./mocks/github/action-auth')(token, undefined, name)
    var User = require('@runnable/api-client')
    opts.userContentDomain = process.env.USER_CONTENT_DOMAIN
    var user = new User(host, opts)
    sessionUser(opts.orgs)
    .then(function () {
      user.githubLogin(token, function (err) {
        if (err) {
          return cb(err)
        } else {
          user.attrs.accounts.github.accessToken = token
          user.attrs.accounts.github.username = name
          user.attrs.accounts._json = {}
          log.trace({
            token: token,
            name: name,
            userId: user.attrs.accounts.github.id
          }, 'createdUser')
          cb(null, user)
        }
      })
    })
    return user
  },
  createHelloRunnableUser: function (cb) {
    log.trace({}, 'createUser')
    var host = require('./host')
    var token = uuid()
    require('./mocks/github/action-auth')(token,
      process.env.HELLO_RUNNABLE_GITHUB_ID)
    var User = require('@runnable/api-client')
    var user = new User(host)
    user.opts.userContentDomain = process.env.USER_CONTENT_DOMAIN
    user.githubLogin(token, function (err) {
      if (err) {
        return cb(err)
      } else {
        user.attrs.accounts.github.accessToken = token
        cb(null, user)
      }
    })
    return user
  },
  createModerator: function (opts, cb) {
    log.trace({}, 'createModerator')
    if (isFunction(opts)) {
      cb = opts
      opts = {}
    }
    return this.createUser(opts, function (err, user) {
      if (err) { return cb(err) }
      var $set = {
        permissionLevel: 5
      }
      MongoUser.updateById(user.id(), { $set: $set }, function (err) {
        cb(err, user)
      })
    })
  },
  createContext: function (ownerId, cb) {
    log.trace({}, 'createContext')
    if (typeof ownerId === 'function') {
      cb = ownerId
      ownerId = null
    }
    if (ownerId) {
      // create context
      require('./mocks/github/user-orgs')(ownerId, 'Runnable')
    }
    var self = this
    async.waterfall([
      function findUser (cb) {
        if (!ownerId) {
          return cb(null, null)
        }
        self.findUser(ownerId, cb)
      },
      function createUser (user, cb) {
        if (user) {
          return cb(null, user)
        }
        let opts = { orgs: [{ githubId: ownerId, name: 'Runnable', allowed: true }] }
        self.createUser(opts, cb)
      },
      function createContext (user, cb) {
        var body = { name: randStr(5) }
        if (ownerId) { body.owner = { github: ownerId } }
        var stub
        if (!PermissionService.isOwnerOf.isSinonProxy) {
          // Duck it, we never need to restore this stub anyways right?
          stub = sinon.stub(PermissionService, 'isOwnerOf').returns(Promise.resolve())
        }
        var context = user.createContext(body, function (err) {
          if (stub) {
            stub.restore()
          }
          cb(err, context, user)
        })
      }
    ], cb)
  },
  createSourceContext: function (cb) {
    log.trace({}, 'createSourceContext')
    this.createModerator(function (err, moderator) {
      if (err) { return cb(err) }
      var body = {
        name: randStr(5),
        isSource: true
      }
      var stub
      if (!PermissionService.isOwnerOf.isSinonProxy) {
        // Duck it, we never need to restore this stub anyways right?
        stub = sinon.stub(PermissionService, 'isOwnerOf').returns(Promise.resolve())
      }
      var context = moderator.createContext(body, function (err) {
        if (stub) {
          stub.restore()
        }
        if (err) { return cb(err) }
        cb(err, context, moderator)
      })
    })
  },
  createSourceContextVersion: function (cb) {
    log.trace({}, 'createSourceContextVersion')
    var stub
    if (!PermissionService.isOwnerOf.isSinonProxy) {
      // Duck it, we never need to restore this stub anyways right?
      stub = sinon.stub(PermissionService, 'isOwnerOf').returns(Promise.resolve())
    }
    function realCb () {
      if (stub) {
        stub.restore()
      }
      cb.apply(null, arguments)
    }
    this.createSourceContext(function (err, context, moderator) {
      if (err) { return realCb(err) }
      require('./mocks/s3/put-object')(context.id(), '/')
      var version = context.createVersion(function (err) {
        if (err) { return realCb(err) }
        require('./mocks/s3/get-object')(context.id(), '/')
        require('./mocks/s3/get-object')(context.id(), '/Dockerfile')
        require('./mocks/s3/put-object')(context.id(), '/Dockerfile')
        version.rootDir.contents.create({
          name: 'Dockerfile',
          body: 'FROM dockerfile/nodejs\nCMD tail -f /var/log/dpkg.log\n'
        }, function (err) {
          if (stub) {
            stub.restore()
          }
          realCb(err, version, context, moderator)
        })
      })
    })
  },
  createBuild: function (ownerId, cb) {
    log.trace({}, 'createBuild')
    if (typeof ownerId === 'function') {
      cb = ownerId
      ownerId = null
    }
    if (ownerId) {
      // create build
      require('./mocks/github/user-orgs')(ownerId, 'Runnable')
    }
    var self = this
    var stub
    if (!PermissionService.isOwnerOf.isSinonProxy) {
      // Duck it, we never need to restore this stub anyways right?
      stub = sinon.stub(PermissionService, 'isOwnerOf').returns(Promise.resolve())
    }
    function realCb () {
      if (stub) {
        stub.restore()
      }
      cb.apply(null, arguments)
    }
    this.createSourceContextVersion(function (err, srcContextVersion, srcContext, moderator) {
      if (err) { return realCb(err) }
      self.createContext(ownerId, function (err, context, user) {
        if (err) { return realCb(err) }
        var body = { name: randStr(5) }
        body.owner = {
          github: ownerId || user.json().accounts.github.id
        }
        if (!PermissionService.checkOwnerAllowed.isSinonProxy) {
          // Duck it, we never need to restore this stub anyways right?
          sinon.stub(PermissionService, 'checkOwnerAllowed').returns(Promise.resolve())
        }
        var build = user.createBuild(body, function (err) {
          realCb(err, build, context, user, [srcContextVersion, srcContext, moderator])
        })
      })
    })
  },
  createContextVersion: function (ownerId, cb) {
    log.trace({}, 'createContextVersion')
    if (typeof ownerId === 'function') {
      cb = ownerId
      ownerId = null
    } else {
      /**
       * Mock successive github API requests that will occur
       * internally as a result of the following API requests
       */
      // post copy version from source
      require('./mocks/github/user-orgs')(ownerId, 'Runnable')
      // post create app code version
      require('./mocks/github/user-orgs')(ownerId, 'Runnable')
      // // fetch build
      require('./mocks/github/user-orgs')(ownerId, 'Runnable')
      // fetch context-version
      require('./mocks/github/user-orgs')(ownerId, 'Runnable')
    }
    var stub
    if (!PermissionService.isOwnerOf.isSinonProxy) {
      // Duck it, we never need to restore this stub anyways right?
      stub = sinon.stub(PermissionService, 'isOwnerOf').returns(Promise.resolve())
    }
    function realCb () {
      if (stub) {
        stub.restore()
      }
      cb.apply(null, arguments)
    }
    this.createBuild(ownerId, function (err, build, context, user, others) {
      if (err) { return realCb(err) }
      var srcContextVersion = others[0]
      var srcContext = others[1]
      var moderator = others[2]
      require('./mocks/s3/put-object')(context.id(), '/')
      var opts = {}
      opts.qs = {
        toBuild: build.id()
      }
      var contextVersion = context.createVersion(opts, function (err) {
        if (err) { return realCb(err) }
        require('./mocks/s3/get-object')(srcContext.id(), '/')
        require('./mocks/s3/get-object')(srcContext.id(), '/Dockerfile')
        require('./mocks/s3/put-object')(context.id(), '/')
        require('./mocks/s3/put-object')(context.id(), '/Dockerfile')
        contextVersion.copyFilesFromSource(srcContextVersion.json().infraCodeVersion, function (err) {
          if (err) { return realCb(err) }
          generateKey(function (err) {
            if (err) { return cb(err) }
            var ghUser = user.json().accounts.github.username
            var ghRepo = 'flaming-octo-nemesis'
            var repo = ghUser + '/' + ghRepo
            require('./mocks/github/repos-username-repo')(user, ghRepo)
            require('./mocks/github/repos-hooks-get')(ghUser, ghRepo)
            require('./mocks/github/repos-hooks-post')(ghUser, ghRepo)
            require('./mocks/github/repos-keys-get')(ghUser, ghRepo)
            require('./mocks/github/repos-keys-post')(ghUser, ghRepo)
            require('./mocks/s3/put-object')('/runnable.deploykeys.test/' + ghUser + '/' + ghRepo + '.key.pub')
            require('./mocks/s3/put-object')('/runnable.deploykeys.test/' + ghUser + '/' + ghRepo + '.key')
            var repoData = {
              repo: repo,
              branch: 'master',
              commit: '065470f6949b0b6f0f0f78f4ee2b0e7a3dc715ac'
            }
            contextVersion.addGithubRepo(repoData, function (err) {
              if (err) { return realCb(err) }
              build.fetch(function (err) {
                if (err) { return realCb(err) }
                contextVersion.fetch(function (err) {
                  realCb(err, contextVersion, context, build, user,
                    [srcContextVersion, srcContext, moderator])
                })
              })
            })
          })
        })
      })
    })
  },
  createBuiltBuild: function (ownerId, cb) {
    log.trace({}, 'createBuiltBuild')
    require('nock').cleanAll()
    if (typeof ownerId === 'function') {
      cb = ownerId
      ownerId = null
    } else {
      require('./mocks/github/user-orgs')(ownerId, 'Runnable')
    }
    var self = this
    log.trace({}, 'this.createContextVersion', ownerId)
    var stub
    if (!PermissionService.isOwnerOf.isSinonProxy) {
      // Duck it, we never need to restore this stub anyways right?
      stub = sinon.stub(PermissionService, 'isOwnerOf').returns(Promise.resolve())
    }
    function realCb () {
      if (stub) {
        stub.restore()
      }
      cb.apply(null, arguments)
    }
    this.createContextVersion(ownerId, function (err, contextVersion, context, build, user, srcArray) {
      if (err) { return realCb(err) }
      log.trace({}, 'self.buildTheBuild', user.id(), build.id(), ownerId)
      self.buildTheBuild(user, build, ownerId, function (err) {
        if (err) { return realCb(err) }
        require('./mocks/github/user')(user)
        require('./mocks/github/user-orgs')(ownerId, 'Runnable')
        log.trace({}, 'contextVersion.fetch', contextVersion.id())
        contextVersion.fetch(function (err) {
          delete contextVersion.build.log
          realCb(err, build, user,
            [contextVersion, context, build, user],
            srcArray)
        })
      })
    })
  },
  /**
   * Creates instance that has completed deploying via background worker
   * process.
   * @param {Function} cb
   */
  createAndTailInstance: function (buildOwnerId, buildOwnerName, createBody, cb) {
    log.trace({}, 'createAndTailInstance', buildOwnerId, buildOwnerName, createBody, typeof cb)
    if (isFunction(buildOwnerId)) {
      cb = buildOwnerId
      buildOwnerId = null
      log.trace({}, 'createAndTailInstance args1', buildOwnerId, buildOwnerName, createBody, typeof cb)
    } else if (isObject(buildOwnerId)) {
      cb = buildOwnerName
      createBody = buildOwnerId
      buildOwnerName = null
      buildOwnerId = null
      log.trace({}, 'createAndTailInstance args2', buildOwnerId, buildOwnerName, createBody, typeof cb)
    }
    if (isFunction(buildOwnerName)) {
      cb = buildOwnerName
      buildOwnerName = null
      log.trace({}, 'createAndTailInstance args3', buildOwnerId, buildOwnerName, createBody, typeof cb)
    } else if (isObject(buildOwnerName)) {
      cb = createBody
      createBody = buildOwnerName
      buildOwnerName = null
      log.trace({}, 'createAndTailInstance args4', buildOwnerId, buildOwnerName, createBody, typeof cb)
    }
    if (isFunction(createBody)) {
      cb = createBody
      createBody = null
    }
    log.trace({}, 'createAndTailInstance args', buildOwnerId, buildOwnerName, createBody, typeof cb)
    var ctx = {}
    var stub
    if (!PermissionService.isOwnerOf.isSinonProxy) {
      // Duck it, we never need to restore this stub anyways right?
      stub = sinon.stub(PermissionService, 'isOwnerOf').returns(Promise.resolve())
    }
    function realCb () {
      if (stub) {
        stub.restore()
      }
      cb.apply(null, arguments)
    }
    this.createBuiltBuild(buildOwnerId, function (err, build, user, modelsArr, srcArr) {
      if (err) { return realCb(err) }
      ctx.build = build
      ctx.user = user
      ctx.modelsArr = modelsArr
      ctx.srcArr = srcArr
      var body = defaults(createBody, {
        name: uuid(),
        build: build.id(),
        masterPod: true
      })
      if (buildOwnerId) {
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
        // redeploy
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
      } else {
        require('./mocks/github/user')(user)
        require('./mocks/github/user')(user)
      }
      require('./mocks/github/user')(user)
      ctx.instance = user.createInstance(body, function (err) {
        if (err) { return realCb(err) }
        log.trace({}, 'createAndTailInstance', 'done')
        ctx.instance.fetch(function (err) {
          if (err) { return realCb(err) }
          realCb(null, ctx.instance, ctx.build, ctx.user, ctx.modelsArr, ctx.srcArr)
        })
      })
    })
  },
  createInstance: function (buildOwnerId, buildOwnerName, cb) {
    log.trace({}, 'createInstance')
    if (typeof buildOwnerId === 'function') {
      cb = buildOwnerId
      buildOwnerId = null
    }
    if (typeof buildOwnerName === 'function') {
      cb = buildOwnerName
      buildOwnerName = 'Runnable'
    }
    var stub
    if (!PermissionService.isOwnerOf.isSinonProxy) {
      // Duck it, we never need to restore this stub anyways right?
      stub = sinon.stub(PermissionService, 'isOwnerOf').returns(Promise.resolve())
    }
    function realCb () {
      if (stub) {
        stub.restore()
      }
      cb.apply(null, arguments)
    }
    this.createBuiltBuild(buildOwnerId, function (err, build, user, modelsArr, srcArr) {
      if (err) { return realCb(err) }
      var body = {
        name: randStr(5),
        build: build.id(),
        masterPod: true
      }
      if (buildOwnerId) {
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
        // redeploy
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
        require('./mocks/github/user-orgs')(buildOwnerId, buildOwnerName)
      } else {
        require('./mocks/github/user')(user)
        require('./mocks/github/user')(user)
      }
      require('./mocks/github/user')(user)
      var instance = user.createInstance(body, function (err) {
        if (err) { return realCb(err) }
        // hold until instance worker completes
        realCb(err, instance, build, user, modelsArr, srcArr)
      /*
      module.exports.tailInstance(user, instance, function (err, instance) {
        console.log('tail instancep', arguments)
      })
      */
      })
    })
  },

  createContainer: function (cb) {
    log.trace({}, 'createContainer')
    var _this = this
    var stub
    if (!PermissionService.isOwnerOf.isSinonProxy) {
      // Duck it, we never need to restore this stub anyways right?
      stub = sinon.stub(PermissionService, 'isOwnerOf').returns(Promise.resolve())
    }
    function realCb () {
      if (stub) {
        stub.restore()
      }
      cb.apply(null, arguments)
    }
    this.createAndTailInstance(function (err, instance, build, user, modelsArray, srcArr) {
      if (err) { return realCb(err) }
      _this.tailInstance(user, instance, function (err) {
        if (err) { return realCb(err) }
        var container = instance.newContainer(instance.json().containers[0])
        realCb(err, container, instance, build, user, modelsArray, srcArr)
      })
    })
  },

  buildTheBuild: function (user, build, ownerId, cb) {
    log.trace({}, 'buildTheBuild')
    require('nock').cleanAll()
    var dispatch = new EventEmitter()
    if (typeof ownerId === 'function') {
      cb = ownerId
      ownerId = null
    } else {
      // build fetch
      require('./mocks/github/user-orgs')(ownerId, 'Runnable')
      // version fetch
      require('./mocks/github/user-orgs')(ownerId, 'Runnable')
      // build build
      require('./mocks/github/user-orgs')(ownerId, 'Runnable')
      // version fetch
      require('./mocks/github/user-orgs')(ownerId, 'Runnable')
      // build fetch
      require('./mocks/github/user-orgs')(ownerId, 'Runnable')
    }
    log.trace({}, 'build.fetch', build.id())
    var stub
    if (!PermissionService.isOwnerOf.isSinonProxy) {
      // Duck it, we never need to restore this stub anyways right?
      stub = sinon.stub(PermissionService, 'isOwnerOf').returns(Promise.resolve())
    }
    function realCb () {
      if (stub) {
        stub.restore()
      }
      cb.apply(null, arguments)
    }
    build.fetch(function (err) {
      if (err) { return realCb(err) }
      log.trace({}, 'build.contextVersions.models[0].fetch')
      build.contextVersions.models[0].fetch(function (err, cv) {
        if (err) { return realCb(err) }
        require('./mocks/github/repos-username-repo-branches-branch')(cv)
        log.trace({}, 'build.build', build.id())
        require('./mocks/github/user')(user)
        build.build({ message: uuid() }, function (err) {
          dispatch.emit('started', err)
          if (err) { return realCb(err) }
          cv = build.contextVersions.models[0] // cv may have been deduped
          log.trace({}, 'cv.fetch', cv.id())
          cv.fetch(function (err) {
            if (err) { return realCb(err) }
            cv = cv.toJSON()
            if (cv.build.completed) { return realCb() }
            require('./mocks/github/user')(user)
            var count = createCount(2, realCb)
            build.contextVersions.models[0].fetch(count.next)
            require('./mocks/github/user')(user)
            build.fetch(count.next)
          })
        })
      })
    })
    return dispatch
  },

  createContextPath: function (user, contextId) {
    log.trace({}, 'createContextPath')
    return user
      .newContext(contextId)
  },

  createContextVersionPath: function (user, contextId, contextVersionId) {
    log.trace({}, 'createContextVersionPath')
    return user
      .newContext(contextId)
      .newVersion(contextVersionId)
  },

  createContainerPath: function (user, instanceId, containerId) {
    log.trace({}, 'createContainerPath')
    return user
      .newInstance(instanceId)
      .newContainer(containerId)
  }
}
