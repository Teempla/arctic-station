"use strict";

define([
    'class'
], function(Class) {
    /**
     * @namespace Network
     * @class QueueMessage
     */
    return Class.extend(/** @lends QueueMessage.prototype */{
        /**
         * @type {Object}
         * @private
         */
        _data: null,

        /**
         * @type {Object}
         * @private
         */
        _message: null,

        /**
         * message constructor
         *
         * @param {Object} data
         * @param {Object} message
         * @constructor
         */
        initialize: function(data, message) {
            this._data = data;
            this._message = message;
        },

        /**
         * reject this message
         *
         * @param {Boolean} [remove] - whether to remove the message from queue
         */
        reject: function(remove) {
            if (this.message.redelivered) {
                remove = true;
            }

            this.message.reject(!remove);
        },

        /**
         * repeat this message
         */
        repeat: function() {
            this.message.reject(true);
        },

        /**
         * resolve this message
         */
        resolve: function() {
            this.message.acknowledge();
        },

        /**
         * returns original message data
         *
         * @returns {Object}
         */
        getData: function() {
            return this._data;
        }
    });
});
