"use strict";

/**
 * Module helper. Contains most of business logic.
 */
define([
    'class',
    'lodash',
    'q',
    'logger',
    'vent',
    '../models/chat'
], function(Class, _, Q, logger, vent, Model) {
    return Class.extend({
        _module: null,
        _link: null,

        _subscribedChannels: null,

        initialize: function(module) {
            this._module = module;
            this._link = module.getLink();

            this._subscribedChannels = {};
        },

        getChannelList: function(uid) {
            return Model.getUserChannels(uid);
        },

        joinChannel: function(uid, channel) {
            return Model.addUserToChannel(uid, channel)
                .then(function() {
                    return Model.getChannelUsers(channel);
                })
                .then(function(users) {
                    var eventData = {
                        channel: channel,
                        uid: uid
                    };

                    _.each(users, function(notifyId) {
                        vent.emit(
                            'user:message',
                            notifyId,
                            'chat:userJoined',
                            eventData,
                            true
                        );
                    });

                    return users;
                });
        },

        leaveChannel: function(uid, channel) {
            return Model.removeUserFromChannel(uid, channel)
                .then(function() {
                    return Model.getChannelUsers(channel);
                })
                .then(function(users) {
                    var eventData = {
                        channel: channel,
                        uid: uid
                    };

                    _.each(users.concat(uid), function(notifyId) {
                        vent.emit(
                            'user:message',
                            notifyId,
                            'chat:userLeft',
                            eventData,
                            true
                        );
                    });

                    return users;
                });
        },

        whisper: function(fromUid, toUid, message) {
            vent.emit(
                'user:message',
                [fromUid, toUid],
                'chat:whisper',
                {
                    from: fromUid,
                    to: toUid,
                    message: message
                },
                true
            );
        },

        message: function(uid, channel, message) {
            return Model.getChannelUsers(channel)
                .then(function(users) {
                    if (!_.contains(users, uid)) {
                        throw new Error('User not in channel ' + channel);
                    }

                    var eventData = {
                        channel: channel,
                        uid: uid,
                        message: message
                    };

                    _.each(users, function(notifyId) {
                        vent.emit(
                            'user:message',
                            notifyId,
                            'chat:message',
                            eventData,
                            true
                        );
                    });
                });
        }
    });
});
