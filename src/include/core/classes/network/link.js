"use strict";

define([
    'class',
    'core/classes/db/redis',
    'logger',
    'config',
    'lodash'
], function(Class, Redis, logger, config, _) {
    var redis = Redis.get(),
        pubsub = Redis.get('pubsub');

    /**
     * @class Link
     */
    return Class.extend(/** @lends Link.prototype */{

        callbacks: null,

        workerID: null,

        /**
         * initialization
         *
         * @param {Object} options
         * @constructs Link
         */
        initialize: function(options) {
            this.workerID = options.workerID;

            this.callbacks = {};

            pubsub.on('message', this.onMessage.bind(this));
        },

        /**
         * adds pub/sub listener
         *
         * @param {String} channel - channel name
         * @param {Function} callback - callback
         * @param {Object} context - callback context
         */
        register: function(channel, callback, context) {
            if (!_.isObject(this.callbacks[channel])) {
                this.callbacks[channel] = [];

                pubsub.subscribe(channel);

                logger.info('Subscribed to pubsub channel: ' + channel);
            }

            var found = false;

            _.each(this.callbacks[channel], function(item) {
                if (item.cb === callback && item.ctx === context) {
                    found = true;

                    return false;
                }
            });

            if (!found) {
                this.callbacks[channel].push({ cb: callback, ctx: context });
            }
        },

        /**
         * removes pub/sub listener. if callback is omitted, removes all listeners
         * of the context for given channel name
         *
         * @param {String} channel - channel name
         * @param {Function} callback - callback or context if context is omitted
         * @param {Object} [context] - callback context
         */
        unregister: function(channel, callback, context) {
            var callbacks = this.callbacks[channel];

            if (!callbacks || !callbacks.length) {
                return;
            }

            if (!context) {
                context = callback;
                callback = null;
            }

            callbacks = callbacks.filter(function(obj) {
                if (!callback) {
                    // remove all callbacks for a given context
                    return obj.ctx !== context;
                } else {
                    // remove specific callback
                    return obj.ctx !== context || obj.cb !== callback;
                }
            });

            if (!callbacks.length) {
                pubsub.unsubscribe(channel);

                delete this.callbacks[channel];

                logger.info('Unsubscribed from pubsub channel: ' + channel);
            } else {
                this.callbacks[channel] = callbacks;
            }
        },

        /**
         * removes all listeners on all subscribed channels for given context
         *
         * @param {Object} context
         */
        unregisterAll: function(context) {
            var self = this;

            _.each(this.callbacks, function(list, channel) {
                self.unregister(channel, context);
            });
        },

        /**
         * sends message over the pub/sub system
         *
         * @param {String} channel - channel name
         * @param {String} event - event name
         * @param {Object} data - event data
         * @param {Boolean} [selfDispatch] - whether the event will be dispatched
         *      to current worker as well as other workers
         */
        notify: function(channel, event, data, selfDispatch) {
            var msg;

            try {
                if (!data) {
                    data = {};
                }

                data.e = event;
                data.wid = this.workerID;

                if (selfDispatch) {
                    data.selfDispatch = true;
                }

                msg = JSON.stringify(data);

                redis.publish(channel, msg);

                delete data.e;
                delete data.wid;
            } catch(e) {
                logger.error(new Error('Failed to send pub/sub message: channel = "' +
                    channel + '" data = "' + data + '"; ' + e)
                    .set('LinkError', 'WrongFormat').toString());
            }
        },

        /**
         * fired when message is received from the pub/sub system
         *
         * @param {String} channel - channel name
         * @param {String} msg - JSON encoded data
         */
        onMessage: function(channel, msg) {
            var data, event;

            try {
                data = JSON.parse(msg);

                if (!data.e) {
                    throw new Error('event id is not specified');
                }

                event = data.e;

                // filter own messages
                if (data.wid == this.workerID && !data.selfDispatch) {
                    return;
                } else {
                    delete data.e;
                    delete data.wid;
                }

                _.each(this.callbacks[channel], function(obj) {
                    obj.cb.call(obj.ctx, event, data);
                });
            } catch(e) {
                logger.error(new Error('Failed to receive pub/sub message: channel = "' +
                    channel + '" message = "' + msg + '"; ' + e)
                    .set('LinkError', 'WrongFormat').toString());
            }
        }

    });
});
