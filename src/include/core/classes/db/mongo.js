"use strict";

define([
    'config',
    'logger',
    'util',
    'q',
    'mongoose',
    'core/utils/misc' // to extend Q with mnfbind()
], function(config, logger, util, Q, mongoose) {
    var database = config.general.get('mongo.database'),
        host = config.general.get('mongo.host'),
        port = config.general.get('mongo.port');

    mongoose.set('debug', config.general.get('mongo.debug'));

    mongoose.connect(util.format('mongodb://%s:%s/%s', host, port, database), {
        server: {
            socketOptions: {
                keepAlive: 1
            }
        }
    });

    var db = mongoose.connection,
        defer = Q.defer(),
        rejectTimer;

    db.on('error', function(err) {
        if (err.name == 'ValidationError') {
            logger.warn('Mongoose model validation failed', err.errors);

            throw new Error('Validation failed').set('MongoError', 'ValidationError');
        } else {
            logger.warn('Mongoose error', err);

            if (rejectTimer) {
                defer.reject();

                clearTimeout(rejectTimer);
            }
        }
    });

    db.on('open', function() {
        logger.info('Connected to MongoDB');

        if (rejectTimer) {
            defer.resolve(true);

            clearTimeout(rejectTimer);
        }
    });

    mongoose.connectionPromise = defer.promise;

    rejectTimer = setTimeout(function() {
        defer.reject();
    }, 30000);

    return mongoose;
});
