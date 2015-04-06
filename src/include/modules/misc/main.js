"use strict";

define([
    'base-module',
    'core/classes/user'
], function(BaseModule, User) {
    return BaseModule.extend({
        id: 'utils',

        socketEvents: {
            'misc:onlineStatus': 'queryOnlineStatus'
        },

        backendEvents: {
            'user:connected': 'onUserConnected',
            'user:reconnected': 'onUserConnected'
        },

        linkEvents: {

        },

        checkAcl: true,

        acl: {
            'misc:onlineStatus': 'all'
        },

        initialize: function() {

        },

        onUserConnected: function(user) {
            user.setAccess(this.id, 'all', true);
        },

        queryOnlineStatus: function(user, data, reply) {
            if (!data.uids) {
                return reply(new Error('Invalid input data'));
            }

            User.getOnlineStatus(data.uids)
                .then(function(result) {
                    reply(null, result);
                })
                .catch(function(e) {
                    reply(e);
                })
                .done();
        }
    });
});
