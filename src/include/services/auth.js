"use strict";

/**
 * User authorization service
 */
define([
    'class',
    'core/classes/user',
    './auth/adapters/chat'
], function(Class, User, ChatAdapter) {
    return Class.extend({ }, {
        /**
         * Installs authorization method
         */
        install: function() {
            User.setAuthAdapter(ChatAdapter);
        }
    });
});

