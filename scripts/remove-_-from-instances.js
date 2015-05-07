'use strict';

require('loadenv')();
var Instances = require('models/mongo/instance');
var async = require('async');
var mongoose = require('mongoose');
var Runnabe = require('runnable');
var user = new Runnabe(process.env.API_HOST);

var dryRun = !process.env.ACTUALLY_RUN;
if (!process.env.API_HOST) {
  console.log('need API_HOST');
  process.exit(1);
}
if (!process.env.API_TOKEN) {
  console.log('need API_TOKEN');
  process.exit(1);
}

mongoose.connect(process.env.MONGO);

console.log('dryRun?', !!dryRun);

async.waterfall([
  function loginApiClient (cb) {
    user.githubLogin(process.env.API_TOKEN, cb);
  },
  function getAllInstances (cb) {
    Instances.find({}, cb);
  },
  function rename (instances, cb) {
    console.log('looking at instances', instances.length);

    var reanameList = [];
    instances.forEach(function (i) {
      if (~i.name.indexOf('_')) {
        reanameList.push(i);
      }
    });

    async.eachLimit(reanameList, 10, function (i, eachCb) {
      var newName = i.name.replace(/[^a-zA-Z0-9]/g, '-');
      console.log('RENAMING', i.name, newName);
      if (dryRun) {
        return eachCb();
      }
      user.updateInstance(i._id.toString(), {
        name: newName
      }, function (err) {
        if (err) { console.error('err renaming',i.name, newName, err.message); }
        eachCb();
      });
    }, cb);
  }
], function (err) {
  console.log('done. err', err);
  process.exit(0);
});
