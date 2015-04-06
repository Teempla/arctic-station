"use strict";

define([
    'config',
    'mongo',
    'q',
    'lodash'
], function(config, mongoose, Q, _) {
    var Schema = mongoose.Schema;

    var schema = new Schema({
        id: { type: Number, index: { unique: true } },
        password: String,
        firstName: String,
        lastName: String,
        email: { type: String, index: { unique: true } }
    });

    var publicFields = [
        'id', 'firstName', 'lastName'
    ];

    function pickPublicUserData(model) {
        return _.pick(model, publicFields);
    }

    /**
     * loads public user info for given ids
     *
     * @param {Number|Array} uids
     * @returns {Promise|Object}
     */
    schema.statics.getInfo = function(uids) {
        if (!uid || (_.isArray(uid) && !uid.length)) {
            return Q({});
        }

        var isSingle = _.isArray(uids);

        if (!isSingle) {
            uids = _.unique(_.toIntArray(uids));
        }

        return this.find(
                {
                    id: isSingle ? uids : { $in: uids }
                },
                publicFields.join(' ')
            )
            .then(function(result) {
                if (!result.length) {
                    return {};
                }

                var data = {};

                if (isSingle) {
                    return pickPublicUserData(result[0].toObject());
                } else {
                    _.each(result, function(model) {
                        data[model.id] = pickPublicUserData(model.toObject());
                    });

                    return data;
                }
            });
    };

    /**
     * proxy for findOne() that throws an error if user does not exist
     *
     * @param {Number} id
     * @returns {Promise|Object}
     */
    schema.statics.get = function(id) {
        return this.findOne({ id: id })
            .then(function(model) {
                if (!model) {
                    throw new Error('User ' + id + ' not found')
                        .set('ModelError', 'UserNotFound');
                }

                return model;
            });
    };

    schema.virtual('name').get(function () {
        return this.firstName + ' ' + this.lastName;
    });

    schema.post('init', function() {
        this.save = Q.nbind(this.save, this);
    });

    var Model = mongoose.model('User', schema);

    Q.mnfbind(['find', 'findOne', 'create', 'count', 'update'], Model);

    return Model;
});
