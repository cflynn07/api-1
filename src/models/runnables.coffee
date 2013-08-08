async = require 'async'
configs = require '../configs'
containers = require './containers'
domain = require 'domain'
error = require '../error'
images = require './images'
users = require './users'
_ = require 'lodash'

Runnables =

  createImage: (domain, userId, from, sync, cb) ->
    handler = (image) ->
      users.findUser domain, _id: userId, (err, user) ->
        if err then cb err else
          if not user then cb error 404, 'user not found' else
            user.addVote domain, image._id, (err) ->
              if err then cb err else
                json_image = image.toJSON()
                delete json_image.files
                if json_image.parent then json_image.parent = encodeId json_image.parent
                json_image._id = encodeId image._id
                cb null, json_image
    if not isObjectId64 from
      images.createFromDisk domain, userId, from, sync, (err, image) ->
        if err then cb err else
          handler image
    else
      containers.findOne _id: decodeId(from), domain.intercept (container) ->
        if not container then cb error 403, 'source runnable not found' else
          if container.owner.toString() isnt userId then cb error 403, 'permission denied' else
            images.createFromContainer domain, container, (err, image) ->
              if err then cb err else
                container.target = image._id
                container.save domain.intercept () ->
                  handler image

  createContainer: (domain, userId, from, cb) ->
    async.waterfall [
      (cb) ->
        if isObjectId64 from
          images.findOne _id: decodeId(from), domain.intercept (image) ->
            if not image then cb error 400, 'could not find source image to fork from' else
              cb null, image
        else
          options =
            sort: { _id: 1 }
            limit: 1
          images.find 'tags.name': from, null, options, domain.intercept (images) ->
            if not images.length then cb error 400, 'could not find source image to fork from' else
              cb null, images[0]
      (image, cb)->
        containers.create domain, userId, image, (err, container) ->
          if err then cb err else
            container.getProcessState domain, (err, state) ->
              if err then cb err else
                json_container = container.toJSON()
                delete json_container.files
                if json_container.parent then json_container.parent = encodeId json_container.parent
                if json_container.target then json_container.target = encodeId json_container.target
                _.extend json_container, state
                json_container._id = encodeId container._id
                cb null, json_container
    ], cb

  listContainers: (domain, userId, parent, cb) ->
    query = { owner: userId }
    if parent then query.parent = decodeId parent
    containers.find query, domain.intercept (containers) ->
      results = for item in containers
        json = item.toJSON()
        delete json.files
        json._id = encodeId json._id
        if json.parent then json.parent = encodeId json.parent
        json
      cb null, results

  getContainer: (domain, userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    if not isObjectId runnableId then cb error, 404, 'runnable not found' else
      containers.findOne _id: runnableId, domain.intercept (container) ->
        if not container then cb error 404, 'runnable not found' else
          if container.owner.toString() isnt userId.toString() then cb error 403, 'permission denied' else
            container.getProcessState domain, (err, state) ->
              if err then cb err else
                json = container.toJSON()
                delete json.files
                json._id = encodeId json._id
                if json.parent then json.parent = encodeId json.parent
                if json.target then json.target = encodeId json.target
                _.extend json, state
                cb null, json

  removeContainer: (domain, userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    remove = () -> containers.destroy domain, runnableId, cb
    containers.findOne _id: runnableId, domain.intercept (container) ->
      if not container then cb error 404, 'runnable not found' else
        if container.owner.toString() is userId.toString() then remove() else
          users.findUser domain, _id: userId, (err, user) ->
            if err then cb err else
              if not user then cb error 404, 'user not found' else
                if user.permission_level <= 1 then cb error 403, 'permission denied' else
                  remove()

  removeImage: (domain, userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    remove = () -> images.destroy domain, runnableId, cb
    images.findOne _id: runnableId, domain.bind (err, image) ->
      if err then throw err
      if not image then cb error 404, 'runnable not found' else
        if image.owner.toString() is userId.toString() then remove() else
          users.findUser domain, _id: userId, (err, user) ->
            if err then cb err else
              if not user then cb error 404, 'user not found' else
                if user.permission_level <= 1 then cb error 403, 'permission denied' else
                  for vote in user.votes
                    if vote.runnable.toString() is image._id.toString()
                      vote.remove()
                  remove()

  updateName: (domain, userId, runnableId, newName, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, domain.intercept (container) ->
      if not container then cb error 404, 'runnable not found' else
        if container.owner.toString() isnt userId.toString() then cb error 403, 'permission denied' else
          container.name = newName;
          container.save domain.intercept () ->
            json = container.toJSON()
            delete json.files
            json._id = encodeId json._id
            if json.parent then json.parent = encodeId json.parent
            if json.target then json.target = encodeId json.target
            cb null, container

  updateImage: (domain, userId, runnableId, from, cb) ->
    runnableId = decodeId runnableId
    from = decodeId from
    images.findOne _id: runnableId, domain.intercept (image) ->
      if not image then cb error 404, 'published runnable does not exist' else
        update = (su) ->
          containers.findOne _id: from, domain.intercept (container) ->
            if not container then cb error 403, 'source container to copy from does not exist' else
              if not su and container.owner.toString() isnt image.owner.toString()
                cb error 400, 'source container owner does not match image owner'
              else
                image.updateFromContainer domain, container, (err) ->
                  if err then cb err else
                    json_project = image.toJSON()
                    delete json_project.files
                    json_project._id = encodeId json_project._id
                    if json_project.parent then json_project.parent = encodeId json_project.parent
                    cb null, json_project
        if image.owner.toString() is userId then update false else
          users.findUser domain, _id: userId, (err, user) ->
            if err then cb err else
              if not user then cb error 404, 'user not found' else
                if user.permission_level < 5 then cb error 403, 'permission denied' else
                  update true

  getImage: (domain, runnableId, cb) ->
    if not isObjectId64 runnableId then cb error 404, 'runnable not found' else
      decodedRunnableId = decodeId runnableId
      images.findOne _id: decodedRunnableId, domain.intercept (image) =>
        if not image then cb error 404, 'runnable not found' else
          @getVotes domain, runnableId, (err, votes) ->
            if err then cb err else
              json_project = image.toJSON()
              delete json_project.files
              json_project.votes = votes.count
              json_project._id = encodeId json_project._id
              if json_project.parent then json_project.parent = encodeId json_project.parent
              cb null, json_project

  startContainer: (domain, userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, domain.intercept (container) ->
      if not container then cb error 404, 'runnable not found' else
        if container.owner.toString() isnt userId.toString() then cb error 403, 'permission denied' else
          container.getProcessState domain, (err, state) ->
            if err then cb err else
              response = (state) ->
                json_project = container.toJSON()
                delete json_project.files
                json_project._id = encodeId json_project._id
                if json_project.parent then json_project.parent = encodeId json_project.parent
                _.extend json_project, state
                cb null, json_project
              if state.running then response state else
                container.start domain, (err) ->
                  if err then cb err else
                    container.getProcessState domain, (err, state) ->
                      response state

  stopContainer: (domain, userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, domain.intercept (container) ->
      if not container then cb error 404, 'runnable not found' else
        if container.owner.toString() isnt userId.toString()
          cb error 403, 'permission denied'
        else
          container.getProcessState domain, (err, state) ->
            response = (state) ->
              json_project = container.toJSON()
              delete json_project.files
              json_project._id = encodeId json_project._id
              if json_project.parent then json_project.parent = encodeId json_project.parent
              _.extend json_project, state
              cb null, json_project
            if not state.running then response state else
              container.stop domain, (err) ->
                if err then cb err else
                  container.getProcessState domain, (err, state) ->
                    if err then cb err else
                      response state

  getVotes: (domain, runnableId, cb) ->
    runnableId = decodeId runnableId
    users.find('votes.runnable': runnableId).count().exec domain.intercept (count) ->
      cb null, { count: count - 1 }

  vote: (domain, userId, runnableId, cb) ->
    runnableId = decodeId runnableId
    images.isOwner domain, userId, runnableId, (err, owner) ->
      if owner then cb error 403, 'cannot vote for own runnables' else
        users.findOne _id: userId, domain.intercept (user) ->
          if not user then cb error 403, 'user not found' else
            user.addVote domain, runnableId, cb

  listAll: (domain, sortByVotes, limit, page, cb) ->
    if not sortByVotes
      images.find().skip(page*limit).limit(limit).exec domain.intercept (results) ->
        cb null, arrayToJSON results
    else
      users.aggregate voteSortPipeline(limit, limit*page), domain.intercept (results) ->
        async.map results, (result, cb) ->
          images.findOne _id: result._id, domain.intercept (runnable) ->
            if not runnable then cb() else
              runnable.votes = result.number - 1
              cb null, runnable
        , (err, results) ->
          if err then cb err else
            result = [ ]
            for item in results
              if item
                json = item.toJSON()
                json._id = encodeId json._id
                delete json.files
                json.votes = item.votes
                if json.parent then json.parent = encodeId json.parent
                result.push json
            cb null, result

  listFiltered: (domain, query, sortByVotes, limit, page, cb) ->
    if not sortByVotes
      images.find(query).skip(page*limit).limit(limit).exec domain.intercept (results) ->
        cb null, arrayToJSON results
    else
      images.find query, domain.intercept (selected) ->
        filter = [ ]
        for image in selected
          filter.push image._id
        users.aggregate voteSortPipelineFiltered(limit, limit*page, filter), domain.intercept (results) ->
          async.map results, (result, cb) ->
            images.findOne { _id: result._id }, domain.intercept (runnable) ->
              if not runnable then cb() else
                runnable.votes = result.number - 1
                cb null, runnable
          , (err, results) ->
            if err then cb err else
              result = [ ]
              for item in results
                if item
                  json = item.toJSON()
                  delete json.files
                  json._id = encodeId json._id
                  json.votes = item.votes
                  if json.parent then json.parent = encodeId json.parent
                  result.push json
              cb null, result

  listNames: (domain, cb) ->
    images.find({ tags: $not: $size: 0 }, 'name').exec domain.intercept (results) ->
      cb null, arrayToJSON results

  getTags: (domain, runnableId, cb) ->
    runnableId = decodeId runnableId
    images.findOne _id: runnableId, domain.intercept (image) ->
      if not image then cb error 404, 'runnable not found' else
        cb null, image.tags

  getTag: (domain, runnableId, tagId, cb) ->
    runnableId = decodeId runnableId
    images.findOne _id: runnableId, domain.intercept (image) ->
      if not image then cb error 404, 'runnable not found' else
        tag = image.tags.id tagId
        if not tag then cb error 404, 'tag not found' else
          cb null, tag

  addTag: (domain, userId, runnableId, text, cb) ->
    users.findUser domain, _id: userId, (err, user) ->
      if err then cb err else
        if not user then cb error 403, 'user not found' else
          if user.permission_level < 1 then cb error 403, 'permission denied' else
            runnableId = decodeId runnableId
            images.findOne _id: runnableId, domain.intercept (image) ->
              if not image then cb error 404, 'runnable not found' else
                if image.owner.toString() isnt userId.toString()
                  if user.permission_level < 2 then cb error 403, 'permission denied' else
                    image.tags.push name: text
                    tagId = image.tags[image.tags.length-1]._id
                    image.save domain.intercept () ->
                      cb null, { name: text, _id: tagId }
                else
                  image.tags.push name: text
                  tagId = image.tags[image.tags.length-1]._id
                  image.save domain.intercept () ->
                    cb null, { name: text, _id: tagId }

  removeTag: (domain, userId, runnableId, tagId, cb) ->
    runnableId = decodeId runnableId
    images.findOne _id: runnableId, domain.intercept (image) ->
      if not image then cb error 404, 'runnable not found' else
        if image.owner.toString() isnt userId.toString()
          users.findOne _id: userId, domain.intercept (user) ->
            if not user then cb error 403, 'user not found' else
              if user.permission_level < 2 then cb error 403, 'permission denied' else
                image.tags.id(tagId).remove()
                image.save domain.intercept () ->
                  cb()
        else
          image.tags.id(tagId).remove()
          image.save domain.intercept () ->
            cb()

  getContainerTags: (domain, runnableId, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, domain.intercept (container) ->
      if not container then cb error 404, 'runnable not found' else
        cb null, container.tags

  getContainerTag: (domain, runnableId, tagId, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, domain.intercept (container) ->
      if not container then cb error 404, 'runnable not found' else
        tag = container.tags.id tagId
        if not tag then cb error 404, 'tag not found' else
          cb null, tag

  addContainerTag: (domain, userId, runnableId, text, cb) ->
    users.findUser domain, _id: userId, (err, user) ->
      if err then cb err else
        if not user then cb error 403, 'user not found' else
          runnableId = decodeId runnableId
          containers.findOne _id: runnableId, domain.intercept (container) ->
            if not container then cb error 404, 'runnable not found' else
              if container.owner.toString() isnt userId.toString()
                if user.permission_level < 2 then cb error 403, 'permission denied' else
                  container.tags.push name: text
                  tagId = container.tags[container.tags.length-1]._id
                  container.save domain.intercept () ->
                    cb null, { name: text, _id: tagId }
              else
                container.tags.push name: text
                tagId = container.tags[container.tags.length-1]._id
                container.save domain.intercept () ->
                  cb null, { name: text, _id: tagId }

  removeContainerTag: (domain, userId, runnableId, tagId, cb) ->
    runnableId = decodeId runnableId
    containers.findOne _id: runnableId, domain.intercept (container) ->
      if not container then cb error 404, 'runnable not found' else
        if container.owner.toString() isnt userId.toString()
          users.findOne _id: userId, domain.intercept (user) ->
            if not user then cb error 403, 'user not found' else
              if user.permission_level < 2 then cb error 403, 'permission denied' else
                container.tags.id(tagId).remove()
                container.save domain.intercept () ->
                  cb()
        else
          container.tags.id(tagId).remove()
          container.save domain.intercept () ->
            cb()

  syncFiles: (domain, userId, runnableId, cb) ->
    fetchContainer domain, userId, runnableId, (err, container) ->
      if err then cb err else
        container.syncFiles cb

  listFiles: (domain, userId, runnableId, content, dir, default_tag, path, cb) ->
    fetchContainer domain, userId, runnableId, (err, container) ->
      if err then cb err else
        container.listFiles domain, content, dir, default_tag, path, cb

  createFile: (domain, userId, runnableId, name, path, content, cb) ->
    fetchContainer domain, userId, runnableId, (err, container) ->
      if err then cb err else
        container.createFile domain, name, path, content, (err, file) ->
          cb err, file

  readFile: (domain, userId, runnableId, fileId, cb) ->
    fetchContainer domain, userId, runnableId, (err, container) ->
      if err then cb err else
        container.readFile domain, fileId, cb

  updateFile: (domain, userId, runnableId, fileId, content, cb) ->
    fetchContainer domain, userId, runnableId, (err, container) ->
      if err then cb err else
        container.updateFile domain, fileId, content, cb

  deleteFile: (domain, userId, runnableId, fileId, recursive, cb) ->
    fetchContainer domain, userId, runnableId, (err, container) ->
      if err then cb err else
        container.deleteFile domain, fileId, recursive, cb

  renameFile: (domain, userId, runnableId, fileId, name, cb) ->
    fetchContainer domain, userId, runnableId, (err, container) ->
      if err then cb err else
        container.renameFile domain, fileId, name, cb

  moveFile: (domain, userId, runnableId, fileId, path, cb) ->
    fetchContainer domain, userId, runnableId, (err, container) ->
      if err then cb err else
        container.moveFile domain, fileId, path, cb

  createDirectory: (domain, userId, runnableId, name, path, cb) ->
    fetchContainer domain, userId, runnableId, (err, container) ->
      if err then cb err else
        container.createDirectory domain, name, path, cb

  defaultFile: (domain, userId, runnableId, fileId, cb) ->
    fetchContainer domain, userId, runnableId, (err, container) ->
      if err then cb err else
        container.tagFile domain, fileId, cb

  getStat: (domain, userId, runnableId, stat, cb) ->
    if not (stat in stats) then cb error 400, 'not a valid stat' else
      runnableId = decodeId runnableId
      async.parallel [
        (cb) ->
          images.findOne _id: runnableId, domain.intercept (image) ->
            cb null, image[stat]
        (cb) ->
          users.findOne _id: userId, domain.intercept (user) ->
            cb null, user[stat]
      ], (err, results) ->
        if err then cb err else
          cb null,
            image: results[0]
            user: results[1]

  incrementStat: (domain, userId, runnableId, stat, cb) ->
    if !(stat in stats) then cb error 400, 'not a valid stat' else
      runnableId = decodeId runnableId
      async.parallel [
        (cb) ->
          images.findOne _id: runnableId, domain.intercept (image) ->
            image[stat] = image[stat] + 1
            image.save domain.intercept () ->
              cb null, image[stat]
        (cb) ->
          users.findOne _id: userId, domain.intercept (user) ->
            user[stat] = user[stat] + 1
            user.save domain.intercept () ->
              cb null, user[stat]
      ], (err, results) ->
        if err then cb err else
          cb null,
            image: results[0]
            user: results[1]


module.exports = Runnables

voteSortPipeline = (limit, skip) ->
  [
    {
      $project:
        _id: 0
        votes: '$votes.runnable'
    },
    { $unwind: '$votes' },
    { $group:
        _id: '$votes'
        number:
          $sum: 1
    },
    {
      $sort: number: -1
    },
    {
      $skip: skip
    },
    {
      $limit: limit
    }
  ]

voteSortPipelineFiltered = (limit, skip, filter) ->
  [
    {
      $project:
        _id: 0
        votes: '$votes.runnable'
    },
    { $unwind: '$votes' },
    { $match: { votes: { $in: filter } } },
    { $group:
        _id: '$votes'
        number:
          $sum: 1
    },
    {
      $sort: number: -1
    },
    {
      $skip: skip
    },
    {
      $limit: limit
    }
  ]

fetchContainer = (domain, userId, runnableId, cb) ->
  runnableId = decodeId runnableId
  containers.findOne _id: runnableId, domain.intercept (container) ->
    if not container then cb error 404, 'runnable not found' else
      if container.owner.toString() isnt userId.toString() then cb error 403, 'permission denied' else
        cb null, container

arrayToJSON = (res) ->
  result = for item in res
    json = item.toJSON()
    delete json.files
    json._id = encodeId json._id
    if json.parent then json.parent = encodeId json.parent
    json

plus = /\+/g
slash = /\//g
minus = /-/g
underscore = /_/g

stats = [
  'copies'
  'pastes'
  'cuts'
  'runs'
  'views'
]

encodeId = (id) -> id
decodeId = (id) -> id

if configs.shortProjectIds
  encodeId = (id) -> (new Buffer(id.toString(), 'hex')).toString('base64').replace(plus,'-').replace(slash,'_')
  decodeId = (id) -> (new Buffer(id.toString().replace(minus,'+').replace(underscore,'/'), 'base64')).toString('hex');

isObjectId = (str) ->
  Boolean(str.match(/^[0-9a-fA-F]{24}$/))

isObjectId64 = (str) ->
  str = decodeId str
  Boolean(str.match(/^[0-9a-fA-F]{24}$/))
