"use string";
const oigServer = {}
oigServer.sessionClient = require("./lib/oigSessionClient").sessionClient
oigServer.callControlClient = require("./lib/oigCallControlClient").callControlClient

module.exports = oigServer