var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;

var last = require('101/last');

var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var multi = require('./fixtures/multi-factory');

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
    // nock.recorder.rec();
    multi.createRegisteredUserProjectAndEnvironments(function (err, user, project, environments) {
      if (err) { return done(err); }

      ctx.user = user;
      ctx.project = project;
      ctx.environments = environments;
      ctx.environment = environments.models[0];

      var contextId = ctx.environment.toJSON().contexts[0].context;
      ctx.context = ctx.user.fetchContext(contextId, function (err) {
        if (err) { return done(err); }

        var versionId = last(ctx.context.toJSON().versions);
        ctx.version = ctx.context.fetchVersion(versionId, done);
      });
    });
  });

  describe('GET', function () {
    it('should give us files from a given context version', function (done) {
      ctx.version.fetchFiles(function (err, files) {
        if (err) { return done(err); }
        expect(files).to.have.length(1);
        expect(files[0].Key).to.match(/[a-f0-9]+\/source\//);
        done();
      });
    });

    it('should give us the body of the file', function (done) {
      files = ctx.version.fetchFiles(function (err) {
        if (err) { return done(err); }
        ctx.version.fetchFile(files[0].id(), function (err, file) {
          if (err) { return done(err); }
          expect(file).to.be.ok;
          // FIXME: this isn't right still... it's hitting the wrong path
          done();
        });
      });
    });
  });

  describe('POST', function () {
    it('should give us details about a file we just created', function (done) {
      ctx.version.createFile({ json: {
        path: 'file.txt',
        body: 'content'
      }}, function (err, data) {
        if (err) { return done(err); }

        expect(data.ETag).to.be.ok;
        expect(data.VersionId).to.be.ok;
        expect(data.Key).to.be.ok;
        expect(data.Key).to.match(/.+file\.txt$/);
        done();
      });
    });
  });

});
