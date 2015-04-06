"use strict";

define([
    'mongo',
    'logger'
], function(mongoose, logger) {
    return function(schema, options) {
        schema.pre('save', function (next) {
            this[options.field] = new Date();
            next();
        });
    };
});
