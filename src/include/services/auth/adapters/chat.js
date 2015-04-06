"use strict";

/**
 * Redis authorization adapter for chat example
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

    function create(key, sid) {
        return redis.qset(key, sid)
            .then(function() {
                return true;
            });
    }

    function find(key, sid) {
        return redis.qget(key)
            .then(function(val) {
                return val == sid;
            });
    }

    function validate(val) {
        return /^[a-z0-9]{3,20}$/ig.exec(val + '');
    }

    /**
     * Example authorization method. Registers user on first login and
     * validates password on all subsequent.
     *
     * @param {Number} uid
     * @param {String} sid
     * @returns {Promise|Boolean}
     */
    return function(uid, sid) {
        if (!validate(uid) || !validate(sid)) {
            return false;
        }

        var authKey = config.redis.get('chat.authData', uid);

        return redis.qexists(authKey)
            .then(function(exists) {
                if (!exists) {
                    return create(authKey, sid);
                } else {
                    return find(authKey, sid);
                }
            });
    }
});

