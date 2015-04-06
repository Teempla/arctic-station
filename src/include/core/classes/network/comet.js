"use strict";

define([
    'class',
    'primus',
    'lodash',
    'logger',
    'config'
], function(Class, Primus, _, logger, config) {
    var haltOnHandlerErrors = config.general.get('app.haltOnHandlerErrors');

    return Class.extend({

        backend: null,
        server: null,
        primus: null,

        events: null,

        /**
         * initialization
         *
         * @param options
         */
        initialize: function(options) {
            this.events = {};

            this.backend = options.backend;
            this.server = options.server;

            var primus = new Primus(this.server, {
                transformer: 'engine.io',
                parser: 'json',
                timeout: config.general.get('comet.socketTimeout')
            });

            primus.on('connection', this.onConnection.bind(this));
            primus.on('disconnection', this.onDisconnection.bind(this));
            primus.on('error', this.onError.bind(this));

            logger.info('Socket server is ready');

            this.primus = primus;
        },

        /**
         * fired when primus encounters an error
         *
         * @param {Error} e - error
         */
        onError: function(e) {
            throw e;
        },

        /**
         * fired when client connects to the socket
         *
         * @param {Object} spark - socket
         */
        onConnection: function(spark) {
            this._prepareCookies(spark);

            var self = this;

            this.backend.onClientConnected(
                    spark.address.ip,
                    spark.headers.origin,
                    {
                        pci: spark.query.t_pci,
                        uid: spark.query.t_uid,
                        sid: spark.query.t_sid
                    },
                    spark
                )
                .then(function(user) {
                    spark.user = user;

                    spark.encodeEvents = false;

                    spark.on('data', function(data) {
                        self.onSparkData(spark, data, user);
                    });

                    self.sendData(spark, 'ready');
                })
                .catch(function(e) {
                    logger.warn('Client rejected: ' + e.message);

                    self.sendData(spark, 'error', {
                        type: 'CONNECTION_REJECTED',
                        code: 'REAUTHORIZE',
                        message: e.message
                    });

                    spark.end();
                })
                .done();
        },

        /**
         * fired when client disconnects
         *
         * @param {Object} spark - socket
         */
        onDisconnection: function(spark) {
            this.backend.onClientDisconnected(spark);
        },

        /**
         * fired when data is received from a client
         *
         * @param {Object} spark - socket
         * @param {Object} data - event data
         * @param {Object} user - associated user
         */
        onSparkData: function(spark, data, user) {
            if (!data || !data.e) {
                return logger.warn('Invalid spark data from user ' + user + ': no event code supplied');
            }

            var reply, event = data.e;

            if (!this.backend.socketEvents[event]) {
                return;
            }

            var listenersCount = this.backend.socketEvents[event].length;

            delete data.e;

            var shouldReply = !!data.q;

            if (shouldReply) {
                if (listenersCount > 1) {
                    reply = this.createMultiReply(spark, event, data.q, listenersCount);
                } else {
                    reply = this.createReply(spark, event, data.q);
                }

                delete data.q;
            } else {
                reply = this.createEmptyReply(spark, event);
            }

            try {
                _.each(this.backend.socketEvents[event], function(handler) {
                    handler(user, data, reply, event);
                });
            } catch(e) {
                if (shouldReply) {
                    reply(e);
                }

                if (haltOnHandlerErrors) {
                    throw e;
                } else {
                    logger.error('Failed to call handlers for ' + event + ' from user ' + user);
                    logger.error(e.stack);
                }
            }
        },

        /**
         * sends data to a client
         *
         * @param {Object} spark - socket
         * @param {String} event - event name
         * @param {Object} [data] - event data
         */
        sendData: function(spark, event, data) {
            if (!data) {
                data = {};
            }

            if (spark.encodeEvents) {
                //data.e = Events.getCode(event);
                throw new Error('Events encoding is not supported');
            } else {
                data.e = event;
            }

            spark.write(data);
        },

        /**
         * replies to an event
         *
         * @param {Object} spark - socket
         * @param {Number} id - reply id
         * @param {Error|Object} err - error, if any
         * @param {Object} data - reply data
         */
        reply: function(spark, id, err, data) {
            var response = {
                q: id
            };

            if (err) {
                response.success = false;
                response.error = err && err.message ? err.message : err;

                if (err.errtype) {
                    response.errcode = err.errcode;
                    response.errtype = err.errtype;
                    response.params = err.params;
                }
            } else {
                response.success = true;
                response.data = data;
            }

            this.sendData(spark, 'qres', response);
        },

        /**
         * creates a reply callback
         *
         * @param {Object} spark - socket
         * @param {String} event - event name
         * @param {Number} id - reply id
         * @returns {Function}
         */
        createReply: function(spark, event, id) {
            var replied = false,
                self = this;

            return function(err, result) {
                if (replied) {
                    throw new Error('Event ' + event + ' has already been replied to');
                }

                self.reply(spark, id, err, result);

                replied = true;
            };
        },

        /**
         * creates a multi-reply callback for events that trigger multiple
         * callbacks and require a result
         *
         * @param {Object} spark - socket
         * @param {String} event - event name
         * @param {Number} id - reply id
         * @param {Number} count - numbers of replies needed
         * @returns {Function}
         */
        createMultiReply: function(spark, event, id, count) {
            var calledCount = 0,
                result = {},
                errors = {},
                errorsCount = 0,
                self = this;

            return function(err, data, resultCode) {
                if (!resultCode) {
                    throw new Error('Must supply result code for multi-reply: ' + event);
                }

                if (err) {
                    errors[resultCode] = err;
                    errorsCount++;
                } else {
                    result[resultCode] = data;
                }

                if (++calledCount == count) {
                    self.reply(spark, id, errorsCount ? errors : null, result);
                }
            };
        },

        /**
         * creates an empty reply callback, that logs an error
         *
         * @param {Object} spark
         * @param {String} event
         */
        createEmptyReply: function(spark, event) {
            return function() {
                logger.warn('No reply ID supplied for event "' + event + '" by user ' + spark.user);
            };
        },

        _prepareCookies: function(spark) {
            var cookieStr = spark.headers.cookie || '',
                cookies = {};

            _.each(cookieStr.split(';'), function(cookie) {
                var parts = cookie.split('=');

                if (!parts || parts.length < 2) {
                    return;
                }

                var key = parts[0].trim(),
                    value = parts[1].trim();

                cookies[key] = value;
            });

            spark.cookies = cookies;
        }
    });
});
