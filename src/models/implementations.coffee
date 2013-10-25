async = require 'async'
configs = require '../configs'
error = require '../error'
mongoose = require 'mongoose'
_ = require 'lodash'
users = require './users'
uuid = require 'node-uuid'
request = require 'request'

Schema = mongoose.Schema
ObjectId = Schema.ObjectId

implementationSchema = new Schema
  owner:
    type: ObjectId
  implements:
    type: ObjectId
  subdomain:
    type:String
    index: true
    unique: true
  requirements:
    type: [
      name: String
      value: String
    ]
    default: [ ]

implementationSchema.set 'autoIndex', false

implementationSchema.statics.createImplementation = (domain, opts, cb) ->
  if not opts.implements then cb error 400, 'needs specification' else
    users.findUser domain, _id: opts.userId, domain.intercept (user) =>
      if not user then cb error 404, 'user not found' else
        @findOne
          owner: opts.userId
          implements: opts.implements
        , domain.intercept (implementation) =>
          save = () =>
            implementation.save domain.intercept () =>
              cb null, implementation.toJSON()
          if implementation then cb error 403, 'implementation already exists' else
            implementation = new @
            implementation.owner = opts.userId
            implementation.implements = opts.implements
            implementation.subdomain = opts.subdomain
            implementation.requirements = opts.requirements
            if opts.containerId
              updateEnv domain, opts, save
            else
              save null

implementationSchema.statics.listImplementations = (domain, userId, cb) ->
  users.findUser domain, _id: userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      if user.isModerator
        @find {}, domain.intercept (implementations) =>
          cb null, implementations.map (implementation) -> implementation.toJSON()
      else
        cb error 403, 'access denied'

implementationSchema.statics.listImplementationsForUser = (domain, userId, cb) ->
  users.findUser domain, _id: userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      @find
        owner: userId
      , domain.intercept (implementations) =>
        cb null, implementations.map (implementation) -> implementation.toJSON()

implementationSchema.statics.getImplementationBySpecification = (domain, opts, cb) ->
  users.findUser domain, _id:opts.userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      @findOne
        owner: opts.userId
        implements: opts.implements
      , domain.intercept (implementation) =>
        cb null, implementation.toJSON()

implementationSchema.statics.getImplementation = (domain, opts, cb) ->
  users.findUser domain, _id: opts.userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      if user.isModerator
        @findOne
          _id: opts.implementationId
        , domain.intercept (implementation) =>
          if not implementation?
            cb error 404, 'implementation not found'
          else
            cb null, implementation.toJSON()
      else
        @findOne
          owner: opts.userId
          _id: opts.implementationId
        , domain.intercept (implementation) =>
          if not implementation?
            cb error 404, 'implementation not found'
          else
            cb null, implementation.toJSON()

implementationSchema.statics.updateImplementation = (domain, opts, cb) ->
  users.findUser domain, _id: opts.userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      query = _id: opts.implementationId
      if !user.isModerator then query.owner = opts.userId
      @findOne query, domain.intercept (implementation) =>
        save = () =>
          implementation.save domain.intercept () ->
            cb null, implementation.toJSON()
        if not implementation?
          cb error 404, 'implementation not found'
        else
          console.log(opts)
          implementation.requirements = opts.requirements
          if opts.containerId
            updateEnv domain, opts, save
          else
            save null

implementationSchema.statics.deleteImplementation = (domain, opts, cb) ->
  users.findUser domain, _id: opts.userId, domain.intercept (user) =>
    if not user then cb error 403, 'user not found' else
      if user.isModerator
        @remove
          _id: opts.implementationId
        , domain.intercept (count) =>
          if count is 0
            cb error 404, 'implementation not found'
          else
            cb null
      else
        @remove
          owner: opts.userId
          _id: opts.implementationId
        , domain.intercept (count) =>
          if count is 0
            cb error 404, 'implementation not found'
          else
            cb null

implementationSchema.statics.updateEnvBySpecification = (domains, opts, cb) ->
  @findOne
    owner: opts.userId
    implements: opts.specification
  , (err, implementation) =>
    if (err or not implementation) then
      # to handle the specification but no implementation case
      console.error err or new Error 'no implementation'
    else 
      updateEnv domain, {
        userId: opts.userId
        implements: opts.specification
        containerId: opts.containerId
        requirements: implementation.requirements
      }, cb

updateEnv = (domain, opts, cb) ->
  containers = require './containers'
  containers.findOne
    owner: opts.userId
    specification: opts.implements
    _id: decodeId opts.containerId
  , domain.intercept (container) =>
    if container
      async.parallel [
        (cb) =>
          url = "http://#{container.servicesToken}.#{configs.rootDomain}/api/envs"
          request.get { url: url, pool: false }, domain.intercept (res, body) =>
            async.each opts.requirements, (requirement, cb) =>
              request.post
                pool: false
                url: url
                json:
                  key: requirement.name
                  value: requirement.value
              , cb
            , domain.intercept () =>
              request.get { url: url, pool: false }, domain.intercept (res, body) =>
                cb null
        (cb) =>
          url = "#{configs.harbourmaster}/containers/#{container.servicesToken}/route"
          request
            pool: false
            method: 'PUT'
            json:
              webToken: opts.subdomain
            url: url
          , domain.intercept (res, body) =>
            cb null
      ], domain.intercept cb
    else
     cb error 404, 'container not found'

module.exports = mongoose.model 'Implementation', implementationSchema

minus = /-/g
underscore = /_/g

decodeId = (id) -> (new Buffer(id.toString().replace(minus,'+').replace(underscore,'/'), 'base64')).toString('hex');