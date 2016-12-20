'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.describe
const it = lab.it
const beforeEach = lab.beforeEach
const afterEach = lab.afterEach

const Code = require('code')
const expect = Code.expect
const objectId = require('objectid')
const Promise = require('bluebird')
const sinon = require('sinon')

const DockerComposeCluster = require('models/mongo/docker-compose-cluster')
const DockerComposeClusterService = require('models/services/docker-compose-cluster-service')
const rabbitMQ = require('models/rabbitmq')
const GitHub = require('models/apis/github')
const octobear = require('@runnable/octobear')
const BuildService = require('models/services/build-service')
const ContextService = require('models/services/context-service')
const ContextVersion = require('models/mongo/context-version')
const InfraCodeVersionService = require('models/services/infracode-version-service')
const InstanceService = require('models/services/instance-service')

require('sinon-as-promised')(Promise)

describe('Docker Compose Cluster Service Unit Tests', function () {
  const testOrgGithubId = 111
  const testUserGithubId = 333
  const testOrgBpId = 222
  const testUserBpId = 444
  const testOrgName = 'Runnable'
  const testContextId = objectId('407f191e810c19729de860ef')
  let testOrgInfo
  let testParsedContent
  let testMainParsedContent
  let testSessionUser
  const testOrg = {
    id: testOrgBpId
  }

  beforeEach((done) => {
    testMainParsedContent = {
      metadata: {
        name: 'api',
        isMain: true
      },
      contextVersion: {
        advanced: true,
        buildDockerfilePath: '.'
      },
      files: { // Optional
        '/Dockerfile': {
          body: 'FROM node'
        }
      },
      instance: {
        name: 'api',
        containerStartCommand: 'npm start',
        ports: [80],
        env: ['HELLO=WORLD']
      }
    }

    testParsedContent = {
      results: [testMainParsedContent]
    }

    testSessionUser = {
      _id: 'id',
      accounts: {
        github: {
          id: testUserGithubId,
          accessToken: 'some-token'
        },
        login: 'login',
        username: 'best'
      },
      bigPoppaUser: {
        id: testUserBpId,
        organizations: [{
          name: testOrgName,
          lowerName: testOrgName.toLowerCase(),
          id: testOrgBpId,
          githubId: testOrgGithubId
        }]
      }
    }

    testOrgInfo = {
      githubOrgId: testOrgGithubId,
      bigPoppaOrgId: testOrgBpId
    }
    done()
  })

  // describe('create', function () {
  //   const clusterId = objectId('407f191e810c19729de860ef')
  //   const parentInstanceId = objectId('507f191e810c19729de860ea')
  //   const dockerComposeFilePath = 'config/compose.yml'
  //   const clusterData = {
  //     _id: clusterId,
  //     dockerComposeFilePath: dockerComposeFilePath,
  //     parentInstanceId: parentInstanceId,
  //     instancesIds: [
  //       objectId('607f191e810c19729de860eb'),
  //       objectId('707f191e810c19729de860ec')
  //     ]
  //   }
  //
  //   const dockerComposeContent = {
  //     name: 'docker-compose.yml',
  //     path: 'docker-compose.yml',
  //     sha: '13ec49b1014891c7b494126226f95e318e1d3e82',
  //     size: 193,
  //     url: 'https://api.github.com/repos/Runnable/compose-test-repo-1.2/contents/docker-compose.yml?ref=master',
  //     html_url: 'https://github.com/Runnable/compose-test-repo-1.2/blob/master/docker-compose.yml',
  //     git_url: 'https://api.github.com/repos/Runnable/compose-test-repo-1.2/git/blobs/13ec49b1014891c7b494126226f95e318e1d3e82',
  //     download_url: 'https://raw.githubusercontent.com/Runnable/compose-test-repo-1.2/master/docker-compose.yml',
  //     type: 'file',
  //     content: 'dmVyc2lvbjogJzInCnNlcnZpY2VzOgogIHdlYjoKICAgIGJ1aWxkOiAnLi9z\ncmMvJwogICAgY29tbWFuZDogW25vZGUsIGluZGV4LmpzXQogICAgcG9ydHM6\nCiAgICAgIC0gIjUwMDA6NTAwMCIKICAgIGVudmlyb25tZW50OgogICAgICAt\nIE5PREVfRU5WPWRldmVsb3BtZW50CiAgICAgIC0gU0hPVz10cnVlCiAgICAg\nIC0gSEVMTE89Njc4Cg==\n',
  //     encoding: 'base64',
  //     _links:
  //      { self: 'https://api.github.com/repos/Runnable/compose-test-repo-1.2/contents/docker-compose.yml?ref=master',
  //        git: 'https://api.github.com/repos/Runnable/compose-test-repo-1.2/git/blobs/13ec49b1014891c7b494126226f95e318e1d3e82',
  //        html: 'https://github.com/Runnable/compose-test-repo-1.2/blob/master/docker-compose.yml'
  //      }
  //   }
  //   const triggeredAction = 'webhook'
  //   const dockerComposeFileString = 'version: \'2\'\nservices:\n  web:\n    build: \'./src/\'\n    command: [node, index.js]\n    ports:\n      - "5000:5000"\n    environment:\n      - NODE_ENV=development\n      - SHOW=true\n      - HELLO=678\n'
  //   const orgName = 'Runnable'
  //   const ownerUsername = orgName.toLowerCase()
  //   const repoName = 'api'
  //   const repoFullName = orgName + '/' + repoName
  //   const branchName = 'feature-1'
  //   const newInstanceName = 'api-unit'
  //   beforeEach(function (done) {
  //     sinon.stub(DockerComposeCluster, 'createAsync').resolves(new DockerComposeCluster(clusterData))
  //     sinon.stub(GitHub.prototype, 'getRepoContentAsync').resolves(dockerComposeContent)
  //     sinon.stub(octobear, 'parse').returns(testParsedContent)
  //     sinon.stub(rabbitMQ, 'clusterCreated').returns()
  //     done()
  //   })
  //   afterEach(function (done) {
  //     DockerComposeCluster.createAsync.restore()
  //     GitHub.prototype.getRepoContentAsync.restore()
  //     octobear.parse.restore()
  //     rabbitMQ.clusterCreated.restore()
  //     done()
  //   })
  //   describe('errors', function () {
  //     it('should return error if getRepoContentAsync failed', function (done) {
  //       const error = new Error('Some error')
  //       GitHub.prototype.getRepoContentAsync.rejects(error)
  //       DockerComposeClusterService.create(testSessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
  //       .asCallback(function (err) {
  //         expect(err).to.exist()
  //         expect(err.message).to.equal(error.message)
  //         done()
  //       })
  //     })
  //
  //     it('should return error if octobear.parse failed', function (done) {
  //       const error = new Error('Some error')
  //       octobear.parse.throws(error)
  //       DockerComposeClusterService.create(testSessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
  //       .asCallback(function (err) {
  //         expect(err).to.exist()
  //         expect(err.message).to.equal(error.message)
  //         done()
  //       })
  //     })
  //
  //     it('should return error if createAsync failed', function (done) {
  //       const error = new Error('Some error')
  //       DockerComposeCluster.createAsync.rejects(error)
  //       DockerComposeClusterService.create(testSessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
  //       .asCallback(function (err) {
  //         expect(err).to.exist()
  //         expect(err.message).to.equal(error.message)
  //         done()
  //       })
  //     })
  //
  //     it('should return error if clusterCreared failed', function (done) {
  //       const error = new Error('Some error')
  //       rabbitMQ.clusterCreated.throws(error)
  //       DockerComposeClusterService.create(testSessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
  //       .asCallback(function (err) {
  //         expect(err).to.exist()
  //         expect(err.message).to.equal(error.message)
  //         done()
  //       })
  //     })
  //   })
  //   describe('success', function () {
  //     it('should run successfully', function (done) {
  //       DockerComposeClusterService.create(testSessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName).asCallback(done)
  //     })
  //
  //     it('should call getRepoContentAsync with correct args', function (done) {
  //       DockerComposeClusterService.create(testSessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
  //       .tap(function () {
  //         sinon.assert.calledOnce(GitHub.prototype.getRepoContentAsync)
  //         sinon.assert.calledWithExactly(GitHub.prototype.getRepoContentAsync, repoFullName, dockerComposeFilePath)
  //       })
  //       .asCallback(done)
  //     })
  //
  //     it('should call octobear.parse with correct args', function (done) {
  //       DockerComposeClusterService.create(testSessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
  //       .tap(function () {
  //         sinon.assert.calledOnce(octobear.parse)
  //         const parserPayload = {
  //           dockerComposeFileString,
  //           repositoryName: newInstanceName,
  //           ownerUsername: ownerUsername,
  //           userContentDomain: process.env.USER_CONTENT_DOMAIN
  //         }
  //         sinon.assert.calledWithExactly(octobear.parse, parserPayload)
  //       })
  //       .asCallback(done)
  //     })
  //
  //     it('should call createAsync with correct args', function (done) {
  //       DockerComposeClusterService.create(testSessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
  //       .tap(function () {
  //         sinon.assert.calledOnce(DockerComposeCluster.createAsync)
  //         sinon.assert.calledWithExactly(DockerComposeCluster.createAsync, {
  //           dockerComposeFilePath,
  //           createdByUser: testSessionUser.bigPoppaUser.id,
  //           ownedByOrg: testOrg.id
  //         })
  //       })
  //       .asCallback(done)
  //     })
  //
  //     it('should call clusterCreated with correct args', function (done) {
  //       DockerComposeClusterService.create(testSessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
  //       .tap(function () {
  //         sinon.assert.calledOnce(rabbitMQ.clusterCreated)
  //         const cluster = { id: clusterId.toString() }
  //         const payload = {
  //           cluster,
  //           parsedCompose: testParsedContent,
  //           sessionUserBigPoppaId: testSessionUser.bigPoppaUser.id,
  //           organization: {
  //             id: testOrg.id
  //           },
  //           triggeredAction,
  //           repoFullName
  //         }
  //         sinon.assert.calledWithExactly(rabbitMQ.clusterCreated, payload)
  //       })
  //       .asCallback(done)
  //     })
  //
  //     it('should call all the functions in the order', function (done) {
  //       DockerComposeClusterService.create(testSessionUser, triggeredAction, repoFullName, branchName, dockerComposeFilePath, newInstanceName)
  //       .tap(function () {
  //         sinon.assert.callOrder(
  //           GitHub.prototype.getRepoContentAsync,
  //           octobear.parse,
  //           DockerComposeCluster.createAsync,
  //           rabbitMQ.clusterCreated)
  //       })
  //       .asCallback(done)
  //     })
  //   })
  // })

  describe('createClusterInstance', () => {
    beforeEach((done) => {
      sinon.stub(DockerComposeClusterService, '_createContext')
      sinon.stub(DockerComposeClusterService, '_createContextVersion')
      sinon.stub(DockerComposeClusterService, '_createBuild')
      sinon.stub(BuildService, 'buildBuild')
      sinon.stub(DockerComposeClusterService, '_createInstance')
      done()
    })

    afterEach((done) => {
      DockerComposeClusterService._createInstance.restore()
      DockerComposeClusterService._createBuild.restore()
      DockerComposeClusterService._createContextVersion.restore()
      BuildService.buildBuild.restore()
      DockerComposeClusterService._createContext.restore()
      done()
    })

    it('should create cluster instance', (done) => {
      const testRepoName = 'Runnable/boo'
      const testInstance = { _id: 'instance' }
      const testBuild = { _id: objectId('407f191e810c19729de860ef') }
      const testContext = { _id: 'context' }
      const testContextVersion = { _id: 'contextVersion' }
      const testTriggeredAction = 'user'

      DockerComposeClusterService._createInstance.resolves(testInstance)
      DockerComposeClusterService._createBuild.resolves(testBuild)
      BuildService.buildBuild.resolves(testBuild)
      DockerComposeClusterService._createContextVersion.resolves(testContextVersion)
      DockerComposeClusterService._createContext.resolves(testContext)

      DockerComposeClusterService.createClusterInstance(testSessionUser, testMainParsedContent, testRepoName, testTriggeredAction).asCallback((err, instance) => {
        if (err) { return done(err) }
        expect(instance).to.equal(testInstance)
        sinon.assert.calledOnce(DockerComposeClusterService._createContext)
        sinon.assert.calledWithExactly(DockerComposeClusterService._createContext, testSessionUser, testOrgInfo)
        sinon.assert.calledOnce(DockerComposeClusterService._createContextVersion)
        sinon.assert.calledWithExactly(DockerComposeClusterService._createContextVersion, testSessionUser, testContext._id, testOrgInfo, testRepoName, testMainParsedContent)
        sinon.assert.calledOnce(DockerComposeClusterService._createBuild)
        sinon.assert.calledWithExactly(DockerComposeClusterService._createBuild, testSessionUser, testContextVersion._id, testOrgInfo.githubOrgId)
        sinon.assert.calledOnce(BuildService.buildBuild)
        const buildData = {
          message: 'Initial Cluster Creation',
          noCache: true,
          triggeredAction: {
            manual: testTriggeredAction === 'user'
          }
        }
        sinon.assert.calledWithExactly(BuildService.buildBuild, testBuild._id, buildData, testSessionUser)
        sinon.assert.calledOnce(DockerComposeClusterService._createInstance)
        sinon.assert.calledWithExactly(DockerComposeClusterService._createInstance, testSessionUser, testMainParsedContent.instance, testBuild._id.toString())
        done()
      })
    })
  }) // end createClusterInstance

  describe('_createContext', () => {
    beforeEach((done) => {
      sinon.stub(ContextService, 'createNew')
      done()
    })

    afterEach((done) => {
      ContextService.createNew.restore()
      done()
    })

    it('should create context', (done) => {
      const testContext = 'context'
      ContextService.createNew.resolves(testContext)

      DockerComposeClusterService._createContext(testSessionUser, {
        githubOrgId: testOrgGithubId,
        bigPoppaOrgId: testOrgBpId
      }).asCallback((err, context) => {
        if (err) { return done(err) }
        sinon.assert.calledOnce(ContextService.createNew)
        sinon.assert.calledWith(ContextService.createNew, testSessionUser, sinon.match({
          name: sinon.match.string,
          owner: {
            github: testOrgGithubId,
            bigPoppa: testOrgBpId
          }
        }))

        expect(context).to.equal(testContext)
        done()
      })
    })
  }) // end _createContext

  describe('_createContextVersion', () => {
    let testContextVersion = { _id: 'contextVersion' }
    let testAppCodeVersion = { _id: 'testAppCodeVersion' }
    let testParentInfraCodeVersion = { _id: 'infraCodeVersion' }
    let testDockerfileContent
    beforeEach((done) => {
      sinon.stub(ContextVersion, 'createAppcodeVersion').resolves(testAppCodeVersion)
      sinon.stub(ContextVersion, 'createWithNewInfraCode').resolves(testContextVersion)
      sinon.stub(InfraCodeVersionService, 'findBlankInfraCodeVersion').resolves(testParentInfraCodeVersion)
      testDockerfileContent = testMainParsedContent.files['/Dockerfile'].body
      sinon.stub(ContextVersion, 'createWithDockerFileContent').resolves(testContextVersion)
      done()
    })

    afterEach((done) => {
      ContextVersion.createAppcodeVersion.restore()
      ContextVersion.createWithNewInfraCode.restore()
      InfraCodeVersionService.findBlankInfraCodeVersion.restore()
      ContextVersion.createWithDockerFileContent.restore()
      done()
    })

    describe('success', () => {
      it('should call ContextVersion.createWithNewInfraCode if no Dockerfile was provided', (done) => {
        const testRepoName = 'runnable/boo'
        const testDockerfilePath = '/Dockerfile'
        const testParsedContextVersionOpts = {
          advanced: true,
          buildDockerfilePath: testDockerfilePath
        }
        const testParsedComposeData = {
          contextVersion: testParsedContextVersionOpts
        }
        DockerComposeClusterService._createContextVersion(testSessionUser, testContextId, testOrgInfo, testRepoName, testParsedComposeData)
        .tap((contextVersion) => {
          expect(contextVersion).to.equal(testContextVersion)
          sinon.assert.calledOnce(ContextVersion.createAppcodeVersion)
          sinon.assert.calledWithExactly(ContextVersion.createAppcodeVersion, testSessionUser, testRepoName)
          sinon.assert.calledOnce(InfraCodeVersionService.findBlankInfraCodeVersion)
          sinon.assert.calledWithExactly(InfraCodeVersionService.findBlankInfraCodeVersion)
          sinon.assert.calledOnce(ContextVersion.createWithNewInfraCode)
          sinon.assert.calledWithExactly(ContextVersion.createWithNewInfraCode, {
            context: testContextId,
            createdBy: {
              github: testSessionUser.accounts.github.id,
              bigPoppa: testSessionUser.bigPoppaUser.id
            },
            owner: {
              github: testOrgGithubId,
              bigPoppa: testOrgBpId
            },
            advanced: true,
            buildDockerfilePath: testDockerfilePath,
            appCodeVersions: [testAppCodeVersion]
          }, { parent: testParentInfraCodeVersion._id, edited: true })
        }).asCallback(done)
      })

      it('should call ContextVersion.createWithDockerFileContent if Dockefile was provided', (done) => {
        const testRepoName = 'runnable/boo'
        const testParsedComposeData = {
          contextVersion: {
            advanced: true
          },
          files: {
            '/Dockerfile': {
              body: testDockerfileContent
            }
          }
        }
        DockerComposeClusterService._createContextVersion(testSessionUser, testContextId, testOrgInfo, testRepoName, testParsedComposeData)
        .tap((contextVersion) => {
          expect(contextVersion).to.equal(testContextVersion)
          sinon.assert.notCalled(ContextVersion.createAppcodeVersion)
          sinon.assert.calledOnce(InfraCodeVersionService.findBlankInfraCodeVersion)
          sinon.assert.calledWithExactly(InfraCodeVersionService.findBlankInfraCodeVersion)
          sinon.assert.calledOnce(ContextVersion.createWithDockerFileContent)
          sinon.assert.calledWithExactly(ContextVersion.createWithDockerFileContent, {
            context: testContextId,
            createdBy: {
              github: testSessionUser.accounts.github.id,
              bigPoppa: testSessionUser.bigPoppaUser.id
            },
            owner: {
              github: testOrgGithubId,
              bigPoppa: testOrgBpId
            },
            advanced: true
          }, testDockerfileContent, { edited: true, parent: testParentInfraCodeVersion._id })
        }).asCallback(done)
      })

      it('should call all functions in order if Dockerfile was not specified', (done) => {
        const testRepoName = 'runnable/boo'
        const testDockerfilePath = '/Dockerfile'
        const testParsedContextVersionOpts = {
          advanced: true,
          buildDockerfilePath: testDockerfilePath
        }
        const testParsedComposeData = {
          contextVersion: testParsedContextVersionOpts
        }
        DockerComposeClusterService._createContextVersion(testSessionUser, testContextId, testOrgInfo, testRepoName, testParsedComposeData)
        .tap((contextVersion) => {
          expect(contextVersion).to.equal(testContextVersion)
          sinon.assert.callOrder(
            InfraCodeVersionService.findBlankInfraCodeVersion,
            ContextVersion.createAppcodeVersion,
            ContextVersion.createWithNewInfraCode)
        }).asCallback(done)
      })

      it('should call all functions in order if Dockerfile was specified', (done) => {
        const testRepoName = 'runnable/boo'
        const testParsedComposeData = {
          contextVersion: {
            advanced: true
          },
          files: {
            '/Dockerfile': {
              body: testDockerfileContent
            }
          }
        }
        DockerComposeClusterService._createContextVersion(testSessionUser, testContextId, testOrgInfo, testRepoName, testParsedComposeData)
        .tap((contextVersion) => {
          expect(contextVersion).to.equal(testContextVersion)
          sinon.assert.callOrder(
            InfraCodeVersionService.findBlankInfraCodeVersion,
            ContextVersion.createWithDockerFileContent)
        }).asCallback(done)
      })
    })
  }) // end _createContextVersion

  describe('_createBuild', () => {
    beforeEach((done) => {
      sinon.stub(BuildService, 'createBuild')
      done()
    })

    afterEach((done) => {
      BuildService.createBuild.restore()
      done()
    })

    it('should create build', (done) => {
      const testContextVersionId = objectId('407f191e810c19729de860ef')
      const testBuildId = objectId('507f191e810c19729de860ee')
      const testBuild = {
        _id: testBuildId
      }
      BuildService.createBuild.resolves(testBuild)
      DockerComposeClusterService._createBuild(testSessionUser, testContextVersionId, testOrgGithubId).asCallback((err, build) => {
        if (err) { return done(err) }
        sinon.assert.calledOnce(BuildService.createBuild)
        sinon.assert.calledWith(BuildService.createBuild, {
          contextVersion: testContextVersionId,
          createdBy: {
            github: testUserGithubId
          },
          owner: {
            github: testOrgGithubId
          }
        }, testSessionUser)

        expect(build).to.equal(testBuild)
        done()
      })
    })
  }) // end _createBuild

  describe('_createInstance', () => {
    beforeEach((done) => {
      sinon.stub(InstanceService, 'createInstance')
      done()
    })

    afterEach((done) => {
      InstanceService.createInstance.restore()
      done()
    })

    it('should create context', (done) => {
      const testParentBuildId = objectId('407f191e810c19729de860ef')
      const testParentComposeData = {
        env: 'env',
        containerStartCommand: 'containerStartCommand',
        name: 'name'
      }
      const testInstance = 'build'
      InstanceService.createInstance.resolves(testInstance)

      DockerComposeClusterService._createInstance(testSessionUser, testParentComposeData, testParentBuildId.toString()).asCallback((err, instance) => {
        if (err) { return done(err) }
        sinon.assert.calledOnce(InstanceService.createInstance)
        sinon.assert.calledWith(InstanceService.createInstance, {
          build: testParentBuildId.toString(),
          env: testParentComposeData.env,
          containerStartCommand: testParentComposeData.containerStartCommand,
          name: testParentComposeData.name,
          isTesting: false,
          masterPod: true,
          ipWhitelist: {
            enabled: false
          }
        })

        expect(instance).to.equal(testInstance)
        done()
      })
    })
  }) // end _createInstance

  // describe('delete', function () {
  //   const clusterId = objectId('407f191e810c19729de860ef')
  //   const parentInstanceId = objectId('507f191e810c19729de860ea')
  //   const clusterData = {
  //     _id: clusterId,
  //     dockerComposeFilePath: '/config/compose.yml',
  //     parentInstanceId: parentInstanceId,
  //     instancesIds: [
  //       objectId('607f191e810c19729de860eb'),
  //       objectId('707f191e810c19729de860ec')
  //     ]
  //   }
  //   beforeEach(function (done) {
  //     sinon.stub(DockerComposeCluster, 'findByIdAndAssert').resolves(new DockerComposeCluster(clusterData))
  //     sinon.stub(DockerComposeCluster, 'markAsDeleted').resolves()
  //     sinon.stub(rabbitMQ, 'deleteInstance').returns()
  //     sinon.stub(rabbitMQ, 'clusterDeleted').returns()
  //     done()
  //   })
  //   afterEach(function (done) {
  //     DockerComposeCluster.findByIdAndAssert.restore()
  //     DockerComposeCluster.markAsDeleted.restore()
  //     rabbitMQ.deleteInstance.restore()
  //     rabbitMQ.clusterDeleted.restore()
  //     done()
  //   })
  //   describe('errors', function () {
  //     it('should return error if findByIdAndAssert failed', function (done) {
  //       const error = new Error('Some error')
  //       DockerComposeCluster.findByIdAndAssert.rejects(error)
  //       DockerComposeClusterService.delete(clusterId.toString())
  //       .asCallback(function (err) {
  //         expect(err).to.exist()
  //         expect(err.message).to.equal(error.message)
  //         done()
  //       })
  //     })
  //
  //     it('should return error if deleteInstance failed', function (done) {
  //       const error = new Error('Some error')
  //       rabbitMQ.deleteInstance.throws(error)
  //       DockerComposeClusterService.delete(clusterId.toString())
  //       .asCallback(function (err) {
  //         expect(err).to.exist()
  //         expect(err.message).to.equal(error.message)
  //         done()
  //       })
  //     })
  //
  //     it('should return error if findByIdAndAssert failed', function (done) {
  //       const error = new Error('Some error')
  //       DockerComposeCluster.markAsDeleted.rejects(error)
  //       DockerComposeClusterService.delete(clusterId.toString())
  //       .asCallback(function (err) {
  //         expect(err).to.exist()
  //         expect(err.message).to.equal(error.message)
  //         done()
  //       })
  //     })
  //
  //     it('should return error if clusterDeleted failed', function (done) {
  //       const error = new Error('Some error')
  //       rabbitMQ.clusterDeleted.throws(error)
  //       DockerComposeClusterService.delete(clusterId.toString())
  //       .asCallback(function (err) {
  //         expect(err).to.exist()
  //         expect(err.message).to.equal(error.message)
  //         done()
  //       })
  //     })
  //   })
  //   describe('success', function () {
  //     it('should run successfully', function (done) {
  //       DockerComposeClusterService.delete(clusterId.toString()).asCallback(done)
  //     })
  //
  //     it('should call findByIdAndAssert with correct args', function (done) {
  //       DockerComposeClusterService.delete(clusterId.toString())
  //       .tap(function () {
  //         sinon.assert.calledOnce(DockerComposeCluster.findByIdAndAssert)
  //         sinon.assert.calledWithExactly(DockerComposeCluster.findByIdAndAssert, clusterId.toString())
  //       })
  //       .asCallback(done)
  //     })
  //
  //     it('should call deleteInstance with correct args', function (done) {
  //       DockerComposeClusterService.delete(clusterId.toString())
  //       .tap(function () {
  //         sinon.assert.calledTwice(rabbitMQ.deleteInstance)
  //         sinon.assert.calledWithExactly(rabbitMQ.deleteInstance, { instanceId: clusterData.instancesIds[0] })
  //         sinon.assert.calledWithExactly(rabbitMQ.deleteInstance, { instanceId: clusterData.instancesIds[1] })
  //       })
  //       .asCallback(done)
  //     })
  //
  //     it('should call markAsDeleted with correct args', function (done) {
  //       DockerComposeClusterService.delete(clusterId.toString())
  //       .tap(function () {
  //         sinon.assert.calledOnce(DockerComposeCluster.markAsDeleted)
  //         sinon.assert.calledWithExactly(DockerComposeCluster.markAsDeleted, clusterId)
  //       })
  //       .asCallback(done)
  //     })
  //
  //     it('should call clusterDeleted with correct args', function (done) {
  //       DockerComposeClusterService.delete(clusterId.toString())
  //       .tap(function () {
  //         sinon.assert.calledOnce(rabbitMQ.clusterDeleted)
  //         const cluster = { id: clusterId.toString() }
  //         sinon.assert.calledWithExactly(rabbitMQ.clusterDeleted, { cluster })
  //       })
  //       .asCallback(done)
  //     })
  //
  //     it('should call all the functions in the order', function (done) {
  //       DockerComposeClusterService.delete(clusterId.toString())
  //       .tap(function () {
  //         sinon.assert.callOrder(
  //           DockerComposeCluster.findByIdAndAssert,
  //           rabbitMQ.deleteInstance,
  //           DockerComposeCluster.markAsDeleted,
  //           rabbitMQ.clusterDeleted)
  //       })
  //       .asCallback(done)
  //     })
  //   })
  // })

  describe('_updateAndRebuildInstancesWithConfigs', () => {
    let instanceMock
    let testConfig
    beforeEach((done) => {
      testConfig = {
        env: 'env',
        containerStartCommand: 'start',
        name: 'NewName'
      }

      instanceMock = {
        _id: 1,
        updateAsync: sinon.stub().resolves(),
        name: 'test',
        config: {
          instance: testConfig
        }
      }
      sinon.stub(rabbitMQ, 'publishInstanceRebuild')
      done()
    })

    afterEach((done) => {
      rabbitMQ.publishInstanceRebuild.restore()
      done()
    })

    it('should update instance if it has new config', (done) => {
      DockerComposeClusterService._updateAndRebuildInstancesWithConfigs(instanceMock)
      .then(() => {
        sinon.assert.calledOnce(instanceMock.updateAsync)
        sinon.assert.calledWith(instanceMock.updateAsync, {
          $set: {
            env: testConfig.env,
            containerStartCommand: testConfig.containerStartCommand
          }
        })

        sinon.assert.calledOnce(rabbitMQ.publishInstanceRebuild)
        sinon.assert.calledWith(rabbitMQ.publishInstanceRebuild, {
          instanceId: instanceMock._id
        })
      })
      .asCallback(done)
    })

    it('should not update instance if it has no config', (done) => {
      delete instanceMock.config

      DockerComposeClusterService._updateAndRebuildInstancesWithConfigs(instanceMock)
      sinon.assert.notCalled(instanceMock.updateAsync)
      sinon.assert.notCalled(rabbitMQ.publishInstanceRebuild)
      done()
    })

    it('should not update instance if it has no name', (done) => {
      delete instanceMock.name

      DockerComposeClusterService._updateAndRebuildInstancesWithConfigs(instanceMock)
      sinon.assert.notCalled(instanceMock.updateAsync)
      sinon.assert.notCalled(rabbitMQ.publishInstanceRebuild)
      done()
    })
  }) // end _updateAndRebuildInstancesWithConfigs

  describe('updateCluster', () => {
    beforeEach((done) => {
      sinon.stub(rabbitMQ, 'publishInstanceRebuild')
      sinon.stub(rabbitMQ, 'createClusterInstance')
      sinon.stub(rabbitMQ, 'deleteInstance')
      done()
    })

    afterEach((done) => {
      rabbitMQ.deleteInstance.restore()
      rabbitMQ.createClusterInstance.restore()
      rabbitMQ.publishInstanceRebuild.restore()
      done()
    })

    it('should delete instance that has no config', (done) => {
      const testDeleteInstance = {
        _id: 2,
        name: 'B'
      }

      DockerComposeClusterService.updateCluster(
        [],
        [testDeleteInstance],
        testOrgBpId
      )
      .then(() => {
        sinon.assert.calledOnce(rabbitMQ.deleteInstance)
        sinon.assert.calledWith(rabbitMQ.deleteInstance, {
          instanceId: testDeleteInstance._id
        })
      })
      .asCallback(done)
    })

    it('should update instance that has config', (done) => {
      const testUpdateInstance = {
        _id: 1,
        name: 'A',
        updateAsync: sinon.stub().resolves()
      }

      const testUpdateConfig = {
        instance: {
          name: 'A',
          env: 'env',
          containerStartCommand: 'start'
        }
      }

      DockerComposeClusterService.updateCluster(
        [testUpdateConfig],
        [testUpdateInstance],
        testOrgBpId
      )
      .then(() => {
        sinon.assert.calledOnce(rabbitMQ.publishInstanceRebuild)
        sinon.assert.calledWith(rabbitMQ.publishInstanceRebuild, {
          instanceId: testUpdateInstance._id
        })

        sinon.assert.calledOnce(testUpdateInstance.updateAsync)
        sinon.assert.calledWith(testUpdateInstance.updateAsync, {
          $set: {
            env: testUpdateConfig.instance.env,
            containerStartCommand: testUpdateConfig.instance.containerStartCommand
          }
        })
      })
      .asCallback(done)
    })

    it('should create instance for new config', (done) => {
      const testNewConfig = {
        instance: { name: 'C' }
      }

      DockerComposeClusterService.updateCluster(
        [testNewConfig],
        [],
        testOrgBpId
      )
      .then(() => {
        sinon.assert.calledOnce(rabbitMQ.createClusterInstance)
        sinon.assert.calledWith(rabbitMQ.createClusterInstance, {
          parsedComposeData: testNewConfig,
          bigPoppaOrgId: testOrgBpId
        })
      })
      .asCallback(done)
    })
  }) // end updateCluster

  describe('_deleteInstanceIfMissingConfig', () => {
    beforeEach((done) => {
      sinon.stub(rabbitMQ, 'deleteInstance')
      done()
    })

    afterEach((done) => {
      rabbitMQ.deleteInstance.restore()
      done()
    })

    it('should call delete if instance does not have a config', (done) => {
      const testId = 1
      DockerComposeClusterService._deleteInstanceIfMissingConfig({ _id: testId })
      sinon.assert.calledOnce(rabbitMQ.deleteInstance)
      sinon.assert.calledWith(rabbitMQ.deleteInstance, { instanceId: testId })
      done()
    })

    it('should not call delete if instance has a config', (done) => {
      DockerComposeClusterService._deleteInstanceIfMissingConfig({ config: {} })
      sinon.assert.notCalled(rabbitMQ.deleteInstance)
      done()
    })
  }) // end _deleteInstanceIfMissingConfig

  describe('_createNewInstancesForNewConfigs', () => {
    beforeEach((done) => {
      sinon.stub(rabbitMQ, 'createClusterInstance')
      done()
    })

    afterEach((done) => {
      rabbitMQ.createClusterInstance.restore()
      done()
    })

    it('should call create if instance does not have a name', (done) => {
      testMainParsedContent.config = testMainParsedContent
      DockerComposeClusterService._createNewInstancesForNewConfigs({
        config: testMainParsedContent
      }, testOrgBpId)

      sinon.assert.calledOnce(rabbitMQ.createClusterInstance)
      sinon.assert.calledWith(rabbitMQ.createClusterInstance, {
        parsedComposeData: testMainParsedContent,
        bigPoppaOrgId: testOrgBpId
      })
      done()
    })

    it('should not call create if instance missing name', (done) => {
      delete testMainParsedContent.name
      DockerComposeClusterService._createNewInstancesForNewConfigs(testMainParsedContent, 1)
      sinon.assert.notCalled(rabbitMQ.createClusterInstance)
      done()
    })

    it('should not call create if instance missing config', (done) => {
      DockerComposeClusterService._createNewInstancesForNewConfigs(testMainParsedContent, 1)
      sinon.assert.notCalled(rabbitMQ.createClusterInstance)
      done()
    })
  }) // end _createNewInstancesForNewConfigs

  describe('_mergeConfigsIntoInstances', () => {
    it('should output list of configs and instances', (done) => {
      const out = DockerComposeClusterService._mergeConfigsIntoInstances(
        [{instance: {name: '1'}}, {instance: {name: '4'}}],
        [{name: '1'}, {name: '2'}]
      )
      expect(out).to.equal([
        {name: '1', config: {instance: {name: '1'}}},
        {name: '2', config: undefined},
        {config: {instance: {name: '4'}}}
      ])
      done()
    })
  }) // end _mergeConfigsIntoInstances

  describe('_addConfigToInstances', () => {
    it('should add instances and missing configs into array', (done) => {
      const out = DockerComposeClusterService._addConfigToInstances(
        [{instance: {name: '1'}}, {instance: {name: '4'}}],
        [{name: '1'}, {name: '2'}]
      )
      expect(out).to.equal([{name: '1', config: {instance: {name: '1'}}}, {name: '2', config: undefined}])
      done()
    })
  }) // end _addConfigToInstances

  describe('_addMissingConfigs', () => {
    it('should add missing configs to array', (done) => {
      const out = DockerComposeClusterService._addMissingConfigs(
        [{instance: {name: '1'}}, {instance: {name: '4'}}],
        [{name: '1'}, {name: '2'}]
      )
      expect(out).to.equal([{name: '1'}, {name: '2'}, {config: {instance: {name: '4'}}}])
      done()
    })
  }) // end _addMissingConfigs

  describe('_isConfigMissingInstance', () => {
    it('should return false if config has an instance', (done) => {
      const out = DockerComposeClusterService._isConfigMissingInstance(
        [{name: '1'}, {name: '2'}, {name: '3'}],
        {instance: {name: '1'}}
      )

      expect(out).to.be.false()
      done()
    })

    it('should return true if config does not have an instance', (done) => {
      const out = DockerComposeClusterService._isConfigMissingInstance(
        [{name: '1'}, {name: '2'}, {name: '3'}],
        {instance: {name: '5'}}
      )

      expect(out).to.be.true()
      done()
    })
  }) // end _isConfigMissingInstance
})
