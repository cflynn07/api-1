var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;
var createCount = require('callback-count');
var redisCleaner = require('../test/fixtures/redis-cleaner');
var RedisMutex = require('models/redis/mutex');


describe('RedisMutex', function () {
  before(redisCleaner.clean('*'));
  after(redisCleaner.clean('*'));

  var ctx = {};

  describe('lock', function () {

    it('should lock', function (done) {
      var mutex = new RedisMutex('key-1');
      mutex.lock(function (err, success) {
        if (err) { return done(err); }
        expect(success).to.equal(true);
        done();
      });
    });

    it('should fail to lock with the same key', function (done) {
      var mutex = new RedisMutex('key-1');
      mutex.lock(function (err, success) {
        if (err) { return done(err); }
        expect(success).to.equal(false);
        done();
      });
    });

    describe('unlock', function () {

      it('should be able to lock after unlock', function (done) {
        var mutex = new RedisMutex('key-1');
        mutex.unlock(function (err, success) {
          if (err) { return done(err); }
          expect(success).to.equal('1');
          mutex.lock(function (err, success) {
            if (err) { return done(err); }
            expect(success).to.equal(true);
            done();
          });
        });
      });

    });


    describe('ttl', function () {
      before(function (done) {
        ctx.originREDIS_LOCK_EXPIRES = process.env.REDIS_LOCK_EXPIRES;
        done();
      });
      after(function (done) {
        process.env.REDIS_LOCK_EXPIRES = ctx.originREDIS_LOCK_EXPIRES;
        done();
      });

      it('should release lock after expiration time', function (done) {
        var count = createCount(2, done);
        process.env.REDIS_LOCK_EXPIRES = 200;
        var mutex1 = new RedisMutex('new-key-1');
        var mutex2 = new RedisMutex('new-key-1');
        setTimeout(function () {
          mutex2.lock(function (err, success) {
            if (err) { return done(err); }
            expect(success).to.equal(true);
            count.next();
          });
        }, 200);
        mutex1.lock(function (err, success) {
          if (err) { return done(err); }
          expect(success).to.equal(true);
          mutex2.lock(function (err, success) {
            if (err) { return done(err); }
            expect(success).to.equal(false);
            count.next();
          });
        });
      });
    });

  });


});
