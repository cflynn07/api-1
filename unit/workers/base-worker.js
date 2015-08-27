/**
 * @module unit/workers/base-worker
 */
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();

var Code = require('code');
var noop = require('101/noop');
var sinon = require('sinon');

var BaseWorker = require('workers/base-worker');
var messenger = require('socket/messenger');

var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

describe('BaseWorker', function () {
  var ctx;

  beforeEach(function (done) {
    ctx = {};
    ctx.data = {
      from: '34565762',
      host: '5476',
      id: '3225',
      time: '234234',
      uuid: '12343'
    };
    ctx.mockContextVersion = {
      toJSON: noop
    };
    ctx.worker = new BaseWorker(ctx.data);
    done();
  });

  afterEach(function (done) {
    done();
  });

  describe('_updateFrontendWithContextVersion', function () {
    beforeEach(function (done) {
      ctx.worker.contextVersion = ctx.mockContextVersion;
      sinon.stub(messenger, 'emitContextVersionUpdate');
      done();
    });
    afterEach(function (done) {
      messenger.emitContextVersionUpdate.restore();
      ctx.worker._findContextVersion.restore();
      done();
    });
    describe('basic', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker, '_findContextVersion').yieldsAsync(null, ctx.mockContextVersion);
        done();
      });

      it('should fetch the contextVersion and emit the update', function (done) {
        ctx.worker._updateFrontendWithContextVersion('build_running', function (err) {
          expect(err).to.be.null();
          expect(ctx.worker._findContextVersion.callCount).to.equal(1);
          expect(ctx.worker._findContextVersion.args[0][0]).to.deep.equal({
            '_id': ctx.mockContextVersion._id
          });
          expect(ctx.worker._findContextVersion.args[0][1]).to.be.a.function();
          expect(
            messenger.emitContextVersionUpdate.callCount,
            'emitContextVersionUpdate'
          ).to.equal(1);
          expect(
            messenger.emitContextVersionUpdate.args[0][0],
            'emitContextVersionUpdate arg0'
          ).to.equal(ctx.mockContextVersion);
          expect(
            messenger.emitContextVersionUpdate.args[0][1],
            'emitContextVersionUpdate arg0'
          ).to.equal('build_running');
          done();
        });
      });
    });
    describe('failure', function () {
      beforeEach(function (done) {
        sinon.stub(ctx.worker, '_findContextVersion').yieldsAsync(new Error('error'));
        done();
      });
      it('should fail with an invalid event message', function (done) {
        ctx.worker._updateFrontendWithContextVersion('dsfasdfasdfgasdf', function (err) {
          expect(err.message).to.equal('Attempted status update contained invalid event');
          done();
        });
      });
      it('should fetch the contextVersion and emit the update', function (done) {
        ctx.worker._updateFrontendWithContextVersion('build_running', function (err) {
          expect(
            messenger.emitContextVersionUpdate.callCount,
            'emitContextVersionUpdate'
          ).to.equal(0);
          expect(err.message).to.equal('error');
          done();
        });
      });
    });
  });

  describe('_validateDieData', function () {
    beforeEach(function (done) {
      done();
    });
    afterEach(function (done) {
      done();
    });
    it('should call back with error if event '+
       'data does not contain required keys', function (done) {
      delete ctx.worker.data.uuid;
      ctx.worker._validateDieData(function (err) {
        expect(err.message).to.equal('_validateDieData: die event data missing key: uuid');
        done();
      });
    });

    it('should call back without error if '+
       'event data contains all required keys', function (done) {
      ctx.worker._validateDieData(function (err) {
        expect(err).to.be.undefined();
        done();
      });
    });
  });
});