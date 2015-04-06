"use strict";

define([
    'class',
    'config',
    'lodash',
    'logger',
    'vent'
], function(Class, config, _, logger, vent) {
    return Class.extend({
        backendEvents: {

        },

        backend: null,

        initialize: function(params) {
            this.backend = params.backend;

            this._bindBackendEvents();
        },

        /**
         * binds bootstrap's backend/vent events
         */
        _bindBackendEvents: function() {
            var context = this;

            _.each(this.backendEvents, function(callbackName, event) {
                vent.on(event, context[callbackName].bind(context));
            });
        }
    });
});