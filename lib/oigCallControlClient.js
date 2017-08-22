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
            "sessionClient": null,
            "sessionId": null,
            "endpoint": null,       // Current OIG implementation returns an invalid endpoint in the returned WSDL, this is calculated later from protocol, server and servicePath
            "server": null,         // Required
            "protocol": "https",
            "servicePath": "/axis2/services/SessionService/",
            "wsdl": "./wsdl_oig/sessionManagement/SessionService.wsdl",
            "version": "4.0",
            "lastError": null,
            "timeout": 2,
            "getEventContinuously": true,
            "_getEventContinuouslySet": false

        }
        
        // Setup defaults and overide with passed options
        Object.assign(_this, _this._defaults, options)

    }

    /**
     * Returns a promise that waits for a specific event that matches an options whereFunction
     * @param {string} eventName 
     * @param {function} [whereFunction] - Function that is passed the eventData and evaluates to true or false, optional.
     * @return {Promise}
     */
    onEventPromise (eventName, whereFunction) {
        var _this = this
        whereFunction = (typeof whereFunction === 'function') ? whereFunction : function() {return true};
        return new Promise(function(resolve){
            this.on(eventName, function(eventData) { // Event name
                if (whereFunction(eventData)) {
                    resolve(result)
                }
            })
        })
    }

    /**
     * @callback getEventCallback
     * @param {Error} error - if success false, returns the error
     * @param {boolean} success
     * @param {string} [eventName] - if success true, name of event
     * @param {standardEvent} [eventData] - if success true, returns the event data
     */

    /**
     * 
     * @param {*} params 
     * @param {getEventCallback} callback 
     * @return {Promise}
     */
    getEvent(params, callback) {
        var _this = this

        // Standard params & callback processing
        if (params === undefined) {
            // No parameters provided
            params = {}
            callback = function(err, result) {}
        } else if (typeof params === 'function') {
            // Callback is first provided parameter
            callback = params
            params = {}
        } else {
            // Both parameters exists, as is
        }

        // Copy over any options to use, first from _this and then from params.  This way params can override client wide options
        var methodParams = {}
        Object.assign(methodParams, _this)
        Object.assign(methodParams, params)


        // Set up event listener
        if (methodParams.getEventContinuously && (methodParams._getEventContinuouslySet === false)) {
            _this.on("standardEvent", function(eventData) {
                _this.getEvent()
            })
        }

        // Setup SOAP params
        // TODO: needs testing
        var soapParams = {
            "sessionId": methodParams.sessionId,
            "timeout": methodParams.timeout
        }

        // Call the soap method async, returning a promise
        return _this._soap_client.getEventAsync(soapParams).then(function(result){
            var resultObj = {"success": true, "error": null}
            resultObj.eventName = "" // TODO: need a method to determine event name

            // TODO: Convert result to something useful
            resultObj.eventData = result //...

            // Emit standardEvent
            _this.emit("standardEvent", resultObj.eventData)

            // Emit specific event
            _this.emit(resultObj.eventName, resultObj.eventData)

            // callback
            callback(null, resultObj)

            // Return result to promise
            return resultObj
        }, function(err){
            callback(err, null)
            return ({"_success": false, "_error": err})
        })
    }

}
module.exports.callControlClient = function(options) {
    return new oigCallControlClient(options)
}