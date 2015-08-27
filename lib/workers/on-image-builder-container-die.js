/**
 * @module lib/workers/on-image-builder-container-die
 */
'use strict';

require('loadenv')();
var Boom = require('dat-middleware').Boom;
var async = require('async');
var domain = require('domain');
var exists = require('101/exists');
var keypather = require('keypather')();
var put = require('101/put');
var util = require('util');

var BaseWorker = require('workers/base-worker');
var ContextVersion = require('models/mongo/context-version');
var Docker = require('models/apis/docker');
var Sauron = require('models/apis/sauron.js');
var error = require('error');
var log = require('middlewares/logger')(__filename).log;

module.exports = OnImageBuilderContainerDie;

module.exports.worker = function (data, done) {
  log.info({
    tx: true,
    data: data
  }, 'OnImageBuilderContainerDie module.exports.worker');
  var workerDomain = domain.create();
  workerDomain.on('error', function (err) {
    log.fatal({
      tx: true,
      data: data,
      err: err
    }, 'on-image-builder-container-die domain error');
    error.workerErrorHandler(err, data);
    // ack job and clear to prevent loop
    done();
  });
  workerDomain.run(function () {
    log.info(put({
      tx: true
    }, data), 'hermes.subscribe on-image-builder-container-die start');
    var worker = new OnImageBuilderContainerDie(data);
    worker.handle(done);
  });
};

function OnImageBuilderContainerDie () {
  log.info('OnImageBuilderContainerDie');
  BaseWorker.apply(this, arguments);
}

util.inherits(OnImageBuilderContainerDie, BaseWorker);

/**
 * @param {Object} data
 * @param {Function} done
 */
OnImageBuilderContainerDie.prototype.handle = function (done) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype.handle');
  var self = this;
  async.series([
    this._validateDieData.bind(this),
    this._findContextVersion.bind(this),
    this._getBuildInfo.bind(this),
    this._deallocImageBuilderNetwork.bind(this)
  ], function (err) {
    log.info(self.logData, '_handle: async.series callback');
    self._finalSeriesHandler(err, done);
  });
};

/**
 * @param {Object} err
 * @param {Function} done - sends ACK signal to rabbitMQ
 */
OnImageBuilderContainerDie.prototype._finalSeriesHandler = function (err, done) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._finalSeriesHandler');
  var self = this;
  if (err) {
    log.warn(put({
      err: err
    }, self.logData), 'OnImageBuilderContainerDie.prototype.handle final error');
  }
  else {
    log.info(self.logData, 'OnImageBuilderContainerDie.prototype.handle final success');
  }
  done();
};

/**
 * Query mongo for context-version document
 * @param {Function} findContextVersionCb
 */
OnImageBuilderContainerDie.prototype._findContextVersion = function (findContextVersionCb) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._findContextVersion');
  var self = this;
  ContextVersion.findOneBy('build.dockerContainer', self.data.id, function (err, cv) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), '_findContextVersion: ContextVersion.findOneBy error');
      return findContextVersionCb(err);
    }
    else if (!cv) {
      var error = new Error('_findContextVersion: context version not found');
      log.warn(put({
        err: error
      }, self.logData), '_findContextVersion: ContextVersion.findOneBy context version not found');
      return findContextVersionCb(error);
    }
    log.trace(put({
      cv: cv.toJSON()
    }, self.logData), '_findContextVersion: ContextVersion.findOneBy success');
    self.contextVersion = cv;
    findContextVersionCb(err);
  });
};

/**
 * Fetch build container logs
 * @param {Function} getBuildInfoCb
 */
