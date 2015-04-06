(function(root, factory) {
    if (typeof define === 'function' && define.amd) { // AMD
        define(['primus', 'lodash', 'q'], function(Primus, _, Q) {
            return factory(Primus, _, Q);
        });
    } else if (typeof exports !== 'undefined') { // Node.js/CommonJS
        /// !!! @todo not supported yet
        module.exports = factory();
    } else { // browser global.
        root.Comet = factory(root.Primus, root._, root.Q);
    }
}(this, function(Primus, _, Q) {
    var Comet = function(options) {
        // Mix in event emitter
        _.extend(this, Primus.EventEmitter.prototype);

        // Default properties
        _.extend(this, {
            inUse: false,
            useCounter: 0,
            connected: false,
            broken: false,
            ready: false,
            isAuthorizing: false,

            qid: 0,

            config: _.extend(
                {
                    debug: false,
                    socketQResTimeout: 60000,
                    releaseTimeout: 10000,
                    connectTimeout: 10000,
                    pongTimeout: 30000,
                    url: '',
                    encodeEvents: true,
                    uid: '',
                    sid: ''
                },
                options
            ),

            primusEvents: {
                'open': 'onOpen',
                'close': 'onClose',
                'reconnected': 'onReconnected',
                'reconnect scheduled': 'onReconnecting',
                'data': 'onData',
                'error': 'onPrimusError'
            },

            resultQueue: {},
            emitQueue: []
        });
    };

    _.extend(Comet.prototype, {
        _bindEvents: function(primus) {
            var self = this;

            _.each(this.primusEvents, function(cb, evt) {
                primus.on(evt, self[cb].bind(self));
            });
        },

        _unbindEvents: function(primus) {
            primus.removeAllListeners();
        },

        _createQuery: function(data) {
            var params = [];

            _.each(data, function(val, key) {
                params.push(key + '=' + encodeURIComponent(val ? val : ''));
            });

            return params.join('&');
        },

        _createUrl: function() {
            var uid, sid;

            if (_.isFunction(this.config.uid)) {
                uid = this.config.uid();
            }

            if (_.isFunction(this.config.sid)) {
                sid = this.config.sid();
            }

            var data = {
                t_pci: this.pci,
                t_uid: uid,
                t_sid: sid,
                t_encevents: this.config.encodeEvents
            };

            this.isAuthorizing = !!uid;

            return this.config.url + '/?' + this._createQuery(data);
        },

        _processEmitQueue: function() {
            for (var i = 0, l = this.emitQueue.length; i < l; i++) {
                var obj = this.emitQueue[i];

                this.send(obj.event, obj.data, obj.deferred);
            }

            this.emitQueue = [];
        },

        connect: function() {
            var primus, wsUrl = this._createUrl();

            primus = new Primus(wsUrl, {
                strategy: [ 'online', 'timeout', 'disconnect' ],
                reconnect: {
                    max: '5 s',
                    min: '2 s',
                    retries: Infinity
                },
                timeout: this.config.connectTimeout,
                pong: this.config.pongTimeout,
                parser: 'json'
            });

            this._bindEvents(primus);

            this.primus = primus;
            this.inUse = true;
        },

        reconnect: function(delay) {
            var self = this;

            Q.delay(delay ? 3000 : 0)
                .then(function() {
                    self.connect();
                })
                .done();
        },

        onOpen: function() {
            this.connected = true;

            this.emit('connection:start');
        },

        onClose: function() {
            this.connected = false;

            this._unbindEvents(this.primus);

            if (this.inUse) {
                this.onReconnecting();

                this.reconnect(true);
            } else {
                this.emit('connection:end');
            }
        },

        onPrimusError: function(e) {
            //console.error('Primus error: ' + e);
        },

        onReconnected: function() {
            this.emit('connection:reconnected');
        },

        onReconnecting: function() {
            this.connected = false;

            if (!this.broken) {
                this.broken = true;
                this.ready = false;

                this.emit('connection:lost');

                this.primus.url.href = this._createUrl();
            }
        },

        onData: function(data) {
            var event = data.e;

            delete data.e;

            if (this.config.debug) {
                console.log('-->', event, data);
            }

            switch (event) {
                case 'set:pci':
                    this.onSetPCI(data);
                    break;
                case 'qres':
                    this.onQRes(data);
                    break;
                case 'ready':
                    this.onReady();
                    break;
                case 'error':
                    this.onError(data);
                    break;
                default:
                    this.emit(event, data);
            }
        },

        onError: function(data) {
            if (data.type == 'CONNECTION_REJECTED' && data.code == 'REAUTHORIZE') {
                if (this.pci) {
                    this.pci = null;
                } else {
                    this.inUse = false;

                    this.release();

                    this.emit('auth:error');
                }
            }
        },

        onSetPCI: function(data) {
            this.pci = data.id;
        },

        onQRes: function(result) {
            if (!this.resultQueue[result.q]) {
                throw new Error('No result in queue with id ' + result.q);
            }

            var deferred = this.resultQueue[result.q];

            delete this.resultQueue[result.q];

            if (!result.success) {
                var err = new Error(result.error);

                err.errcode = result.errcode;
                err.errtype = result.errtype;
                err.params = result.params;

                deferred.reject(err);
            } else {
                deferred.resolve(result.data);
            }

            clearTimeout(deferred.socketTimer);
        },

        onReady: function() {
            if (this.broken) {
                this.broken = false;

                this.emit('connection:restored');
            }

            this.ready = true;

            if (this.isAuthorizing) {
                this.emit('auth:success');
            }

            this._processEmitQueue();
        },

        disconnect: function() {
            this.inUse = false;
            this.pci = null;
            this.resultQueue = {};
            this.emitQueue = [];
            this.ready = false;

            this.primus.end();

            console.log('comet disconnected');
        },

        acquire: function() {
            console.log('acquiring comet');

            if (!this.inUse) {
                this.connect();
            }
        },

        release: function() {
            console.log('releasing comet');

            if (this.inUse) {
                this.disconnect();
            }
        },

        send: function(event, data, deferred) {
            if (!this.inUse) {
                throw new Error('Failed to emit message: not in use');
            }

            var primus = this.primus,
                self = this;

            if (!this.ready) {
                this.emitQueue.push({
                    event: event,
                    data: data,
                    deferred: deferred
                });
            } else {
                if (_.isUndefined(data)) {
                    data = {};
                }

                if (this.config.debug) {
                    console.log('<--', event, data);
                }

                data.e = event;

                primus.write(data);

                if (deferred) {
                    deferred.socketTimer = setTimeout(function() {
                        deferred.reject(new Error('No result timeout for ' + event));

                        delete self.resultQueue[data.q];
                    }, self.config.socketQResTimeout);
                }
            }
        },

        qsend: function(event, data) {
            if (!data) {
                data = {};
            }

            data.q = ++this.qid;

            var deferred = Q.defer();

            this.resultQueue[data.q] = deferred;

            this.send(event, data, deferred);

            return deferred.promise;
        },

        wait: function(events, timeout) {
            var promises = [], self = this;

            for (var i = 0, l = events.length; i < l; i++) {
                (function(event){
                    var deferred = Q.defer(),
                        rejectTimer;

                    self.once(event, function(data) {
                        deferred.resolve(data);

                        if (rejectTimer)
                            clearTimeout(rejectTimer);
                    });

                    if (timeout) {
                        rejectTimer = setTimeout(function() {
                            deferred.reject(new Error('Did not receive ' + event + ' in ' + timeout + 'ms'));
                        }, timeout);
                    }

                    promises.push(deferred.promise);
                })(events[i]);
            }

            return Q.all(promises);
        }
    });

    return Comet;
}));
