'use strict';

const NewSockets = require('./lib/newsockets');

NewSockets.createNewSocketsStream = require('./lib/stream');
NewSockets.Server = require('./lib/newsockets-server');
NewSockets.Receiver = require('./lib/receiver');
NewSockets.Sender = require('./lib/sender');

module.exports = NewSockets;