OnImageBuilderContainerDie.prototype._getBuildInfo = function (getBuildInfoCb) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._getBuildInfo');
  var self = this;
  var docker = new Docker(this.data.host);
  docker.getBuildInfo(this.data.id, function (err, buildInfo) {
    if (err) {
      log.error(put({
        err: err,
        buildInfo: buildInfo
      }, self.logData), '_getBuildInfo: docker.getBuildInfo error');
      self._handleBuildError(err, getBuildInfoCb);
    }
    else if (buildInfo.failed) {
      log.warn(put({
        buildInfo: buildInfo
      }, self.logData), '_getBuildInfo: docker.getBuildInfo buildInfo.failed');
      self._handleBuildError(buildInfo, getBuildInfoCb);
    }
    else {
      log.info(put({
        buildInfo: buildInfo
      }, self.logData), '_getBuildInfo: docker.getBuildInfo success');
      self._handleBuildSuccess(buildInfo, getBuildInfoCb);
    }
  });
};

/**
 * Update mongo and emit event to frontend + holding logic in /builds/:id/actions/build
 * @param {Object} buildInfo
 * @param {Function} handleBuildErrorCb
 */
OnImageBuilderContainerDie.prototype._handleBuildError =
function (buildInfo, handleBuildErrorCb) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._handleBuildError');
  var self = this;
  var Labels = keypather.get(this.data, 'inspectData.Config.Labels');
  if (!Labels) {
    Labels = 'no labels';
  }
  var errorCode = exists(keypather.get(this.data, 'inspectData.State.ExitCode')) ?
    this.data.inspectData.State.ExitCode : '?';
  var errorMessage = 'Building dockerfile failed with errorcode: '+errorCode;
  errorMessage += ' - ' + keypather.get(Labels, 'sessionUserDisplayName');
  errorMessage += ' - [' + keypather.get(Labels, 'sessionUserUsername') + ']';
  errorMessage += ' - [' + keypather.get(Labels, 'contextVersion.appCodeVersions[0].repo') + ']';
  errorMessage += ' - [manual: ' + keypather.get(Labels, 'manualBuild') + ']';
  var err = Boom.badRequest(errorMessage, {
    data: this.data,
    Labels: Labels,
    docker: {
      containerId: this.data.id,
      log: buildInfo.log
    }
  });
  log.trace(put({
    errorMessage: errorMessage
  }, this.logData));
  ContextVersion.updateBuildErrorByContainer(this.data.id, err, function (err) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData),
        '_handleBuildError: contextVersion.updateBuildErrorByContainer failure');
    }
    else {
      log.trace(self.logData,
        '_handleBuildError: contextVersion.updateBuildErrorByContainer success');
    }
    handleBuildErrorCb(err);
  });
};

/**
 * Update mongo and emit event to frontend + holding logic in /builds/:id/actions/build
 * @param {Object} buildInfo
 * @param {Function} handleBuildSuccessCb
 */
OnImageBuilderContainerDie.prototype._handleBuildSuccess =
function (buildInfo, handleBuildSuccessCb) {
  var self = this;
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._handleBuildSuccess');
  ContextVersion.updateBuildCompletedByContainer(this.data.id, buildInfo, function (err) {
    if (err) {
      log.warn(put({
        err: err
      }, self.logData),
        '_handleBuildSuccess: contextVersion.updateBuildCompletedByContainer failure');
    }
    else {
      log.trace(self.logData,
        '_handleBuildSuccess: contextVersion.updateBuildCompletedByContainer success');
    }
    handleBuildSuccessCb(err);
  });
};

/**
 * @param {Function} deallocImageBuilderNetworkCb
 */
OnImageBuilderContainerDie.prototype
._deallocImageBuilderNetwork = function (deallocImageBuilderNetworkCb) {
  log.info(this.logData, 'OnImageBuilderContainerDie.prototype._deallocImageBuilderNetwork ');
  var self = this;
  Sauron.deleteHostFromContextVersion(this.contextVersion, function (err) {
    if (err) {
      log.error(put({
        err: err
      }, self.logData), '_deallocImageBuilderNetwork: '+
        'Sauron.deleteHostFromContextVersion error');
    }
    else {
      log.trace(self.logData, '_deallocImageBuilderNetwork: '+
                'Sauron.deleteHostFromContextVersion success');
    }
    deallocImageBuilderNetworkCb();
  });
};