configs = require '../lib/configs'
helpers = require './helpers'
sa = require 'superagent'

describe 'api', ->

  it 'should return a 500 on a thrown error ::base', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/throws")
          .set('runnable-token', token)
          .end (err, res) ->
            if err then done err else
              res.should.have.status 500
              done()

  it 'should respond with hello at the root path ::base', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}")
          .set('runnable-token', token)
          .end (err, res) ->
            if err then done err else
              res.should.have.status 200
              res.body.message.should.equal 'hello!'
              res.type.should.equal 'application/json'
              done()

  it 'should return 404 not found when hit with unknown route ::base', (done) ->
    user = sa.agent()
    helpers.createUser user, (err, token) ->
      if err then done err else
        user.get("http://localhost:#{configs.port}/blah")
          .set('runnable-token', token)
          .end (err, res) ->
            if err then done err else
              res.should.have.status 404
              res.body.message.should.equal 'operation not found'
              done()