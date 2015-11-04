/**
 * @module unit/models/apis/docker
 */
'use strict';
require('loadenv')();

var Code = require('code');
var Lab = require('lab');
var path = require('path');
var sinon = require('sinon');

var Github = require('models/apis/github');

var lab = exports.lab = Lab.script();

var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;
var moduleName = path.relative(process.cwd(), __filename);

describe('github: '+moduleName, function () {

  describe('isOrgMember', function () {

    it('should return 404 if getting orgs returned 404', function (done) {
      var github = new Github({token: 'some-token'});
      var err = new Error('Orgs error');
      err.code = 404;
      sinon.stub(github, 'getUserAuthorizedOrgs').yieldsAsync(err);
      github.isOrgMember('CodeNow', function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(404);
        expect(err.output.payload.message).to.equal('user is not a member of org');
        done();
      });
    });

    it('should return 502 in case other error', function (done) {
      var github = new Github({token: 'some-token'});
      var err = new Error('Orgs error');
      sinon.stub(github, 'getUserAuthorizedOrgs').yieldsAsync(err);
      github.isOrgMember('CodeNow', function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(502);
        expect(err.output.payload.message).to.equal('failed to get user orgs');
        done();
      });
    });

    it('should return 404 if not orgs were found (null)', function (done) {
      var github = new Github({token: 'some-token'});
      sinon.stub(github, 'getUserAuthorizedOrgs').yieldsAsync(null, null);
      github.isOrgMember('CodeNow', function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(404);
        expect(err.output.payload.message).to.equal('user is not a member of org');
        done();
      });
    });

    it('should return 404 if not orgs were found ([])', function (done) {
      var github = new Github({token: 'some-token'});
      sinon.stub(github, 'getUserAuthorizedOrgs').yieldsAsync(null, []);
      github.isOrgMember('CodeNow', function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(404);
        expect(err.output.payload.message).to.equal('user is not a member of org');
        done();
      });
    });

    it('should return 404 if orgs was not in the list', function (done) {
      var github = new Github({token: 'some-token'});
      var orgs = [{login: 'Runnable'}];
      sinon.stub(github, 'getUserAuthorizedOrgs').yieldsAsync(null, orgs);
      github.isOrgMember('CodeNow', function (err) {
        expect(err).to.exist();
        expect(err.output.statusCode).to.equal(404);
        expect(err.output.payload.message).to.equal('user is not a member of org');
        done();
      });
    });

    it('should return true if org was found', function (done) {
      var github = new Github({token: 'some-token'});
      var orgs = [{login: 'CodeNow'}];
      sinon.stub(github, 'getUserAuthorizedOrgs').yieldsAsync(null, orgs);
      github.isOrgMember('CodeNow', function (err, isMember) {
        expect(err).to.not.exist();
        expect(isMember).to.be.true();
        done();
      });
    });
  });


  describe('_listRepoHooks', function () {
    it('should return 404 if repo wasnot found', function (done) {
      var github = new Github({token: 'some-token'});
      var err = new Error('Not found');
      err.code = 404;
      sinon.stub(github.repos, 'getHooks').yieldsAsync(err);
      github._listRepoHooks('codenow/api', function (boomErr) {
        expect(boomErr).to.exist();
        expect(boomErr.output.statusCode).to.equal(404);
        expect(boomErr.output.payload.message).to.equal('Github repo codenow/api not found.');
        expect(boomErr.data.err.code).to.equal(err.code);
        expect(boomErr.data.err.message).to.equal(err.message);
        var query = github.repos.getHooks.getCall(0).args[0];
        expect(query.user).to.equal('codenow');
        expect(query.repo).to.equal('api');
        done();
      });
    });
    it('should return 502 if some error happened', function (done) {
      var github = new Github({token: 'some-token'});
      var err = new Error('Some error');
      sinon.stub(github.repos, 'getHooks').yieldsAsync(err);
      github._listRepoHooks('codenow/api', function (boomErr) {
        expect(boomErr).to.exist();
        expect(boomErr.output.statusCode).to.equal(502);
        expect(boomErr.output.payload.message).to.equal('Failed to get github repo hooks for codenow/api');
        expect(boomErr.data.err.message).to.equal(err.message);
        var query = github.repos.getHooks.getCall(0).args[0];
        expect(query.user).to.equal('codenow');
        expect(query.repo).to.equal('api');
        done();
      });
    });
    it('should return 404 if repo was renamed', function (done) {
      var github = new Github({token: 'some-token'});
      var redirectResp = {
        message: 'Moved Permanently',
        url: 'https://api.github.com/repositories/20696842/hooks?per_page=100' +
          '&access_token=aeb93139d50473aa5f812bf9731d4f04fb842864',
        documentation_url: 'https://developer.github.com/v3/#http-redirects',
        meta: {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4988',
          'x-ratelimit-reset': '1444181546',
           'x-oauth-scopes':
           'read:org, read:repo_hook, repo, user:email',
           location: 'https://api.github.com/repositories/20696842/hooks' +
            '?per_page=100&access_token=aeb93139d50473aa5f812bf9731d4f04fb842864',
           status: '301 Moved Permanently'
        }
      };
      sinon.stub(github.repos, 'getHooks').yieldsAsync(null, redirectResp);
      github._listRepoHooks('codenow/api', function (boomErr) {
        expect(boomErr).to.exist();
        expect(boomErr.output.statusCode).to.equal(404);
        expect(boomErr.output.payload.message).to.equal('Github repo codenow/api not found, because it moved');
        var query = github.repos.getHooks.getCall(0).args[0];
        expect(query.user).to.equal('codenow');
        expect(query.repo).to.equal('api');
        done();
      });
    });
    it('should work if no errors occured', function (done) {
      var github = new Github({token: 'some-token'});
      sinon.stub(github.repos, 'getHooks').yieldsAsync(null, [{id: 1}]);
      github._listRepoHooks('codenow/api', function (err, hooks) {
        expect(err).to.not.exist();
        expect(hooks.length).to.equal(1);
        expect(hooks[0].id).to.equal(1);
        done();
      });
    });
  });
  describe('_deleteRepoHook', function () {
    it('should return 404 if repo wasnot found', function (done) {
      var github = new Github({token: 'some-token'});
      var err = new Error('Not found');
      err.code = 404;
      sinon.stub(github.repos, 'deleteHook').yieldsAsync(err);
      github._deleteRepoHook(1, 'codenow/api', function (boomErr) {
        expect(boomErr).to.exist();
        expect(boomErr.output.statusCode).to.equal(404);
        expect(boomErr.output.payload.message).to.equal('Github repo hook 1 not found.');
        expect(boomErr.data.err.code).to.equal(err.code);
        expect(boomErr.data.err.message).to.equal(err.message);
        var query = github.repos.deleteHook.getCall(0).args[0];
        expect(query.id).to.equal(1);
        expect(query.user).to.equal('codenow');
        expect(query.repo).to.equal('api');
        done();
      });
    });
    it('should return 502 if some error happened', function (done) {
      var github = new Github({token: 'some-token'});
      var err = new Error('Some error');
      sinon.stub(github.repos, 'deleteHook').yieldsAsync(err);
      github._deleteRepoHook(1, 'codenow/api', function (boomErr) {
        expect(boomErr).to.exist();
        expect(boomErr.output.statusCode).to.equal(502);
        expect(boomErr.output.payload.message).to.equal('Failed to delete github repo hook with id 1');
        expect(boomErr.data.err.message).to.equal(err.message);
        var query = github.repos.deleteHook.getCall(0).args[0];
        expect(query.id).to.equal(1);
        expect(query.user).to.equal('codenow');
        expect(query.repo).to.equal('api');
        done();
      });
    });
    it('should work if no errors occured', function (done) {
      var github = new Github({token: 'some-token'});
      sinon.stub(github.repos, 'deleteHook').yieldsAsync(null, {});
      github._deleteRepoHook(1, 'codenow/api', function (err) {
        expect(err).to.not.exist();
        done();
      });
    });
  });
});