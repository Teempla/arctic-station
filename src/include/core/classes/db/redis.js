"use strict";

define([
    'redis',
    'logger',
    'util',
    'q',
    'lodash'
], function(Redis, logger, util, Q, _) {
    var CreateClient = function(options) {
        var client = Redis.createClient(options.port, options.host, options.options);

        _.extend(client, {
            setjson: function(key, data, callback) {
                if (!_.isObject(data) && !_.isArray(data))
                    throw new Error('Data is not an object or array');

                return this.set(key, JSON.stringify(data), callback);
            },

            getjson: function(key, callback) {
                return this.get(key, function(err, data) {
                    if (err) return callback(err);

                    if (!data) {
                        return callback();
                    }

                    try {
                        data = JSON.parse(data);
                    } catch (e) {
                        callback(new Error('"' + data + '" is not a JSON string'));
                    }

                    callback(null, data);
                });
            },

            lrangejson: function(key, from, to, callback) {
                return this.lrange(key, from, to, function(err, data) {
                    if (err) callback(err);

                    var parsedData = [];

                    _.each(data, function(element) {
                        try {
                            parsedData.push(JSON.parse(element));
                        } catch (e) {
                            callback(new Error('"' + element + '" is not a JSON string'));
                        }
                    });

                    callback(null, parsedData);
                });
            },

            rpushjson: function(key, data, callback) {
                if (!_.isObject(data) && !_.isArray(data))
                    throw new Error('Data is not an object or array');

                return this.rpush(key, JSON.stringify(data), callback);
            },

            lpushjson: function(key, data, callback) {
                if (!_.isObject(data) && !_.isArray(data))
                    throw new Error('Data is not an object or array');

                return this.lpush(key, JSON.stringify(data), callback);
            }
        });

        _.each([
            'get', 'getjson', 'setjson', 'smembers', 'hgetall', 'lrange', 'lrangejson',
            'incr', 'llen', 'hget', 'keys', 'sismember', 'exists', 'select',
            'del', 'mget', 'srem', 'sadd', 'set'
        ], function(method) {
            client['q' + method] = Q.nbind(client[method], client);
        });

        var defer = Q.defer(),
            rejectTimer;

        client.on('error', function(e) {
            logger.warn(new Error(e.message).set('RedisError', 'CoreError').toString());

            if (rejectTimer) {
                defer.reject();

                clearTimeout(rejectTimer);
            }
        });

        client.on('ready', function() {
            this.stream.setKeepAlive(true);
            this.stream.setTimeout(0);

            logger.info('Redis connection is ready');

            if (rejectTimer) {
                defer.resolve(true);

                clearTimeout(rejectTimer);
            }
        });

        client.connectionPromise = defer.promise;

        rejectTimer = setTimeout(function() {
            defer.reject();
        }, 30000);

        return client;
    };

    return {

        clients: {},

        acquire: function(options, name) {
            if (!name) {
                name = 'default';
            }

            if (this.clients[name]) {
                throw new Error('Redis connection "' + name + '" already exists')
                    .set('RedisError', 'NameExists');
            }

            this.clients[name] = CreateClient(options);

            return this.clients[name];
        },

        release: function(name) {
            if (!name) {
                name = 'default';
            }

            if (!this.clients[name]) {
                throw new Error('Redis connection "' + name + '" does not exist')
                    .set('RedisError', 'NameDoesNotExist');
            }

            this.clients[name].quit();

            delete this.clients[name];
        },

        get: function(name) {
            if (!name) {
                name = 'default';
            }

            if (!this.clients[name]) {
                throw new Error('Redis connection "' + name + '" does not exist')
                    .set('RedisError', 'NameDoesNotExist');
            }

            return this.clients[name];
        }

    };
});
