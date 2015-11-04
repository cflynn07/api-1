'use strict';

/**
 * Internal request to deprovision test clusters
*  NOTE: this is temporary code. See SAN-2739
 * @module rest/actions/internal/deprovision-clusters
 */
var express = require('express');
var jobs = require('middlewares/apis/jobs');
var mw = require('dat-middleware');


var app = module.exports = express();

app.post('/actions/internal/deprovision-clusters',
  jobs.publishClustersDeprovision,
  mw.res.send(204));