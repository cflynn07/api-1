var route53 = require('./route53');
route53.start(); // must be before api require
var ApiServer = require('server');
var cleanMongo = require('./clean-mongo');
var cayley = require('./cayley');

module.exports = {
  start: startApi,
  stop: stopApi
};

function startApi (done) {
  var ctx = this;
  ctx.cayley = cayley;
  this.apiServer = new ApiServer().start(function (err) {
    if (err) { return done(err); }
    cayley.start(function () {
      cleanMongo.removeEverything(done);
    });
  });
}

function stopApi (done) {
  route53.stop();
  this.apiServer.stop(function (err) {
    if (err) { return done(err); }
    cayley.stop(done);
    // cleanMongo.dropDatabase(done);
  });
}
