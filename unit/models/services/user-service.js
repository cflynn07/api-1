'use strict'
require('loadenv')()

const errors = require('errors')
var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach

var expect = require('code').expect
var keypather = require('keypather')()
var sinon = require('sinon')
require('sinon-as-promised')(require('bluebird'))

const UserService = require('models/services/user-service')
const User = require('models/mongo/user')
const rabbitMQ = require('models/rabbitmq')

var BigPoppaClient = require('@runnable/big-poppa-client')
var Github = require('models/apis/github')

describe('User Service', function () {
  describe('getUser', function () {
    var model = { id: '2' }
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(BigPoppaClient.prototype, 'getUsers').resolves([model])
        done()
      })

      afterEach(function (done) {
        BigPoppaClient.prototype.getUsers.restore()
        done()
      })

      it('should resolve an owner', function (done) {
        UserService.getUser({ github: model })
          .tap(function (checkedModel) {
            expect(checkedModel).to.equal(model)
            sinon.assert.calledOnce(BigPoppaClient.prototype.getUsers)
            sinon.assert.calledWith(BigPoppaClient.prototype.getUsers, {
              githubId: '2'
            })
          })
          .asCallback(done)
      })
    })
    describe('fail', function () {
      beforeEach(function (done) {
        sinon.stub(BigPoppaClient.prototype, 'getUsers').resolves([])
        done()
      })

      afterEach(function (done) {
        BigPoppaClient.prototype.getUsers.restore()
        done()
      })
      it('should reject if getUsers returns null', function (done) {
        UserService.getUser({ github: model })
          .asCallback(function (err) {
            expect(err.message).to.equal('User not found')
            done()
          })
      })
    })
  })

  describe('createOrUpdateUser', function () {
    var githubId = 23123
    var accessToken = 'asdasdasdasdasdasd'
    describe('success', function () {
      beforeEach(function (done) {
        sinon.stub(rabbitMQ, 'publishUserAuthorized').returns()
        done()
      })

      afterEach(function (done) {
        rabbitMQ.publishUserAuthorized.restore()
        done()
      })

      it('should publish a job with `githubId` and `accessToken`', function (done) {
        UserService.createOrUpdateUser(githubId, accessToken)
        sinon.assert.calledOnce(rabbitMQ.publishUserAuthorized)
        sinon.assert.calledWith(rabbitMQ.publishUserAuthorized, {
          accessToken: accessToken,
          githubId: githubId
        })
        done()
      })
    })
  })

  describe('isUserPartOfOrgByGithubId', function () {
    var orgGithubId = '232323'
    var user = {}
    var userGithubId = '1111'
    keypather.set(user, 'accounts.github.id', userGithubId)
    var bigPoppaUser
    var bigPoppaOrg = {
      githubId: orgGithubId
    }
    describe('success', function () {
      beforeEach(function (done) {
        bigPoppaUser = {
          organizations: []
        }
        done()
      })

      it('should resolve when the user has no orgs', function (done) {
        var orgExists = UserService.isUserPartOfOrgByGithubId(bigPoppaUser, orgGithubId)
        expect(orgExists).to.be.false()
        done()
      })

      it('should resolve when the user has the org', function (done) {
        bigPoppaUser.organizations.push(bigPoppaOrg)
        var orgExists = UserService.isUserPartOfOrgByGithubId(bigPoppaUser, orgGithubId)
        expect(orgExists).to.be.true()
        done()
      })
    })
  })

  describe('isUserPartOfOrg', function () {
    var orgId = 232323
    var user = {}
    var userGithubId = '1111'
    keypather.set(user, 'accounts.github.id', userGithubId)
    var bigPoppaUser
    var bigPoppaOrg = {
      id: orgId
    }
    describe('success', function () {
      beforeEach(function (done) {
        bigPoppaUser = {
          organizations: []
        }
        done()
      })

      it('should resolve when the user has no orgs', function (done) {
        var orgExists = UserService.isUserPartOfOrg(bigPoppaUser, orgId)
        expect(orgExists).to.be.false()
        done()
      })

      it('should resolve when the user has the org', function (done) {
        bigPoppaUser.organizations.push(bigPoppaOrg)
        var orgExists = UserService.isUserPartOfOrg(bigPoppaUser, orgId)
        expect(orgExists).to.be.true()
        done()
      })
    })
  })

  describe('validateSessionUserPartOfOrg', function () {
    var orgId = 232323
    var user = {}
    var userGithubId = '1111'
    keypather.set(user, 'accounts.github.id', userGithubId)
    var bigPoppaUser
    var bigPoppaOrg = {
      id: orgId
    }
    beforeEach(function (done) {
      sinon.stub(UserService, 'getUser').resolves(bigPoppaUser)
      done()
    })

    afterEach(function (done) {
      UserService.getUser.restore()
      done()
    })

    describe('success', function () {
      beforeEach(function (done) {
        bigPoppaUser = {
          organizations: []
        }
        done()
      })

      it('should throw a UserNotFoundError when the user doesnt have the org', function (done) {
        UserService.validateSessionUserPartOfOrg(user, orgId)
          .catch(errors.UserNotAllowedError, function (err) {
            expect(err).to.exist()
            done()
          })
      })

      it('should resolve when the user has the org', function (done) {
        bigPoppaUser.organizations.push(bigPoppaOrg)
        UserService.getUser.resolves(bigPoppaUser)
        UserService.validateSessionUserPartOfOrg(user, orgId)
          .then(function (user) {
            expect(user).to.exist()
            done()
          })
      })
    })
  })

  describe('getUsersOrganizationsWithGithubModel', function () {
    const orgGithubId = '232323'
    const orgGithubName = 'bigPoppa'
    const userGithubId = '191198'
    const userGithubName = 'thejsj'
    const user = {}
    keypather.set(user, 'accounts.github.id', userGithubId)
    let bigPoppaUser
    let bigPoppaOrg
    let persoanlAccountBigPoppaOrg
    let githubOrg
    let githubUser

    beforeEach(function (done) {
      bigPoppaUser = {
        organizations: []
      }
      bigPoppaOrg = {
        githubId: orgGithubId
      }
      persoanlAccountBigPoppaOrg = {
        githubId: userGithubId
      }
      githubOrg = {
        id: orgGithubId,
        login: orgGithubName
      }
      githubUser = {
        id: userGithubId,
        login: userGithubName
      }
      sinon.stub(Github.prototype, 'getUserAuthorizedOrgsAsync').resolves([ githubOrg ])
      sinon.stub(Github.prototype, 'getAuthorizedUserAsync').resolves(githubUser)
      sinon.stub(UserService, 'getUser').resolves(bigPoppaUser)
      done()
    })

    afterEach(function (done) {
      UserService.getUser.restore()
      Github.prototype.getUserAuthorizedOrgsAsync.restore()
      Github.prototype.getAuthorizedUserAsync.restore()
      done()
    })

    describe('Success', function () {
      it('should resolve when the user has no orgs', function (done) {
        Github.prototype.getUserAuthorizedOrgsAsync.resolves([])
        UserService.getUsersOrganizationsWithGithubModel(user)
          .then(function (orgs) {
            expect(orgs).to.be.have.length(0)
            sinon.assert.calledOnce(UserService.getUser)
          })
          .asCallback(done)
      })

      it('should fetch the user orgs and user personal account', function (done) {
        bigPoppaUser.organizations.push(bigPoppaOrg)
        UserService.getUsersOrganizationsWithGithubModel(user)
          .then(function (orgs) {
            sinon.assert.calledOnce(Github.prototype.getUserAuthorizedOrgsAsync)
            sinon.assert.calledOnce(Github.prototype.getAuthorizedUserAsync)
          })
          .asCallback(done)
      })

      it('should resolve when the user has the org', function (done) {
        bigPoppaUser.organizations.push(bigPoppaOrg)
        UserService.getUsersOrganizationsWithGithubModel(user)
          .then(function (orgs) {
            expect(orgs).to.be.have.length(1)
            expect(orgs[0]).to.equal(bigPoppaOrg)
            sinon.assert.calledOnce(UserService.getUser)
          })
          .asCallback(done)
      })

      it('should resolve when there is a persoanl account', function (done) {
        bigPoppaUser.organizations = bigPoppaUser.organizations.concat([ bigPoppaOrg, persoanlAccountBigPoppaOrg ])
        UserService.getUsersOrganizationsWithGithubModel(user)
          .then(function (orgs) {
            expect(orgs).to.be.have.length(2)
            expect(orgs[0]).to.equal(bigPoppaOrg)
            expect(orgs[1]).to.equal(persoanlAccountBigPoppaOrg)
          })
          .asCallback(done)
      })

      it('should resolve when the user has more github orgs than bigPoppaOrgs', function (done) {
        const fakeOrg = {
          id: 1,
          login: 'fakeOrg'
        }
        bigPoppaUser.organizations.push(bigPoppaOrg)
        Github.prototype.getUserAuthorizedOrgsAsync.resolves([ githubOrg, fakeOrg ])
        UserService.getUsersOrganizationsWithGithubModel(user)
          .then(function (orgs) {
            expect(orgs).to.be.have.length(1)
            expect(orgs[0]).to.equal(bigPoppaOrg)
            sinon.assert.calledOnce(UserService.getUser)
          })
          .asCallback(done)
      })
    })

    describe('Faillure', function () {
      const error = new Error('This is an error')
      it('should reject if `getUserAuthorizedOrgsAsync` fails', function (done) {
        Github.prototype.getUserAuthorizedOrgsAsync.rejects(error)

        bigPoppaUser.organizations.push(bigPoppaOrg)
        UserService.getUsersOrganizationsWithGithubModel(user)
          .asCallback(function (err) {
            expect(err).to.equal(error)
            done()
          })
      })

      it('should reject if `getAuthorizedUserAsync` fails', function (done) {
        Github.prototype.getAuthorizedUserAsync.rejects(error)

        bigPoppaUser.organizations.push(bigPoppaOrg)
        UserService.getUsersOrganizationsWithGithubModel(user)
          .asCallback(function (err) {
            expect(err).to.equal(error)
            done()
          })
      })
    })
  })

  describe('getCompleteUserById', function () {
    var findByIdStub
    var getByGithubIdStub
    var user
    const githubId = 1981198
    const userId = 546
    var bigPoppaUser
    beforeEach(function (done) {
      user = {
        accounts: {
          github: {
            id: githubId
          }
        },
        set: sinon.stub()
      }
      bigPoppaUser = {}
      findByIdStub = sinon.stub(User, 'findByIdAsync').resolves(user)
      getByGithubIdStub = sinon.stub(UserService, 'getByGithubId').resolves(bigPoppaUser)
      done()
    })
    afterEach(function (done) {
      findByIdStub.restore()
      getByGithubIdStub.restore()
      done()
    })

    it('should find the user by their id', function (done) {
      UserService.getCompleteUserById(userId)
      .then(function (res) {
        sinon.assert.calledOnce(findByIdStub)
        sinon.assert.calledWithExactly(findByIdStub, userId)
      })
      .asCallback(done)
    })

    it('should fetch the big poppa user', function (done) {
      UserService.getCompleteUserById(userId)
      .then(function (res) {
        sinon.assert.calledOnce(getByGithubIdStub)
        sinon.assert.calledWithExactly(getByGithubIdStub, githubId)
      })
      .asCallback(done)
    })

    it('should set the big poppa user', function (done) {
      UserService.getCompleteUserById(userId)
      .then(function (res) {
        sinon.assert.calledOnce(user.set)
        sinon.assert.calledWithExactly(user.set, 'bigPoppaUser', bigPoppaUser)
      })
      .asCallback(done)
    })

    it('should return the user', function (done) {
      UserService.getCompleteUserById(userId)
      .then(function (res) {
        expect(res).to.equal(user)
      })
      .asCallback(done)
    })

    it('should throw an error if it cant find the BP user', function (done) {
      let originalErr = new Error('')
      getByGithubIdStub.rejects(originalErr)

      UserService.getCompleteUserById(userId)
      .asCallback(function (err, res) {
        expect(err).to.exist()
        expect(err).to.equal(originalErr)
        sinon.assert.notCalled(user.set)
        done()
      })
    })

    it('should throw an error if no user is found', function (done) {
      findByIdStub.resolves(null)

      UserService.getCompleteUserById(userId)
      .asCallback(function (err, res) {
        expect(err).to.be.an.instanceof(User.NotFoundError)
        expect(err.message).to.match(/user.*not.*found/i)
        done()
      })
    })
  })

  describe('getCompleteUserByGithubId', function () {
    var findByGithubIdStub
    var getByGithubIdStub
    var user
    const githubId = 1981198
    var bigPoppaUser
    beforeEach(function (done) {
      user = {
        accounts: {
          github: {
            id: githubId
          }
        },
        set: sinon.stub()
      }
      bigPoppaUser = {}
      findByGithubIdStub = sinon.stub(User, 'findByGithubIdAsync').resolves(user)
      getByGithubIdStub = sinon.stub(UserService, 'getByGithubId').resolves(bigPoppaUser)
      done()
    })
    afterEach(function (done) {
      findByGithubIdStub.restore()
      getByGithubIdStub.restore()
      done()
    })

    it('should find the user by their id', function (done) {
      UserService.getCompleteUserByGithubId(githubId)
      .then(function (res) {
        sinon.assert.calledOnce(findByGithubIdStub)
        sinon.assert.calledWithExactly(findByGithubIdStub, githubId)
      })
      .asCallback(done)
    })

    it('should fetch the big poppa user', function (done) {
      UserService.getCompleteUserByGithubId(githubId)
      .then(function (res) {
        sinon.assert.calledOnce(getByGithubIdStub)
        sinon.assert.calledWithExactly(getByGithubIdStub, githubId)
      })
      .asCallback(done)
    })

    it('should set the big poppa user', function (done) {
      UserService.getCompleteUserByGithubId(githubId)
      .then(function (res) {
        sinon.assert.calledOnce(user.set)
        sinon.assert.calledWithExactly(user.set, 'bigPoppaUser', bigPoppaUser)
      })
      .asCallback(done)
    })

    it('should return the user', function (done) {
      UserService.getCompleteUserByGithubId(githubId)
      .then(function (res) {
        expect(res).to.equal(user)
      })
      .asCallback(done)
    })

    it('should not matter if the big poppa user is not found', function (done) {
      let error = new Error('')
      getByGithubIdStub.rejects(error)

      UserService.getCompleteUserByGithubId(githubId)
      .asCallback(function (err) {
        expect(err).to.equal(error)
        done()
      })
    })

    it('should throw an error if no user is found', function (done) {
      findByGithubIdStub.resolves(null)

      UserService.getCompleteUserByGithubId(githubId)
      .asCallback(function (err, res) {
        expect(err).to.be.an.instanceof(User.NotFoundError)
        expect(err.message).to.match(/user.*not.*found/i)
        done()
      })
    })
  })

  describe('getCompleteUserByBigPoppaId', function () {
    var findByGithubIdStub
    var getUserStub
    var user
    const bpId = 1981198
    const githubId = 1981198
    var bigPoppaUser
    beforeEach(function (done) {
      user = {
        accounts: {
          github: {
            id: githubId
          }
        },
        set: sinon.stub()
      }
      bigPoppaUser = { githubId }
      findByGithubIdStub = sinon.stub(User, 'findByGithubIdAsync').resolves(user)
      getUserStub = sinon.stub(BigPoppaClient.prototype, 'getUser').resolves(bigPoppaUser)
      done()
    })
    afterEach(function (done) {
      findByGithubIdStub.restore()
      getUserStub.restore()
      done()
    })

    it('should fetch the big poppa user', function (done) {
      UserService.getCompleteUserByBigPoppaId(bpId)
      .then(function (res) {
        sinon.assert.calledOnce(getUserStub)
        sinon.assert.calledWithExactly(getUserStub, bpId)
      })
      .asCallback(done)
    })

    it('should find the user by its id', function (done) {
      UserService.getCompleteUserByBigPoppaId(bpId)
      .then(function (res) {
        sinon.assert.calledOnce(findByGithubIdStub)
        sinon.assert.calledWithExactly(findByGithubIdStub, githubId)
      })
      .asCallback(done)
    })

    it('should set the big poppa user', function (done) {
      UserService.getCompleteUserByBigPoppaId(bpId)
      .then(function (res) {
        sinon.assert.calledOnce(user.set)
        sinon.assert.calledWithExactly(user.set, 'bigPoppaUser', bigPoppaUser)
      })
      .asCallback(done)
    })

    it('should return the mongo user', function (done) {
      UserService.getCompleteUserByBigPoppaId(bpId)
      .then(function (res) {
        expect(res).to.equal(user)
      })
      .asCallback(done)
    })

    it('should throw an error if the BP user is not found', function (done) {
      let error = new Error('')
      getUserStub.rejects(error)

      UserService.getCompleteUserByBigPoppaId(bpId)
      .asCallback(function (err) {
        expect(err).to.equal(error)
        done()
      })
    })

    it('should throw an error if no user is found', function (done) {
      findByGithubIdStub.resolves(null)

      UserService.getCompleteUserByBigPoppaId(bpId)
      .asCallback(function (err, res) {
        expect(err).to.be.an.instanceof(User.NotFoundError)
        expect(err.message).to.match(/user.*not.*found/i)
        done()
      })
    })
  })

  describe('getBpOrgInfoFromRepoName', () => {
    it('should return correct org info', (done) => {
      const testInfo = {
        lowerName: 'good'
      }
      const sessionUser = {
        bigPoppaUser: {
          organizations: [{
            lowerName: 'bad'
          },
          testInfo, {
            lowerName: 'worst'
          }]
        }
      }
      const output = UserService.getBpOrgInfoFromRepoName(sessionUser, 'good/repo-name')
      expect(output).to.equal(testInfo)
      done()
    })

    it('should throw if no org found', (done) => {
      const sessionUser = {
        bigPoppaUser: {
          organizations: [{
            lowerName: 'bad'
          }, {
            lowerName: 'good'
          }, {
            lowerName: 'worst'
          }]
        }
      }
      expect(() => {
        UserService.getBpOrgInfoFromRepoName(sessionUser, 'mysterious/repo')
      }).to.throw(UserService.OrganizationNotFoundError)
      done()
    })
  }) // end getBpOrgInfoFromRepoName
})
