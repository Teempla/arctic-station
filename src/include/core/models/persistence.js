"use strict";

define([
    'redis-model',
    'config'
], function(Model, config) {
    return Model.extend({
        key: config.redis.get('persistence.model'),

        fields: {
            ip: 'text',
            acl: 'json',
            customData: 'json'
        },

        defaults: {
            ip: '',
            acl: {},
            customData: {}
        }
    });
});
