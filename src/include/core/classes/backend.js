"use strict";

/**
 * Main worker class
 */
define([
    'config',
    'class',
    'express',
    'http',
    './network/comet',
    'crypto',
    './network/queue/queue',
    'body-parser',
    'cookie-parser',
    './db/redis',
    'mongo',
    '../utils/misc',
    'logger',
    'os',
    'q',
    'lodash',
    'vent'
], function(config, Class, express, http, Comet, crypto, Queue, bodyParser, cookieParser,
            Redis, mongoose, utils, logger, os, Q, _, vent)
{
    // create db instances so other modules could simply .get() them
    var redis = Redis.acquire({
            port: config.general.get('redis.port'),
            host: config.general.get('redis.host'),
            options: { }
        }),

        pubsub = Redis.acquire({
            port: config.general.get('redis.port'),
            host: config.general.get('redis.host'),
            options: { }
        }, 'pubsub');

    var User = require('core/classes/user'),
        Link = require('core/classes/network/link'),
        Bootstrap = require('bootstrap');

    /**
     * @class Backend
     */
    return Class.extend(/** @lends Backend.prototype */{

        backendEvents: {
            'user:message': 'onUserMessage'
        },

        /**
         * @type Object
         */
        modules: null,

        /**
         * @type Object
         */
        socketEvents: null,

        /**
         * @type Object
         */
        linkEvents: null,

        /**
         * @type Object
         */
        queueEvents: null,

        /**
         * @type Object
         */
        options : null,

        app     : null,
        server  : null,

        /**
         * @type Object
         */
        users   : null,

        /**
         * @type Link
         */
        link    : null,

        /**
         * @type Queue
         */
        queue   : null,

        /**
         * @type Number
         */
        port    : null,

        /**
         * unique worker id, md5 hash
         *
         * @type String
         */
        id: null,

        /**
         * @type Object
         */
        persistenceCleanupTimers: null,

        /**
         * @constructs Backend
         * @param options
         */
        initialize: function(options) {
            if (config.general.get('app.environment') == 'development') {
                Q.longStackSupport = true;
            }

            // very dangerous!
            if (config.general.get('app.flushdb') === true &&
                config.general.get('app.environment') == 'development')
            {
                logger.warn('Flushing redis database...');

                redis.flushall();
            }

            var queue = Queue.getInstance();

            var app = express();

            app.set('env', config.general.get('app.environment'));

            app.use(bodyParser.raw());
            app.use(cookieParser());
            app.use(express.static(config.general.get('app.staticWebContent')));

            var server = http.createServer(app);

            var comet = new Comet({
                backend: this,
                server: server
            });

            this.port = config.process.get('port', config.general.get('comet.port'));

            this.createWorkerID();

            var link = new Link({
                workerID: this.id
            });

            this.socketEvents = {};

            this.link    = link;

            this.options = options;
            this.app     = app;
            this.server  = server;
            this.modules = {};
            this.users   = {};
            this.comet   = comet;
            this.queue   = queue;

            this.linkEvents = {};
            this.queueEvents = {};

            this.persistenceCleanupTimers = {};

            this.bootstrap = new Bootstrap({
                backend: this
            });

            this._bindOwnEvents();

            this._initModules();

            vent.emit('server:start');
        },

        /**
         * called when all database/queue initializations is ready
         */
        deferredStart: function() {
            var self = this;

            // set up pub/sub system
            _.each(this.linkEvents, function(listeners, channel) {
                _.each(listeners, function(listener) {
                    self.link.register(channel, listener);
                });
            });

            // set up queue workers
            _.each(this.queueEvents, function(listeners, queueName) {
                _.each(listeners, function(listener) {
                    self.queue.register(queueName, listener);
                });
            });

            // set timers to remove unused pci keys
            redis.qsmembers(config.redis.get('persistence.list', this.id))
                .then(function(pciList) {
                    _.each(pciList, function(pci) {
                        self.persistenceCleanupTimers[pci] = setTimeout(function() {
                            redis.del(config.redis.get('persistence.model', pci));
                            redis.srem(config.redis.get('persistence.list', self.id), pci);
                        }, config.general.get('comet.reconnectTimeout'));
                    });
                })
                .then(function() {
                    self.server.listen(self.port);

                    logger.info('Opened socket on port ' + self.port);

                    // everything is initialized and ready
                    logger.info('Ready to serve!');

                    vent.emit('server:ready');
                })
                .done();
        },

        /**
         * server start method. waits for all database and queues connections
         * to be ready and calls {@code deferredStart()} to start listening socket
         */
        start: function() {
            var self = this;

            Q.all([
                    redis.connectionPromise,
                    pubsub.connectionPromise,
                    mongoose.connectionPromise,
                    this.queue.getConnectionPromise()
                ])
                .then(function() {
                    return self.deferredStart();
                })
                .done();
        },

        /**
         * gracefully shuts down the server
         *
         * @param {Error} [e] if set, shutdown is due to an uncaught error
         */
        stop: function(e) {
            if (e) {
                logger.info('Shutting down due to an uncaught exception');
            } else {
                logger.info('SIGINT received. Server is shutting down');
            }

            try {
                this.emit('server:shutdown', e);
            } catch(shutdownError) {
                logger.error(shutdownError.message);
            }

            process.exit(!!e); // "1" for exit code if we have an error
        },

        /**
         * generates current worker id based on available IP addresses
         */
        createWorkerID: function() {
            var ifaces = os.networkInterfaces(),
                md5sum = crypto.createHash('md5');

            _.each(ifaces, function(iface) {
                _.each(iface, function(details) {
                    if (details.family == 'IPv4') {
                        md5sum.update(details.address);
                    }
                });
            });

            this.id = md5sum.digest('hex');

            logger.info('Worker ID: ' + this.id);
        },

        _bindOwnEvents: function() {
            var self = this;

            _.each(this.backendEvents, function(cb, event) {
                self.on(event, self[cb].bind(self));
            });
        },

        /**
         * Initializes all modules listed in bootstrap
         */
        _initModules: function() {
            var self = this;

            _.each(self.bootstrap.modules, function(Module) {
                if (_.isString(Module)) {
                    Module = require(Module);
                }

                self.use(new Module());
            });
        },

        onUserMessage: function(uid, event, data, relay) {
            this.sendUserMessage(uid, event, data, relay);
        },

        /**
         * Initializes module and binds its events to backend/socket events
         * @param mod
         */
        use: function(mod) {
            if (!mod.id) {
                throw new Error('Module does not have an ID');
            }

            if (_.isObject(this.modules[mod.id])) {
                throw new Error('Module "' + mod.id + '" is already in use');
            }

            this.modules[mod.id] = mod;

            mod.backend = this;

            this.bindSocketEvents(mod.socketEvents, mod);
            this.bindBackendEvents(mod.backendEvents, mod);
            this.bindLinkEvents(mod.linkEvents, mod);
            this.bindQueueEvents(mod.queueEvents, mod);
            this.bindHttpRoutes(mod.httpRoutes, mod);

            mod.initialize();
        },

        /**
         * binds modules' websocket events
         *
         * @param {Object} events - hash map of eventName => methodName
         * @param {Object} context - module context
         */
        bindSocketEvents: function(events, context) {
            var self = this;

            _.each(events, function(callbackName, event) {
                if (!_.isArray(self.socketEvents[event])) {
                    self.socketEvents[event] = [];
                }

                self.socketEvents[event].push(function(user, data, reply, event) {
                    if (context.checkAcl && !context.checkAccess(user, event)) {
                        context.handleUnauthorizedAccess(user, event, reply);
                    } else {
                        context[callbackName].bind(context)(user, data, reply, event);
                    }
                });
            });
        },

        /**
         * binds modules' backend/vent events
         *
         * @param {Object} events - hash map of eventName => methodName
         * @param {Object} context - module context
         */
        bindBackendEvents: function(events, context) {
            var self = this;

            _.each(events, function(callbackName, event) {
                self.on(event, context[callbackName].bind(context));
            });
        },

        /**
         * binds modules' {@code Link} events
         *
         * @param {Object} events - hash map in form of
         * {
         *   channelName: {
         *      eventName: methodName
         *   }
         * }
         * @param {Object} context - module context
         */
        bindLinkEvents: function(events, context) {
            var self = this;

            _.each(events, function(callbacks, channel) {
                var listeners = self.linkEvents[channel];

                if (!_.isArray(listeners)) {
                    self.linkEvents[channel] = [];
                }

                var listener = function(event, data) {
                    context[callbacks[event]].bind(context)(data);
                };

                self.linkEvents[channel].push(listener);
            });
        },

        /**
         * binds modules' {@code Queue} events
         *
         * @param {Object} events - hash map in form of
         * {
         *   queueName: {
         *      eventName: methodName
         *   }
         * }
         * @param {Object} context - module context
         */
        bindQueueEvents: function(events, context) {
            var self = this;

            _.each(events, function(callbacks, queueName) {
                var listeners = self.queueEvents[queueName];

                if (!_.isArray(listeners)) {
                    self.queueEvents[queueName] = [];
                }

                var listener = function(event, data) {
                    var callbackName = callbacks[event];

                    if (!callbackName) {
                        return;
                    }

                    if (!context[callbackName]) {
                        return logger.warn('Failed to route queue message to ' + context.id + ' ' +
                            event + ': Context does not have ' + callbackName + ' method');
                    }

                    context[callbacks[event]].call(context, data);
                };

                self.queueEvents[queueName].push(listener);
            });
        },

        /**
         * overridden to delegate functionality to {@code vent.on}
         */
        on: function() {
            // bind events to vent object instead of self
            vent.on.apply(vent, arguments);
        },

        /**
         * overridden to delegate functionality to {@code vent.emit}
         */
        emit: function() {
            vent.emit.apply(vent, arguments);
        },

        /**
         * binds modules' HTTP routes
         *
         * @param {Array} routes - array of route objects:
         * [
         *   {
         *     url: {String} - url in express format
         *     type: {String} - either 'get' or 'post'
         *     callback: {String} - module's method name
         *   }
         * ]
         * @param {Object} context - module context
         */
        bindHttpRoutes: function(routes, context) {
            var self = this;

            _.each(routes, function(item) {
                self.app[item.type](item.url, function(req, res) {
                    var origin = req.get('Origin');

                    if (!self.checkCORSAccess(origin)) {
                        res.send(500, {
                            status: false,
                            data: 'CORS Denied'
                        });
                    } else {
                        res.set({
                            'Access-Control-Allow-Origin': origin,
                            'Access-Control-Allow-Credentials': 'true'
                        });

                        context[item.callback].bind(context)(req, res);
                    }
                });
            });
        },

        /**
         * checks whether the CORS origin is allowed to access this worker
         * temporarily disabled due to phonegap compatibility
         *
         * @param {String} origin - 'Origin' header
         * @returns {Boolean}
         */
        checkCORSAccess: function(/*origin*/) {
            return true; // @todo temporary

            /*if (!origin) {
                return true;
            }

            var host = origin.split('//')[1];

            return _.indexOf(config.general.get('app.allowedHosts'), host) != -1;*/
        },

        checkIPBlock: function(ip) {
            return redis.qsismember(config.redis.get('app.blacklist'), ip);
        },

        onClientConnected: function(ip, origin, auth, spark) {
            var id = spark.id;

            if (auth.pci) {
                logger.info('Client trying to reconnect: pci = "' + auth.pci + '"');
            } else {
                logger.info('Client trying to connect: spark id = "' + id + '" origin = "' + origin +
                    '" uid = "' + auth.uid + '" sid = "' + auth.sid + '" pci = "' + auth.pci + '"');
            }

            var user, self = this;

            return this.checkIPBlock(ip) // check if ip is blacklisted
                .then(function(blocked) {
                    if (blocked) {
                        throw new Error('IP ' + ip + ' is blacklisted').set('BackendError', 'IPNotAllowed');
                    }

                    if (!origin) {
                        return true;
                    }

                    return self.checkCORSAccess(origin); // check if CORS is allowed
                })
                .then(function(allowed) {
                    if (!allowed) {
                        throw new Error('CORS Denied').set('BackendError', 'CORSNotAllowed');
                    }

                    user = new User({
                        id: id,
                        backend: self,
                        spark: spark,
                        auth: auth
                    });

                    return user.load(auth); // handle persistence loading and authorization
                })
                .then(function() {
                    if (self.persistenceCleanupTimers[auth.pci]) {
                        // kill cleanup timer if user reconnected after server restart
                        // @todo rewrite to support sharding
                        clearTimeout(self.persistenceCleanupTimers[auth.pci]);
                    }

                    if (auth.uid) {
                        if (!self.users[auth.uid]) {
                            self.users[auth.uid] = {};
                        }

                        self.users[auth.uid][id] = user;
                    }

                    self.users[id] = user;

                    if (auth.pci) {
                        logger.info('Client reconnected: spark id = "' + id + '" origin = "' + origin +
                            '" uid = "' + auth.uid + '" sid = "' + auth.sid + '" pci = "' + auth.pci +
                            '" user = "' + user + '"');

                        self.emit('user:reconnected', user);
                    } else {
                        logger.info('Client connected: spark id = "' + id + '" origin = "' + origin +
                            '" uid = "' + auth.uid + '" sid = "' + auth.sid + '" pci = "' + auth.pci +
                            '" user = "' + user + '"');

                        self.emit('user:connected', user);
                    }

                    return user;
                });
        },

        onClientDisconnected: function(spark) {
            logger.info('Client disconnected: ' + (spark.user ? spark.user : spark.id));

            if (spark.user) {
                var user = spark.user;

                user.onDisconnected();

                if (user.uid) {
                    delete this.users[user.uid][user.id];
                }

                delete this.users[user.id];

                this.emit('user:disconnected', user);
            }
        },

        getUsers: function(uid) {
            return this.users[uid];
        },

        isUserConnected: function(uid) {
            return this.users[uid] && !!_.size(this.users[uid]);
        },

        getModule: function(id) {
            if (!_.isObject(this.modules[id])) {
                throw new Error('Module is not found').set('BackendError', 'ModuleNotLoaded');
            }

            return this.modules[id];
        },

        sendUserMessage: function(uid, event, data, relay) {
            var self = this;

            if (!_.isArray(uid)) {
                uid = [uid];
            }

            _.each(uid, function(notifyId) {
                _.each(self.users[notifyId], function(user) {
                    user.sendMessage(event, data);
                });

                if (relay) {
                    self.link.notify(config.redis.get('users.linkRelay', notifyId), event, data);
                }
            });
        },

        getLink: function() {
            return this.link;
        }

    });
});
