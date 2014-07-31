var createCount = require('callback-count');
var docker = require('./docker');
var docklet = require('./docklet');
var redis = require('models/redis');
var mavisApp = require('mavis');
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
  ctx.docklet = docklet.start(count.inc().next);
  ctx.mavis = mavisApp.listen(url.parse(process.env.MAVIS_HOST).port);
  ctx.mavis.on('listening', count.inc().next);
  redis.lpush(process.env.REDIS_HOST_KEYS, testDockHost, count.inc().next);
  redis.hmset(testDockHost,
    'numContainers',
    '0',
    'numBuilds',
    '0',
    'host',
    testDockHost,
    count.inc().next);
}
function stopDock (done) {
  var count = createCount(done);
  ctx.docker = docker.stop(count.inc().next);
  ctx.docklet = docklet.stop(count.inc().next);
  ctx.mavis = ctx.mavis.close(count.inc().next);
  redis.del(process.env.REDIS_HOST_KEYS, count.inc().next);
  redis.del(testDockHost, count.inc().next);
  delete ctx.docker;
  delete ctx.docklet;
}
