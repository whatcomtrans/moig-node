"use strict";
const oigServer = {}
oigServer.sessionClient = require("./lib/oigSessionClient").sessionClient
oigServer.callControlClient = require("./lib/oigCallControlClient").callControlClient
oigServer.oigACDPath = require("./lib/oigACDPath")

module.exports = oigServer