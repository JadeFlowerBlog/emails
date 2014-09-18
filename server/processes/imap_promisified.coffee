Imap = require 'imap'
Promise = require 'bluebird'
{MailParser} = require 'mailparser'
{WrongConfigError} = require '../utils/errors'


# better Promisify of node-imap
Promise.promisifyAll Imap.prototype, suffix: 'Promised'
module.exports = class ImapPromisified


    state: 'not connected'

    # called when the connection breaks randomly
    # can be overwritten
    onTerminated: ->

    # see node-imap for options
    constructor: (options) ->
        @_super = new Imap options

        # wait connection as a promise
        @waitConnected = new Promise (resolve, reject) =>
            @_super.once 'ready', =>
                @state = 'connected'
                resolve this
            @_super.once 'error', (err) =>
                @state = 'errored'
                if @waitConnected.isPending()
                    reject err
            @_super.connect()

        # we time out the connection at 10s
        # if the port is wrong, the failure is too damn long
        .timeout 10000, 'cant reach host'
        .catch (err) =>
            # if the know the type of error, clean it up for the user

            if err.textCode is 'AUTHENTICATIONFAILED'
                throw new WrongConfigError 'auth'

            if err.code is 'ENOTFOUND' and err.syscall is 'getaddrinfo'
                throw new WrongConfigError 'server'

            if err instanceof Promise.TimeoutError
                @_super.end()
                throw new WrongConfigError 'port'

            if err.source is 'timeout-auth'
                throw new WrongConfigError 'tls'

            # unknown err
            throw err

        # once connection is resolved
        .tap =>
            @_super.once 'error', (err) ->
                # an error happened while connection active
                # @TODO : how do we handle this ?
                console.log "ERROR ?", err
            @_super.once 'close', =>
                # if we did not expect the ending
                @onTerminated?() unless @waitEnding
                @closed = true
            @_super.once 'end', =>
                # if we did not expect the ending
                @onTerminated?() unless @waitEnding
                @closed = true

    # end the connection
    # if hard == false, we attempt to logout
    # else we destroy the socket
    end: (hard) ->
        return Promise.resolve('closed') if @state is 'closed'
        return @waitEnding if @waitEnding

        # do not end the connection before it is started
        @waitEnding = @waitConnected

        # if connection failed, waitEnding is resolved
        .catch -> Promise.resolve('closed')

        # if connection succeeded, end it
        .then =>
            new Promise (resolve, reject) =>
                if hard
                    # nuke the socket
                    @_super._sock.end()
                    @_super._sock.destroy()
                    return resolve 'closed'
                else
                    # do a logout before closing
                    @_super.end()

                @_super.once 'error', ->
                    resolve new Error 'fail to logout'
                @_super.once 'end', ->
                    resolve 'closed'
                @_super.once 'close', ->
                    resolve 'closed'

    # see imap.getBoxes
    # return a Promise of the boxtree
    getBoxes: ->
        @_super.getBoxesPromised.apply @_super, arguments

    # see imap.openBox
    # return a Promise of the box
    # change : it is fast to open the same box multiple time
    openBox: (name) ->
        if @_super._box?.name is name
            return Promise.resolve @_super._box
        @_super.openBoxPromised.apply @_super, arguments

    # see imap.search
    # return a Promise of the search result (UIDs array)
    search: ->
        @_super.searchPromised.apply @_super, arguments

    # fetch one mail by its UID from the currently open mailbox
    # return a promise for the mailparser result
    fetchOneMail: (id) ->
        return new Promise (resolve, reject) =>
            fetch = @_super.fetch [id], size: true, bodies: ''
            messageReceived = false
            fetch.on 'message', (msg) ->
                messageReceived = true
                msg.once 'error', reject
                msg.on 'attributes', (attrs) ->
                    # for now, we dont use the msg attributes

                msg.on 'body', (stream) ->
                    parts = []
                    # this should be streaming
                    # but node-imap#345
                    stream.on 'error', reject
                    stream.on 'data', (d) -> parts.push d
                    stream.on 'end', ->
                        mailparser = new MailParser()
                        mailparser.on 'error', reject
                        mailparser.on 'end', resolve
                        mailparser.write(part) for part in parts
                        mailparser.end()

            fetch.on 'error', reject
            fetch.on 'end', ->
                unless messageReceived
                    reject new Error 'fetch ended with no message'