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

require('sinon-as-promised')(Promise)

describe('Docker Compose Cluster Service Unit Tests', function () {
  describe('create', function () {
    const clusterId = objectId('407f191e810c19729de860ef')
    const parentInstanceId = objectId('507f191e810c19729de860ea')
    const clusterData = {
      _id: clusterId,
      dockerComposeFilePath: '/config/compose.yml',
      parentInstanceId: parentInstanceId,
      siblingsInstanceIds: [
        objectId('607f191e810c19729de860eb'),
        objectId('707f191e810c19729de860ec')
      ]
    }
    const testParsedContent = {
      results: [{
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
      }]
    }
    const sessionUser = {
      _id: objectId('107f191e810c19729de860ee'),
      accounts: {
        github: {
          id: 123,
          username: 'runnabot',
          accessToken: 'some-token'
        }
      }
    }
    const triggeredAction = 'webhook'
    const dockerComposeFileString = 'some-compose-file-string'
    const repoName = 'Runnable/api'
    const branchName = 'feature-1'
    const dockerComposeFilePath = './compose.yml'
    const newInstanceName = 'api-unit'
    beforeEach(function (done) {
      sinon.stub(DockerComposeCluster, 'createAsync').resolves(new DockerComposeCluster(clusterData))
      sinon.stub(GitHub.prototype, 'getRepoContentAsync').resolves(dockerComposeFileString)
      sinon.stub(octobear, 'parse').returns(testParsedContent)
      sinon.stub(rabbitMQ, 'clusterCreated').returns()
      done()
    })
    afterEach(function (done) {
      DockerComposeCluster.createAsync.restore()
      GitHub.prototype.getRepoContentAsync.restore()
      octobear.parse.restore()
      rabbitMQ.clusterCreated.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if getRepoContentAsync failed', function (done) {
        const error = new Error('Some error')
        GitHub.prototype.getRepoContentAsync.rejects(error)
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if octobear.parse failed', function (done) {
        const error = new Error('Some error')
        octobear.parse.throws(error)
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if createAsync failed', function (done) {
        const error = new Error('Some error')
        DockerComposeCluster.createAsync.rejects(error)
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if clusterCreared failed', function (done) {
        const error = new Error('Some error')
        rabbitMQ.clusterCreated.throws(error)
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })
    describe('success', function () {
      it('should run successfully', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName).asCallback(done)
      })

      it('should call getRepoContentAsync with correct args', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .tap(function () {
          sinon.assert.calledOnce(GitHub.prototype.getRepoContentAsync)
          sinon.assert.calledWithExactly(GitHub.prototype.getRepoContentAsync, repoName, dockerComposeFilePath)
        })
        .asCallback(done)
      })

      it('should call octobear.parse with correct args', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .tap(function () {
          sinon.assert.calledOnce(octobear.parse)
          const parserPayload = {
            dockerComposeFileString,
            repositoryName: newInstanceName,
            ownerUsername: sessionUser.accounts.github.username,
            userContentDomain: process.env.USER_CONTENT_DOMAIN
          }
          sinon.assert.calledWithExactly(octobear.parse, parserPayload)
        })
        .asCallback(done)
      })

      it('should call createAsync with correct args', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .tap(function () {
          sinon.assert.calledOnce(DockerComposeCluster.createAsync)
          sinon.assert.calledWithExactly(DockerComposeCluster.createAsync, {
            dockerComposeFilePath,
            createdBy: sessionUser.accounts.github.id,
            triggeredAction })
        })
        .asCallback(done)
      })

      it('should call clusterCreated with correct args', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .tap(function () {
          sinon.assert.calledOnce(rabbitMQ.clusterCreated)
          const cluster = { id: clusterId.toString() }
          const payload = {
            cluster,
            parsedCompose: testParsedContent
          }
          sinon.assert.calledWithExactly(rabbitMQ.clusterCreated, payload)
        })
        .asCallback(done)
      })

      it('should call all the functions in the order', function (done) {
        DockerComposeClusterService.create(sessionUser, triggeredAction, repoName, branchName, dockerComposeFilePath, newInstanceName)
        .tap(function () {
          sinon.assert.callOrder(
            GitHub.prototype.getRepoContentAsync,
            octobear.parse,
            DockerComposeCluster.createAsync,
            rabbitMQ.clusterCreated)
        })
        .asCallback(done)
      })
    })
  })
  describe('delete', function () {
    const clusterId = objectId('407f191e810c19729de860ef')
    const parentInstanceId = objectId('507f191e810c19729de860ea')
    const clusterData = {
      _id: clusterId,
      dockerComposeFilePath: '/config/compose.yml',
      parentInstanceId: parentInstanceId,
      siblingsInstanceIds: [
        objectId('607f191e810c19729de860eb'),
        objectId('707f191e810c19729de860ec')
      ]
    }
    beforeEach(function (done) {
      sinon.stub(DockerComposeCluster, 'findByIdAsync').resolves(new DockerComposeCluster(clusterData))
      sinon.stub(DockerComposeCluster, 'markAsDeleted').resolves()
      sinon.stub(rabbitMQ, 'deleteInstance').returns()
      sinon.stub(rabbitMQ, 'clusterDeleted').returns()
      done()
    })
    afterEach(function (done) {
      DockerComposeCluster.findByIdAsync.restore()
      DockerComposeCluster.markAsDeleted.restore()
      rabbitMQ.deleteInstance.restore()
      rabbitMQ.clusterDeleted.restore()
      done()
    })
    describe('errors', function () {
      it('should return error if findByIdAsync failed', function (done) {
        const error = new Error('Some error')
        DockerComposeCluster.findByIdAsync.rejects(error)
        DockerComposeClusterService.delete(clusterId.toString())
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if deleteInstance failed', function (done) {
        const error = new Error('Some error')
        rabbitMQ.deleteInstance.throws(error)
        DockerComposeClusterService.delete(clusterId.toString())
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if findActiveByParentId failed', function (done) {
        const error = new Error('Some error')
        DockerComposeCluster.markAsDeleted.rejects(error)
        DockerComposeClusterService.delete(clusterId.toString())
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })

      it('should return error if clusterDeleted failed', function (done) {
        const error = new Error('Some error')
        rabbitMQ.clusterDeleted.throws(error)
        DockerComposeClusterService.delete(clusterId.toString())
        .asCallback(function (err) {
          expect(err).to.exist()
          expect(err.message).to.equal(error.message)
          done()
        })
      })
    })
    describe('success', function () {
      it('should run successfully', function (done) {
        DockerComposeClusterService.delete(clusterId.toString()).asCallback(done)
      })

      it('should call findByIdAsync with correct args', function (done) {
        DockerComposeClusterService.delete(clusterId.toString())
        .tap(function () {
          sinon.assert.calledOnce(DockerComposeCluster.findByIdAsync)
          sinon.assert.calledWithExactly(DockerComposeCluster.findByIdAsync, clusterId.toString())
        })
        .asCallback(done)
      })

      it('should call deleteInstance with correct args', function (done) {
        DockerComposeClusterService.delete(clusterId.toString())
        .tap(function () {
          sinon.assert.calledTwice(rabbitMQ.deleteInstance)
          sinon.assert.calledWithExactly(rabbitMQ.deleteInstance, { instanceId: clusterData.siblingsInstanceIds[0] })
          sinon.assert.calledWithExactly(rabbitMQ.deleteInstance, { instanceId: clusterData.siblingsInstanceIds[1] })
        })
        .asCallback(done)
      })

      it('should call markAsDeleted with correct args', function (done) {
        DockerComposeClusterService.delete(clusterId.toString())
        .tap(function () {
          sinon.assert.calledOnce(DockerComposeCluster.markAsDeleted)
          sinon.assert.calledWithExactly(DockerComposeCluster.markAsDeleted, clusterId)
        })
        .asCallback(done)
      })

      it('should call clusterDeleted with correct args', function (done) {
        DockerComposeClusterService.delete(clusterId.toString())
        .tap(function () {
          sinon.assert.calledOnce(rabbitMQ.clusterDeleted)
          const cluster = { id: clusterId.toString() }
          sinon.assert.calledWithExactly(rabbitMQ.clusterDeleted, { cluster })
        })
        .asCallback(done)
      })

      it('should call all the functions in the order', function (done) {
        DockerComposeClusterService.delete(clusterId.toString())
        .tap(function () {
          sinon.assert.callOrder(
            DockerComposeCluster.findByIdAsync,
            rabbitMQ.deleteInstance,
            DockerComposeCluster.markAsDeleted,
            rabbitMQ.clusterDeleted)
        })
        .asCallback(done)
      })
    })
  })
})
