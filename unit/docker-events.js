'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var after = Lab.after;
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var pubsub = require('models/redis/pubsub');
var error = require('error');
var dockerEvents = require('models/events/docker');
var events = require('models/events/index');
var expect = Lab.expect;
var redisCleaner = require('../test/fixtures/redis-cleaner');
var createCount = require('callback-count');
var uuid = require('uuid');
var activeApi = require('models/redis/active-api');

require('loadenv')();

describe('Docker Events', function () {
  var ctx = {};

  describe('handleDie', function () {
    before(redisCleaner.clean('*'));
    after(redisCleaner.clean('*'));
    afterEach(function (done) {
      dockerEvents.close(done);
    });

    beforeEach(function (done) {
      ctx.origErrorLog = error.log;
      done();
    });

    afterEach(function (done) {
      error.log = ctx.origErrorLog;
      done();
    });

    it('should fail if event data has no uuid', function (done) {
      error.log = function (err) {
        expect(err.output.payload.message).to.equal('Invalid data: uuid is missing');
        done();
      };
      dockerEvents.handleDie({host: 'http://localhost:4243'});
    });

    it('should fail if event data has no id', function (done) {
      error.log = function (err) {
        expect(err.output.payload.message).to.equal('Invalid data: container id is missing');
        done();
      };
      dockerEvents.handleDie({uuid: 'some-uuid'});
    });

    it('should fail if event data has no time', function (done) {
      error.log = function (err) {
        expect(err.output.payload.message).to.equal('Invalid data: time is missing');
        done();
      };
      dockerEvents.handleDie({uuid: 'some-uuid', id: 'some-id'});
    });

    it('should fail if event data has no host', function (done) {
      error.log = function (err) {
        expect(err.output.payload.message).to.equal('Invalid data: host is missing');
        done();
      };
      dockerEvents.handleDie({uuid: 'some-uuid', id: 'some-id', time: new Date().getTime() });
    });

  });


  describe('listen', function () {
    before(redisCleaner.clean('*'));
    after(redisCleaner.clean('*'));
    afterEach(events.close.bind(events));

    it('should start listening and callback', function (done) {
      events.listen(done);
    });
    describe('listen twice', function () {
      it('should callback an error', function (done) {
        var count = createCount(2, function (err) {
          expect(err.output.statusCode).to.equal(409);
          expect(err.output.payload.message).to.equal('Events were already started');
          done();
        });
        events.listen(count.next);
        events.listen(count.next);
      });
    });

    describe('listen, close, listen', function () {
      it('should start listening ok', function (done) {
        var count = createCount(3, done);
        events.listen(count.next);
        events.close(count.next);
        events.listen(count.next);
      });
    });

    describe('closing', function () {
      afterEach(function (done) {
        dockerEvents.eventLockCount = 0;
        dockerEvents.close(done);
      });

      it('should throw an error if close in progress', function (done) {
        var count = createCount(1, function (err) {
          if (err) { return done(err); }
          expect(dockerEvents.eventLockCount).to.equal(0);
          done();
        });
        dockerEvents.eventLockCount = 1;
        dockerEvents.close();
        dockerEvents.listen(function (err) {
          expect(err.output.statusCode).to.equal(409);
          expect(err.output.payload.message).to.equal('closing events listener is in progress');
          done();
        });
        dockerEvents.decLockCount();
      });
    });

  });

  describe('event lock', function () {
    before(redisCleaner.clean('*'));
    after(redisCleaner.clean('*'));
    before(function (done) {
      ctx.origHandleDieGetEventLock = dockerEvents.getEventLock;
      done();
    });
    beforeEach(function (done) {
      activeApi.setAsMe(done);
    });
    after(function (done) {
      dockerEvents.getEventLock = ctx.origHandleDieGetEventLock;
      dockerEvents.close(done);
    });
    it('should not be possible to process event with the same uuid twice', function (done) {
      var count = createCount(3, done);
      var counter = 0;
      dockerEvents.getEventLock = function (eventId, cb) {
        ctx.origHandleDieGetEventLock.bind(dockerEvents)(eventId, function (err, mutex) {
          if (counter === 0) {
            expect(mutex.unlock).to.exist();
          }
          if (counter === 1) {
            expect(err.output.statusCode).to.equal(409);
            expect(err.output.payload.message).to.equal('Event is being handled by another API host.');
          }
          counter++;

          cb(err, mutex);
          count.next();
        });
      };
      dockerEvents.listen(function () {
        var payload = {
          uuid: uuid(),
          id: 'some-id',
          time: new Date().getTime(),
          host: 'http://localhost:4243'
        };
        dockerEvents.handleDie(payload);
        dockerEvents.handleDie(payload);
        count.next();
      });
    });
  });


  describe('close', function () {
    describe('not listening', function () {
      it('should callback', function (done) {
        dockerEvents.close(done);
      });
    });

    describe('with active lock', function () {
      afterEach(function (done) {
        dockerEvents.eventLockCount = 0;
        dockerEvents.close(done);
      });

      it('should close after lock decrement', function (done) {
        var count = createCount(1, function (err) {
          if (err) { return done(err); }
          expect(dockerEvents.eventLockCount).to.equal(0);
          done();
        });
        dockerEvents.eventLockCount = 1;
        dockerEvents.close(count.next);
        dockerEvents.decLockCount();
      });
    });


    describe('listening', function () {
      beforeEach(function (done) {
        dockerEvents.listen(done);
      });
      it('should callback', function (done) {
        dockerEvents.close(done);
      });
    });
    describe('while handling events', function () {
      beforeEach(function (done) {
        ctx.origHandleDie = dockerEvents.events.die;
        done();
      });
      afterEach(function (done) {
        dockerEvents.events.die = ctx.origHandleDie;
        done();
      });
      it('should wait for events to be handled and callback', function (done) {
        var count = createCount(2, done);
        // mock handle die
        dockerEvents.events.die = function simpleLockTimeoutUnlock () {
          dockerEvents.getEventLock(uuid(), function (err, mutex) {
            if (err) { return count.next(err); }
            setTimeout(function () {
              mutex.unlock(count.next);
            }, 50);
          });
          callClose();
        };
        dockerEvents.listen(function (err) {
          if (err) { return count.next(err); }
          // trigger die event
          pubsub.publish(process.env.DOCKER_EVENTS_NAMESPACE + 'die', {});
        });
        // call close while outstanding events are occuring
        function callClose () {
          dockerEvents.close(function (err) {
            if (err) { return count.next(err); }
            expect(dockerEvents.eventLockCount).to.equal(0);
            count.next();
          });
          expect(dockerEvents.eventLockCount).to.equal(1);
        }
      });
    });
  });
});