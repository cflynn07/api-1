var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var redis = require('models/redis');

var async = require('async');
var Docklet = require('../lib/models/apis/docklet.js');

describe('Docklet', function () {
  beforeEach(function (done) {
    this.docklet = new Docklet();
    done();
  });
  afterEach(function (done) {
    delete this.docklet;
    async.series([
      redis.del.bind(redis, 'docks:active'),
      redis.del.bind(redis, 'docks:10.0.1.20'),
      redis.del.bind(redis, 'docks:10.0.1.21'),
      redis.del.bind(redis, 'docks:10.0.1.22'),
    ], done);
  });

  it('should find inserted dock from redis', function (done) {
    redis.lpush('docks:active', '10.0.1.20', function(err) {
      if (err) {
        return done(err);
      }
      this.docklet.findDock(function(err, dockerHost) {
        expect(dockerHost).to.equal('10.0.1.20');
        done();
      });
    });
  });

  it('should error if no dock', function (done) {
    this.docklet.findDock(function(err) {
      expect(err.message).to.equal('no active docks in redis');
      done();
    });
  });

  it('should return same IP for same dock instance', function (done) {
    async.series([
      redis.lpush.bind(redis, 'docks:active', '10.0.1.21'),
      redis.lpush.bind(redis, 'docks:active', '10.0.1.22'),
    ], function (err) {
      if (err) { return done(err); }
      this.docklet.findDock(function(err, dockerHost) {
        if (err) {
          return done(err);
        }
        expect(dockerHost).to.equal('10.0.1.22');
        this.docklet.findDock(function(err, dockerHost) {
          if (err) {
            return done(err);
          }
          expect(dockerHost).to.equal('10.0.1.22');
          done();
        });
      });
    });
  });

  it('should rotate to a new box when it becomes full', function (done) {
    async.series([
      redis.lpush.bind(redis, 'docks:active', '10.0.1.21'),
      redis.lpush.bind(redis, 'docks:active', '10.0.1.22'),
      redis.set.bind(redis, 'docks:10.0.1.22', '101')
    ], function (err) {
      if (err) { return done(err); }
      this.docklet.findDock(function(err, dockerHost) {
        if (err) {
          return done(err);
        }
        expect(dockerHost).to.equal('10.0.1.22');
        var tmpDock = new Docklet();
        tmpDock.findDock(function(err, dockerHost) {
          if (err) {
            return done(err);
          }
          tmpDock = new Docklet();
          expect(dockerHost).to.equal('10.0.1.21');
          tmpDock.findDock(function(err, dockerHost) {
            if (err) {
              return done(err);
            }
            expect(dockerHost).to.equal('10.0.1.21');
            done();
          });
        });
      });
    });
  });
});
