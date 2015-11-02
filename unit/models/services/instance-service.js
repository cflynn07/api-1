/**
 * @module unit/models/services/instance-service
 */
'use strict';

var assign = require('101/assign');
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var sinon = require('sinon');
var Boom = require('dat-middleware').Boom;
var Code = require('code');

var ContextVersion = require('models/mongo/context-version');
var Docker = require('models/apis/docker');
var dock = require('../../../test/functional/fixtures/dock');
var Hashids = require('hashids');
var InstanceService = require('models/services/instance-service');
var Instance = require('models/mongo/instance');
var Mavis = require('models/apis/mavis');
var joi = require('utils/joi');
var rabbitMQ = require('models/rabbitmq');
var validation = require('../../fixtures/validation')(lab);

var afterEach = lab.afterEach;
var after = lab.after;
var beforeEach = lab.beforeEach;
var before = lab.before;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;
var expectErr = function (expectedErr, done) {
  return function (err) {
    expect(err).to.exist();
    expect(err).to.equal(expectedErr);
    done();
  };
};

var path = require('path');
var moduleName = path.relative(process.cwd(), __filename);

var id = 0;
function getNextId () {
  id++;
  return id;
}
function getNextHash () {
  var hashids = new Hashids(process.env.HASHIDS_SALT, process.env.HASHIDS_LENGTH);
  return hashids.encrypt(getNextId());
}

function createNewVersion (opts) {
  return new ContextVersion({
    message: 'test',
    owner: { github: validation.VALID_GITHUB_ID },
    createdBy: { github: validation.VALID_GITHUB_ID },
    config: validation.VALID_OBJECT_ID,
    created: Date.now(),
    context: validation.VALID_OBJECT_ID,
    files: [{
      Key: 'test',
      ETag: 'test',
      VersionId: validation.VALID_OBJECT_ID
    }],
    build: {
      dockerImage: 'testing',
      dockerTag: 'adsgasdfgasdf'
    },
    appCodeVersions: [
      {
        additionalRepo: false,
        repo: opts.repo || 'bkendall/flaming-octo-nemisis._',
        lowerRepo: opts.repo || 'bkendall/flaming-octo-nemisis._',
        branch: opts.branch || 'master',
        defaultBranch: opts.defaultBranch || 'master',
        commit: 'deadbeef'
      },
      {
        additionalRepo: true,
        commit: '4dd22d12b4b3b846c2e2bbe454b89cb5be68f71d',
        branch: 'master',
        lowerBranch: 'master',
        repo: 'Nathan219/yash-node',
        lowerRepo: 'nathan219/yash-node',
        _id: '5575f6c43074151a000e8e27',
        privateKey: 'Nathan219/yash-node.key',
        publicKey: 'Nathan219/yash-node.key.pub',
        defaultBranch: 'master',
        transformRules: { rename: [], replace: [], exclude: [] }
      }
    ]
  });
}

function createNewInstance (name, opts) {
  // jshint maxcomplexity:10
  opts = opts || {};
  var container = {
    dockerContainer: opts.containerId || validation.VALID_OBJECT_ID,
    dockerHost: opts.dockerHost || 'http://localhost:4243',
    inspect: {
      State: {
        ExitCode: 0,
        FinishedAt: '0001-01-01T00:00:00Z',
        Paused: false,
        Pid: 889,
        Restarting: false,
        Running: true,
        StartedAt: '2014-11-25T22:29:50.23925175Z'
      },
      NetworkSettings: {
        IPAddress: opts.IPAddress || '172.17.14.2'
      }
    }
  };
  return new Instance({
    name: name || 'name',
    shortHash: getNextHash(),
    locked: opts.locked || false,
    'public': false,
    masterPod: opts.masterPod || false,
    parent: opts.parent,
    autoForked: opts.autoForked || false,
    owner: { github: validation.VALID_GITHUB_ID },
    createdBy: { github: validation.VALID_GITHUB_ID },
    build: validation.VALID_OBJECT_ID,
    created: Date.now(),
    contextVersion: createNewVersion(opts),
    container: container,
    containers: [],
    network: {
      hostIp: '1.1.1.100'
    }
  });
}
before(dock.start);
after(dock.stop);

