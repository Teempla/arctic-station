"use strict";

define([
    'winston',
    'node-logentries',
    'util',
    'os',
    'lodash'
], function(winston, nodeLogentries, util, os, _) {
    var Logentries  = winston.transports.Logentries = function (options) {

        winston.Transport.call(this, options);
        options = (options || {});

        this.name     = 'logentries';
        this.level    = (options.level || 'info');
        this.token    = (options.token || null);

        this.$client = nodeLogentries.logger({
            token: this.token
        });

        this.$client.level(this.level);
    };

    util.inherits(Logentries, winston.Transport);

    Logentries.prototype.log = function (level, msg, meta, callback) {
        var metaString = '';

        if(!_.isEmpty(meta)){
            metaString = ' '+JSON.stringify(meta);
        }

        var data = os.hostname().toString() + ':' + msg + metaString;
        this.$client.log(level, data);

        callback(null, true);
    };

    return Logentries;
});
