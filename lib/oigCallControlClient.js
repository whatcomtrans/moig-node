"use string";
// Private

const EventEmitter = require('events')

// https://www.promisejs.org/
const Promise = require('promise');

// Setup SOAP client
// https://github.com/vpulim/node-soap
const soap = require('soap')

// Public

// TODO: I need to add emiters to all of the methods below

/** class representing an OIG Call Control client */
class oigCallControlClient extends EventEmitter {
    /**
     * @typedef Options
     * @type {object}
     * @param {number} [Options[].sessionId] - To re-use an existing sessionId
     * @param {string} [Options[].protocol=https] - HTTP or HTTPS
     * @param {string} [Options[].server] - Name or IP of OIG server
     * @param {string} [Options[].endpoint] - Full URL of endpoint.  If not provided, use protocol, server and servicePath to calculate endpoint.
     * @param {string} [Options[].servicePath=/axis2/services/SessionService/] - Path to the service, used with protocol and server to set endpoint if endpoint is not directly set
     * @param {string} [Options[].wsdl=./wsdl_oig/sessionManagement/SessionService.wsdl] - URL/path to the WSDL
     * @param {string} [Options[].version=4.0] - Version this client is using, MUST match WSDL and be equal or less then OIG server.
     */

    /**
     * Create a Mitel OIG session SOAP client
     * @param {Options} [options] - Options
     */
    constructor (options) {
        super()
        var _this = this

        // Defaults
        _this._defaults = {
            "_soap_client": null,
            "sessionId": null,
            "endpoint": null,       // Current OIG implementation returns an invalid endpoint in the returned WSDL, this is calculated later from protocol, server and servicePath
            "server": null,         // Required
            "protocol": "https",
            "servicePath": "/axis2/services/SessionService/",
            "wsdl": "./wsdl_oig/sessionManagement/SessionService.wsdl",
            "version": "4.0",
            "lastError": null
        }
        
        // Setup defaults and overide with passed options
        Object.assign(_this, _this._defaults, options)
    }

}
module.exports.callControlClient = function(options) {
    return new oigCallControlClient(options)
}