'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var schemaValidators = require('models/mongo/schemas/schema-validators')
var ContextVersion = require('models/mongo/context-version')
var validation = require('../../../fixtures/validation')(lab)
var Version = require('models/mongo/context-version')

var mongooseControl = require('models/mongo/mongoose-control.js')

describe('CV Schema Integration Tests', function () {
  before(mongooseControl.start)

  afterEach(function (done) {
    ContextVersion.remove({}, done)
  })

  after(function (done) {
    ContextVersion.remove({}, done)
  })
  after(mongooseControl.stop)

  function createNewVersion (acv) {
    acv = acv || {}
    return new Version({
      message: 'test',
      createdBy: { github: validation.VALID_GITHUB_ID },
      owner: { github: validation.VALID_GITHUB_ID },
      config: validation.VALID_OBJECT_ID,
      created: Date.now(),
      context: validation.VALID_OBJECT_ID,
      files: [{
        Key: 'test',
        ETag: 'test',
        VersionId: validation.VALID_OBJECT_ID
      }],
      build: {
        dockerTag: 'adsgasdfgasdf'
      },
      appCodeVersions: [{
        repo: acv.repo || 'bkendall/flaming-octo-nemisis._',
        lowerRepo: acv.lowerRepo || 'bkendall/flaming-octo-nemisis._',
        branch: 'master',
        commit: 'deadbeef'
      }]
    })
  }

  it('should be able to save a version!', function (done) {
    var version = createNewVersion()
    version.save(function (err, version) {
      if (err) { return done(err) }
      expect(version).to.exist()
      done()
    })
  })

  describe('InfaCodeVersion Id Validation', function () {
    validation.objectIdValidationChecking(createNewVersion, 'infraCodeVersion')
  })

  describe('Docker Host Validation', function () {
    validation.urlValidationChecking(createNewVersion, 'dockerHost',
      schemaValidators.validationMessages.dockerHost)
  })

  describe('Github Created By Validation', function () {
    validation.githubUserRefValidationChecking(createNewVersion, 'createdBy.github')
    validation.requiredValidationChecking(createNewVersion, 'createdBy')
  })

  describe('Context Id Validation', function () {
    validation.objectIdValidationChecking(createNewVersion, 'context')
    validation.requiredValidationChecking(createNewVersion, 'context')
  })

  describe('Build Validation', function () {
    describe('Message', function () {
      validation.stringLengthValidationChecking(function () {
        var newVersion = createNewVersion()
        newVersion.build.triggeredAction = {
          manual: true
        }
        newVersion.build.triggeredBy = { github: validation.VALID_GITHUB_ID }
        return newVersion
      }, 'build.message', 1000)
    })
    describe('Docker Tag', function () {
      validation.stringLengthValidationChecking(createNewVersion, 'build.dockerTag', 1000)
    })
    describe('Triggering Validation', function () {
      describe('Triggered Action', function () {
        it('should fail when triggeredAction is manual, but triggeredBy is null', function (done) {
          var version = createNewVersion()
          version.build.message = 'hello!'
          version.build.triggeredAction = {
            manual: true
          }
          version.save(function (err, model) {
            expect(model).to.not.exist()
            expect(err).to.exist()
            done()
          })
        })
        it('should fail when triggeredAction is rebuild, but triggeredBy is null', function (done) {
          var version = createNewVersion()
          version.build.message = 'hello!'
          version.build.triggeredAction = {
            rebuild: true
          }
          version.save(function (err, model) {
            expect(model).to.not.exist()
            expect(err).to.exist()
            done()
          })
        })
        it('should pass when triggeredAction is manual, and triggeredBy is filled', function (done) {
          var version = createNewVersion()
          version.build.message = 'hello!'
          version.build.triggeredAction = {
            rebuild: true
          }
          version.build.triggeredBy = { github: validation.VALID_GITHUB_ID }
          version.save(function (err, model) {
            expect(model).to.exist()
            expect(err).to.not.exist()
            done(err)
          })
        })
        it('should fail when triggeredAction is empty, but triggeredBy is filled', function (done) {
          var version = createNewVersion()
          version.build.message = 'hello!'
          version.build.triggeredBy = { github: validation.VALID_GITHUB_ID }
          version.save(function (err, model) {
            expect(model).to.not.exist()
            expect(err).to.exist()
            done()
          })
        })
      })
    })
  })

  describe('AppCode Validation', function () {
    describe('Repo', function () {
      validation.requiredValidationChecking(createNewVersion, 'appCodeVersions.0.repo')
    })
    describe('Lower Repo', function () {
      validation.requiredValidationChecking(createNewVersion, 'appCodeVersions.0.lowerRepo')
    })
    describe('Branch', function () {
      validation.requiredValidationChecking(createNewVersion, 'appCodeVersions.0.branch')
      validation.stringLengthValidationChecking(createNewVersion, 'appCodeVersions.0.branch', 200)
    })
  })
})
