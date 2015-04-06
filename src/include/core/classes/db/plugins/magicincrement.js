"use strict";

define([
    'mongo',
    'core/models/counters'
], function(mongoose, Counters) {
    return function(schema, options) {
        schema.pre('save', function (next) {
            if (!this.isNew) {
                return next();
            }

            var self = this,
                key = options.magicKey ? options.key + '.' + self[options.magicKey] : options.key;

            Counters.collection.findAndModify(
                { field: key },
                null,
                { $inc: { value: 1 } },
                { new: true, upsert: true },
                function(err, counter) {
                    if (err) {
                        return next();
                    }

                    self[options.field] = counter.value;

                    next();
                }
            );
        });
    };
});
