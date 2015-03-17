'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var after = lab.after;
var Code = require('code');
var expect = Code.expect;

var redis = require('models/redis');
var activeApi = require('models/redis/active-api');

require('loadenv')();

describe('Active API', function () {
  var ctx = {};
  describe('isMe', function () {
    before(function (done) {
      redis.flushdb(done);
    });
    after(function (done) {
      redis.flushdb(done);
    });

    it('should return false if setAsMe was never called', function (done) {
      activeApi.isMe(function (err, isActive) {
        if (err) { return done(err); }
        expect(isActive).to.equal(false);
        done();
      });
    });

  });

  describe('setAsMe', function () {
    before(function (done) {
      redis.flushdb(done);
    });
    after(function (done) {
      redis.flushdb(done);
    });

    before(function (done) {
      ctx.originUUID = process.env.UUID;
      done();
    });

    after(function (done) {
      process.env.UUID = ctx.originUUID;
      done();
    });


    it('should return success if key was set', function (done) {
      activeApi.setAsMe(function (err, isSet) {
        if (err) { return done(err); }
        expect(isSet).to.equal(true);
        done();
      });
    });

    it('should return isMe as true', function (done) {
      activeApi.isMe(function (err, isActive) {
        if (err) { return done(err); }
        expect(isActive).to.equal(true);
        done();
      });
    });

    it('should throw an error if process.env.UUID is null', function (done) {
      process.env.UUID = null;
      try {
        activeApi.setAsMe(function (err, isSet) {
          if (err) { return done(err); }
          expect(isSet).to.equal(true);
        });
      }
      catch (err) {
        expect(err.message).to.equal('ActiveApi has not been set with a uuid.');
        done();
      }
    });

  });

});
