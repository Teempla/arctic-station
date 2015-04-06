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

            var self = this;

            Counters.collection.findAndModify(
                { field: options.key },
                null,
                { $inc: { value: 1 } },
                { new: true, upsert: true },
                function(err, counter) {
                    if (err) {
                        next(err);

                        return;
                    }

                    self[options.field] = counter.value;

                    next();
                }
            );
        });
    };
});
