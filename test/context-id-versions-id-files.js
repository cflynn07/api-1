var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var users = require('./fixtures/user-factory');
var multi = require('./fixtures/multi-factory');
var expects = require('./fixtures/expects');

describe('Context File List - /contexts/:id/versions/:versionid', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  afterEach(require('./fixtures/clean-mongo').removeEverything);
  afterEach(require('./fixtures/clean-ctx')(ctx));

  beforeEach(function (done) {
    nockS3();
    multi.createRegisteredUserProjectAndEnvironments(function (err, user, project, environments) {
      if (err) { return done(err); }

      ctx.user = user;
      ctx.project = project;
      ctx.environments = environments;
      ctx.environment = environments.models[0];

      var contextId = ctx.environment.toJSON().contexts[0].context;
      ctx.context = ctx.user.fetchContext(contextId, function (err) {
        if (err) { return done(err); }

        ctx.versions = ctx.context.fetchVersions(function (err, versions) {
          if (err) { return done(err); }

          ctx.version = ctx.context.fetchVersion(versions[0]._id, done);
        });
      });
    });
  });

  // describe('GET', function () {
  //   it('should give us files from a given context version', function (done) {
  //     ctx.version.fetchFiles(function (err, files) {
  //       console.log(err, files);
  //       if (err) { return done(err); }
  //       done(1);
  //     });
  //   });

  //   it('should filter down when given a prefix', function (done) {
  //     done(1);
  //   });
  // });

});
