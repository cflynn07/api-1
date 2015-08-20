/**
 * @module unit/workers/on-instance-container-create
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var async = require('async');
var noop = require('101/noop');
var sinon = require('sinon');

var Instance = require('models/mongo/instance');

var OnInstanceContainerCreateWorker = require('workers/on-instance-container-create');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

describe('OnInstanceContainerCreateWorker', function () {
  var ctx;

  beforeEach(function (done) {
    ctx = {};
    ctx.mockInstance = {
      _id: 555,
      toJSON: function () { return {}; }
    };
    ctx.data = {
      id: 111,
      host: '10.0.0.1',
      inspectData: {
        NetworkSettings: {
          Ports: []
        },
        Config: {
          Labels: {
            instanceId: ctx.mockInstance._id,
            contextVersionId: 123
          }
        }
      }
    };
    sinon.stub(async, 'series', noop);
    ctx.worker = new OnInstanceContainerCreateWorker();
    ctx.worker.handle(ctx.data);
    done();
  });

  afterEach(function (done) {
    async.series.restore();
    done();
  });

  describe('_updateInstance', function () {

    beforeEach(function (done) {
      sinon.stub(Instance, 'findOneAndUpdate', function (query, opts, cb) {
        cb(null, ctx.mockInstance);
      });
      done();
    });

    afterEach(function (done) {
      Instance.findOneAndUpdate.restore();
      done();
    });

    it('should find and update instance with container', function (done) {
      ctx.worker._updateInstance(function () {
        expect(Instance.findOneAndUpdate.callCount).to.equal(1);
        expect(Instance.findOneAndUpdate.args[0][0]).to.only.contain({
          _id: ctx.mockInstance._id,
          'contextVersion.id': ctx.data.inspectData.Config.Labels.contextVersionId
        });
        done();
      });
    });
  });

  describe('_startContainer', function () {
  });

});
