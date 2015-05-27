"use strict";

process.chdir(__dirname);

var requirejs = require('requirejs'),
    backend;

requirejs.config({
    nodeRequire: require,

    baseUrl: __dirname + '/include/',

    paths: {
        'class': 'core/base/class',
        'base-module': 'core/base/module',
        'redis-model': 'core/base/redis-model',
        'mongo': 'core/classes/db/mongo',
        'vent': 'core/utils/vent',
        'logger': 'core/utils/logger',
        'config': 'core/utils/config'
    }
});

function shutdown(e) {
    if (e) {
        console.error(e.stack);
    }

    if (backend) {
        backend.stop(e);
    } else {
        process.exit(!!e);
    }
}

process.on('SIGINT', shutdown);
process.on('uncaughtException', shutdown);

requirejs([ 'core/classes/backend' ], function(Backend) {
    backend = new Backend();

    backend.start();
});
