var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var api = require('../fixtures/api-control');
var dock = require('../fixtures/dock');
var multi = require('../fixtures/multi-factory');
var primus = require('../fixtures/primus');

describe('Instance - /instances/:id/masterPod', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  beforeEach(primus.connect);
  afterEach(primus.disconnect);
  after(dock.stop.bind(ctx));
  afterEach(require('../fixtures/clean-mongo').removeEverything);
  afterEach(require('../fixtures/clean-ctx')(ctx));
  afterEach(require('../fixtures/clean-nock'));

  beforeEach(function (done) {
    ctx.orgId = 1001;
    multi.createInstance(ctx.orgId, function (err, instance) {
      if (err) { return done(err); }
      ctx.instance = instance;
      done();
    });
  });

  describe('get master pod', function () {
    it('should get us the default (false) value', function (done) {
      ctx.instance.isInMasterPod(function (err, isMaster) {
        expect(isMaster).to.equal(false);
        done();
      });
    });
  });

  describe('set master pod', function () {
    it('should update the value', function (done) {
      ctx.instance.setInMasterPod({ masterPod: true }, function (err) {
        expect(err).to.be.null();
        ctx.instance.isInMasterPod(function (err, isMaster) {
          expect(err).to.be.null();
          expect(isMaster).to.equal(true);
          done();
        });
      });
    });
  });

  describe('remove from master pod', function () {
    beforeEach(function (done) {
      ctx.instance.setInMasterPod({ masterPod: true }, done);
    });

    it('should remove the instance from master pod', function (done) {
      ctx.instance.removeFromMasterPod(function (err) {
        expect(err).to.be.null();
        ctx.instance.isInMasterPod(function (err, isMaster) {
          expect(err).to.be.null();
          expect(isMaster).to.equal(false);
          done();
        });
      });
    });
  });

});
