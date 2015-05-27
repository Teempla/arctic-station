"use strict";

define([
    'winston',
    'config',
    'core/utils/logentries-transport'
], function(winston, config) {
    var settings = {
            transports: [
                new (winston.transports.Console)({
                    timestamp: true,
                    colorize: true,
                    handleExceptions: true,
                    prettyPrint: true
                })
            ],
            exitOnError: false
        };

    var logger = new (winston.Logger)(settings);

    if (config.general.get('logentries.enabled')) {
        logger.add(winston.transports.Logentries, {
            token: config.general.get('logentries.token'),
            level: config.general.get('logentries.level')
        });
    }

    /**
     * Error logging helper
     * Winston can`t log error
     *
     * @param error - Error or string and even null
     */
    logger.logError = function(error){

        if(!error){
            logger.error('Unknown error');
            return;
        }

        if(error.stack){
            logger.error(error.stack);
        }else{
            logger.error(error.toString());
        }
    };

    return logger;
});
