'use strict';

var Primus = require('primus'),
    server = require('http').createServer(),
    primus = new Primus(server, {
        transformer: 'engine.io',
        parser: 'json',
        timeout: 60000
    });

primus.save(__dirname + '/../dist/www/lib/primus.js');
