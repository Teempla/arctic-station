"use strict";

define([
    'class',
    'mysql',
    'logger',
    'q'
], function(Class, mysql, logger, Q) {
    var Client = Class.extend({
        connection: null,
        connected: false,

        reconnectTimeout: 2000,

        initialize: function() {
            this.connect();
        },

        connect: function() {
            var self = this;

            this.connected = false;
            this.connection = mysql.createConnection(this.options);

            this.connection.connect(function(err) {
                if (err) {
                    logger.warn(new Error('Mysql connection to ' + self.options.host + ':' +
                        self.options.port + ' failed - connect ' + err.code)
                        .set('MysqlError', 'ConnectionError').toString());

                    setTimeout(function() {
                        self.connect();
                    }, self.reconnectTimeout);

                    return;
                }

                self.connected = true;

                logger.info('Connected to MySQL db');
            });

            this.connection.on('error', function(err) {
                if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                    logger.warn(new Error('Mysql Error: ' + err.code)
                        .set('MysqlError', 'ConnectionError').toString());

                    self.connect();
                } else {
                    throw new Error('Code: ' + err.code + '; Message: ' + err.message)
                        .set('MysqlError', 'CoreError').toString();
                }
            });
        },

        exec: function(cb) {
            var self = this;

            if (this.connected) {
                cb();
            } else {
                setTimeout(function() {
                    self.exec(cb);
                }, self.reconnectTimeout);
            }
        },

        qquery: function(query, params) {
            var deferred = Q.defer(),
                self = this;

            this.exec(function() {
                self.connection.query(query, params, function(err, result) {
                    if (err) {
                        deferred.reject(new Error(err));
                    } else {
                        deferred.resolve(result);
                    }
                });
            });

            return deferred.promise;
        },

        disconnect: function() {
            if (this.connected) {
                this.connection.end();
            }
        }
    });

    return {

        clients: {},

        acquire: function(options, name) {
            if (!name) {
                name = 'default';
            }

            if (this.clients[name]) {
                throw new Error('MySQL connection "' + name + '" already exists')
                    .set('MysqlError', 'NameExists');
            }

            this.clients[name] = new Client(options);

            return this.clients[name];
        },

        release: function(name) {
            if (!name) {
                name = 'default';
            }

            if (!this.clients[name]) {
                throw new Error('MySQL connection "' + name + '" does not exist')
                    .set('MysqlError', 'NameDoesNotExist');
            }

            this.clients[name].disconnect();

            delete this.clients[name];
        },

        get: function(name) {
            if (!name) {
                name = 'default';
            }

            if (!this.clients[name]) {
                throw new Error('MySQL connection "' + name + '" does not exist')
                    .set('MysqlError', 'NameDoesNotExist');
            }

            return this.clients[name];
        }

    };
});
