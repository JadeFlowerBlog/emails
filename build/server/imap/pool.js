// Generated by CoffeeScript 1.9.3
var Account, AccountConfigError, Imap, ImapPool, RecoverChangedUIDValidity, Scheduler, TimeoutError, async, connectionID, forceOauthRefresh, log, makeIMAPConfig, rawImapLog, ref, ref1, xoauth2,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

ref = require('../utils/errors'), AccountConfigError = ref.AccountConfigError, TimeoutError = ref.TimeoutError;

log = require('../utils/logging')({
  prefix: 'imap:pool'
});

rawImapLog = require('../utils/logging')({
  prefix: 'imap:raw'
});

Account = require('../models/account');

Imap = require('./connection');

xoauth2 = require('xoauth2');

async = require("async");

ref1 = require('../imap/account2config'), makeIMAPConfig = ref1.makeIMAPConfig, forceOauthRefresh = ref1.forceOauthRefresh;

Scheduler = require('../processes/_scheduler');

RecoverChangedUIDValidity = require('../processes/recover_change_uidvalidity');

connectionID = 1;

module.exports = ImapPool = (function() {
  var _typeConnectionError;

  function ImapPool(account) {
    this._deQueue = bind(this._deQueue, this);
    this._closeConnections = bind(this._closeConnections, this);
    log.debug(this.id, "new pool Object#" + account.id);
    this.id = account.id || 'tmp';
    this.account = account;
    this.parallelism = 1;
    this.tasks = [];
    this.pending = {};
    this.failConnectionCounter = 0;
    this.connecting = 0;
    this.connections = [];
    this.freeConnections = [];
  }

  ImapPool.prototype.destroy = function() {
    log.debug(this.id, "destroy");
    if (this.closingTimer) {
      clearTimeout(this.closingTimer);
    }
    return this._closeConnections();
  };

  ImapPool.prototype._removeFromPool = function(connection) {
    var index;
    log.debug(this.id, "remove " + connection.connectionID + " from pool");
    index = this.connections.indexOf(connection);
    if (index > -1) {
      this.connections.splice(index, 1);
    }
    index = this.freeConnections.indexOf(connection);
    return this.freeConnections.splice(index, 1);
  };

  ImapPool.prototype._makeConnection = function() {
    log.debug(this.id, "makeConnection");
    this.connecting++;
    return makeIMAPConfig(this.account, (function(_this) {
      return function(err, options) {
        var imap, onConnError, password;
        if (err) {
          log.error("oauth generation error", err);
        }
        if (err) {
          return _this._onConnectionError({
            connectionName: ''
          }, err);
        }
        log.debug("Attempting connection");
        password = options.password;
        if (password) {
          options.password = "****";
        }
        log.debug(options);
        if (password) {
          options.password = password;
        }
        imap = new Imap(options);
        onConnError = _this._onConnectionError.bind(_this, imap);
        imap.connectionID = 'conn' + connectionID++;
        imap.connectionName = options.host + ":" + options.port;
        imap.on('error', onConnError);
        imap.once('ready', function() {
          imap.removeListener('error', onConnError);
          clearTimeout(_this.wrongPortTimeout);
          return _this._onConnectionSuccess(imap);
        });
        imap.connect();
        return _this.wrongPortTimeout = setTimeout(function() {
          var ref2, ref3;
          log.debug(_this.id, "timeout 10s");
          imap.removeListener('error', onConnError);
          onConnError(new TimeoutError("Timeout connecting to " + (((ref2 = _this.account) != null ? ref2.imapServer : void 0) + ":" + ((ref3 = _this.account) != null ? ref3.imapPort : void 0))));
          return imap.destroy();
        }, 10000);
      };
    })(this));
  };

  ImapPool.prototype._onConnectionError = function(connection, err) {
    log.debug(this.id, "connection error on " + connection.connectionName);
    log.debug("RAW ERROR", err);
    clearTimeout(this.wrongPortTimeout);
    this.connecting--;
    this.failConnectionCounter++;
    if (this.failConnectionCounter > 2) {
      return this._giveUp(_typeConnectionError(err));
    } else if (err.source === 'autentification' && this.account.oauthProvider === 'GMAIL') {
      return forceOauthRefresh(this.account, this._deQueue);
    } else {
      return setTimeout(this._deQueue, 5000);
    }
  };

  ImapPool.prototype._onConnectionSuccess = function(connection) {
    log.debug(this.id, "connection success");
    connection.once('close', this._onActiveClose.bind(this, connection));
    connection.once('error', this._onActiveError.bind(this, connection));
    this.connections.push(connection);
    this.freeConnections.push(connection);
    this.connecting--;
    this.failConnectionCounter = 0;
    return process.nextTick(this._deQueue);
  };

  ImapPool.prototype._onActiveError = function(connection, err) {
    var name;
    name = connection.connectionName;
    log.error("error on active imap socket on " + name, err);
    this._removeFromPool(connection);
    try {
      return connection.destroy();
    } catch (_error) {}
  };

  ImapPool.prototype._onActiveClose = function(connection, err) {
    var task;
    log.error("active connection " + connection.connectionName + " closed", err);
    task = this.pending[connection.connectionID];
    if (task) {
      delete this.pending[connection.connectionID];
      if (typeof task.callback === "function") {
        task.callback(err || new Error('connection was closed'));
      }
      task.callback = null;
    }
    return this._removeFromPool(connection);
  };

  ImapPool.prototype._closeConnections = function() {
    var connection;
    log.debug(this.id, "closeConnections");
    this.closingTimer = null;
    connection = this.connections.pop();
    while (connection) {
      connection.expectedClosing = true;
      connection.end();
      connection = this.connections.pop();
    }
    return this.freeConnections = [];
  };

  ImapPool.prototype._giveUp = function(err) {
    var results, task;
    log.debug(this.id, "giveup", err);
    task = this.tasks.pop();
    results = [];
    while (task) {
      task.callback(err);
      results.push(task = this.tasks.pop());
    }
    return results;
  };

  ImapPool.prototype._deQueue = function() {
    var free, full, imap, moreTasks, task;
    free = this.freeConnections.length > 0;
    full = this.connections.length + this.connecting >= this.parallelism;
    moreTasks = this.tasks.length > 0;
    if (this.account.isTest()) {
      if (moreTasks) {
        task = this.tasks.pop();
        if (typeof task.callback === "function") {
          task.callback(null);
        }
        process.nextTick(this._deQueue);
      }
      return;
    }
    if (moreTasks) {
      if (this.closingTimer) {
        clearTimeout(this.closingTimer);
      }
      if (free) {
        imap = this.freeConnections.pop();
        task = this.tasks.pop();
        this.pending[imap.connectionID] = task;
        return task.operation(imap, (function(_this) {
          return function(err) {
            var arg, args;
            args = (function() {
              var i, len, results;
              results = [];
              for (i = 0, len = arguments.length; i < len; i++) {
                arg = arguments[i];
                results.push(arg);
              }
              return results;
            }).apply(_this, arguments);
            _this.freeConnections.push(imap);
            delete _this.pending[imap.connectionID];
            process.nextTick(function() {
              var ref2;
              if ((ref2 = task.callback) != null) {
                ref2.apply(null, args);
              }
              return task.callback = null;
            });
            return process.nextTick(_this._deQueue);
          };
        })(this));
      } else if (!full) {
        return this._makeConnection();
      }
    } else {
      return this.closingTimer != null ? this.closingTimer : this.closingTimer = setTimeout(this._closeConnections, 5000);
    }
  };

  _typeConnectionError = function(err) {
    var typed;
    typed = err;
    if (err.textCode === 'AUTHENTICATIONFAILED') {
      typed = new AccountConfigError('auth', err);
    }
    if (err.code === 'ENOTFOUND' && err.syscall === 'getaddrinfo') {
      typed = new AccountConfigError('imapServer', err);
    }
    if (err.code === 'EHOSTUNREACH') {
      typed = new AccountConfigError('imapServer', err);
    }
    if (err.source === 'timeout-auth') {
      typed = new AccountConfigError('imapTLS', err);
    }
    if (err instanceof TimeoutError) {
      typed = new AccountConfigError('imapPort', err);
    }
    return typed;
  };

  ImapPool.prototype._wrapOpenBox = function(cozybox, operation) {
    var wrapped;
    return wrapped = (function(_this) {
      return function(imap, callback) {
        return imap.openBox(cozybox.path, function(err, imapbox) {
          var newUidvalidity, oldUidvalidity, recover;
          if (err) {
            return callback(err);
          }
          if (!imapbox.persistentUIDs) {
            return callback(new Error('UNPERSISTENT UID'));
          }
          oldUidvalidity = cozybox.uidvalidity;
          newUidvalidity = imapbox.uidvalidity;
          if (oldUidvalidity && oldUidvalidity !== newUidvalidity) {
            log.error("uidvalidity has changed");
            recover = new RecoverChangedUIDValidity({
              newUidvalidity: newUidvalidity,
              mailbox: cozybox,
              imap: imap
            });
            return recover.run(function(err) {
              if (err) {
                log.error(err);
              }
              return wrapped(imap, callback);
            });
          } else {
            return operation(imap, imapbox, function(err, arg1, arg2, arg3) {
              var changes;
              log.debug(_this.id, "wrapped operation completed");
              if (err) {
                return callback(err);
              }
              if (!oldUidvalidity) {
                changes = {
                  uidvalidity: newUidvalidity
                };
                return cozybox.updateAttributes(changes, function(err) {
                  if (err) {
                    return callback(err);
                  }
                  return callback(null, arg1, arg2, arg3);
                });
              } else {
                return callback(null, arg1, arg2, arg3);
              }
            });
          }
        });
      };
    })(this);
  };

  ImapPool.prototype.doASAP = function(operation, callback) {
    this.tasks.unshift({
      operation: operation,
      callback: callback
    });
    return this._deQueue();
  };

  ImapPool.prototype.doLater = function(operation, callback) {
    this.tasks.push({
      operation: operation,
      callback: callback
    });
    return this._deQueue();
  };

  ImapPool.prototype.doASAPWithBox = function(cozybox, operation, callback) {
    operation = this._wrapOpenBox(cozybox, operation);
    this.tasks.unshift({
      operation: operation,
      callback: callback
    });
    return this._deQueue();
  };

  ImapPool.prototype.doLaterWithBox = function(cozybox, operation, callback) {
    operation = this._wrapOpenBox(cozybox, operation);
    this.tasks.push({
      operation: operation,
      callback: callback
    });
    return this._deQueue();
  };

  return ImapPool;

})();
