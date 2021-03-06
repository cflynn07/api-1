'use strict'
require('loadenv')()

const ponos = require('ponos')

const log = require('logger').child({
  module: 'WorkerServer'
})

/**
 * The api ponos server.
 * @type {ponos~Server}
 * @module api/worker-server
 */
module.exports = new ponos.Server({
  name: process.env.APP_NAME,
  enableErrorEvents: true,
  log: log,
  rabbitmq: {
    channel: {
      prefetch: process.env.WORKER_PREFETCH
    },
    hostname: process.env.RABBITMQ_HOSTNAME,
    port: process.env.RABBITMQ_PORT,
    username: process.env.RABBITMQ_USERNAME,
    password: process.env.RABBITMQ_PASSWORD
  },
  tasks: {
    'application.container.create': require('workers/application.container.create'),
    'application.container.redeploy': require('workers/application.container.redeploy'),
    'build.container.create': require('workers/build.container.create'),
    'cluster.cleanup': require('workers/cluster.cleanup'),
    'cluster.create': require('workers/cluster.create'),
    'cluster.delete': require('workers/cluster.delete'),
    'cluster.update': require('workers/cluster.update'),
    'container.delete': require('workers/container.delete'),
    'container.logs.store': require('workers/container.logs.store'),
    'container.resource.clear': require('workers/container.resource.clear'),
    'context-version.delete': require('workers/context-version.delete'),
    'cluster-build.complete': require('workers/cluster-build.complete'),
    'image.push': require('workers/image.push'),
    'instance.auto-deploy': require('workers/instance.auto-deploy'),
    'instance.delete': require('workers/instance.delete'),
    'instance.kill': require('workers/instance.kill'),
    'instance.rebuild': require('workers/instance.rebuild'),
    'instance.restart': require('workers/instance.restart'),
    'instance.start': require('workers/instance.start'),
    'instance.stop': require('workers/instance.stop'),
    'instance.volumes.delete': require('workers/instance.volumes.delete'),
    'isolation.kill': require('workers/isolation.kill'),
    'isolation.match-commit': require('workers/isolation.match-commit'),
    'isolation.redeploy': require('workers/isolation.redeploy')
  },
  events: {
    'application.container.created': require('workers/application.container.created'),
    'application.container.died': require('workers/application.container.died'),
    'application.container.errored': require('workers/application.container.errored'),
    'build.container.created': require('workers/build.container.created'),
    'build.container.died': require('workers/build.container.died'),
    'build.container.started': require('workers/build.container.started'),
    'container.life-cycle.created': require('workers/container.life-cycle.created'),
    'container.life-cycle.died': require('workers/container.life-cycle.died'),
    'container.life-cycle.started': require('workers/container.life-cycle.started'),
    'container.network.attached': require('workers/container.network.attached'),
    'container.state.polled': require('workers/container.state.polled'),
    'dock.removed': require('workers/dock.removed'),
    'docker.events-stream.connected': require('workers/docker.events-stream.connected'),
    'docker.events-stream.disconnected': require('workers/docker.events-stream.disconnected'),
    'github.pull-request.opened': require('workers/github.pull-request.opened'),
    'github.pull-request.synchronized': require('workers/github.pull-request.synchronized'),
    'github.pushed': require('workers/github.pushed'),
    'instance.deleted': require('workers/instance.deleted'),
    'instance.expired': require('workers/instance.delete'),
    'instance.started': require('workers/instance.started'),
    'organization.payment-method.added': require('workers/organization.payment-method.added'),
    'stripe.invoice.payment-succeeded': require('workers/stripe.invoice.payment-succeeded'),
    'org.user.private-key.secured': require('workers/org.user.private-key.secured')
  },
  redisRateLimiter: {
    host: process.env.REDIS_IPADDRESS,
    port: process.env.REDIS_PORT
  }
})
