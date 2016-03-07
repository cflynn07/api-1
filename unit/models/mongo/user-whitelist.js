/**
 * @module unit/models/mongo/schemas/userwhitelist
 */
'use strict'

var Code = require('code')
var Lab = require('lab')
var path = require('path')

var lab = exports.lab = Lab.script()

var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var expect = Code.expect
var sinon = require('sinon')

var Github = require('models/apis/github')
var UserWhitelist = require('models/mongo/user-whitelist')

var moduleName = path.relative(process.cwd(), __filename)
describe('UserWhitelist: ' + moduleName, function () {
  var accessToken = '123'

  before(require('../../fixtures/mongo').connect)
  afterEach(require('../../../test/functional/fixtures/clean-mongo').removeEverything)

  beforeEach(function (done) {
    var orgs = [
      {
        login: 'Runnable',
        id: 2828361,
        url: 'https://api.github.com/orgs/github',
        avatar_url: 'https://github.com/images/error/octocat_happy.gif'
      }, {
        login: 'NotRunnable',
        id: 2828362
      }
    ]
    var whitelistedUsers = [
      {
        name: 'Runnable',
        lowerName: 'runnable',
        allowed: true
      }
    ]
    sinon.stub(Github.prototype, 'getUserAuthorizedOrgs').yieldsAsync(null, orgs)
    sinon.stub(UserWhitelist, 'find').yieldsAsync(null, whitelistedUsers)
    done()
  })
  afterEach(function (done) {
    UserWhitelist.find.restore()
    Github.prototype.getUserAuthorizedOrgs.restore()
    done()
  })

  describe('getUserWhitelistedOrgs', function () {
    it('should get all orgs that GH authorizes the user to see', function (done) {
      UserWhitelist.getUserWhitelistedOrgs(accessToken, function (err, orgs) {
        if (err) done(err)
        sinon.assert.calledOnce(Github.prototype.getUserAuthorizedOrgs)
        sinon.assert.calledOnce(UserWhitelist.find)
        sinon.assert.calledWithExactly(
          UserWhitelist.find,
          {
            'lowerName': { $in: ['runnable', 'notrunnable'] }
          },
          sinon.match.func
        )
        expect(err).to.not.exist()
        expect(orgs).to.be.an.array()
        expect(orgs.length).to.equal(1)
        expect(orgs[0].name).to.equal('Runnable')
        done()
      })
    })

    it('should return an empty array if not orgs were found', function (done) {
      Github.prototype.getUserAuthorizedOrgs.yieldsAsync(null, [{
        login: 'NotRunnable'
      }])
      UserWhitelist.find.yieldsAsync(null, [])

      UserWhitelist.getUserWhitelistedOrgs(accessToken, function (err, orgs) {
        if (err) done(err)
        sinon.assert.calledOnce(Github.prototype.getUserAuthorizedOrgs)
        sinon.assert.calledOnce(UserWhitelist.find)
        sinon.assert.calledWithExactly(
          UserWhitelist.find,
          {
            'lowerName': { $in: ['notrunnable'] }
          },
          sinon.match.func
        )
        expect(err).to.not.exist()
        expect(orgs).to.be.an.array()
        expect(orgs.length).to.equal(0)
        done()
      })
    })

    it('should throw an error if it cant get the authorized orgs from GH', function (done) {
      Github.prototype.getUserAuthorizedOrgs.yieldsAsync(new Error(), null)
      UserWhitelist.getUserWhitelistedOrgs(accessToken, function (err, orgs) {
        expect(err).to.exist()
        expect(orgs).to.not.exist()
        done()
      })
    })
  })
})
