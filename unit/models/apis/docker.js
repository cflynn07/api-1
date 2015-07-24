'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var afterEach = lab.afterEach;
var beforeEach = lab.beforeEach;
var Code = require('code');
var expect = Code.expect;
var sinon = require('sinon');
var noop = require('101/noop');

require('loadenv')();
var Docker = require('models/apis/docker');
var Dockerode = require('dockerode');
var Modem = require('docker-modem');

describe('docker unit test', function () {
  var model = new Docker('http://fake.host.com');
  describe('startUserContainer', function () {
    afterEach(function (done) {
      model.startContainer.restore();
      done();
    });

    it('should not include charon if env variable is not set', function (done) {
      sinon.stub(model, 'startContainer', function (container, opts) {
        expect(opts.Dns.length).to.equal(1);
        done();
      });
      model.startUserContainer({}, {}, noop);
    });

    it('should include charon as the first dns when evn is set', function (done) {
      var host = process.env.CHARON_HOST = '10.10.10.10';
      sinon.stub(model, 'startContainer', function (container, opts) {
        expect(opts.Dns.length).to.equal(2);
        expect(opts.Dns[0]).to.equal(host);
        delete process.env.CHARON_HOST;
        done();
      });
      model.startUserContainer({}, {}, noop);
    });
  });
  describe('pullImage', function () {
    var testImageName = 'galadriel';
    beforeEach(function (done) {
      sinon.stub(Dockerode.prototype, 'pull');
      done();
    });
    afterEach(function (done) {
      Dockerode.prototype.pull.restore();
      done();
    });
    it('should pull image', function (done) {
      Dockerode.prototype.pull.yieldsAsync();
      model.pullImage(testImageName, function (err) {
        expect(err).to.not.exist();
        expect(Dockerode.prototype.pull
          .withArgs(testImageName)
          .calledOnce).to.be.true();
        done();
      });
    });
    it('should cb error', function (done) {
      var testErr = 'sauron attacks';
      Dockerode.prototype.pull.yieldsAsync(testErr);
      model.pullImage(testImageName, function (err) {
        expect(err).to.be.equal(testErr);
        done();
      });
    });
  });
  describe('pushImage', function () {
    var testImageName = 'galadriel';
    var mockObj = {
      push: sinon.stub()
    };
    beforeEach(function (done) {
      sinon.stub(Dockerode.prototype, 'getImage').returns(mockObj);
      done();
    });
    afterEach(function (done) {
      Dockerode.prototype.getImage.restore();
      done();
    });
    it('should pull image', function (done) {
      mockObj.push.yieldsAsync();
      model.pushImage(testImageName, function (err) {
        expect(err).to.not.exist();
        expect(Dockerode.prototype.getImage
          .withArgs(testImageName)
          .calledOnce).to.be.true();
        expect(mockObj.push
          .withArgs({})
          .calledOnce).to.be.true();
        done();
      });
    });
    it('should cb error', function (done) {
      var testErr = 'sauron attacks';
      mockObj.push.yieldsAsync(testErr);
      model.pushImage(testImageName, function (err) {
        expect(err).to.be.equal(testErr);
        done();
      });
    });
  });
  describe('saveImage', function () {
    var testImageName = 'galadriel';
    var mockObj = {
      get: sinon.stub()
    };
    beforeEach(function (done) {
      sinon.stub(Dockerode.prototype, 'getImage').returns(mockObj);
      done();
    });
    afterEach(function (done) {
      Dockerode.prototype.getImage.restore();
      done();
    });
    it('should pull image', function (done) {
      mockObj.get.yieldsAsync();
      model.saveImage(testImageName, function (err) {
        expect(err).to.not.exist();
        expect(Dockerode.prototype.getImage
          .withArgs(testImageName)
          .calledOnce).to.be.true();
        expect(mockObj.get
          .withArgs()
          .calledOnce).to.be.true();
        done();
      });
    });
    it('should cb error', function (done) {
      var testErr = 'sauron attacks';
      mockObj.get.yieldsAsync(testErr);
      model.saveImage(testImageName, function (err) {
        expect(err).to.be.equal(testErr);
        done();
      });
    });
  });
  describe('loadImage', function () {
    var testImageName = 'galadriel';
    beforeEach(function (done) {
      sinon.stub(Dockerode.prototype, 'loadImage');
      done();
    });
    afterEach(function (done) {
      Dockerode.prototype.loadImage.restore();
      done();
    });
    it('should load image', function (done) {
      Dockerode.prototype.loadImage.yieldsAsync();
      model.loadImage(testImageName, function (err) {
        expect(err).to.not.exist();
        expect(Dockerode.prototype.loadImage
          .withArgs(testImageName)
          .calledOnce).to.be.true();
        done();
      });
    });
    it('should cb error', function (done) {
      var testErr = 'sauron attacks';
      Dockerode.prototype.loadImage.yieldsAsync(testErr);
      model.loadImage(testImageName, function (err) {
        expect(err).to.be.equal(testErr);
        done();
      });
    });
  });
  describe('transferImage', function () {
    var testImageName = 'galadriel';
    var mockObj;
    beforeEach(function (done) {
      mockObj = {
        get: sinon.stub(),
        push: sinon.stub()
      };
      sinon.stub(Dockerode.prototype, 'pull');
      sinon.stub(Dockerode.prototype, 'loadImage');
      sinon.stub(Modem.prototype, 'followProgress');
      sinon.stub(Dockerode.prototype, 'getImage').returns(mockObj);
      done();
    });
    afterEach(function (done) {
      Dockerode.prototype.pull.restore();
      Dockerode.prototype.loadImage.restore();
      Dockerode.prototype.getImage.restore();
      Modem.prototype.followProgress.restore();
      done();
    });
    it('should transfer image with direct push', function (done) {
      var testStream = 'mordor';
      var testTarget = 'http://mountdoom:123';
      mockObj.get.yieldsAsync(null, testStream);
      Dockerode.prototype.loadImage.yieldsAsync();
      model.transferImage(testImageName, testTarget, function (err) {
        expect(err).to.not.exist();
        expect(mockObj.get
          .withArgs()
          .calledOnce).to.be.true();
        expect(Dockerode.prototype.loadImage
          .withArgs(testStream)
          .calledOnce).to.be.true();
        done();
      });
    });
    it('should transfer image with registry if save failed', function (done) {
      var testStream = 'mordor';
      var testTarget = 'http://mountdoom:123';
      var testErr = 'Saruman';
      Modem.prototype.followProgress.yieldsAsync();
      Dockerode.prototype.pull.yieldsAsync();
      mockObj.get.yieldsAsync(testErr);
      mockObj.push.yieldsAsync(null, testStream);
      model.transferImage(testImageName, testTarget, function (err) {
        expect(err).to.not.exist();
        expect(mockObj.get
          .withArgs()
          .calledOnce).to.be.true();
        expect(Dockerode.prototype.loadImage
          .calledOnce).to.be.false();
        expect(mockObj.push
          .withArgs({})
          .calledOnce).to.be.true();
        expect(Dockerode.prototype.pull
          .withArgs(testImageName)
          .calledOnce).to.be.true();
        done();
      });
    });
    it('should transfer image with registry if load failed', function (done) {
      var testStream = 'mordor';
      var testTarget = 'http://mountdoom:123';
      var testErr = new Error('attack by Saruman');
      Modem.prototype.followProgress.yieldsAsync();
      Dockerode.prototype.pull.yieldsAsync();
      mockObj.get.yieldsAsync();
      Dockerode.prototype.loadImage.yieldsAsync(testErr);
      mockObj.push.yieldsAsync(null, testStream);
      model.transferImage(testImageName, testTarget, function (err) {
        expect(err).to.not.exist();
        expect(mockObj.get
          .withArgs()
          .calledOnce).to.be.true();
        expect(Dockerode.prototype.loadImage
          .calledOnce).to.be.true();
        expect(mockObj.push
          .withArgs({})
          .calledOnce).to.be.true();
        expect(Dockerode.prototype.pull
          .withArgs(testImageName)
          .calledOnce).to.be.true();
        done();
      });
    });
    it('should cb error if pull fails', function (done) {
      var testStream = 'mordor';
      var testTarget = 'http://mountdoom:123';
      var testErr = new Error('attack by Saruman');
      Modem.prototype.followProgress.yieldsAsync();
      Dockerode.prototype.pull.yieldsAsync(testErr);
      mockObj.get.yieldsAsync();
      Dockerode.prototype.loadImage.yieldsAsync(testErr);
      mockObj.push.yieldsAsync(null, testStream);
      model.transferImage(testImageName, testTarget, function (err) {
        expect(err).to.equal(testErr);
        expect(mockObj.get
          .withArgs()
          .calledOnce).to.be.true();
        expect(Dockerode.prototype.loadImage
          .calledOnce).to.be.true();
        expect(mockObj.push
          .withArgs({})
          .calledOnce).to.be.true();
        expect(Dockerode.prototype.pull
          .withArgs(testImageName)
          .calledOnce).to.be.true();
        done();
      });
    });
    it('should cb error if push fails', function (done) {
      var testTarget = 'http://mountdoom:123';
      var testErr = new Error('attack by Saruman');
      Modem.prototype.followProgress.yieldsAsync();
      Dockerode.prototype.pull.yieldsAsync();
      mockObj.get.yieldsAsync();
      Dockerode.prototype.loadImage.yieldsAsync(testErr);
      mockObj.push.yieldsAsync(testErr);
      model.transferImage(testImageName, testTarget, function (err) {
        expect(err).to.equal(testErr);
        expect(mockObj.get
          .withArgs()
          .calledOnce).to.be.true();
        expect(Dockerode.prototype.loadImage
          .calledOnce).to.be.true();
        expect(mockObj.push
          .withArgs({})
          .calledOnce).to.be.true();
        expect(Dockerode.prototype.pull
          .withArgs(testImageName)
          .calledOnce).to.be.false();
        done();
      });
    });
  });
  describe('directTransferImage', function () {
    var testImageName = 'galadriel';
    var mockObj;
    beforeEach(function (done) {
      mockObj = {
        get: sinon.stub(),
      };
      sinon.stub(Dockerode.prototype, 'loadImage');
      sinon.stub(Dockerode.prototype, 'getImage').returns(mockObj);
      done();
    });
    afterEach(function (done) {
      Dockerode.prototype.loadImage.restore();
      Dockerode.prototype.getImage.restore();
      done();
    });
    it('should transfer image with direct push', function (done) {
      var testStream = 'mordor';
      var testTarget = 'http://mountdoom:123';
      mockObj.get.yieldsAsync(null, testStream);
      Dockerode.prototype.loadImage.yieldsAsync();
      model.directTransferImage(testImageName, testTarget, function (err) {
        expect(err).to.not.exist();
        expect(mockObj.get
          .withArgs()
          .calledOnce).to.be.true();
        expect(Dockerode.prototype.loadImage
          .withArgs(testStream)
          .calledOnce).to.be.true();
        done();
      });
    });
    it('should cb error if load failed', function (done) {
      var testStream = 'mordor';
      var testTarget = 'http://mountdoom:123';
      var testErr = new Error('Nazgaul attack');
      mockObj.get.yieldsAsync(null, testStream);
      Dockerode.prototype.loadImage.yieldsAsync(testErr);
      model.directTransferImage(testImageName, testTarget, function (err) {
        expect(err.output.statusCode).to.equal(504);
        expect(mockObj.get
          .withArgs()
          .calledOnce).to.be.true();
        expect(Dockerode.prototype.loadImage
          .withArgs(testStream)
          .calledOnce).to.be.true();
        done();
      });
    });
    it('should cb error if save failed', function (done) {
      var testStream = 'mordor';
      var testTarget = 'http://mountdoom:123';
      var testErr = new Error('Nazgaul attack');
      mockObj.get.yieldsAsync(testErr);
      Dockerode.prototype.loadImage.yieldsAsync();
      model.directTransferImage(testImageName, testTarget, function (err) {
        expect(err).to.equal(testErr);
        expect(mockObj.get
          .withArgs()
          .calledOnce).to.be.true();
        expect(Dockerode.prototype.loadImage
          .withArgs(testStream)
          .calledOnce).to.be.false();
        done();
      });
    });
  });
});
