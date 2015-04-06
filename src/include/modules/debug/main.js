"use strict";

define([
    'base-module',
    'q',
    'lodash',
    'logger',
    'config'
], function(BaseModule, Q, _, logger, config) {
    return BaseModule.extend({
        id: 'debug',

        socketEvents: {
            'debug': 'onCommand'
        },

        backendEvents: {
            'user:connected': 'onUserConnected',
            'user:reconnected': 'onUserConnected'
        },

        linkEvents: {

        },

        acl: {
            'debug': 'all'
        },

        commands: [
            'ping',
            'info',
            'exceptionTest'
        ],

        reportsPath: null,

        initialize: function() {

        },

        onUserConnected: function(user) {
            user.setAccess(this.id, 'all', true);
        },

        onCommand: function(user, data, reply) {
            logger.info('User ' + user + ' queried debug command "' + data.c + '"');

            var command = this._getCommandName(data.c);

            if (!command) {
                return;
            }

            this[command](user, data, reply);
        },

        _getCommandName: function(command) {
            command += '';

            if (_.indexOf(this.commands, command) == -1)
                return false;

            command = 'command' + command.charAt(0).toUpperCase() + command.substr(1);

            if (!_.isFunction(this[command]))
                return false;

            return command;
        },

        /**
         * simple ping command to check latency
         */
        commandPing: function(user, data, reply) {
            reply(null, data);
        },

        /**
         * get server info
         */
        commandInfo: function(user, data, reply) {
            reply(null, {
                workerID: this.backend.id,
                environment: config.general.get('app.environment'),
                port: this.backend.port
            });
        },

        /**
         * test exceptions
         */
        commandExceptionTest: function(user, data, reply) {
            reply(new Error('Test error')
                .set('GenericError', 'Test', { foo: 'bar' }));
        }
    });
});
