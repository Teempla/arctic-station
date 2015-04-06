"use strict";

/**
 * Chat model class. Data storage API.
 */
define([
    'class',
    'config',
    'lodash',
    'q',
    'core/classes/db/redis'
], function(Class, config, _, Q, Redis) {
    var redis = Redis.get();

    return Class.extend({}, {
        getUserChannels: function(uid) {
            var userChannelsKey = config.redis.get('chat.userChannels', uid);

            return redis.qsmembers(userChannelsKey);
        },

        addUserToChannel: function(uid, channel) {
            var userChannelsKey = config.redis.get('chat.userChannels', uid),
                channelUsersKey = config.redis.get('chat.channelUsers', channel);

            return Q.all([
                redis.qsadd(userChannelsKey, channel),
                redis.qsadd(channelUsersKey, uid)
            ]);
        },

        removeUserFromChannel: function(uid, channel) {
            var userChannelsKey = config.redis.get('chat.userChannels', uid),
                channelUsersKey = config.redis.get('chat.channelUsers', channel);

            return Q.all([
                redis.qsrem(userChannelsKey, channel),
                redis.qsrem(channelUsersKey, uid)
            ]);
        },

        isUserInChannel: function(uid, channel) {
            var userChannelsKey = config.redis.get('chat.userChannels', uid);

            return redis.qsismember(userChannelsKey, channel);
        },

        getChannelUsers: function(channel) {
            var channelUsersKey = config.redis.get('chat.channelUsers', channel);

            return redis.qsmembers(channelUsersKey);
        }
    });
});
