"use strict";

define([
    'base-module',
    'core/classes/user',
    'q',
    'fs',
    'lodash',
    'logger',
    'moment'
], function(BaseModule, User, Q, fs, _, logger, moment) {
    return BaseModule.extend({
        id: 'static',

        socketEvents: {

        },

        backendEvents: {

        },

        linkEvents: {

        },

        checkAcl: true,

        acl: {

        },

        httpRoutes: [
            {
                url: '/*',
                type: 'get',
                callback: 'onDefaultRoute'
            }
        ],

        _templates: {
            'index': 'index.tpl.html'
        },

        initialize: function() {
            this._initTemplates();
        },

        _initTemplates: function() {
            logger.info('Compiling static templates...');

            var self = this;

            _.each(this._templates, function(path, name) {
                self._templates[name] = fs.readFileSync('include/modules/static/tpl/' + path, { encoding: 'utf8' });
            });
        },

        _getTemplate: function(name) {
            var tpl = this._templates[name];

            if (!tpl) {
                throw new Error('Template "' + name + '" does not exist');
            }

            return tpl;
        },

        _render: function(tplName, data) {
            return this._getTemplate(tplName);
        },

        onDefaultRoute: function(req, res) {
            res.end(this._render('index', {
                time: moment().format()
            }));
        }
    });
});
