var nock = require('nock');
var Boom = require('dat-middleware').Boom;

module.exports = function (delay, failure) {
  nock('http://localhost:4243', { allowUnmocked: true })
    .filteringPath(/\/containers\/[0-9a-f]+\/logs\?.+/,
      '/containers/284912fa2cf26d40cc262798ecbb483b58f222d42ab1551e818afe35744688f7/logs')
    .get('/containers/284912fa2cf26d40cc262798ecbb483b58f222d42ab1551e818afe35744688f7/logs')
    .delayConnection(delay || 0)
    .reply((failure) ? 403 : 200, failure || 'Successfully built d776bdb409ab783cea9b986170a2a496684c9a99a6f9c048080d32980521e743');

  nock('http://localhost:4243', { allowUnmocked: true })
    .filteringPath(/\/images\/.+\/push/, '/images/repo/push')
    .post('/images/repo/push')
    .reply(200);

  nock('http://localhost:4243', { allowUnmocked: true })
    .post('/images/push')
    .reply(200);
};