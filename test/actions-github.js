'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var afterEach = Lab.afterEach;
var beforeEach = Lab.beforeEach;
var expect = Lab.expect;
var request = require('request');
var expects = require('./fixtures/expects');
var exists = require('101/exists');
var ContextVersion = require('models/mongo/context-version');
var api = require('./fixtures/api-control');
var hooks = require('./fixtures/github-hooks');
var multi = require('./fixtures/multi-factory');
var dock = require('./fixtures/dock');
var primus = require('./fixtures/primus');
var dockerMockEvents = require('./fixtures/docker-mock-events');
var waitForCv = require('./fixtures/wait-for-cv');
var createCount = require('callback-count');
// require('console-trace')({always:true, right:true});

var nock = require('nock');
var generateKey = require('./fixtures/key-factory');

before(function (done) {
  nock('http://runnable.com:80')
    .persist()
    .get('/')
    .reply(200);
  done();
});

describe('Github - /actions/github', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  before(dock.start.bind(ctx));
  after(dock.stop.bind(ctx));
  before(require('./fixtures/mocks/api-client').setup);
  after(require('./fixtures/mocks/api-client').clean);
  beforeEach(generateKey);
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  describe('ping', function () {
    it('should return OKAY', function (done) {
      var options = hooks().ping;
      request.post(options, function (err, res, body) {
        if (err) { return done(err); }

        expect(res.statusCode).to.equal(202);
        expect(body).to.equal('Hello, Github Ping!');
        done();
      });
    });
  });


  describe('disabled hooks', function () {
    beforeEach(function (done) {
      ctx.originalBuildsOnPushSetting = process.env.ENABLE_BUILDS_ON_GIT_PUSH;
      delete process.env.ENABLE_BUILDS_ON_GIT_PUSH;
      done();
    });
    afterEach(function (done) {
      process.env.ENABLE_BUILDS_ON_GIT_PUSH = ctx.originalBuildsOnPushSetting;
      done();
    });
    it('should send response immediately if hooks are disabled', function (done) {
      var options = hooks().push;
      options.json.ref = 'refs/heads/someotherbranch';
      require('./fixtures/mocks/github/users-username')(101, 'bkendall');
      request.post(options, function (err, res) {
        if (err) {
          done(err);
        }
        else {
          expect(res.statusCode).to.equal(202);
          expect(res.body).to.match(/hooks are currently disabled\. but we gotchu/);
          done();
        }
      });
    });
  });

  describe('when a branch was deleted', function () {
    beforeEach(function (done) {
      process.env.ENABLE_BUILDS_ON_GIT_PUSH = 'true';
      done();
    });

    it('should return 202 with thing to do', function (done) {
      var options = hooks().push_delete;
      require('./fixtures/mocks/github/users-username')(101, 'bkendall');
      request.post(options, function (err, res) {
        if (err) {
          done(err);
        }
        else {
          expect(res.statusCode).to.equal(202);
          expect(res.body).to.match(/Deleted the branch\; no work.+/);
          done();
        }
      });
    });
  });

  describe('ignore hooks without commits data', function () {
    beforeEach(function (done) {
      process.env.ENABLE_BUILDS_ON_GIT_PUSH = 'true';
      done();
    });

    it('should send response immediately there are no commits data ([]) in the payload ', function (done) {
      var options = hooks().push;
      options.json.ref = 'refs/heads/someotherbranch';
      options.json.commits = [];
      require('./fixtures/mocks/github/users-username')(101, 'bkendall');
      request.post(options, function (err, res) {
        if (err) {
          done(err);
        }
        else {
          expect(res.statusCode).to.equal(202);
          expect(res.body).to.equal('No commits pushed; no work to be done.');
          done();
        }
      });
    });

    it('should send response immediately there are no commits data (null) in the payload ', function (done) {
      var options = hooks().push;
      options.json.ref = 'refs/heads/someotherbranch';
      options.json.commits = null;
      require('./fixtures/mocks/github/users-username')(101, 'bkendall');
      request.post(options, function (err, res) {
        if (err) {
          done(err);
        }
        else {
          expect(res.statusCode).to.equal(202);
          expect(res.body).to.equal('No commits pushed; no work to be done.');
          done();
        }
      });
    });
  });

  describe('push new branch', function () {
    describe('disabled by default', function () {
      it('should return 202 which means processing of new branches is disabled', function (done) {
        var data = {
          branch: 'feature-1'
        };
        var options = hooks(data).push;
        require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
          (options.json.repository.owner.name, options.json.repository.name, options.json.head_commit.id);
        request.post(options, function (err, res) {
          if (err) {
            done(err);
          }
          else {
            expect(res.statusCode).to.equal(202);
            expect(res.body).to.equal('New branch builds are disabled for now');
            done();
          }
        });
      });
    });

    describe('enabled auto builds', function () {
      before(function (done) {
        process.env.ENABLE_NEW_BRANCH_BUILDS_ON_GIT_PUSH = 'true';
        done();
      });
      beforeEach(primus.connect);
      beforeEach(function (done) {
        multi.createInstance(function (err, instance, build, user, modelsArr) {
          ctx.contextVersion = modelsArr[0];
          ctx.context = modelsArr[1];
          ctx.build = build;
          ctx.user = user;
          ctx.instance = instance;
          done(err);
        });
      });
      beforeEach(function (done) {
        primus.joinOrgRoom(ctx.user.json().accounts.github.id, function (err) {
          done(err);
        });
      });
      afterEach(primus.disconnect);

      it('should do nothing if there were no context versions found', function (done) {
        var data = {
          branch: 'feature-1',
          repo: 'some-user/some-repo'
        };
        var options = hooks(data).push;
        require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
        request.post(options, function (err, res) {
          if (err) { return done(err); }
          expect(res.statusCode).to.equal(202);
          expect(res.body).to.equal('No appropriate work to be done; finishing.');
          done();
        });
      });

      it('should create a build for an existing branch if instance is locked', {timeout: 5000}, function (done) {
        ctx.instance.update({locked: true}, function (err) {
          if (err) { return done(err); }
          var acv = ctx.contextVersion.attrs.appCodeVersions[0];
          var data = {
            branch: 'master',
            repo: acv.repo
          };
          var options = hooks(data).push;
          require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
          request.post(options, function (err, res, cvIds) {
            if (err) { return done(err); }
            expect(res.statusCode).to.equal(201);
            expect(cvIds).to.be.okay;
            expect(cvIds).to.be.an('array');
            expect(cvIds).to.have.a.lengthOf(1);
            var cvId = cvIds[0];
            // immediately returned context version with started build
            ContextVersion.findById(cvId, function (err, contextVersion) {
              if (err) { return done(err); }
              expect(contextVersion.build.started).to.exist();
              expect(contextVersion.build.completed).to.not.exist();
              expect(contextVersion.build.duration).to.not.exist();
              expect(contextVersion.build.triggeredBy.github).to.exist();
              expect(contextVersion.build.triggeredAction.manual).to.equal(false);
              expect(contextVersion.appCodeVersions[0].lowerRepo).to.equal(options.json.repository.full_name);
              expect(contextVersion.appCodeVersions[0].commit).to.equal(options.json.head_commit.id);
              expect(contextVersion.appCodeVersions[0].branch).to.equal(data.branch);
              expect(contextVersion.build.triggeredAction.appCodeVersion.repo)
                .to.equal(options.json.repository.full_name);
              expect(contextVersion.build.triggeredAction.appCodeVersion.commit)
                .to.equal(options.json.head_commit.id);
              expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog)
                .to.have.lengthOf(1);
              expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog[0].id)
                .to.equal(options.json.head_commit.id);
              // wait until cv is build.
              dockerMockEvents.emitBuildComplete(contextVersion);
              waitForCv.complete(contextVersion._id, function (err, contextVersion) {
                if (err) { return done(err); }
                expect(contextVersion.build.started).to.exist();
                expect(contextVersion.build.completed).to.exist();
                expect(contextVersion.build.duration).to.exist();
                expect(contextVersion.build.triggeredBy.github).to.exist();
                expect(contextVersion.build.triggeredAction.manual).to.equal(false);
                expect(contextVersion.appCodeVersions[0].lowerRepo).to.equal(options.json.repository.full_name);
                expect(contextVersion.appCodeVersions[0].commit).to.equal(options.json.head_commit.id);
                expect(contextVersion.appCodeVersions[0].branch).to.equal(data.branch);
                expect(contextVersion.build.triggeredAction.appCodeVersion.repo)
                  .to.equal(options.json.repository.full_name);
                expect(contextVersion.build.triggeredAction.appCodeVersion.commit)
                  .to.equal(options.json.head_commit.id);
                expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog)
                  .to.have.lengthOf(1);
                expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog[0].id)
                  .to.equal(options.json.head_commit.id);
                done();
              });
            });
          });
        });
      });

      it('should create a build for push on new branch', {timeout: 3000}, function (done) {
        var acv = ctx.contextVersion.attrs.appCodeVersions[0];
        var data = {
          branch: 'feature-1',
          repo: acv.repo
        };
        var options = hooks(data).push;
        require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
        request.post(options, function (err, res, cvs) {
          if (err) { return done(err); }
          expect(res.statusCode).to.equal(201);
          expect(cvs).to.be.okay;
          expect(cvs).to.be.an('array');
          expect(cvs).to.have.a.lengthOf(1);
          var cvId = cvs[0];
          // immediately returned context version with started build
          ContextVersion.findById(cvId, function (err, contextVersion) {
            if (err) { return done(err); }
            expect(contextVersion.build.started).to.exist();
            expect(contextVersion.build.completed).to.not.exist();
            expect(contextVersion.build.duration).to.not.exist();
            expect(contextVersion.build.triggeredBy.github).to.exist();
            expect(contextVersion.build.triggeredAction.manual).to.equal(false);
            expect(contextVersion.appCodeVersions[0].lowerRepo).to.equal(options.json.repository.full_name);
            expect(contextVersion.appCodeVersions[0].commit).to.equal(options.json.head_commit.id);
            expect(contextVersion.appCodeVersions[0].branch).to.equal(data.branch);
            expect(contextVersion.build.triggeredAction.appCodeVersion.repo)
              .to.equal(options.json.repository.full_name);
            expect(contextVersion.build.triggeredAction.appCodeVersion.commit)
              .to.equal(options.json.head_commit.id);
            expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog)
              .to.have.lengthOf(1);
            expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog[0].id)
              .to.equal(options.json.head_commit.id);
            // wait until cv is build.
            dockerMockEvents.emitBuildComplete(contextVersion);
            waitForCv.complete(contextVersion._id, function (err, contextVersion) {
              if (err) { return done(err); }
              expect(contextVersion.build.started).to.exist();
              expect(contextVersion.build.completed).to.exist();
              expect(contextVersion.build.duration).to.exist();
              expect(contextVersion.build.triggeredBy.github).to.exist();
              expect(contextVersion.build.triggeredAction.manual).to.equal(false);
              expect(contextVersion.appCodeVersions[0].lowerRepo).to.equal(options.json.repository.full_name);
              expect(contextVersion.appCodeVersions[0].commit).to.equal(options.json.head_commit.id);
              expect(contextVersion.appCodeVersions[0].branch).to.equal(data.branch);
              expect(contextVersion.build.triggeredAction.appCodeVersion.repo)
                .to.equal(options.json.repository.full_name);
              expect(contextVersion.build.triggeredAction.appCodeVersion.commit)
                .to.equal(options.json.head_commit.id);
              expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog)
                .to.have.lengthOf(1);
              expect(contextVersion.build.triggeredAction.appCodeVersion.commitLog[0].id)
                .to.equal(options.json.head_commit.id);
              done();
            });
          });
        });
      });

    });
  });

  describe('push follow branch', function () {
    beforeEach(primus.connect);
    beforeEach(function (done) {
      process.env.ENABLE_NEW_BRANCH_BUILDS_ON_GIT_PUSH = 'true';
      multi.createInstance(function (err, instance, build, user, modelsArr) {
        ctx.contextVersion = modelsArr[0];
        ctx.context = modelsArr[1];
        ctx.build = build;
        ctx.user = user;
        ctx.instance = instance;
        var settings = {
          owner: {
            github: instance.attrs.owner.github
          },
          notifications: {
            slack: {
              webhookUrl: 'http://slack.com/some-web-hook-url'
            },
            hipchat: {
              authToken: 'some-hipchat-token',
              roomId: 123123
            }
          }
        };
        user.createSetting({json: settings}, done);
      });
    });
    beforeEach(function (done) {
      primus.joinOrgRoom(ctx.user.json().accounts.github.id, function (err) {
        done(err);
      });
    });
    beforeEach(function (done) {
      ctx.instance2 = ctx.instance.copy(done);
    });
    afterEach(primus.disconnect);

    it('should redeploy two instances with new build', {timeout: 10000}, function (done) {
      var acv = ctx.contextVersion.attrs.appCodeVersions[0];
      var hookData = {
        branch: 'master',
        repo: acv.repo
      };
      var options = hooks(hookData).push;
      require('./fixtures/mocks/github/users-username')(101, 'podviaznikov');
      request.post(options, function (err, res, instanceIds) {
        if (err) { return done(err); }
        expect(res.statusCode).to.equal(201);
        expect(instanceIds).to.be.okay;
        expect(instanceIds).to.be.an('array');
        expect(instanceIds).to.have.a.lengthOf(2);
        expect(instanceIds).to.include(ctx.instance.attrs._id);
        expect(instanceIds).to.include(ctx.instance2.attrs._id);
        // ASSUMPTION: since db is clean any incomplete cv's will be from the github route.
        var incompleteBuildsQuery = {
          'build.started'  : { $exists: true },
          'build.completed': { $exists: false }
        };
        var fields = null; // all fields
        var opts = { sort: ['build.started'] };
        ContextVersion.find(incompleteBuildsQuery, fields, opts, function (err, versions) {
          if (err) { return done(err); }
          // expect(versions.length).to.equal(1);
          var buildIds = [];
          versions
            .filter(function (version) {
              // filter versions by unique build ids
              // a non unique build id would indicate a deduped build
              var buildId = version.build._id.toString();
              if (!~buildIds.indexOf(buildId)) {
                buildIds.push(buildId);
                return true;
              }
            })
            .forEach(function (version) {
              // emit build complete events for each unique build
              dockerMockEvents.emitBuildComplete(version);
            });
          var count = createCount(finalAssertions);
          primus.onceInstanceUpdate('patch', instanceIds[0], count.inc().next);
          primus.onceInstanceUpdate('patch', instanceIds[1], count.inc().next);
            // dockerMockEvents.emitBuildComplete(contextVersion);
          function finalAssertions () {
            var expected = {
              'contextVersion.build.started': exists,
              'contextVersion.build.completed': exists,
              'contextVersion.build.duration': exists,
              'contextVersion.build.triggeredBy.github': exists,
              'contextVersion.appCodeVersions[0].lowerRepo': options.json.repository.full_name,
              'contextVersion.appCodeVersions[0].commit': options.json.head_commit.id,
              'contextVersion.appCodeVersions[0].branch': hookData.branch,
              'contextVersion.build.triggeredAction.manual': false,
              'contextVersion.build.triggeredAction.appCodeVersion.repo':
                options.json.repository.full_name,
              'contextVersion.build.triggeredAction.appCodeVersion.commit':
                options.json.head_commit.id,
              'contextVersion.build.triggeredAction.appCodeVersion.commitLog':
                function (commitLog) {
                  expect(commitLog).to.be.an('array');
                  expect(commitLog).to.have.lengthOf(1);
                  expect(commitLog[0].id).to.equal(options.json.head_commit.id);
                  return true;
                }
            };
            ctx.instance.fetch(expects.success(200, expected, function (err) {
              if (err) { return done(err); }
              ctx.instance2.fetch(expects.success(200, expected, done));
            }));
          }
        });
      });
    });
  });

});