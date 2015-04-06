"use strict";

define([
    'class',
    'q',
    'lodash',
    'util',
    'core/classes/db/redis'
], function(Class, Q, _, util, Redis) {
    var redis = Redis.get();

    return Class.extend({
        /**
         * e.g. sticker:%s
         */
        key: null,

        /**
         * e.g. global:nextStickerId
         */
        nextIdKey: null,

        fields: {
            /*
             format:
             'name': 'type'
             name 'id' is reserved

             types: text, set, list, json, jsonlist
             */
        },

        defaults: {

        },

        id: null,
        data: null,
        isLoaded: false,
        isChanged: false,

        config: null,

        initialize: function(config) {
            this.id        = null;
            this.data      = JSON.parse(JSON.stringify(this.defaults));
            this.isLoaded  = false;
            this.isChanged = false;

            if (!config) {
                config = {};
            }

            if (config.data) {
                this.setObject(config.data);
            }

            this.config = config;
        },

        load: function(id) {
            if (!id) {
                throw new Error('Cannot load model without id').set('ModelError', 'VoidID');
            }

            this.id = id;

            var modelkey = util.format(this.key, id),
                self = this, promises = [];

            return redis.qexists(modelkey)
                .then(function(result) {
                    if (!result) {
                        throw new Error('Key ' + modelkey + ' does not exist').set('ModelError', 'KeyNotFound');
                    }
                })
                .then(function() {
                    promises.push(
                        redis.qhgetall(modelkey)
                            .then(function(obj) {
                                _.each(obj, function(value, name) {
                                    if (self.fields[name] == 'json' && value) {
                                        obj[name] = JSON.parse(value);
                                    }
                                });

                                self.setObject(obj);
                            })
                    );

                    _.each(self.fields, function(type, name) {
                        if (type == 'text' || type == 'json')
                            return;

                        var fieldkey = modelkey + ':' + name,
                            promise = null;

                        switch (type) {
                            case 'set':
                                promise = redis.qsmembers(fieldkey);
                                break;
                            case 'list':
                                promise = redis.qlrange(fieldkey, 0, -1);
                                break;
                            case 'jsonlist':
                                promise = redis.qlrangejson(fieldkey, 0, -1);
                                break;
                        }

                        promise.then(function(data) {
                            self.set(name, data);
                        });

                        promises.push(promise);
                    });

                    return Q.all(promises);
                })
                .then(function() {
                    self.isLoaded = true;
                    self.isChanged = false;

                    return self.getObject();
                })
                .catch(function(e) {
                    if (e.errtype != 'ModelError') {
                        throw new Error('Failed to load model: ' + e).set('ModelError', 'Unknown');
                    } else {
                        throw e;
                    }
                });
        },

        set: function(key, value) {
            if (_.isObject(key)) {
                this.setObject(key);
            } else {
                if (this.fields[key]) {
                    this.data[key] = value;
                } else if (key == 'id') {
                    this.id = value;
                }

                this.isChanged = true;
            }

            return this;
        },

        setObject: function(obj) {
            _.each(obj, (function(value, key) {
                if (this.fields[key]) {
                    this.data[key] = value;
                } else if (key == 'id') {
                    this.id = value;
                }
            }).bind(this));

            this.isChanged = true;
        },

        getObject: function() {
            var data = JSON.parse(JSON.stringify(this.data)); // clone object

            data.id = this.id;

            return data;
        },

        /**
         * Adds child item to list, jsonlist or set and saves it immediately
         * @param field
         * @param value
         */
        addChild: function(field, value, skipSave) {
            if (!this.isLoaded)
                throw new Error('The model is not loaded');

            var fieldType = this.fields[field];

            if (fieldType != 'list' && fieldType != 'jsonlist' && fieldType != 'set') {
                throw new Error('Cannot add child to a non-list field "' + field + '"').set('ModelError', 'WrongType');
            }

            if (!value) {
                throw new Error('Cannot add child with empty value "' + field + '"').set('ModelError', 'WrongType');
            }

            this.data[field].push(value);

            if (skipSave) {
                return;
            }

            var key = util.format(this.key, this.id) + ':' + field;

            switch (fieldType) {
                case 'list':
                    redis.rpush(key, value);
                    break;
                case 'jsonlist':
                    redis.rpushjson(key, value);
                    break;
                case 'set':
                    redis.sadd(key, value);
                    break;
            }

            return this;
        },

        remove: function(setKey) {
            if (!this.isLoaded)
                throw new Error('The model is not loaded');

            var modelkey = util.format(this.key, this.id);

            redis.del(modelkey);

            _.each(this.fields, function(type, name) {
                if (type == 'text' || type == 'json')
                    return;

                var fieldkey = modelkey + ':' + name;

                redis.del(fieldkey);
            });

            if (setKey) {
                redis.srem(setKey, this.id);
            }
        },

        beforeSave: function() { },

        save: function(setKey) {
            var id = this.id, self = this;

            if (!this.isChanged)
                return Q(id);

            this.beforeSave();

            if (!id)
                id = redis.qincr(this.nextIdKey);

            return Q(id)
                .then(function(id) {
                    self.id = id;

                    var modelkey = util.format(self.key, id),
                        hashData = {};

                    _.each(self.fields, function(type, name) {
                        var fieldkey = modelkey + ':' + name,
                            value = self.data[name];

                        switch (type) {
                            case 'text':
                                hashData[name] = _.isUndefined(value) || _.isNull(value) ? '' : value;
                                break;
                            case 'json':
                                hashData[name] = _.isUndefined(value) || _.isNull(value) ? '' : JSON.stringify(value);
                                break;
                            case 'set':
                                redis.del(fieldkey, function() {
                                    _.each(value, function(item) {
                                        redis.sadd(fieldkey, item);
                                    });
                                });
                                break;
                            case 'list':
                                redis.del(fieldkey, function() {
                                    _.each(value, function(item) {
                                        redis.rpush(fieldkey, item);
                                    });
                                });
                                break;
                            case 'jsonlist':
                                redis.del(fieldkey, function() {
                                    _.each(value, function(item) {
                                        redis.rpushjson(fieldkey, item);
                                    });
                                });
                                break;
                        }
                    });

                    redis.hmset(modelkey, hashData);

                    self.isChanged = false;
                    self.isLoaded = true;

                    if (setKey) {
                        redis.sadd(setKey, id);
                    }

                    return id;
                })
                .catch(function(e) {
                    if (e.errtype != 'ModelError') {
                        throw new Error('Failed to save model: ' + e).set('ModelError', 'Unknown');
                    } else {
                        throw e;
                    }
                });
        }

    }, { // static properties

        getCollection: function(ids) {
            var Me = this;

            if (!_.isArray(ids))
                ids = redis.qsmembers(ids);

            return Q(ids)
                .then(function(ids) {
                    var result = [],
                        promises = [];

                    _.each(ids, function(id) {
                        var model = new Me();

                        promises.push(
                            model.load(id)
                                .then(function() {
                                    result.push(model);
                                })
                        );
                    });

                    return Q.all(promises)
                        .then(function() {
                            return result;
                        });
                })
                .catch(function(e) {
                    if (e.errtype != 'ModelError') {
                        throw new Error('Failed to get collection: ' + e).set('ModelError', 'Unknown');
                    } else {
                        throw e;
                    }
                });
        },

        getCollectionData: function(ids) {
            return this.getCollection(ids)
                .then(function(data) {
                    var result = {};

                    _.each(data, function(model) {
                        var modelData = model.getObject();

                        result[modelData.id] = modelData;
                    });

                    return result;
                })
                .catch(function(e) {
                    if (e.errtype != 'ModelError') {
                        throw new Error('Failed to get collection data: ' + e).set('ModelError', 'Unknown');
                    } else {
                        throw e;
                    }
                });
        }

    });
});
