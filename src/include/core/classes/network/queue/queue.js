"use strict";

define([
    'class',
    'amqp',
    'lodash',
    'q',
    './message',
    'logger',
    'config',
    'vent'
], function(Class, amqp, _, Q, QueueMessage, logger, config, vent) {
    var exchangeName = config.general.get('rabbitmq.exchangeName'),
        instance;

    /**
     * @namespace Network
     * @class Queue
     */
    return Class.extend(/** @lends Queue.prototype */{
        /**
         * @private
         */
        _connection: null,

        /**
         * @private
         */
        _connectionPromise: null,

        /**
         * @private
         */
        _queuePool: null,

        /**
         * @private
         */
        _exchangePool: null,

        /**
         * @private
         */
        _workers: null,

        /**
         * @private
         */
        _ctags: null,

        /**
         * @constructor
         */
        initialize: function() {
            this._queuePool = {};
            this._exchangePool = {};
            this._workers = {};
            this._ctags = {};

            if (!config.general.get('rabbitmq.enabled')) {
                return;
            }

            var connection = this._connection = amqp.createConnection(this._getConnectionConfig()),
                defer = Q.defer();

            connection.on('ready', function() {
                logger.info('RabbitMQ connection is ready');

                defer.resolve();
            });

            connection.on('error', function(e) {
                // prevent error on end connection
                if (e.message === 'read ECONNRESET') {
                    logger.warn('RabbitMQ connection error');
                } else {
                    logger.warn('RabbitMQ error: ' + e);

                    defer.reject(e);
                }
            });

            connection.on('end', function() {
                logger.warn('RabbitMQ connection is lost');

                connection.reconnect();
            });

            vent.on('server:shutdown', function() {
                connection.end();
            });

            this._connectionPromise = defer.promise;
        },

        /**
         * connection promise getter
         *
         * @returns {Promise}
         */
        getConnectionPromise: function() {
            return this._connectionPromise;
        },

        /**
         * publishes a message to a queue
         *
         * @param {String} queueName - name of the queue
         * @param {Object} message - either message object or array of messages
         * if multiple is set to true
         * @param {Boolean} [multiple]
         * @returns {Promise}
         */
        publish: function(queueName, message, multiple) {
            var self = this;

            return Q(this._connectionPromise)
                .then(function() {
                    return [ self._getQueue(queueName), self._getExchange(exchangeName) ];
                })
                .spread(function(queue, exchange) {
                    queue.bind(exchange, queueName);

                    if (!multiple) {
                        message = [message];
                    }

                    _.each(message, function(msgObject) {
                        exchange.publish(
                            queueName,
                            JSON.stringify(msgObject),
                            {
                                contentType: 'text/json',
                                deliveryMode: 2
                            }
                        );
                    });
                });
        },

        /**
         * ends RabbitMQ connection
         */
        close: function() {
            this._connection.end();
        },

        /**
         * adds queue worker
         *
         * @param {String} queueName - queue to subscribe to
         * @param {Function} callback - worker/callback function
         * @param {Object} context - context that callback binds to
         */
        register: function(queueName, callback, context) {
            if (!_.isObject(this._workers[queueName])) {
                this._workers[queueName] = [];

                this._subscribe(queueName);
            }

            var found = false;

            _.each(this._workers[queueName], function(item) {
                if (item.cb === callback && item.ctx === context) {
                    found = true;

                    return false;
                }
            });

            if (!found) {
                this._workers[queueName].push({ cb: callback, ctx: context });
            }
        },

        /**
         * remove queue worker
         *
         * @param {String} queueName - queue name
         * @param {Function} [callback] - worker/callback function
         * @param {Object} context - context
         */
        unregister: function(queueName, callback, context) {
            var workers = this._getWorkers[queueName];

            if (!workers.length) {
                return;
            }

            // empty context means callback is not provided
            // reassign vars accordingly
            if (!context) {
                context = callback;
                callback = null;
            }

            workers = workers.filter(function(obj) {
                if (!callback) {
                    // remove all callbacks for a given context
                    return obj.ctx !== context;
                } else {
                    // remove specific callback
                    return obj.ctx !== context || obj.cb !== callback;
                }
            });

            if (!workers.length) {
                this._unsubscribe(queueName);

                this._setWorkers(queueName, null);
            } else {
                this._setWorkers(queueName, workers);
            }
        },

        /**
         * creates configuration object
         *
         * @returns {Object}
         * @private
         */
        _getConnectionConfig: function() {
            return {
                host     : config.general.get('rabbitmq.host'),
                port     : config.general.get('rabbitmq.port'),
                login    : config.general.get('rabbitmq.login'),
                password : config.general.get('rabbitmq.password')
            };
        },

        /**
         * create a queue objects and returns a promise of it
         *
         * @param {String} name
         * @param {Object} [options]
         * @returns {Promise}
         * @private
         */
        _getQueue: function(name, options) {
            if (this._queuePool[name]) {
                return this._queuePool[name];
            }

            var defer = Q.defer();

            options = options || {
                durable: true,
                autoDelete: false
            };

            this._connection.queue(name, options, defer.resolve.bind(defer));

            this._queuePool[name] = defer.promise;

            return this._queuePool[name];
        },

        /**
         * opens an exchange object and returns a promise of it
         *
         * @param {String} name
         * @param {Object} options
         * @returns {Promise}
         * @private
         */
        _getExchange: function(name, options) {
            if (this._exchangePool[name]) {
                return this._exchangePool[name];
            }

            var defer = Q.defer();

            options = options || {
                type: 'direct'
            };

            this._connection.exchange(name, options, defer.resolve.bind(defer));

            return defer.promise;
        },

        /**
         * saves subscribed consumer tag
         *
         * @param {String} queueName
         * @param {String} ctag
         * @private
         */
        _setCTag: function(queueName, ctag) {
            this._ctags[queueName] = ctag;
        },

        /**
         * returns consumer tag
         *
         * @param queueName
         * @returns {String}
         * @private
         */
        _getCTag: function(queueName) {
            return this._ctags[queueName];
        },

        /**
         * subscribe to a given queue
         *
         * @param {String} queueName
         * @private
         */
        _subscribe: function(queueName) {
            var self = this;

            this._getQueue(queueName)
                .then(function(queue) {
                    return queue.subscribe(function(data, headers, deliveryInfo, message) {
                        self._processMessage(queueName, new QueueMessage(data, message));
                    });
                })
                .then(function(result) {
                    self._setCTag(queueName, result.consumerTag);

                    logger.info('Subscribed to queue: ' + queueName);
                })
                /*.catch(function(e) {
                    logger.warn('Failed to subscribe to RabbitMQ queue ' + queueName + ': ' + e);
                })*/
                .done();
        },

        /**
         * unsubscribes from a given queue
         *
         * @param {String} queueName
         * @private
         */
        _unsubscribe: function(queueName) {
            var self = this;

            this._getQueue(queueName)
                .then(function(queue) {
                    var ctag = self._getCTag(queueName);

                    if (!ctag) {
                        throw new Error('No consumer tag for queue ' + queueName);
                    }

                    queue.unsubscribe(ctag);

                    logger.info('Unsubscribed from queue: ' + queueName);
                })
                /*.catch(function(e) {
                    logger.warn('Failed to unsubscribe from RabbitMQ queue ' + queueName + ': ' + e);
                 })*/
                .done();
        },

        /**
         * returns currently active callbacks for a given queue
         *
         * @param {String} queueName
         * @private
         */
        _getWorkers: function(queueName) {
            return this._workers[queueName] || [];
        },

        /**
         * sets currently active workers for a given queue
         *
         * @param {String} queueName
         * @param {Array} workers - array of functions
         * @private
         */
        _setWorkers: function(queueName, workers) {
            this._workers[queueName] = workers;
        },

        /**
         * route the data to appropriate callback
         *
         * @param {String} queueName
         * @param {QueueMessage} message
         * @private
         */
        _processMessage: function(queueName, message) {
            var workers = this._getWorkers(queueName),
                data = message.getData(),
                event = data.e;

            _.each(workers, function(worker) {
                worker.cb.call(worker.ctx, event, data);
            });
        }
    }, {
        getInstance: function() {
            if (!instance) {
                instance = new this();
            }

            return instance;
        }
    });
});
