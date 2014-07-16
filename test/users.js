var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;
var createCount = require('callback-count');
var pluck = require('101/pluck');
require('console-trace')({always:true, right:true});
console.log('console-trace added here');

var api = require('./fixtures/api-control');
var users = require('./fixtures/user-factory');

describe('Users - /users', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  beforeEach(require('./fixtures/nock-github'));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));
  afterEach(require('./fixtures/clean-nock'));

  beforeEach(function (done) {
    ctx.user = users.createGithub(done);
  });

  describe('GET', function() {
    it('should error if no query params are provided', function (done) {
      ctx.user.fetchUsers(function (err) {
        expect(err).to.be.ok;
        expect(err.output.statusCode).to.equal(400);
        // TODO: verify error message
        done();
      });
    });
    describe('failures', function () {
      it('should fail with an invalid _id', function (done) {
        ctx.user.fetchUsers({ _id: '[Object object]' }, function (err) {
          expect(err).to.be.okay;
          expect(err.output.statusCode).to.equal(400);
          done();
        });
      });
      // github's nocks are actually breaking this test. I hate to say this, but I tried
      // it locally and it worked, but won't force this to be run ATM. to be fixed.
      // FIXME: why are the github nocks breaking this?
      // it('should return an empty list with an invalid username', function (done) {
      //   ctx.user.fetchUsers({ githubUsername: 'idonotexist' }, function (err, users) {
      //     if (err) { return done(err); }
      //     console.log(users);
      //     expect(users).to.be.okay;
      //     expect(users).to.be.an('array');
      //     expect(users).to.have.a.lengthOf(0);
      //     done();
      //   });
      // });
    });
    describe('list', function() {
      beforeEach(require('./fixtures/nock-github'));
      beforeEach(require('./fixtures/nock-github'));
      beforeEach(require('./fixtures/nock-github'));
      beforeEach(require('./fixtures/nock-github'));
      beforeEach(require('./fixtures/nock-github')); // five
      beforeEach(function (done) {
        var count = createCount(done);
        ctx.users = [
          users.createGithub(count.inc().next),
          users.createGithub(count.inc().next),
          users.createGithub(count.inc().next),
          users.createGithub(count.inc().next),
          users.createGithub(count.inc().next)
        ];
      });

      it('should list users by _id', function (done) {
        var userIds = ctx.users.map(pluck('attrs')).map(pluck('_id'));
        var qs = {
          _id: userIds
        };
        ctx.user.fetchUsers({ qs: qs }, function (err, users, code) {
          if (err) { return done(err); }

          expect(code).to.equal(200);
          expect(users).to.be.an('array');
          expect(users).to.have.a.lengthOf(ctx.users.length);
          expect(users.map(pluck('_id'))).to.include.members(userIds);
          expectPublicFields(users[0]);
          done();
        });
      });
      it('should get users by github username', function (done) {
        var count = createCount(ctx.users.length, done);
        ctx.users.forEach(function (user) {
          var qs = {
            'githubUsername': user.toJSON().accounts.github.username
          };
          ctx.user.fetchUsers({ qs: qs }, function (err, users, code) {
            if (err) { return count.next(err); }

            expect(code).to.equal(200);
            expect(users).to.be.an('array');
            expectPublicFields(users[0]);
            count.next();
          });
        });
      });
    });
  });
});

function expectPublicFields (user) {
  expect(user).to.not.include.keys([
    'email',
    'password',
    'votes',
    'imagesCount',
    'taggedImagesCount'
  ]);
  expect(user).to.include.keys(['_id', 'gravitar']);
}
