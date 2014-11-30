var createCount = require('callback-count');
var docker = require('./docker');
var redis = require('models/redis');
var mavisApp = require('mavis');
var sauron = require('sauron');
var dockerModuleMock = require('./mocks/docker-model.js');

// fixme: rename this dependencies .. it isnt just a dock now

var url = require('url');
module.exports = {
  start: startDock,
  stop: stopDock
};
var testDockHost = 'http://localhost:4243';
var ctx = {};
function startDock (done) {
  var count = createCount(done);
  ctx.docker = docker.start(count.inc().next);
  ctx.mavis = mavisApp.listen(url.parse(process.env.MAVIS_HOST).port);
  ctx.mavis.on('listening', count.inc().next);
  require('mavis/lib/models/dockData').addHost(testDockHost, count.inc().next); // init mavis docks data
  ctx.sauron = sauron.listen(process.env.SAURON_PORT);
  ctx.sauron.on('listening', count.inc().next);
  dockerModuleMock.setup(count.inc().next);
}
function stopDock (done) {
  var count = createCount(done);
  ctx.docker = docker.stop(count.inc().next);
  ctx.mavis = ctx.mavis.close(count.inc().next);
  ctx.sauron = ctx.sauron.close(count.inc().next);
  redis.del(process.env.REDIS_HOST_KEYS, count.inc().next);
  redis.del(testDockHost, count.inc().next);
  dockerModuleMock.clean(count.inc().next);
  delete ctx.docker;
}
