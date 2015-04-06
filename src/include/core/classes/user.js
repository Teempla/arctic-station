"use strict";

define([
    'class',
    'lodash',
    'crypto',
    'q',
    'logger',
    'config',
    './db/redis',
    '../models/persistence',
    'models/user'
], function(Class, _, crypto, Q, logger, config, Redis, Persistence, Model) {
    var redis = Redis.get();

    var User = Class.extend({
        id             : null,
        spark          : null,
        backend        : null,

        pci            : null,
        uid            : null,
        sid            : null,

        username       : null,

        aclGroups      : null,

        persistenceTimer: null,
        onlineStatusTimer: null,

        persistence    : null,

        customData: null,

        /**
         * data, injected directly to an object with .inject() method
         */
        injectData: null,

        initialize: function(options) {
            this.spark     = options.spark;
            this.backend   = options.backend;
            this.id        = options.id;
            this.aclGroups = {};

            this.customData = {};
            this.injectData = {};
        },

        load: function(auth) {
            var uid = auth.uid,
                sid = auth.sid,
                pci = auth.pci,
                self = this;

            return Q()
                .then(function() {
                    return uid ? self.authorize(uid, sid) : false;
                })
                .then(function(success) {
                    // successful authorization
                    if (success) {
                        self.uid = uid;
                        self.sid = sid;

                        self._setOnlineStatus(true);

                        self._connectRelay();
                    // tried to authorize but failed
                    } else if (uid) {
                        throw new Error('Failed to authorize: wrong uid/sid combo');
                    // anonymous access is disabled
                    } else if (!config.general.get('user.allowAnonymous')) {
                        throw new Error('Anonymous users are not allowed');
                    // anonymous
                    } else {
                        self._generateUsername();
                    }

                    return pci ? self._loadPersistence(pci) : self._createPersistence();
                });
        },

        setAccess: function(moduleId, groupId, value) {
            if (!this.aclGroups[moduleId]) {
                this.aclGroups[moduleId] = {};
            }

            this.aclGroups[moduleId][groupId] = value;
        },

        getAccess: function(moduleId, groupId) {
            if (!this.aclGroups[moduleId]) {
                return false;
            }

            return this.aclGroups[moduleId][groupId];
        },

        onDisconnected: function() {
            this._updatePersistence();
            this._setPersistenceTtl();
            this._setOnlineStatus(null, true);

            this.backend.link.unregisterAll(this);
        },

        sendMessage: function(event, data) {
            this.backend.comet.sendData(this.spark, event, data);
        },

        authorize: function(uid, sid) {
            throw new Error('Authorization method must be overridden');
        },

        setCustomData: function(ns, key, val) {
            if (!this.customData[ns]) {
                this.customData[ns] = {};
            }

            if (!_.isObject(key)) {
                this.customData[ns][key] = val;
            } else {
                _.extend(this.customData[ns], key);
            }
        },

        getCustomData: function(ns, key) {
            if (!this.customData[ns]) {
                return false;
            } else if (!key) {
                return this.customData[ns];
            } else {
                return this.customData[ns][key];
            }
        },

        toString: function() {
            return (this.uid ? this.uid : this.id) + '@' + this.spark.address.ip;
        },

        _onLinkRelayEvent: function(event, data) {
            this.sendMessage(event, data);
        },

        _connectRelay: function() {
            this.backend.link.register(
                config.redis.get('users.linkRelay', this.uid),
                this._onLinkRelayEvent,
                this
            );
        },

        _setOnlineStatus: function(value, stopTimer) {
            if (!this.uid) {
                return;
            }

            if (stopTimer) {
                return clearInterval(this.onlineStatusTimer);
            }

            var key = config.redis.get('users.onlineStatus', this.uid),
                updateTTL = function() {
                    redis.expire(key, config.general.get('user.onlineStatusTTL'));
                };

            if (value) {
                redis.set(key, 1, updateTTL);

                this.onlineStatusTimer = setInterval(updateTTL,
                        config.general.get('user.onlineStatusRefreshInterval') * 1000);
            } else {
                redis.del(key);

                clearInterval(this.onlineStatusTimer);
            }
        },

        _loadPersistence: function(pci) {
            this.pci = pci;

            this.persistence = new Persistence();

            var self = this;

            return this.persistence.load(pci)
                .then(function(data) {
                    self._validatePersistence(data);

                    self.aclGroups = data.acl;

                    self.customData = data.customData;
                })
                .catch(function(e) {
                    throw new Error('Failed to load persistence: ' + e);
                });
        },

        _createPersistence: function() {
            this.pci = this._generatePCI();

            this.persistence = new Persistence();

            this.persistence.id = this.pci;

            this.sendMessage('set:pci', {
                id: this.pci
            });

            this._updatePersistence();
        },

        _validatePersistence: function(/*data*/) {
            /*if (this.spark.address.ip != data.ip) {
                logger.warn('Client failed persistence validation: ip mismatch: ' +
                    'current = ' + this.spark.address.ip + ' previous = ' + data.ip);

                throw new Error('Wrong IP address');
            }*/
        },

        _generatePCI: function() {
            var md5sum = crypto.createHash('md5');

            md5sum.update(this.spark.id + config.general.get('comet.secret') + this.spark.address.ip);

            return md5sum.digest('hex');
        },

        _updatePersistence: function() {
            var ip;

            try {
                ip = this.spark.address.ip;
            } catch(e) {
                // sometimes it throws an error
                ip = '';
            }

            this.persistence.setObject({
                acl: this.aclGroups,
                ip: ip,
                customData: this.customData
            });

            this.persistence.save(config.redis.get('persistence.list', this.backend.id));
        },

        _setPersistenceTtl: function() {
            var self = this;

            this.persistenceTimer = setTimeout(function() {
                redis.del(config.redis.get('persistence.model', self.pci));
                redis.srem(config.redis.get('persistence.list', self.backend.id), self.pci);
            }, config.general.get('comet.reconnectTimeout'));
        },

        _generateUsername: function() {
            this.username = 'Anonymous' + Math.floor(Math.random() * 1000);
        }
    }, {
        /**
         * Sets authorization method for user class.
         * Authorization function accepts two parameters (uid and sid) and
         * must return either a promise of authorization success or a plain
         * boolean value.
         *
         * @param {Function} authorizer
         */
        setAuthAdapter: function(authorizer) {
            if (!_.isFunction(authorizer)) {
                throw new Error('Auth adapter must be a function');
            }

            User.prototype.authorize = authorizer;
        },

        /**
         * returns online status for given user ids
         *
         * @param {Number|Array} uids
         * @returns {Promise|Object}
         */
        getOnlineStatus: function(uids) {
            if (!_.isArray(uids)) {
                uids = [uids];
            }

            var keys = _.map(uids, function(uid) {
                return config.redis.get('users.onlineStatus', uid);
            });

            return redis.qmget(keys)
                .then(function(values) {
                    return _.object(uids, _.values(values).map(function(val) {
                        return val ? 1 : 0;
                    }));
                });
        }
    });

    return User;
});