describe('InstanceService: '+moduleName, function () {
  var ctx;
  beforeEach(function (done) {
    ctx = {};
    done();
  });

  describe('#deleteForkedInstancesByRepoAndBranch', function () {

    it('should return if instanceId param is missing', function (done) {
      var instanceService = new InstanceService();
      sinon.spy(Instance, 'findForkedInstances');
      instanceService.deleteForkedInstancesByRepoAndBranch(null, 'user-id', 'api', 'master',
        function (err) {
          expect(err).to.not.exist();
          expect(Instance.findForkedInstances.callCount).to.equal(0);
          Instance.findForkedInstances.restore();
          done();
        });
    });

    it('should return if user param is missing', function (done) {
      var instanceService = new InstanceService();
      sinon.spy(Instance, 'findForkedInstances');
      instanceService.deleteForkedInstancesByRepoAndBranch('instance-id', null, 'api', 'master',
        function (err) {
          expect(err).to.not.exist();
          expect(Instance.findForkedInstances.callCount).to.equal(0);
          Instance.findForkedInstances.restore();
          done();
        });
    });

    it('should return if repo param is missing', function (done) {
      var instanceService = new InstanceService();
      sinon.spy(Instance, 'findForkedInstances');
      instanceService.deleteForkedInstancesByRepoAndBranch('instance-id', 'user-id', null, 'master',
        function (err) {
          expect(err).to.not.exist();
          expect(Instance.findForkedInstances.callCount).to.equal(0);
          Instance.findForkedInstances.restore();
          done();
        });
    });

    it('should return if branch param is missing', function (done) {
      var instanceService = new InstanceService();
      sinon.spy(Instance, 'findForkedInstances');
      instanceService.deleteForkedInstancesByRepoAndBranch('instance-id', 'user-id', 'api', null,
        function (err) {
          expect(err).to.not.exist();
          expect(Instance.findForkedInstances.callCount).to.equal(0);
          Instance.findForkedInstances.restore();
          done();
        });
    });

    it('should return error if #findForkedInstances failed', function (done) {
      var instanceService = new InstanceService();
      sinon.stub(Instance, 'findForkedInstances')
        .yieldsAsync(new Error('Some error'));
      instanceService.deleteForkedInstancesByRepoAndBranch('instance-id', 'user-id', 'api', 'master',
        function (err) {
          expect(err).to.exist();
          expect(err.message).to.equal('Some error');
          Instance.findForkedInstances.restore();
          done();
        });
    });

    it('should not create new jobs if instances were not found', function (done) {
      var instanceService = new InstanceService();
      sinon.stub(Instance, 'findForkedInstances')
        .yieldsAsync(null, []);
      sinon.spy(rabbitMQ, 'deleteInstance');
      instanceService.deleteForkedInstancesByRepoAndBranch('instance-id', 'user-id', 'api', 'master',
        function (err) {
          expect(err).to.not.exist();
          expect(rabbitMQ.deleteInstance.callCount).to.equal(0);
          Instance.findForkedInstances.restore();
          rabbitMQ.deleteInstance.restore();
          done();
        });
    });

    it('should create 2 jobs if 3 instances were found and 1 filtered', function (done) {
      var instanceService = new InstanceService();
      sinon.stub(Instance, 'findForkedInstances')
        .yieldsAsync(null, [{_id: 'inst-1'}, {_id: 'inst-2'}, {_id: 'inst-3'}]);
      sinon.spy(rabbitMQ, 'deleteInstance');
      instanceService.deleteForkedInstancesByRepoAndBranch('inst-2', 'user-id', 'api', 'master',
        function (err) {
          expect(err).to.not.exist();
          expect(rabbitMQ.deleteInstance.callCount).to.equal(2);
          var arg1 = rabbitMQ.deleteInstance.getCall(0).args[0];
          expect(arg1.instanceId).to.equal('inst-1');
          expect(arg1.sessionUserId).to.equal('user-id');
          var arg2 = rabbitMQ.deleteInstance.getCall(1).args[0];
          expect(arg2.instanceId).to.equal('inst-3');
          expect(arg2.sessionUserId).to.equal('user-id');
          Instance.findForkedInstances.restore();
          rabbitMQ.deleteInstance.restore();
          done();
        });
    });
  });

  describe('#createContainer', function () {
    beforeEach(function (done) {
      sinon.stub(InstanceService, '_findInstanceAndContextVersion');
      sinon.stub(InstanceService, '_createDockerContainer');
      // correct opts
      ctx.opts = {
        instanceId: '123456789012345678901234',
        contextVersionId: '123456789012345678901234',
        ownerUsername: 'runnable'
      };
      done();
    });
    afterEach(function (done) {
      InstanceService._findInstanceAndContextVersion.restore();
      InstanceService._createDockerContainer.restore();
      joi.validateOrBoom.restore();
      done();
    });
    describe('success', function() {
      beforeEach(function (done) {
        ctx.mockContextVersion = {};
        ctx.mockInstance = {};
        ctx.mockContainer = {};
        ctx.mockMongoData = {
          instance: ctx.mockInstance,
          contextVersion: ctx.mockContextVersion,
        };
        sinon.stub(joi, 'validateOrBoom', function (data, schema, cb) {
          cb(null, data);
        });
        InstanceService._findInstanceAndContextVersion.yieldsAsync(null, ctx.mockMongoData);
        InstanceService._createDockerContainer.yieldsAsync(null, ctx.mockContainer);
        done();
      });

      it('should create a container', function (done) {
        InstanceService.createContainer(ctx.opts, function (err, container) {
          if (err) { return done(err); }
          // assertions
          sinon.assert.calledWith(
            joi.validateOrBoom, ctx.opts, sinon.match.object, sinon.match.func
          );
          sinon.assert.calledWith(
            InstanceService._findInstanceAndContextVersion,
            ctx.opts,
            sinon.match.func
          );
          sinon.assert.calledWith(
            InstanceService._createDockerContainer,
            ctx.opts.ownerUsername,
            ctx.mockMongoData,
            sinon.match.func
          );
          expect(container).to.equal(ctx.mockContainer);
          done();
        });
      });
    });

    describe('errors', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom');
        done();
      });

      describe('validateOrBoom error', function() {
        beforeEach(function (done) {
          sinon.stub(joi, 'validateOrBoom').yieldsAsync(ctx.err);
          done();
        });
        it('should callback the error', function (done) {
          InstanceService.createContainer(ctx.opts, expectErr(ctx.err, done));
        });
      });
      describe('_findInstanceAndContextVersion error', function() {
        beforeEach(function (done) {
          sinon.stub(joi, 'validateOrBoom', function (data, schema, cb) {
            cb(null, data);
          });
          InstanceService._findInstanceAndContextVersion.yieldsAsync(ctx.err);
          done();
        });

        it('should callback the error', function (done) {
          InstanceService.createContainer(ctx.opts, expectErr(ctx.err, done));
        });
      });
      describe('_createDockerContainer error', function() {
        beforeEach(function (done) {
          sinon.stub(joi, 'validateOrBoom', function (data, schema, cb) {
            cb(null, data);
          });
          InstanceService._findInstanceAndContextVersion.yieldsAsync(null, ctx.mockMongoData);
          InstanceService._createDockerContainer.yieldsAsync(ctx.err);
          done();
        });
        it('should callback the error', function (done) {
          InstanceService.createContainer(ctx.opts, expectErr(ctx.err, done));
        });
      });
    });
  });
  describe('#_findInstanceAndContextVersion', function () {
    beforeEach(function (done) {
      // correct opts
      ctx.opts = {
        instanceId: '123456789012345678901234',
        contextVersionId: '123456789012345678901234',
        ownerUsername: 'runnable'
      };
      // mock results
      ctx.mockContextVersion = {
        _id: ctx.opts.contextVersionId
      };
      ctx.mockInstance = {
        contextVersion: {
          _id: ctx.opts.contextVersionId
        }
      };
      sinon.stub(ContextVersion, 'findById');
      sinon.stub(Instance, 'findById');
      done();
    });
    afterEach(function (done) {
      ContextVersion.findById.restore();
      Instance.findById.restore();
      done();
    });

    describe('success', function () {
      beforeEach(function (done) {
        ContextVersion.findById.yieldsAsync(null, ctx.mockContextVersion);
        Instance.findById.yieldsAsync(null, ctx.mockInstance);
        done();
      });

      it('should find instance and contextVersion', function (done) {
        InstanceService._findInstanceAndContextVersion(ctx.opts, function (err, data) {
          if (err) { return done(err); }
          sinon.assert.calledWith(ContextVersion.findById, ctx.opts.contextVersionId, sinon.match.func);
          sinon.assert.calledWith(Instance.findById, ctx.opts.instanceId, sinon.match.func);
          expect(data).to.deep.equal({
            contextVersion: ctx.mockContextVersion,
            instance: ctx.mockInstance
          });
          done();
        });
      });
    });
    describe('errors', function () {
      describe('Instance not found', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom');
          ContextVersion.findById.yieldsAsync(null, ctx.mockInstance);
          Instance.findById.yieldsAsync();
          done();
        });

        it('should callback 404 error', function(done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, function (err) {
            expect(err).to.exist();
            expect(err.isBoom).to.be.true();
            expect(err.output.statusCode).to.equal(404);
            expect(err.message).to.match(/Instance/i);
            done();
          });
        });
      });

      describe('ContextVersion not found', function () {
        beforeEach(function (done) {
          ctx.err = new Error('boom');
          ContextVersion.findById.yieldsAsync();
          Instance.findById.yieldsAsync(null, ctx.mockInstance);
          done();
        });

        it('should callback 404 error', function(done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, function (err) {
            expect(err).to.exist();
            expect(err.isBoom).to.be.true();
            expect(err.output.statusCode).to.equal(404);
            expect(err.message).to.match(/ContextVersion/i);
            done();
          });
        });
      });

      describe('Instance contextVersion changed', function () {
        beforeEach(function (done) {
          ctx.mockInstance.contextVersion._id = '000011112222333344445555';
          ContextVersion.findById.yieldsAsync(null, ctx.mockContextVersion);
          Instance.findById.yieldsAsync(null, ctx.mockInstance);
          done();
        });
        it('should callback 409 error', function(done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, function (err) {
            expect(err).to.exist();
            expect(err.isBoom).to.be.true();
            expect(err.output.statusCode).to.equal(409);
            expect(err.message).to.match(/Instance.*contextVersion/i);
            done();
          });
        });
      });

      describe('ContextVersion.findById error', function() {
        beforeEach(function (done) {
          ctx.err = new Error('boom');
          ContextVersion.findById.yieldsAsync(ctx.err);
          Instance.findById.yieldsAsync(null, ctx.mockInstance);
          done();
        });

        it('should callback the error', function (done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, expectErr(ctx.err, done));
        });
      });

      describe('Instance.findById error', function() {
        beforeEach(function (done) {
          ctx.err = new Error('boom');
          ContextVersion.findById.yieldsAsync(ctx.err);
          Instance.findById.yieldsAsync(null, ctx.mockInstance);
          done();
        });

        it('should callback the error', function (done) {
          InstanceService._findInstanceAndContextVersion(ctx.opts, expectErr(ctx.err, done));
        });
      });
    });
  });
  describe('#_createDockerContainer', function () {
    beforeEach(function (done) {
      // correct opts
      ctx.ownerUsername = 'runnable';
      ctx.mongoData = {
        contextVersion: { _id: '123456789012345678901234' },
        instance: {}
      };
      // results
      ctx.mockContainer = {};
      sinon.stub(Mavis.prototype, 'findDockForContainer');
      sinon.stub(Docker.prototype, 'createUserContainer');
      done();
    });
    afterEach(function (done) {
      Mavis.prototype.findDockForContainer.restore();
      Docker.prototype.createUserContainer.restore();
      done();
    });

    describe('success', function() {
      beforeEach(function (done) {
        Mavis.prototype.findDockForContainer.yieldsAsync(null, 'http://10.0.1.10:4242');
        Docker.prototype.createUserContainer.yieldsAsync(null, ctx.mockContainer);
        done();
      });

      it('should create a docker container', function (done) {
        InstanceService._createDockerContainer(ctx.ownerUsername, ctx.mongoData, function (err, container) {
          if (err) { return done(err); }
          sinon.assert.calledWith(
            Mavis.prototype.findDockForContainer,
            ctx.mongoData.contextVersion, sinon.match.func
          );
          // note: do not use any 101 util that clones mongoData, it will error
          var createOpts = assign({
            ownerUsername: ctx.ownerUsername
          }, ctx.mongoData);
          sinon.assert.calledWith(
            Docker.prototype.createUserContainer, createOpts, sinon.match.func
          );
          expect(container).to.equal(ctx.mockContainer);
          done();
        });
      });
    });

    describe('error', function () {
      beforeEach(function (done) {
        ctx.err = new Error('boom');
        done();
      });

      describe('mavis error', function() {
        beforeEach(function (done) {
          Mavis.prototype.findDockForContainer.yieldsAsync(ctx.err);
          Docker.prototype.createUserContainer.yieldsAsync(null, ctx.mockContainer);
          done();
        });

        it('should callback the error', function (done) {
          InstanceService._createDockerContainer(ctx.ownerUsername, ctx.mongoData, expectErr(ctx.err, done));
        });
      });

      describe('docker error', function() {
        beforeEach(function (done) {
          Mavis.prototype.findDockForContainer.yieldsAsync(null, 'http://10.0.1.10:4242');
          Docker.prototype.createUserContainer.yieldsAsync(ctx.err, ctx.mockContainer);
          done();
        });

        it('should callback the error', function (done) {
          InstanceService._createDockerContainer(ctx.ownerUsername, ctx.mongoData, expectErr(ctx.err, done));
        });
      });

      describe('4XX err', function() {
        beforeEach(function (done) {
          ctx.err = Boom.notFound('Image not found');
          ctx.mongoData.instance = new Instance();
          Mavis.prototype.findDockForContainer.yieldsAsync(null, 'http://10.0.1.10:4242');
          Docker.prototype.createUserContainer.yieldsAsync(ctx.err, ctx.mockContainer);
          done();
        });
        afterEach(function (done) {
          Instance.prototype.modifyContainerCreateErr.restore();
          done();
        });

        describe('modifyContainerCreateErr success', function() {
          beforeEach(function (done) {
            sinon.stub(Instance.prototype, 'modifyContainerCreateErr').yieldsAsync();
            done();
          });

          it('should callback the error', function (done) {
            InstanceService._createDockerContainer(ctx.ownerUsername, ctx.mongoData, function (err) {
              expect(err).to.equal(ctx.err);
              sinon.assert.calledWith(
                Instance.prototype.modifyContainerCreateErr,
                ctx.mongoData.contextVersion._id,
                ctx.err,
                sinon.match.func
              );
              InstanceService._createDockerContainer(ctx.ownerUsername, ctx.mongoData, expectErr(ctx.err, done));
            });
          });
        });

        describe('modifyContainerCreateErr success', function() {
          beforeEach(function (done) {
            ctx.dbErr = new Error('boom');
            sinon.stub(Instance.prototype, 'modifyContainerCreateErr').yieldsAsync(ctx.dbErr);
            done();
          });

          it('should callback the error', function (done) {
            InstanceService._createDockerContainer(ctx.ownerUsername, ctx.mongoData, function (err) {
              expect(err).to.equal(ctx.dbErr);
              sinon.assert.calledWith(
                Instance.prototype.modifyContainerCreateErr,
                ctx.mongoData.contextVersion._id,
                ctx.err,
                sinon.match.func
              );
              InstanceService._createDockerContainer(ctx.ownerUsername, ctx.mongoData, expectErr(ctx.dbErr, done));
            });
          });
        });
      });
    });
  });

  describe('modifyContainerIp', function () {
    describe('with db calls', function () {
      var ctx = {};

      beforeEach(function (done) {
        var instance = createNewInstance('testy', {});
        ctx.containerId = instance.container.dockerContainer;
        sinon.spy(instance, 'invalidateContainerDNS');
        expect(instance.network.hostIp).to.equal('1.1.1.100');
        instance.save(function (err, instance) {
          if (err) { return done(err); }
          ctx.instance  = instance;
          done();
        });
      });
      afterEach(function (done) {
        // cache invalidation should be always called
        expect(ctx.instance.invalidateContainerDNS.calledOnce).to.be.true();
        done();
      });
      it('should return modified instance from database', function (done) {
        var instanceService = new InstanceService();
        instanceService.modifyContainerIp(ctx.instance, ctx.containerId, '127.0.0.2', function (err, updated) {
          expect(err).to.not.exist();
          expect(updated._id.toString()).to.equal(ctx.instance._id.toString());
          expect(updated.network.hostIp).to.equal('127.0.0.2');
          done();
        });
      });
    });
    describe('without db calls', function () {
      var ctx = {};

      beforeEach(function (done) {
        ctx.instance = createNewInstance('testy', {});
        ctx.containerId = ctx.instance.container.dockerContainer;
        sinon.spy(ctx.instance, 'invalidateContainerDNS');
        done();
      });

      afterEach(function (done) {
        // cache invalidation should be always called
        expect(ctx.instance.invalidateContainerDNS.calledOnce).to.be.true();
        expect(Instance.findOneAndUpdate.calledOnce).to.be.true();
        var query = Instance.findOneAndUpdate.getCall(0).args[0];
        var setQuery = Instance.findOneAndUpdate.getCall(0).args[1];
        expect(query._id).to.equal(ctx.instance._id);
        expect(query['container.dockerContainer']).to.equal(ctx.containerId);
        expect(setQuery.$set['network.hostIp']).to.equal('127.0.0.1');
        expect(Object.keys(setQuery.$set).length).to.equal(1);
        ctx.instance.invalidateContainerDNS.restore();
        Instance.findOneAndUpdate.restore();
        done();
      });

      it('should return an error if findOneAndUpdate failed', function (done) {
        var instanceService = new InstanceService();
        var mongoErr = new Error('Mongo error');
        sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(mongoErr);
        instanceService.modifyContainerIp(ctx.instance, ctx.containerId, '127.0.0.1', function (err) {
          expect(err.message).to.equal('Mongo error');
          done();
        });
      });
      it('should return an error if findOneAndUpdate returned nothing', function (done) {
        var instanceService = new InstanceService();
        sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, null);
        instanceService.modifyContainerIp(ctx.instance, ctx.containerId, '127.0.0.1', function (err) {
          expect(err.output.statusCode).to.equal(409);
          var errMsg = 'Container IP was not updated, instance\'s container has changed';
          expect(err.output.payload.message).to.equal(errMsg);
          done();
        });
      });
      it('should return modified instance', function (done) {
        var instanceService = new InstanceService();
        var instance = new Instance({_id: ctx.instance._id, name: 'updated-instance'});
        sinon.stub(Instance, 'findOneAndUpdate').yieldsAsync(null, instance);
        instanceService.modifyContainerIp(ctx.instance, ctx.containerId, '127.0.0.1', function (err, updated) {
          expect(err).to.not.exist();
          expect(updated._id).to.equal(ctx.instance._id);
          expect(updated.name).to.equal(instance.name);
          done();
        });
      });
    });
  });
});
