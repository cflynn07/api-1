var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;
var testFile = './test.txt';
var fs = require('fs');

var createCount = require('callback-count');
var uuid = require('uuid');
var buildStream = require('../lib/socket/build-stream.js');
var api = require('./fixtures/api-control');

var Primus = require('primus');
var primusClient = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});


describe('Build Stream', function () {
  var ctx = {};

  before(api.start.bind(ctx));
  after(api.stop.bind(ctx));
  after(function(done) {
    fs.unlink(testFile, done);
  });
  // TODO: test multi client once API start is fixed
  it('should send data to clients', function (done) {
    var roomId = uuid();
    var testString = "this is yet another message";
    var numClients = 1;
    var clientOpenCount = createCount(numClients, function() {
      sendData(testString, roomId);
    });
    var clientReadCount = createCount(numClients, done);

    var client = new primusClient('http://'+process.env.IPADDRESS+':'+process.env.PORT+"?type=build-stream&id="+roomId);
    client.on('open', function() {
      clientOpenCount.next();
      client.on('end', function () {
        clientReadCount.next();
      });
      client.on('data', function(data) {
        expect(data.toString()).to.equal(testString);
        client.end();
      });
    });

    function sendData (testString, roomId) {
      fs.writeFileSync(testFile, testString);
      buildStream.sendBuildStream(roomId, fs.createReadStream(testFile));
    }
  });
});
