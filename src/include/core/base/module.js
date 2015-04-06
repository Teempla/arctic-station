"use strict";

define([
    'class',
    'lodash',
    'logger',
    'config'
], function(Class, _, logger, config) {
    return Class.extend({
        /*
         Module id, eg: 'chat' or 'news'
         */
        id: '',

        socketEvents: {
            /*
             Socket events here, eg:
             'chat:message': 'onChatMessage'
             */
        },

        backendEvents: {
            /*
             Same format as above
             */
        },

        linkEvents: {
            /*
             Same format as above
             */
        },

        acl: {

        },

        checkAcl: false,

        /*
         Link to Backend instance
         */
        backend: null,

        options: null,

        constructor: function(options) {
            this.options = options || {};
        },

        initialize: function() {

        },

        checkAccess: function(user, event) {
            return user.getAccess(this.id, this.acl[event]);
        },

        handleUnauthorizedAccess: function(user, event, reply) {
            var err = new Error('Unauthorized access. User: ' + user + ' Module: ' + this.id + ' Event: ' + event)
                .set('BackendError', 'AccessDenied');

            logger.error(err.toString());

            if (reply) {
                reply(err);
            }
        },

        getBackend: function() {
            return this.backend;
        },

        getLink: function() {
            return this.getBackend().getLink();
        }
    });
});
