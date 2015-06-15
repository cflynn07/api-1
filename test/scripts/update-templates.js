'use strict';

// we are going to test the seed script. all we have to do is shell out with the right stuff

var Code = require('code');
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

var assign = require('101/assign');
var clone = require('101/clone');
var path = require('path');
var spawn = require('child_process').spawn;

var cmd = 'node';
var args = ['scripts/templates/update-templates.js'];
var opts = {
  env: assign(clone(process.env), {
    'NODE_ENV': 'test',
    'ACTUALLY_RUN': true
  }),
  cwd: path.resolve(__dirname, '../..')
};

describe('template update script', function () {
  it('should update the templates', function (done) {
    var ps = spawn(cmd, args, opts);
    ps.on('error', done);
    ps.on('close', function (code) {
      expect(code).to.equal(0);
      done();
    });
  });
});
