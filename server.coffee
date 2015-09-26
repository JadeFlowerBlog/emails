americano = require 'americano'

application = module.exports.start = (options, callback) ->
    options ?= {}
    options.name = 'emails'
    options.root ?= __dirname
    options.port ?= process.env.PORT or 9125
    options.host ?= process.env.HOST or '0.0.0.0'
    options.dbName = process.env.POUCHDB_NAME or 'db'

    callback ?= ->

    americano.start options, (err, app, server) ->
        callback null, app, server

if not module.parent
    application()

