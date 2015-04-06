"use strict";

define([
    'q',
    'lodash',
    'logger',
    'http',
    'os',

    './misc/throat'
], function(Q, _, logger, http, os) {
    var utils = {
        escapeRegExp: function(str) {
            return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
        },

        /**
         * retrieves remote url and returns its content as {Buffer}
         *
         * @param {String} url
         * @param {Boolean} isBinary
         * @returns {Promise|Buffer}
         */
        loadURL: function(url, isBinary) {
            var defer = Q.defer();

            http.get(url)
                .on('response', function(response) {
                    if (response.statusCode != 200) {
                        return defer.reject(new Error('Failed to read remote file: HTTP response status: ' +
                            response.statusCode).set('HTTPError', 'InvalidStatus'));
                    }

                    if (isBinary) {
                        response.setEncoding('binary');
                    }

                    var body = '';

                    response
                        .on('data', function(chunk) {
                            body += chunk;
                        })
                        .on('end', function() {
                            defer.resolve(new Buffer(body, isBinary ? 'binary' : null));
                        })
                        .on('error', function(e) {
                            defer.reject(new Error('Failed to read remote file: ' + e.message)
                                .set('HTTPError', 'ResponseError'));
                        });
                })
                .on('error', function(e) {
                    defer.reject(new Error('Failed to read remote file: ' + e.message)
                        .set('HTTPError', 'ConnectionError'));
                });

            return defer.promise;
        },

        getServerIPAddress: function(preferPrivateNetwork) {
            var ifaces = os.networkInterfaces(),
                addresses = [], preferred;

            _.each(ifaces, function(iface, name) {
                if (!/eth\d+/.test(name)) {
                    return;
                }

                _.each(iface, function(details) {
                    if (details.family == 'IPv4') {
                        addresses.push(details.address);

                        if (preferPrivateNetwork && /^10\./.test(details.address)) {
                            preferred = details.address;
                        }
                    }
                });
            });

            if (preferred) {
                return preferred;
            }

            if (addresses.length > 0) {
                return addresses[0];
            }

            return false;
        }
    };

    /**
     * binds multiple methods at once using Q.nfbind()
     *
     * @param methods - list of methods
     * @param ctx - context to bind methods to
     */
    Q.mnfbind = function(methods, ctx) {
        _.each(methods, function(method) {
            ctx[method] = Q.nfbind(ctx[method].bind(ctx));
        });
    };

    // error extension

    Error.prototype.errtype = '';
    Error.prototype.errcode = '';

    Error.prototype.set = function(type, code, params) {
        this.errtype = type;
        this.errcode = code;
        this.params = params;

        return this;
    };

    Error.prototype.toString = function() {
        return (this.errtype ? this.errtype : 'Error') +
            (this.errcode ? '#' + this.errcode : '') +  ': ' + this.message;
    };

    Date.nowSeconds = function() {
        return Math.floor(this.now() / 1000);
    };

    // lodash mixins

    function toIntArray(a, shouldFilter) {
        var filteredResult;

        if (shouldFilter) {
            filteredResult = [];

            _.each(a, function(i) {
                var num = +i;

                if (num) {
                    filteredResult.push(num);
                }
            });

            return filteredResult;
        } else {
            return _.map(a, function(item) {
                return +item;
            });
        }
    }

    function toStrArray(a) {
        return _.map(a, function(item) {
            return '' + item;
        });
    }

    function withoutArray(a1, a2) {
        return a1.filter(function(item) {
            return _.indexOf(a2, item) == -1;
        });
    }

    _.mixin({
        toIntArray: toIntArray,
        toStrArray: toStrArray,
        withoutArray: withoutArray
    });

    return utils;
});
