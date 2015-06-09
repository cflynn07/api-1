/**
 * Tests for POST /workers/container-create
 * - Internal route
 * @module test/workers/container-create/post/201
 */
'use strict';

var Code = require('code');
var EventEmitter = require('events').EventEmitter;
var Lab = require('lab');
var async = require('async');
var createCount = require('callback-count');
var emitter = new EventEmitter();
var keypath = require('keypather')();
var sinon = require('sinon');

var Instance = require('models/mongo/instance');
var api = require('../../../fixtures/api-control');
var dock = require('../../../fixtures/dock');
var multi = require('../../../fixtures/multi-factory');
var primus = require('../../../fixtures/primus');

var lab = exports.lab = Lab.script();

var after = lab.after;
var afterEach = lab.afterEach;
var before = lab.before;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;
var containerCreate = require('workers/container-create');

var ctx = {};
var originalContainCreateWorker;

describe('201 POST /workers/container-create', function () {
  // before
  before(function (done) {
    // unsubscribe rabbitmq event
    sinon.stub(containerCreate, 'worker', function (data, ack) {
      emitter.emit('container-create', data);
      ack();
    });
    done();
  });

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  before(require('../../../fixtures/mocks/api-client').setup);
  beforeEach(primus.connect);
  // after
  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  after(require('../../../fixtures/mocks/api-client').clean);
  after(require('../../../fixtures/clean-mongo').removeEverything);
  afterEach(require('../../../fixtures/clean-nock'));
  after(function (done) {
    containerCreate.worker.restore();
    done();
  });

  beforeEach(function (done) {
    var count = createCount(2, done);
    emitter.on('container-create', function (data) {
      var labels = keypath.get(data, 'inspectData.Config.Labels');
      if (labels.type === 'user-container') {
        ctx.jobData = data;
        count.next();
        console.log('p2');
        emitter.removeAllListeners('container-create');
      }
    });
    multi.createInstance(function (err, instance, build, user) {
      if (err) { return done(err); }
      ctx.instance = instance;
      ctx.user = user;
      console.log('p1');
      count.next();
    });
  });

  beforeEach(function(done){
    primus.joinOrgRoom(ctx.user.json().accounts.github.id, done);
  });
  it('should update instance with container information', {timeout: 10000}, function (done) {
    // this is essentially all the worker callback does, invoke this method
    // containerInspect is sample data collected from actual docker-listener created job
    async.series([
      function (cb) {
        //assert instance has no container
        Instance.findById(ctx.instance.attrs._id, function (err, instance) {
          expect(instance.container).to.be.undefined();
          cb();
        });
      },
      function (cb) {
        var count = createCount(cb);
        primus.expectAction('start', {}, count.inc().next);
        originalContainCreateWorker(ctx.jobData, count.inc().next);
      },
      function (cb) {
        //assert instance has no container
        Instance.findById(ctx.instance.attrs._id, function (err, instance) {
          console.log('final fetch instance', instance.container);
          expect(instance.container).to.be.an.object();
          expect(instance.container.inspect).to.be.an.object();
          expect(instance.container.dockerContainer).to.be.a.string();
          expect(instance.container.dockerHost).to.be.a.string();
          cb();
        });
      }
    ], done);
  });
});