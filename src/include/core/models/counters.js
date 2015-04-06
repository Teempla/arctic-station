"use strict";

define([
    'mongo'
],function(mongoose) {
    var counterSchema = new mongoose.Schema({
        field: { type: String, require: true, index: { unique: true } },
        value: { type: Number, default: 0 }
    });

    var Counters = mongoose.model('Counters', counterSchema);

    return Counters;
});
