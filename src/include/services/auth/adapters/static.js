"use strict";

/**
 * Static authorization adapter
 */
define([
    'config',
    'logger'
], function(config, logger) {
    var adminUser = config.general.get('example.adminUser'),
        adminPassword = config.general.get('example.adminPassword');

    /**
     * Compares uid and sid provided to example.adminUser and
     * example.adminPassword config values respectively.
     */
    return function(uid, sid) {
        // can return either a plain boolean value or a promise of it
        return uid == adminUser && sid == adminPassword;
    };
});
