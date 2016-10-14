'use strict'

var Code = require('code')
var Lab = require('lab')
var async = require('async')
var createCount = require('callback-count')
var noop = require('101/noop')

var Instance = require('models/mongo/instance')
var api = require('../../fixtures/api-control')
var dock = require('../../fixtures/dock')
var expects = require('../../fixtures/expects')
var mockGetUserById = require('../../fixtures/mocks/github/getByUserId')
var multi = require('../../fixtures/multi-factory')
var primus = require('../../fixtures/primus')

var lab = exports.lab = Lab.script()

var after = lab.after
var afterEach = lab.afterEach
var before = lab.before
var beforeEach = lab.beforeEach
var describe = lab.describe
var expect = Code.expect
var it = lab.it
const whitelistOrgs = require('../../fixtures/mocks/big-poppa').whitelistOrgs
const whitelistUserOrgs = require('../../fixtures/mocks/big-poppa').whitelistUserOrgs
const sessionUser = require('../../fixtures/mocks/big-poppa').sessionUser

describe('GET /instances', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  afterEach(require('../../fixtures/clean-mongo').removeEverything)
  afterEach(require('../../fixtures/clean-ctx')(ctx))
  afterEach(require('../../fixtures/clean-nock'))
  var runnableOrg = {
    name: 'Runnable',
    githubId: 11111,
    allowed: true
  }
  var otherOrg = {
    name: 'Not Runnable',
    githubId: 12345,
    allowed: true
  }
  beforeEach(function (done) {
    whitelistOrgs([runnableOrg, otherOrg])
    done()
  })
  beforeEach(
    mockGetUserById.stubBefore(function () {
      var array = [{
        id: runnableOrg.githubId,
        username: runnableOrg.name
      }, {
        id: otherOrg.githubId,
        username: otherOrg.name
      }]
      if (ctx.user) {
        array.push({
          id: ctx.user.attrs.accounts.github.id,
          username: ctx.user.attrs.accounts.github.username
        })
      }
      if (ctx.user2) {
        array.push({
          id: ctx.user2.attrs.accounts.github.id,
          username: ctx.user2.attrs.accounts.github.username
        })
      }
      return array
    })
  )
  afterEach(mockGetUserById.stubAfter)
  describe('GET', function () {
    beforeEach(function (done) {
      multi.createAndTailInstance(primus, { name: 'InstanceNumber1' }, function (err, instance, build, user) {
        if (err) { return done(err) }
        ctx.instance = instance
        ctx.build = build // builtBuild
        ctx.user = user
        whitelistUserOrgs(ctx.user, [runnableOrg])
        multi.createAndTailInstance(primus, function (err, instance, build, user) {
          if (err) { return done(err) }
          ctx.instance2 = instance
          ctx.build2 = build
          ctx.user2 = user
          whitelistUserOrgs(ctx.user2, [runnableOrg])
          done()
        })
      })
    })
    it('should get instances by hashIds', function (done) {
      var count = createCount(2, done)
      require('../../fixtures/mocks/github/user')(ctx.user)
      require('../../fixtures/mocks/github/user')(ctx.user2)
      var query = {
        shortHash: ctx.instance.json().shortHash,
        owner: {
          github: ctx.user.attrs.accounts.github.id
        }
      }
      var expected = [{
        _id: ctx.instance.json()._id,
        shortHash: ctx.instance.json().shortHash,
        'containers[0].inspect.State.Running': true,
        'owner.github': ctx.user.json().accounts.github.id,
        'owner.username': ctx.user.json().accounts.github.login,
        'createdBy.username': ctx.user.json().accounts.github.login,
        'createdBy.gravatar': ctx.user.json().gravatar
      }]
      ctx.user.fetchInstances(query, expects.success(200, expected, function (err) {
        count.next(err)
      }))
      var query2 = {
        shortHash: ctx.instance2.json().shortHash,
        owner: {
          github: ctx.user2.attrs.accounts.github.id
        }
      }
      var expected2 = [{
        _id: ctx.instance2.json()._id,
        shortHash: ctx.instance2.json().shortHash,
        'containers[0].inspect.State.Running': true,
        'owner.github': ctx.user2.json().accounts.github.id,
        'owner.username': ctx.user2.json().accounts.github.login,
        'createdBy.username': ctx.user2.json().accounts.github.login,
        'createdBy.gravatar': ctx.user2.json().gravatar
      }]
      ctx.user2.fetchInstances(query2, expects.success(200, expected2, function (err) {
        count.next(err)
      }))
    })
    it('should get instances by id', function (done) {
      var count = createCount(2, done)
      require('../../fixtures/mocks/github/user')(ctx.user)
      require('../../fixtures/mocks/github/user')(ctx.user2)
      var query = {
        _id: ctx.instance.json()._id,
        owner: {
          github: ctx.user.attrs.accounts.github.id
        }
      }
      var expected = [{
        _id: ctx.instance.json()._id,
        shortHash: ctx.instance.json().shortHash,
        'containers[0].inspect.State.Running': true,
        'owner.github': ctx.user.json().accounts.github.id,
        'owner.username': ctx.user.json().accounts.github.login,
        'createdBy.username': ctx.user.json().accounts.github.login,
        'createdBy.gravatar': ctx.user.json().gravatar
      }]
      ctx.user.fetchInstances(query, expects.success(200, expected, count.next))
      var query2 = {
        shortHash: ctx.instance2.json().shortHash,
        owner: {
          github: ctx.user2.attrs.accounts.github.id
        }
      }
      var expected2 = [{
        _id: ctx.instance2.json()._id,
        shortHash: ctx.instance2.json().shortHash,
        'containers[0].inspect.State.Running': true,
        'owner.github': ctx.user2.json().accounts.github.id,
        'owner.username': ctx.user2.json().accounts.github.login,
        'createdBy.username': ctx.user2.json().accounts.github.login,
        'createdBy.gravatar': ctx.user2.json().gravatar
      }]
      ctx.user2.fetchInstances(query2, expects.success(200, expected2, count.next))
    })
    it('should get instances by username', function (done) {
      require('../../fixtures/mocks/github/user')(ctx.user)
      require('../../fixtures/mocks/github/users-username')(
        ctx.user.json().accounts.github.id,
        ctx.user.json().accounts.github.username)
      require('../../fixtures/mocks/github/user')(ctx.user2)
      require('../../fixtures/mocks/github/users-username')(
        ctx.user2.json().accounts.github.id,
        ctx.user2.json().accounts.github.username)
      async.series([
        function userOne (cb) {
          var query = {
            githubUsername: ctx.user.json().accounts.github.username
          }
          var expected = [
            {
              _id: ctx.instance.json()._id,
              shortHash: ctx.instance.json().shortHash,
              'containers[0].inspect.State.Running': true
            }
          ]
          ctx.user.fetchInstances(query, expects.success(200, expected, cb))
        },
        function userTwo (cb) {
          var query2 = {
            githubUsername: ctx.user2.json().accounts.github.username
          }
          var expected2 = [
            {
              _id: ctx.instance2.json()._id,
              shortHash: ctx.instance2.json().shortHash,
              'containers[0].inspect.State.Running': true
            }
          ]
          ctx.user2.fetchInstances(query2, expects.success(200, expected2, cb))
        }
      ], done)
    })
    it('should support instance filtering', function (done) {
      require('../../fixtures/mocks/github/user')(ctx.user)
      require('../../fixtures/mocks/github/users-username')(
        ctx.user.json().accounts.github.id,
        ctx.user.json().accounts.github.username)
      var query = {
        githubUsername: ctx.user.json().accounts.github.username,
        ignoredFields: [ 'containers', 'container' ]
      }
      ctx.user.fetchInstances(query, function (err, data) {
        if (err) { return done(err) }
        expect(data).to.have.length(1)
        expect(data[0].container).to.not.exist()
        expect(data[0].containers).to.not.exist()
        expect(data[0]._id).to.equal(ctx.instance.attrs._id)
        done()
      })
    })
    it('should get instances by ["contextVersion.appCodeVersions.repo"]', function (done) {
      require('../../fixtures/mocks/github/user')(ctx.user)
      var count = createCount(2, done)
      require('../../fixtures/mocks/github/user')(ctx.user)
      require('../../fixtures/mocks/github/user')(ctx.user2)
      var query = {
        'contextVersion.appCodeVersions.repo': ctx.instance.attrs.contextVersion.appCodeVersions[0].repo,
        owner: {
          github: ctx.user.attrs.accounts.github.id
        }
      }
      var expected = [
        {
          _id: ctx.instance.json()._id,
          shortHash: ctx.instance.json().shortHash,
          'containers[0].inspect.State.Running': true
        }
      ]
      require('../../fixtures/mocks/github/users-username')(
        ctx.user.json().accounts.github.id,
        ctx.user.attrs.accounts.github.username)
      ctx.user.fetchInstances(query, expects.success(200, expected, count.next))
      var query2 = {
        'contextVersion.appCodeVersions.repo': ctx.instance2.attrs.contextVersion.appCodeVersions[0].repo,
        owner: {
          github: ctx.user2.attrs.accounts.github.id
        }
      }
      var expected2 = [
        {
          _id: ctx.instance2.json()._id,
          shortHash: ctx.instance2.json().shortHash,
          'containers[0].inspect.State.Running': true
        }
      ]
      require('../../fixtures/mocks/github/users-username')(
        ctx.user2.json().accounts.github.id,
        ctx.user2.attrs.accounts.github.username)
      ctx.user2.fetchInstances(query2, expects.success(200, expected2, count.next))
    })
    it('should list instances by owner.github', function (done) {
      var count = createCount(2, done)
      require('../../fixtures/mocks/github/user')(ctx.user)
      require('../../fixtures/mocks/github/user')(ctx.user2)

      var query = {
        owner: {
          github: ctx.user.attrs.accounts.github.id
        }
      }
      var expected = [
        {}
      ]
      expected[0]['build._id'] = ctx.build.id()
      expected[0]['owner.username'] = ctx.user.json().accounts.github.username
      expected[0]['owner.github'] = ctx.user.json().accounts.github.id
      expected[0]['containers[0].inspect.State.Running'] = true
      // FIXME: chai is messing up with eql check:
      ctx.user.fetchInstances(query, expects.success(200, expected, count.next))

      var query2 = {
        owner: {
          github: ctx.user2.attrs.accounts.github.id
        }
      }
      var expected2 = [{}]
      expected2[0]['build._id'] = ctx.build2.id()
      expected2[0]['owner.username'] = ctx.user2.json().accounts.github.username
      expected2[0]['owner.github'] = ctx.user2.json().accounts.github.id
      expected[0]['containers[0].inspect.State.Running'] = true
      // FIXME: chai is messing up with eql check:
      ctx.user2.fetchInstances(query2, expects.success(200, expected2, count.next))
    })

    describe('masterPod', function () {
      it('should get instance by masterPod', function (done) {
        require('../../fixtures/mocks/github/user')(ctx.user)
        require('../../fixtures/mocks/github/users-username')(
          ctx.user.json().accounts.github.id, ctx.user.json().accounts.github.login)
        var query = {
          masterPod: true,
          'owner.github': ctx.user.attrs.accounts.github.id
        }
        ctx.user.fetchInstances(query, expects.success(200, function (err, body) {
          if (err) { return done(err) }
          expect(body.length).to.equal(1)
          expect(body[0].shortHash).to.equal(ctx.instance.attrs.shortHash)
          done()
        }))
      })

      it('should get instance by masterPod', function (done) {
        require('../../fixtures/mocks/github/user')(ctx.user)
        require('../../fixtures/mocks/github/users-username')(
          ctx.user.json().accounts.github.id, ctx.user.json().accounts.github.login)
        var hostname = [
          ctx.instance.attrs.name, '-staging-', ctx.user.attrs.accounts.github.username, '.',
          process.env.USER_CONTENT_DOMAIN
        ].join('')
        var query = {
          masterPod: true,
          hostname: hostname
        }
        ctx.user.fetchInstances(query, expects.success(200, function (err, body) {
          if (err) { return done(err) }
          expect(body.length).to.equal(1)
          expect(body[0].shortHash).to.equal(ctx.instance.attrs.shortHash)
          done()
        }))
      })
    })

    it('should get instance by hostname', function (done) {
      require('../../fixtures/mocks/github/user')(ctx.user)
      require('../../fixtures/mocks/github/users-username')(
        ctx.user.json().accounts.github.id, ctx.user.json().accounts.github.login)
      var hostname = [
        ctx.instance.attrs.name, '-staging-', ctx.user.attrs.accounts.github.username, '.',
        process.env.USER_CONTENT_DOMAIN
      ].join('')
      var query = {
        hostname: hostname
      }
      ctx.user.fetchInstances(query, expects.success(200, function (err, body) {
        if (err) { return done(err) }
        expect(body.length).to.equal(1)
        expect(body[0].shortHash).to.equal(ctx.instance.attrs.shortHash)
        done()
      }))
    })

    it('should return empty for unknown hostname', function (done) {
      require('../../fixtures/mocks/github/user')(ctx.user)
      require('../../fixtures/mocks/github/users-username')(
        ctx.user.json().accounts.github.id, ctx.user.json().accounts.github.login)
      var query = {
        hostname: 'http://dne-staging-codenow.runnableapp.com'
      }
      ctx.user.fetchInstances(query, expects.success(200, function (err, body) {
        if (err) { return done(err) }
        expect(body).to.be.an.array()
        expect(body.length).to.equal(0)
        done()
      }))
    })

    describe('by hostIp', function () {
      beforeEach(function (done) {
        var query = {
          _id: ctx.instance.attrs.id
        }
        var $set = {
          'network.hostIp': '10.20.987.09'
        }
        Instance.findOneAndUpdate(query, { $set: $set }, done)
      })
      it('should get instance by network.hostIp', function (done) {
        require('../../fixtures/mocks/github/user')(ctx.user)
        require('../../fixtures/mocks/github/users-username')(
          ctx.user.json().accounts.github.id, ctx.user.json().accounts.github.login)
        var query = {
          'network.hostIp': '10.20.987.09',
          'owner.github': ctx.user.attrs.accounts.github.id
        }
        ctx.user.fetchInstances(query, expects.success(200, function (err, body) {
          if (err) { return done(err) }
          expect(body.length).to.equal(1)
          expect(body[0].shortHash).to.equal(ctx.instance.attrs.shortHash)
          expect(body[0].network.hostIp).to.equal('10.20.987.09')
          done()
        }))
      })
    })

    it('should get instances by contextVersion.context', function (done) {
      require('../../fixtures/mocks/github/user')(ctx.user)
      require('../../fixtures/mocks/github/users-username')(
        ctx.user.json().accounts.github.id, ctx.user.json().accounts.github.login)
      var query = {
        masterPod: true,
        'contextVersion.context': ctx.instance.attrs.contextVersion.context,
        githubUsername: ctx.user.json().accounts.github.username
      }
      ctx.user.fetchInstances(query, expects.success(200, function (err, body) {
        if (err) { return done(err) }
        expect(body.length).to.equal(1)
        expect(body[0].shortHash).to.equal(ctx.instance.attrs.shortHash)
        done()
      }))
    })

    describe('name and owner', function () {
      beforeEach(function (done) {
        require('../../fixtures/mocks/github/user')(ctx.user)
        require('../../fixtures/mocks/github/user')(ctx.user)
        require('../../fixtures/mocks/github/user')(ctx.user)
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, function (err) {
          if (err) { return done(err) }
          require('../../fixtures/mocks/github/user')(ctx.user)
          require('../../fixtures/mocks/github/user')(ctx.user)
          ctx.instance3 = ctx.user.createInstance({
            name: 'InstanceNumber3',
            build: ctx.instance.attrs.build._id
          }, noop)
          primus.expectAction('start', {}, done)
        })
      })
      it('should list instances by owner.github and name', function (done) {
        require('../../fixtures/mocks/github/user')(ctx.user)
        require('../../fixtures/mocks/github/user')(ctx.user2)
        var query = {
          owner: {
            github: ctx.user.attrs.accounts.github.id
          },
          name: 'InstanceNumber3'
        }
        var expected = [
          {}
        ]
        expected[0]['build._id'] = ctx.build.id() // instance3's build
        expected[0].name = 'InstanceNumber3'
        expected[0]['owner.username'] = ctx.user.json().accounts.github.username
        expected[0]['owner.github'] = ctx.user.json().accounts.github.id
        expected[0]['containers[0].inspect.State.Running'] = true
        // FIXME: chai is messing up with eql check:
        ctx.user.fetchInstances(query, expects.success(200, expected, done))
      })
      it('should list instances by githubUsername and name', function (done) {
        require('../../fixtures/mocks/github/user')(ctx.user)

        var query = {
          githubUsername: ctx.user.json().accounts.github.username,
          name: 'InstanceNumber3'
        }
        var expected = [
          {}
        ]
        expected[0]['build._id'] = ctx.build.id() // instance3's build
        expected[0].name = 'InstanceNumber3'
        expected[0]['owner.username'] = ctx.user.json().accounts.github.username
        expected[0]['owner.github'] = ctx.user.json().accounts.github.id
        expected[0]['containers[0].inspect.State.Running'] = true
        // FIXME: chai is messing up with eql check:
        require('../../fixtures/mocks/github/users-username')(ctx.user.attrs.accounts.github.id,
          ctx.user.json().accounts.github.username)
        ctx.user.fetchInstances(query, expects.success(200, expected, done))
      })
    })

    describe('exceptions', function () {
      it('should list projects belonging to HelloRunnable for any request from any user', function (done) {
        var query = {
          owner: {
            github: process.env.HELLO_RUNNABLE_GITHUB_ID
          }
        }
        var expected = []
        whitelistUserOrgs(ctx.user, [])
        ctx.user.fetchInstances(query, expects.success(200, expected, done))
      })
    })

    describe('errors', function () {
      it('should error invalid hostname if the hostname is not on the user content domain', function (done) {
        var query = {
          hostname: 'http://google.com'
        }
        require('../../fixtures/mocks/github/user-orgs')()
        whitelistUserOrgs(ctx.user, [])
        ctx.user.fetchInstances(query, expects.error(400, /invalid.*hostname/i, function (err, expectedErr) {
          if (err) { return done(err) }
          expect(expectedErr.data.errorCode).to.equal('INVALID_HOSTNAME') // used by api-client
          done()
        }))
      })
      it('should not list projects for owner.github the user does not have permission for', function (done) {
        var query = {
          owner: {
            github: ctx.user2.attrs.accounts.github.id
          }
        }
        whitelistUserOrgs(ctx.user, [])
        whitelistUserOrgs(ctx.user2, [])
        require('../../fixtures/mocks/github/user-orgs')()
        ctx.user.fetchInstances(query, expects.error(403, /denied/, function (err) {
          if (err) { return done(err) }
          var query2 = {
            owner: {
              github: ctx.user.attrs.accounts.github.id
            }
          }
          require('../../fixtures/mocks/github/user-orgs')()
          ctx.user2.fetchInstances(query2, expects.error(403, /denied/, done))
        }))
      })
      it('should error when the username is not found', function (done) {
        var query = {
          githubUsername: ctx.user.json().accounts.github.username
        }
        // Make username fetch 404
        require('../../fixtures/mocks/github/users-username')(null, null, { fail: true })
        ctx.user.fetchInstances(query, expects.error(404, /Not found/, done))
      })
      it('should require owner.github', function (done) {
        var query = {}
        ctx.user.fetchInstances(query, expects.error(400, /owner[.]github/, done))
      })
      it('should require owner (with name)', function (done) {
        var query = { name: 'hello' }
        ctx.user.fetchInstances(query, expects.error(400, /owner/, done))
      })
      it('should require owner (with shorthash)', function (done) {
        var query = { shortHash: 'hello' }
        ctx.user.fetchInstances(query, expects.error(400, /owner/, done))
      })
    })
  })

  describe('Org Get', function () {
    beforeEach(function (done) {
      ctx.orgId = otherOrg.githubId
      ctx.orgName = otherOrg.name
      multi.createAndTailInstance(primus, ctx.orgId, ctx.orgName, function (err, instance, build, user) {
        ctx.user = user
        whitelistUserOrgs(user, [otherOrg])
        ctx.instance = instance
        done(err)
      })
    })
    describe('name and owner', function () {
      it('should list instances by githubUsername and name', function (done) {
        sessionUser([otherOrg])
        .then(function () {
          var query = {
            githubUsername: ctx.orgName,
            name: ctx.instance.attrs.name
          }
          var expected = [
            {}
          ]
          expected[0].name = ctx.instance.attrs.name
          // expected[0]['owner.username'] = ctx.orgName
          expected[0]['owner.github'] = ctx.orgId
          require('../../fixtures/mocks/github/users-username')(ctx.orgId, ctx.orgName)
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, ctx.orgName)
          require('../../fixtures/mocks/github/user-orgs')(ctx.orgId, ctx.orgName)
          ctx.user.fetchInstances(query, expects.success(200, expected, done))
        })
      })
    })
  })
})
