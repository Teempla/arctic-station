var tplChannelLink = _.template($('#tpl-channel-link').text()),
    tplUserLink = _.template($('#tpl-user-link').text());

var templateHelpers = {
    channelLink: function(channel) {
        return tplChannelLink({
            channel: channel
        });
    },

    userLink: function(user) {
        return tplUserLink({
            user: user
        });
    },

    disarmMessage: function(text) {
        if (!_.isString(text)) {
            text = '';
        }

        text = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;")
            .replace(/\n/g, '<br/>');

        var replacer = function(s) {
                return '<a href="' + s + '" target="_blank">' + s + '</a>';
            },
            regexp = /\(?\b(http|https|ftp):\/\/[-A-Za-z0-9+&@#/%?=~_()|!:,.;]*[-A-Za-z0-9+&@#/%=~_()|]/ig,
            links = [],
            result;

        while (result = regexp.exec(text)) {
            var link = result[0];

            if (link.substr(0, 1) == '(' &&
                link.substr(link.length - 1, 1) == ')') {
                link = link.substr(1, link.length - 2);
            }

            links.push(link);
        }

        for (var i = 0, l = links.length; i < l; i++) {
            text = text.replace(links[i], replacer);
        }

        return text;
    }
};

function getTemplate(id) {
    var compiled = _.template($('#' + id).text());

    return function(data) {
        return compiled(_.extend(templateHelpers, data));
    };
}

var ChatAPI = Marionette.Controller.extend({
    cometEvents: {
        // Service events
        'connection:start': 'onConnectionStart',
        'connection:end': 'onConnectionEnd',
        'connection:lost': 'onConnectionLost',
        'connection:reconnected': 'onConnectionReconnected',
        'auth:success': 'onAuthSuccess',
        'auth:error': 'onAuthError',

        // Chat module events
        'chat:userJoined': 'onUserJoined',
        'chat:userLeft': 'onUserLeft',
        'chat:whisper': 'onWhisper',
        'chat:message': 'onMessage'
    },

    defaultChannel: 'General',
    currentChannel: 'General',

    initialize: function(params) {
        var self = this;

        this.comet = new Comet({
            /*
             Enable message logging to the console
             */
            debug: true,

            /*
             Authorization is by user id and session key.
             Username/password can be used as well although not recommended.

             Specify user id or name/email/whatever. Can be either value or function.
             */
            uid: function() {
                return self.username;
            },

            /*
             Specify session key or password. Can be either value or function.
             Make sure to not transmit sensitive user information over a non-secure
             connection.
             */
            sid: function() {
                return self.password;
            }
        });

        this._bindCometEvents();
    },

    /**
     * Connect to the server and log into chat
     *
     * @param {String} user
     * @param {String} password
     */
    login: function(user, password) {
        this.username = user;
        this.password = password;

        // Connect to the server and authorize
        this.comet.acquire();
    },

    logout: function() {
        // Disconnect from the server
        this.comet.release();
    },

    /*
     Public methods
     */
    onUserJoined: function(data) {
        this.trigger('log', 'system', {
            text: templateHelpers.userLink(data.uid) + ' joined ' + templateHelpers.channelLink(data.channel)
        });

        if (data.uid == this.username) {
            this.currentChannel = data.channel;
        }
    },

    onUserLeft: function(data) {
        this.trigger('log', 'system', {
            text: templateHelpers.userLink(data.uid) + ' left ' + templateHelpers.channelLink(data.channel)
        });
    },

    onWhisper: function(data) {
        this.trigger('log', 'private', {
            isTo: data.from == this.username,
            from: data.from,
            to: data.to,
            text: data.message
        });
    },

    onMessage: function(data) {
        this.trigger('log', 'channel', {
            from: data.uid,
            text: data.message,
            channel: data.channel
        });
    },

    getChannelList: function() {
        return this.comet.qsend('chat:getChannelsList');
    },

    processCommand: function(data) {
        /*
        First we process commands that do not require connection
         */

        var result;

        // login
        if (result = /^\/login ([a-z0-9]{3,20}) ([a-z0-9]{3,20})$/ig.exec(data)) {
            return this.login(result[1], result[2]);
        // print help
        } else if (/^\/help/ig.exec(data)) {
            return this.printHelp();
        }

        if (!this.comet.connected) {
            return this._logError('You must log in first. Use the following command: /login {username} {password}');
        }

        /*
         And then the rest of commands
         */

        if (data[0] != '/') {
            return this.sendMessage(this.currentChannel, data);
        }

        // whisper
        if (result = /^\/w ([a-z0-9]+) (.+?)$/ig.exec(data)) {
            return this.whisper(result[1], result[2]);
        // send message to a channel
        } else if (result = /^\/s ([a-z0-9]+) (.+?)$/ig.exec(data)) {
            this.currentChannel = result[1];

            return this.sendMessage(this.currentChannel, result[2]);
        // join channel
        } else if (result = /^\/join ([a-z0-9]+)$/ig.exec(data)) {
            return this.joinChannel(result[1]);
        // leave channel
        } else if (result = /^\/leave ([a-z0-9]+)$/ig.exec(data)) {
            return this.leaveChannel(result[1]);
        // logout
        } else if (/^\/logout$/ig.exec(data)) {
            return this.logout();
        // channels list
        } else if (/^\/channels$/ig.exec(data)) {
            return this._printChannelsList();
        // unknown command
        } else {
            return this._logError('Unknown command. Use /help to view available commands');
        }
    },

    sendMessage: function(channel, message) {
        var self = this;

        this.comet.qsend('chat:message', {
                to: channel,
                message: message
            })
            .catch(function(e) {
                self._logError('Failed to send channel message: ' + e);
            })
            .done();
    },

    whisper: function(username, message) {
        var self = this;

        this.comet.qsend('chat:whisper', {
                to: username,
                message: message
            })
            .catch(function(e) {
                self._logError('Failed to send private message: ' + e);
            })
            .done();
    },

    joinChannel: function(channel) {
        var self = this;

        this.comet.qsend('chat:joinChannel', {
                channel: channel
            })
            .catch(function(e) {
                self._logError('Failed to join channel: ' + e);
            })
            .done();
    },

    leaveChannel: function(channel) {
        var self = this;

        this.comet.qsend('chat:leaveChannel', {
                channel: channel
            })
            .catch(function(e) {
                self._logError('Failed to leave channel: ' + e);
            })
            .done();
    },

    printHelp: function() {
        this.trigger('log', 'system', { text:
            'Available commands:' });
        this.trigger('log', 'system', { text:
            '/login {username} {password} - registration and login' });
        this.trigger('log', 'system', { text:
            '/logout - disconnects from the server' });
        this.trigger('log', 'system', { text:
            '/channels - print list of joined channels' });
        this.trigger('log', 'system', { text:
            '/join {channel} - join channel' });
        this.trigger('log', 'system', { text:
            '/leave {channel} - leave channel' });
        this.trigger('log', 'system', { text:
            '/s {channel} {message} - send message to a specific channel and make it default' });
        this.trigger('log', 'system', { text:
            '/w {username} {message} - send private message' });
    },

    /*
     Service methods
     */
    onAuthSuccess: function() {
        this.trigger('log', 'system', {
            text: 'Logged in as ' + this.username
        });

        this._printChannelsList();
    },

    onAuthError: function() {
        this._logError('Authorization error!');
    },

    onConnectionStart: function() {
        this.trigger('log', 'system', {
            text: 'Connected to the server'
        });
    },

    onConnectionEnd: function() {
        this.trigger('log', 'system', {
            text: 'Disconnected from the server'
        });
    },

    onConnectionLost: function() {
        this._logError('Lost connection to the server');
    },

    onConnectionReconnected: function() {
        this.trigger('log', 'system', {
            text: 'Reconnected to the server'
        });
    },

    /*
     Private methods
     */
    _printChannelsList: function() {
        var self = this;

        this.getChannelList()
            .then(function(list) {
                if (!list.length) {
                    return self.joinChannel(self.defaultChannel);
                }

                self.trigger('log', 'system', { text:
                    'Your channels:' });

                _.each(list, function(channel, i) {
                    if (!i) {
                        // make first channel current channel
                        self.currentChannel = channel;
                    }

                    self.trigger('log', 'system', { text:
                        templateHelpers.channelLink(channel) });
                });
            })
            .catch(function(e) {
                self._logError('Failed to fetch user channel list: ' + e);
            })
            .done();
    },

    _logError: function(e) {
        this.trigger('log', 'error', {
            text: e
        });
    },

    _bindCometEvents: function() {
        var self = this;

        // Bind comet events
        _.each(this.cometEvents, function(cb, event) {
            self.comet.on(event, self[cb].bind(self));
        });
    }
});

var Chat = Marionette.ItemView.extend({
    template: getTemplate('tpl-root'),

    events: {
        'keypress @ui.input': 'onInputKeypress',
        'click .channel-link': 'onChannelLinkClick',
        'click .user-link': 'onUserLinkClick'
    },

    ui: {
        log: '.log',
        input: '.chat-input'
    },

    _logTemplates: {
        'error'     : getTemplate('tpl-log-error'),
        'system'    : getTemplate('tpl-log-system'),
        'private'   : getTemplate('tpl-log-private'),
        'channel'   : getTemplate('tpl-log-channel')
    },

    _apiEvents: {
        'log': 'onLog'
    },

    _api: null,

    initialize: function (params) {
        this._api = new ChatAPI();

        this._bindApiEvents();
    },

    onShow: function() {
        this._printWelcome();
    },

    onLog: function(type, data) {
        this._addLogLine(type, data);
    },

    onInputKeypress: function(e) {
        var command = this.ui.input.val();

        if (!command.trim()) {
            return;
        }

        if (e.keyCode == 13) {
            this._api.processCommand(command);

            this.ui.input.val('');

            return false;
        }
    },

    onChannelLinkClick: function(e) {
        var channel = $(e.target).data('id');

        this._prepareCommand('/s ' + channel + ' ');

        return false;
    },

    onUserLinkClick: function(e) {
        var user = $(e.target).data('id');

        this._prepareCommand('/w ' + user + ' ');

        return false;
    },

    /*
    Private methods
     */
    _printWelcome: function() {
        this._addLogLine('system', { text:
            'Welcome to chat example!' });
        this._addLogLine('system', { text:
            'Please start by logging in.' });
        this._addLogLine('system', { text:
            'Type /help to print list of supported commands.' });
    },

    _prepareCommand: function(cmd) {
        this.ui.input
            .val(cmd)
            .focus();
    },

    _addLogLine: function(type, data) {
        var tpl = this._logTemplates[type];

        this.ui.log.append($(tpl(data)));
    },

    _bindApiEvents: function() {
        var self = this;

        _.each(this._apiEvents, function(cb, event) {
            self.listenTo(self._api, event, self[cb]);
        });
    }
});

$(document).ready(function() {
    var rootRegion = new Marionette.Region({
            el: $('.rgn-app')
        });

    var chat = window.chat = new Chat();

    rootRegion.show(chat);
});