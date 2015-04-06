"use strict";

define([
    'events',
    'lodash'
], function(events, _) {
    var EventEmitter = events.EventEmitter;

    var Class = function(options) {
        this.options = options || {};

        if (_.isFunction(this.initialize)) {
            this.initialize(this.options);
        }
    };

    Class.extend = function(protoProps, staticProps) {
        var parent = this;
        var child;

        if (protoProps && _.has(protoProps, 'constructor')) {
            child = protoProps.constructor;
        } else {
            child = function(){ return parent.apply(this, arguments); };
        }

        _.extend(child, parent, staticProps);

        var Surrogate = function(){ this.constructor = child; };
        Surrogate.prototype = parent.prototype;
        child.prototype = new Surrogate();

        if (protoProps) _.extend(child.prototype, protoProps);

        child.__super__ = parent.prototype;

        return child;
    };

    _.extend(Class.prototype, EventEmitter.prototype);

    return Class;
});
