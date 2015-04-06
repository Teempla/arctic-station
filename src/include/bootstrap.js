"use strict";

/**
 * Example bootstrap class
 */
define([
    'core/classes/bootstrap',
    'config',
    'logger',
    'vent',
    'services/auth'
], function(Bootstrap, config, logger, vent, AuthService) {
    return Bootstrap.extend({
        /**
         * List of modules to be used. Can be either a string name of
         * script file or a loaded module class.
         */
        modules: [
            'modules/chat/main',
            'modules/debug/main',
            'modules/misc/main',
            'modules/static/main'
        ],

        backendEvents: {
            /**
             * Event is emitted when server is starting up.
             * Ideal place to put your init code and overrides.
             */
            'server:start': 'onServerStart',

            /**
             * Emitted when all database connections are ready and
             * server is accepting incoming connections.
             */
            'server:ready': 'onServerReady',

            /**
             * Emitted on shutdown by either SIGINT or unhandled error
             */
            'server:shutdown': 'onServerShutdown'
        },

        onServerStart: function() {
            logger.info('Bootstrap::onServerStart()');

            // Install authorization service
            AuthService.install();
        },

        onServerReady: function() {
            logger.info('Bootstrap::onServerReady()');
        },

        onServerShutdown: function(err) {
            logger.info('Bootstrap::onServerShutdown()');
        }
    });
});