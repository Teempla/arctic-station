"use strict";

define([
    'class',
    'lodash',
    'fs',
    'util'
], function(Class, _, fs, util) {
    var configsPath = 'configs/',
        configFiles = {
            general: [
                'default.conf',
                'environment.conf',
                'machine.conf',
                'user.conf'
            ],
            redis: [
                'redis.conf'
            ]
        };

    var iniRegex = {
        section: /^\s*\[\s*([^\]]*)\s*\]\s*$/,
        param: /^\s*([\w\.\-\_]+)\s*=\s*(.*?)\s*$/,
        comment: /^\s*;.*$/
    };

    function parseIni(data) {
        var value = {};
        var lines = data.split(/\r\n|\r|\n/);
        var section = null;

        _.each(lines, function(line) {
            var match;

            if (iniRegex.comment.test(line)) {
                return;
            } else if(iniRegex.param.test(line)) {
                match = line.match(iniRegex.param);

                if(section){
                    value[section + '.' + match[1]] = match[2];
                }else{
                    value[match[1]] = match[2];
                }
            } else if(iniRegex.section.test(line)) {
                match = line.match(iniRegex.section);

                section = match[1];
            } else if(line.length === 0 && section) {
                section = null;
            }
        });

        return value;
    }

    var data = { };

    var Config = Class.extend({

        general: null,
        redis: null,

        process: null,

        initialize: function() {
            this.loadGeneral();
            this.loadRedis();

            this.loadProcess();
        },

        load: function(files, to) {
            if (!_.isObject(to)) {
                to = {};
            }

            _.each(files, function(file) {
                var fullname = configsPath + file;

                if (!fs.existsSync(fullname)) {
                    return;
                }

                var conf = parseIni(fs.readFileSync(fullname, 'utf8'));

                _.extend(to, conf);

                //logger.info('Configuration file loaded: ' + file);
            });

            _.each(to, function(val, key) {
                if (val === '') {
                    throw new Error('Failed to load configuration: ' +
                        'Key "' + key + '" is empty. Please use one of ' +
                        'configuration files to define it.');
                } else if (val.toLowerCase() === 'true') {
                    to[key] = true;
                } else if (val.toLowerCase() === 'false') {
                    to[key] = false;
                }
            });

            return to;
        },

        createConfig: function(from) {
            var self = this;

            return { 'get': function() {
                var args = Array.prototype.slice.call(arguments);

                args.unshift(from);

                return self.pick.apply(self, args);
            }};
        },

        pick: function(from, key) {
            if (_.isUndefined(from[key])) {
                throw new Error('Failed to get configuration value: ' +
                    'Key "' + key + '" is not found in registry. Please use one of ' +
                    'configuration files to define it.');
            }

            if (arguments.length > 2) {
                var args = _.drop(arguments, 1);

                args[0] = from[key];

                return util.format.apply(util, args);
            }

            return from[key];
        },

        loadGeneral: function() {
            var conf = this.load(configFiles.general, data.general);

            // turn into array
            conf['app.allowedHosts'] = conf['app.allowedHosts'].split(' ');

            this.general = this.createConfig(conf);
        },

        loadRedis: function() {
            var conf = this.load(configFiles.redis, data.redis);

            this.redis = this.createConfig(conf);
        },

        loadProcess: function() {
            var conf = {};

            _.each(process.argv, function (arg) {
                arg = arg.toLowerCase();

                if (arg.substr(0, 2) != '--') {
                    return;
                }

                var parts = /--(.*?)=(.*)/.exec(arg),
                    key, val;

                if (parts) {
                    key = parts[1];
                    val = parts[2];

                    if (val === 'true') {
                        val = true;
                    } else if (val === 'false') {
                        val = false;
                    }
                } else {
                    key = arg.substr(2);
                    val = true;
                }

                conf[key] = val;
            });

            this.process = { 'get': function(key, def) {
                if (_.isUndefined(conf[key])) {
                    return def;
                } else {
                    return conf[key];
                }
            }};
        }

    });

    return new Config();
});
