"use string";
// Private

const EventEmitter = require('events')

// https://www.promisejs.org/
const Promise = require('promise')

// Setup SOAP client
// https://github.com/vpulim/node-soap
const soap = require('soap')

// https://github.com/JsCommunity/event-to-promise
var eventToPromise = require('event-to-promise')

// https://github.com/janl/mustache.js
const Mustache = require('mustache')

// Public

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
     * @param {int} [Options[].timeout=45000] - getEvent timeout in miliseconds, default is 45 seconds
     * @param {boolean} [Options[].getEventContinuously=true] - should getEvent be called continuously? If true at connect, getEvent will be called as part of connect.
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
            "servicePath": "/axis2/services/StandardCCService/",
            "wsdl": "./wsdl_oig/standard/StandardCCService.wsdl",
            "version": "4.0",
            "lastError": null,
            "timeout": 45 * 1000,  // ten seconds
            "getEventContinuously": true,
            "_getEventContinuouslySet": false
        }
        
        // Setup defaults and overide with passed options
        Object.assign(_this, _this._defaults, options)

        _this.setMaxListeners(100)
    }

    /**
     * @callback errorSuccessCallback
     * @param {Error} err - Error object, null if sucess is true
     * @param {boolean} success - boolean indicating success or failure
     */

    /**
     * Configures a new soap client.
     * If not called prior to other functions it witll be called using default + constructor options.
     * It is provided here to allow for additional options and error handling.
     * @param {Options} [options] - Takes the same options as the constructor
     * @param {errorSuccessCallback} [callback] - If no callback, function returns a promise with success as value
     */
    connect (options, callback) {
        var _this = this
        if (options === undefined) {
            // No parameters provided
            options = {}
            callback = function(err, success) {}
        } else if (typeof options === 'function') {
            // Callback is first provided parameter
            callback = options
            options = {}
        } else {
            callback = (typeof callback === 'function') ? callback : function() {};
        }

        // Copy over any options to use
        Object.assign(_this, options)

        // Establish the endpoint to use
        if (_this.endpoint == null) {
            // Calculate using protocol, server, ServicePath
            if (_this.server == null) {
                throw (new Error("Either endpoint or server MUST be specified"))
            }
            _this.endpoint = _this.protocol + "://" + _this.server + _this.servicePath
        }

        // Ignore self signed certificate error
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

        /* Pass _this to the client options with includes endpoint at a minimum, other SOAP options
            can be passed to createClient, see https://github.com/vpulim/node-soap#options
        */
        return soap.createClientAsync(_this.wsdl, _this).then(function(client) {
            _this._soap_client = client
             // if getEventContinuously, call getEvent now
            
            _this.emit("connect", {"success": true, "error": null})

            if (_this.getEventContinuously) {
                _this.getEvent()
            }

            callback(null, true)
            return true
        }, function(err) {
            _this.lastError = err
            _this.emit("connect", {"success": false, "error": err})
            callback(err, false)
            return err
        })
    }

    /**
     * Returns a promise that waits for a specific event that matches an options whereFunction
     * @param {string} eventName 
     * @return {Promise}
     */
    onceEventPromise (eventName) {
        var _this = this
        return eventToPromise(_this, eventName)
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
        var p = _this._parameters(params, callback)
        callback = p.callback
        params = p.params

        // Copy over any options to use, first from _this and then from params.  This way params can override client wide options
        var methodParams = {}
        Object.assign(methodParams, _this)
        Object.assign(methodParams, params)


        // Set up event listeners
        var ef = function(eventData) {
            _this.getEvent()
        }
        if (methodParams.getEventContinuously && (methodParams._getEventContinuouslySet === false)) {
            _this.on("getEventTimeout", ef)
        
            _this.on("standardEvent", ef)
            _this._getEventContinuouslySet = true
        } else if (methodParams.getEventContinuously === false && methodParams._getEventContinuouslySet === true) {
           // Stop listening
           _this.removeListener("getEventTimeout", ef)
           _this.removeListener("standardEvent", ef)
        }

        // Setup SOAP params
        var soapParams = {
            "sessionId": methodParams.sessionId,
            "timeout": methodParams.timeout
        }

        // Call the soap method async, returning a promise
        return _this._soap_client.getEventAsync(soapParams).then(function(result){
            var resultObj = {"success": true, "error": null, "timeout": false}

            if (result.return.attributes.result == "false" && result.return.errorDescription == "Timeout no event message available.") {
                // Timed out with no events
                resultObj.eventName = "getEventTimeout"
                resultObj.timeout = true
                // Emit getEventTimeout event
                _this.emit(resultObj.eventName, resultObj)
            } else if (result.return.attributes.result == "false" && result.return.errorDescription) {
                resultObj.success = false
                resultObj.error = new Error(result.return.errorDescription)
                throw resultObj.error
            } else {
                // Has an event
                resultObj.eventName = "" // TODO: need a method to determine event name
                // TODO: Convert result to something useful
                resultObj.eventData = result.return //...
                // Emit standardEvent (only if there is an event)
                _this.emit("standardEvent", resultObj.eventData)
                // Emit specific event
                _this.emit(resultObj.eventName, resultObj.eventData)
            }

            // callback
            callback(null, resultObj)

            // Return result to promise
            return resultObj
        }, function(err){
            callback(err, null)
            return (err)
        })
    }

    // TODO: remove once done
    _getIcpId(params, callback) {
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
            callback = (typeof callback === 'function') ? callback : function() {};
        }

        // Copy over any options to use, first from _this and then from params.  This way params can override client wide options
        var methodParams = {}
        Object.assign(methodParams, _this)
        Object.assign(methodParams, params)

        // Setup SOAP params
        var soapParams = {
            "request": {
                "attributes": {
                    "sessionId": methodParams.sessionId
                },
                "ns3:icpIpAddress": methodParams.IcpIpAddress
            }
        }

        var strParams = Mustache.render('{"request": {"attributes": {"sessionId": "{{sessionId}}"}, "ns3:icpIpAddress": "{{IcpIpAddress}}"}}', methodParams)
        console.log(strParams)
        console.log(JSON.parse(strParams))
        soapParams = JSON.parse(strParams)

        // Call the soap method async, returning a promise
        return _this._soap_client.getIcpIdAsync(soapParams).then(function(result){
            var resultObj = {"success": false, "error": null, "result": {}}
            if (result.return.attributes.result === "true") {
                resultObj.success = true
                resultObj.result = result.return
                resultObj.result.icpId = result.return.attributes.icpId
                _this.IcpId = result.return.attributes.icpId
                _this.IcpConnectionState = result.return.IcpConnectionState
                _this.IcpVersion = result.return.icpVersion
            }
            _this.emit("getIcpId", resultObj)

            // callback
            callback(null, resultObj)

            // Return result to promise
            return resultObj
        }, function(err){
            callback(err, null)
            return (err)
        })
    }

    _parameters(params, callback) {
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
            callback = (typeof callback === 'function') ? callback : function() {};
        }
        return {"params": params, "callback": callback}
    }

    _execute(params, callback, methodName, paramsTemplate, resultTemplate) {
        var _this = this

        // Standard params & callback processing
        var p = _this._parameters(params, callback)
        callback = p.callback
        params = p.params

        // Copy over any options to use, first from _this and then from params.  This way params can override client wide options
        var methodParams = {}
        Object.assign(methodParams, _this)
        Object.assign(methodParams, params)

        // Setup SOAP params
        var soapParams = JSON.parse(Mustache.render(paramsTemplate, methodParams))

        // TODO: debug only
        console.log(methodName + " params")
        console.log(soapParams)

        // Call the soap method async, returning a promise
        return _this._soap_client[methodName + "Async"](soapParams).then(function(result){

            // TODO: debug only
            console.log(methodName + " result")
            console.log(result)

            var resultObj = {"success": false, "error": null, "result": {}, "methodName": methodName}
            if (result.return.attributes.result === "true") {
                resultObj.success = true
                var obj = result.return
                if (resultTemplate != null) {
                    var stringObj = Mustache.render(resultTemplate, result.return)
                    obj = JSON.parse(stringObj)
                }
                resultObj.result = obj
             } else {
                 resultObj.success = false
                 // TODO: THIS SHOULD NOW REJECT AND NOT RESOLVE
                 resultObj.error = new Error(result.return.errorDescription)
                 throw resultObj.error
             }
            _this.emit(methodName, resultObj)
            // callback
            callback(null, resultObj)
            // Return result to promise
            return resultObj
        }, function(err){
            callback(err, null)
            return (err)
        })            
    }

    getIcpId(params, callback) {
        var _this = this

        // Standard params & callback processing, only needed here because us the callback below
        var p = _this._parameters(params, callback)
        callback = p.callback
        params = p.params

        // Custom callback to set this values
        var cp = function(err, r) {
            _this.icpId = r.result.icpId
            _this.IcpConnectionState = r.result.connectionState
            _this.IcpVersion = r.result.icpVersion
            callback
        }

        return _this._execute(params, cp, "getIcpId", `{
            "request": {
                "attributes": {
                    "sessionId": "{{sessionId}}"
                },
                "ns3:icpIpAddress": "{{IcpIpAddress}}"
            }
        }`, `{
            "connectionState": "{{connectionState}}",
            "icpId": "{{attributes.icpId}}",
            "icpVersion": "{{icpVersion}}"
        }`)
    }

    getPhoneNumberId(params, callback) {
        var _this = this
        return _this._execute(params, callback, "getPhoneNumberId", `{
            "request": {
                "attributes": {
                    "sessionId": "{{sessionId}}",
                    "icpId": "{{icpId}}"
                },
                "ns3:primeDn": "{{primeDn}}"
            }
        }`, `{
            "objectId": {{attributes.objectId}}
        }`)
    }

    monitorObject(params, callback) {
        var _this = this
        return _this._execute(params, callback, "monitorObject", `{
            "sessionId": "{{sessionId}}",
            "objectId": "{{objectId}}"
        }`, `{}`)
    }

    stopMonitor(params, callback) {
        var _this = this
        return _this._execute(params, callback, "stopMonitor", `{
            "sessionId": "{{sessionId}}",
            "objectId": "{{objectId}}"
        }`, `{}`)
    }

    makeCall(params, callback) {
        var _this = this
        return _this._execute(params, callback, "makeCall", `{
            "sessionId": "{{sessionId}}",
            "objectId": "{{objectId}}",
            "number": "{{number}}"{{#accountCode}}, "accountCode": {{accountCode}}{{/accountCode}}
        }`, `{}`)
    }

    advSetACDAgentPresence(params, callback) {
        var _this = this
        return _this._execute(params, callback, "advSetACDAgentPresence", `{
            "sessionId": "{{sessionId}}",
            "objectId": "{{objectId}}",
            "groupDn": "{{groupDn}}",
            "presenceValue": "{{presenceValue}}"{{#invokerDn}}, "invokerDn": {{invokerDn}}{{/invokerDn}}
        }`, `{}`)
    }

    advGetACDAgentId(params, callback) {
        var _this = this
        return _this._execute(params, callback, "advGetACDAgentId", `{
            "sessionId": "{{sessionId}}",
            "icpId": "{{icpId}}",
            "agentDn": "{{agentDn}}"
        }`,`{
            "objectId": {{attributes.objectId}}
        }`)
    }

    loginExtHotDeskUser(params, callback) {
        var _this = this
        return _this._execute(params, callback, "loginExtHotDeskUser", `{
            "request": {
                "attributes": {
                    "sessionId": "{{sessionId}}",
                    "objectId": "{{objectId}}"
                },
                "ns3:pin": "{{Pin}}"
            }

        }`,`{}`)
    }

}
module.exports.callControlClient = function(options) {
    return new oigCallControlClient(options)
}