/**
 * LOG_LEVEL_STDOUT=none NODE_PATH=lib/ node scripts/populate-link.js
 */
'use strict';

require('loadenv')();

// Load all the things!
require('express-app');

// dummy port
process.env.PORT = 7777;
var Server = require('server');
var server = new Server();

var mongoose = require('mongoose');
var async = require('async');

var Instance = require('models/mongo/instance');
var User = require('models/mongo/user');

if (!process.env.MONGO) {
  throw 'process.env.MONGO does not exist!'
}

server.start(function () {
  console.log('server started', arguments);
	console.log('Connecting to ', process.env.MONGO, ' in 10 seconds');
	console.log('Connecting...');
	mongoose.connect(process.env.MONGO, function () {
	  console.log('Connected.');

	  console.log('Fetching Instances');
	  Instance.find({}, function (err, instances) {
	    if (err) {
	      throw err
	    }
	    console.log(instances.length + ' instances fetched');
	    console.log('About to go through each one and update them in 10 seconds. Now is your last chance to stop the onslaught!');
	    setTimeout(function () {
	      console.log('TOO LATE! Populating....');
	      async.eachSeries(instances, function (instance, cb) {
		instance.emitInstanceUpdate('update', function (err) {
		  if (err) {
		    throw err
		  }
		  if (!instance.owner.username || !instance.createdBy.username ) {
		    console.log('Instance did not populate owner username and createdBy username', instance._id);
		  }
//		  console.log('Updated', index, Math.floor(index/instances.length * 100));
                  console.log('updated: ', instance._id);
                  cb();
		})
	      }, function () {
		console.log('DONE!');
		process.exit(1);
	      })
	    }, 10000);
	  })
	})
});

