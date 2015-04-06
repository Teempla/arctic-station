"use strict";

/**
 * Example chat module. Allows users to join custom channels
 * and send private messages.
 */
define([
    'base-module',
    './helpers/chat'
], function(BaseModule, Helper) {
    return BaseModule.extend({
        id: 'chat',

        socketEvents: {
            'chat:getChannelsList'  : 'onGetChannelsList',
            'chat:joinChannel'      : 'onJoinChannel',
            'chat:leaveChannel'     : 'onLeaveChannel',
            'chat:whisper'          : 'onWhisper',
            'chat:message'          : 'onMessage'
        },

        acl: {
            'chat:getChannelsList'  : 'registered',
            'chat:joinChannel'      : 'registered',
            'chat:leaveChannel'     : 'registered',
            'chat:whisper'          : 'registered',
            'chat:message'          : 'registered'
        },

        backendEvents: {
            'user:connected'    : 'onUserConnected',
            'user:reconnected'  : 'onUserConnected'
        },

        checkAcl: true,

        helper: null,

        initialize: function() {
            this.helper = new Helper(this);
        },

        onUserConnected: function(user) {
            user.setAccess(this.id, 'all', true);

            if (!user.uid) {
                return;
            }

            user.setAccess(this.id, 'registered', true);
        },

        onGetChannelsList: function(user, data, reply) {
            this.helper.getChannelList(user.uid)
                .then(function(result) {
                    reply(null, result);
                })
                .catch(function(e) {
                    reply(e);
                })
                .done();
        },

        onJoinChannel: function(user, data, reply) {
            var channel = data.channel + '';

            if (!channel) {
                return reply(new Error('Invalid input data'));
            }

            this.helper.joinChannel(user.uid, channel)
                .then(function(result) {
                    reply(null, result);
                })
                .catch(function(e) {
                    reply(e);
                })
                .done();
        },

        onLeaveChannel: function(user, data, reply) {
            var channel = data.channel + '';

            if (!channel) {
                return reply(new Error('Invalid input data'));
            }

            this.helper.leaveChannel(user.uid, channel)
                .then(function() {
                    reply(null, true);
                })
                .catch(function(e) {
                    reply(e);
                })
                .done();
        },

        onWhisper: function(user, data, reply) {
            var toUser = data.to + '',
                message = data.message + '';

            if (!toUser || !message) {
                return reply(new Error('Invalid input data'));
            }

            this.helper.whisper(user.uid, toUser, message);

            reply(null, true);
        },

        onMessage: function(user, data, reply) {
            var channel = data.to + '',
                message = data.message + '';

            if (!channel || !message) {
                return reply(new Error('Invalid input data'));
            }

            this.helper.message(user.uid, channel, message)
                .then(function() {
                    reply(null, true);
                })
                .catch(function(e) {
                    reply(e);
                })
                .done();
        }
    });
});
