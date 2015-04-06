"use strict";

/**
 * Redis session authorization adapter
 */
define([
    'class',
    'core/classes/user',
    'core/classes/db/redis',
    'config',
    'logger',
    'q'
], function(Class, User, Redis, config, logger, Q) {
    var redis = Redis.get();

    /**
     * Example authorization method. It assumes external authorization
     * has been made and session data is stored in Redis.
     *
     * @param {Number} uid
     * @param {String} sid
     * @returns {Promise|Boolean}
     */
    return function(uid, sid) {
        if (!uid || !sid) {
            return Q(false);
        }

        return redis.qgetjson(config.redis.get('users.session', sid))
            .then(function(data) {
                if (!data) {
                    return false;
                }

                return data.id == uid;
            });
    }
});

