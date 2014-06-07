var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var expect = Lab.expect;
var krain = require('krain');
var rimraf = require('rimraf');
var api = require('./fixtures/api-control');
var dock = require('./fixtures/dock');
var nockS3 = require('./fixtures/nock-s3');
var multi = require('./fixtures/multi-factory');
var fs = require('fs');
var path = require('path');
var configs = require('configs');

var containerRoot = path.join(__dirname, '../node_modules/krain/test/1');
before(function (done) {
  // create test folder
  krain.listen(configs.krainPort);
  fs.mkdirSync(containerRoot);
  done();
});
afterEach(function (done) {
  // create test folder
  rimraf.sync(containerRoot);
  fs.mkdirSync(containerRoot);
  done();
});
after(function (done) {
  // create test folder
  rimraf.sync(containerRoot);
  done();
});

function createFile (ctx, done) {
  var fileName = "file1.txt";
  var fileContent = "this is a test file";
  var filePath = "/";
  ctx.file = ctx.container.createFile({
    json: {
      name: fileName,
      path: filePath,
      isDir: false,
      content: fileContent
    }
  }, function (err, body, code) {
    if (err) { return done(err); }
    expect(code).to.equal(201);
    expect(body).to.have.property('name', fileName);
    expect(body).to.have.property('path', filePath);
    expect(body).to.have.property('isDir', false);
    var content = fs.readFileSync(
      path.join(containerRoot, filePath, fileName), {
        encoding: 'utf8'
      });
    expect(content).to.equal(fileContent);
    done();
  });
}

describe('File System - /instances/:id/containers/:id/files/*path*', function () {
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
      ctx.version = user.fetchVersion(ctx.environment.toJSON().versions[0], function (err) {
        if (err) { return done(err); }
        ctx.version.build(function (err) {
          if (err) { return done(err); }
          ctx.instance = ctx.user.createInstance({
            json: { environment: ctx.environment.id() }
          }, function (err) {
            if (err) { return done(err); }
            var containerAttrs = ctx.instance.toJSON().containers[0];
            ctx.container = ctx.instance.newContainer(containerAttrs);
            createFile(ctx, done);
          });
        });
      });
    });
  });

  describe('GET', function () {
    it('should read a file', function (done) {
      var fileContent = "this is a test file";
      ctx.file.fetch(function (err, body, code) {
        if (err) { return done(err); }

        expect(code).to.equal(200);
        expect(body).to.exist;
        expect(body).to.equal(fileContent);
        done();
      });
    });
  });

  describe('PATCH', function () {
    it('should update content of file', function (done) {
      var fileName = "file1.txt";
      var newFileContent = "new content is better";
      var filePath = "/";
      ctx.file.update({
        json: {
          name: fileName,
          path: filePath,
          isDir: false,
          content: newFileContent
        }
      }, function (err, body, code) {
        if (err) { return done(err); }
        expect(code).to.equal(200);
        expect(body).to.have.property('name', fileName);
        expect(body).to.have.property('path', filePath);
        expect(body).to.have.property('isDir', false);
        var content = fs.readFileSync(
          path.join(containerRoot, filePath, fileName), {
            encoding: 'utf8'
          });
        expect(content).to.equal(newFileContent);
        done();
      });
    });
  });

  describe('POST', function () {
    it('should create a file', function (done) {
      var fileName = "file1.txt";
      var fileContent = "this is a test file";
      var filePath = "/";
      ctx.container.createFile({
        json: {
          name: fileName,
          path: filePath,
          isDir: false,
          content: fileContent
        }
      }, function (err, body, code) {
        if (err) { return done(err); }
        expect(code).to.equal(201);
        expect(body).to.have.property('name', fileName);
        expect(body).to.have.property('path', filePath);
        expect(body).to.have.property('isDir', false);
        var content = fs.readFileSync(
          path.join(containerRoot, filePath, fileName), {
            encoding: 'utf8'
          });
        expect(content).to.equal(fileContent);
        done();
      });
    });
  });

  describe('DELETE', function () {
    it('should delete a file', function (done) {
      var fileName = "file1.txt";
      var fileContent = "this is a test file";
      var filePath = "/";
      ctx.file.destroy({
        json: {
          name: fileName,
          path: filePath,
          isDir: false,
          content: fileContent
        }
      }, function (err, body, code) {
        if (err) { return done(err); }
        expect(code).to.equal(200);
        try {
          fs.readFileSync(
            path.join(containerRoot, filePath, fileName), {
              encoding: 'utf8'
            });
        } catch (err) {
          if (err.code === 'ENOENT') {
            return done();
          }
        }
        return done(new Error('file did not delete'));

      });
    });
  });

});


