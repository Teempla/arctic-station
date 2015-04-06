"use strict";

define([
    'q'
], function(Q) {
    function Delayed(resolve, fn, self, args) {
        this.resolve = resolve;
        this.fn = fn;
        this.self = self || null;
        this.args = args || null;
    }

    Q.throat = function(size, fn) {
        var queue = [];

        function run(fn, self, args) {
            if (size) {
                size--;

                var result = new Q.Promise(function(resolve) {
                    resolve(fn.apply(self, args));
                });

                result.then(release, release);

                return result;
            } else {
                return new Q.Promise(function(resolve) {
                    queue.push(new Delayed(resolve, fn, self, args));
                });
            }
        }

        function release() {
            size++;

            if (queue.length) {
                var next = queue.shift();

                next.resolve(run(next.fn, next.self, next.args));
            }
        }

        if (typeof fn === 'function') {
            return function() {
                return run(fn, this, arguments);
            };
        } else {
            return function(fn) {
                return run(fn, this, Array.prototype.slice.call(arguments, 1));
            };
        }
    };
});