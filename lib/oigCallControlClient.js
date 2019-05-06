"use strict";
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
            "getEventContinuously": true
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
            _this.emit("connect", {"success": true, "error": null})
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
     * Returns a promise that waits for a specific event
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

    _executeEvent(params, callback, methodName, returnTemplate) {
        var _this = this
        // Standard params & callback processing - added here because I use callback later
        var p = _this._parameters(params, callback)
        callback = p.callback
        params = p.params
        // empty callback to pass to _execute
        var cp = function() {}

        return _this._execute(params, cp, methodName, `{
            "sessionId": "{{sessionId}}",
            "timeout": "{{timeout}}"
        }`, returnTemplate)
        .then(function(ret) {
            // Cleanup object
            ret.timeout = false
            return ret
        }, function(err) {
            if (err.message == "Timeout no event message available.") {
                return Promise.resolve({"success": false, "error": err, "result": {}, "methodName": methodName, "timeout": true, "templateError": {}})
            } else {
                // TODO: debug only
                // console.log(err)
                return err
            }
        })
        .then(function(ret) {
            // emit
            if (ret.timeout == false) {
                //Verify eventType exists before I access this
                if (ret && ret.result && ret.result.eventType) {
                    // emit
                    _this.emit(ret.result.eventType, ret)
                }
            }
            _this.emit(ret.methodName, ret)
            // callback
            callback(null, ret)
            if (_this.getEventContinuously) {
                if (ret.methodName == "getEvent") {
                    _this.getEvent()
                } else if (ret.methodName == "advGetEvent") {
                    _this.advGetEvent()
                }
            }
            // Return result to promise
            return ret
        }, function(err) {
            callback(err)
            return err
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

        // Copy over any options to use, first from _this and then from params.  This way params can override client wide options
        var methodParams = {}
        Object.assign(methodParams, _this, p.params)

        // Setup SOAP params
        var soapParams = JSON.parse(Mustache.render(paramsTemplate, methodParams))

        // TODO: debug only
        // console.log(methodName + " params")
        // console.log(soapParams)

        // Call the soap method async, returning a promise
        return _this._soap_client[methodName + "Async"](soapParams).then(function(result){

            // TODO: debug only
            // console.log(methodName + " raw result")
            // console.log(result)
            //_this.emit("rawResult", result)

            var resultObj = {"success": false, "error": null, "result": {}, "methodName": methodName, "templateError": {}}
            if (result.return.attributes.result === "true") {
                resultObj.success = true
                resultObj.result = result.return
                if (resultTemplate != null) {
                    try {
                        resultObj.result = JSON.parse(Mustache.render(resultTemplate, result.return))
                    } catch (e) {
                        // Thow something
                        resultObj.templateError = e
                    }
                }
             } else {
                 resultObj.success = false
                 // TODO: THIS SHOULD NOW REJECT AND NOT RESOLVE
                 resultObj.error = new Error(result.return.errorDescription)
                 throw resultObj.error
             }
            _this.emit(methodName, resultObj)
            // callback
            p.callback(null, resultObj)
            // Return result to promise
            return resultObj
        }, function(err){
            p.callback(err, null)
            return (err)
        })            
    }

    _convertObject(object, template) {
        var stringObj = Mustache.render(template, object)
        var obj = null
        try {
            obj = JSON.parse(stringObj)
        } catch (e) {
            obj = e
        } finally {
            return obj
        }
    }

    /**
     * 
     * @param {Object} [params]
     * @param {String} [params.sessionId] - sessionId to use, defaults to this.sessionId
     * @param {Integer} [params.timeout] - timeout to use in milliseconds, defualts to this.timeout
     * @param {getEventCallback} callback 
     * @return {Promise}
     */
    getEvent(params, callback) {
        var _this = this
        return _this._executeEvent(params, callback, "getEvent", `{
            "result": {{attributes.result}}{{#errorDescription}}, 
            "errorDescription": {{errorDescription}}{{/errorDescription}}{{#eventType}},
            "eventType": "{{eventType}}"{{#standardEvent}}, 
            "eventData": {{standardEvent}}{/standardEvent}}
        }`)  // TODO: this template needs testing and further development
    }

    /**
     * 
     * @param {Object} [params]
     * @param {String} [params.sessionId] - sessionId to use, defaults to this.sessionId
     * @param {Integer} [params.timeout] - timeout to use in milliseconds, defualts to this.timeout
     * @param {getEventCallback} callback 
     * @return {Promise}
     */
    advGetEvent(params, callback) {
        var _this = this
        return _this._executeEvent(params, callback, "advGetEvent", `{
            "result": {{attributes.result}}{{#errorDescription}}, 
            "errorDescription": {{errorDescription}}{{/errorDescription}}{{#eventType}},
            "eventType": "{{eventType}}",
            "eventData": {
                {{#callEvent}}
                "callEvent": {
                    "objectId": "{{callEvent.attributes.objectId}}",
                    {{#callEvent.type}}"type": "{{callEvent.type}}", {{/callEvent.type}}
                    {{#callEvent.cause}}"cause": "{{callEvent.cause}}", {{/callEvent.cause}}
                    {{#callEvent.callState}}"callState": "{{callEvent.callState}}",{{/callEvent.callState}}
                    {{#callEvent.callEventAttribute}}
                    "{{attributeName}}": "{{attributeValue}}",{{/callEvent.callEventAttribute}}
                    {{#featuresAllowed}}"featuresAllowed": "{{featuresAllowed}}",{{/featuresAllowed}}
                    "callEventTime": "{{callEvent.attributes.callEventTime}}",
                    {{#device}}"deviceName": "{{deviceName}}",
                    {{#deviceAttribute}}"device{{attributeName}}": "{{attributeValue}}",
                    {{/deviceAttribute}}
                    {{/device}}
                    "localCallId": "{{callEvent.attributes.localCallId}}"
                }{{/callEvent}}
            }{{/eventType}}
        }`) // TODO: this template needs testing and further development
    }


    /**
     * Common callback
     * @callback callControlCallBack
     * @param {Error} [err] - If error, this will contain the error object
     * @param {Object} result - A result object
     * TODO: document result properties
     * 
     * @memberOf oigCallControlClient
     */

    /**
     * Returns the IcpId
     * 
     * @param {Object} [params] - Optional parameters to pass
     * @param {sting} [params.sessionId] - sessionId
     * @param {callControlCallBack} [callback] 
     * @returns {Promise}
     * 
     * @memberOf oigCallControlClient
     */
    getIcpId(params, callback) {
        var _this = this

        // Standard params & callback processing, only needed here because us the callback below
        var p = _this._parameters(params, callback)
        callback = p.callback
        params = p.params

        // Custom callback to set these values
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

    /**
     * Returns the objectId for a given primeDn
     * 
     * @param {Object} [params] - Optional parameters to pass
     * @param {sting} [params.sessionId] - sessionId, defaults to the clients current sessionId
     * @param {sting} [params.icpId] - icpId, defaults to the clients current icpId
     * @param {sting} params.primeDn - primeDn
     * @param {callControlCallBack} [callback] 
     * @returns {Promise}
     * 
     * @memberOf oigCallControlClient
     */
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
            "objectId": "{{attributes.objectId}}"
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

    advSetACDAgentMakeBusy(params, callback) {
        var _this = this
        return _this._execute(params, callback, "advSetACDAgentMakeBusy", `{
            "sessionId": "{{sessionId}}",
            "objectId": "{{objectId}}",
            "busyState": "{{busyState}}"
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

    redirectCall(params, callback) {
        var _this = this
        return _this._execute(params, callback, "redirectCall", `{
            "sessionId": "{{sessionId}}",
            "objectId": "{{objectId}}",
            "localCallId": "{{localCallId}}",
            "redirectDn": "{{redirectDn}}"
        }`,`{}`)
    }

    advGetACD2PathId(params, callback) {
        var _this = this
        return _this._execute(params, callback, "advGetACD2PathId", `{
            "sessionId": "{{sessionId}}",
            "icpId": "{{icpId}}",
            "pathDn": "{{pathDn}}"
        }`,`{
            "objectId": "{{attributes.objectId}}"
        }`)
    }

    advGetACD2PathDescription(params, callback) {
        var _this = this
        return _this._execute(params, callback, "advGetACD2PathDescription", `{
            "sessionId": "{{sessionId}}",
            "objectId": "{{objectId}}"
        }`,`{
            {{#pathName}}
            "numGroups": {{attributes.numGroups}},
            "interflowEnabled": {{attributes.interflowEnabled}},
            "isResilient": {{attributes.isResilient}},
            "primaryIcpId": "{{attributes.primaryIcpId}}",
            "secondaryIcpId": "{{attributes.secondaryIcpId}}",
            "pathName": "{{& pathName}}",
            "firstRad": "{{firstRad}}",
            "secondRad": "{{secondRad}}",
            "thirdRad": "{{thirdRad}}",
            "fourthRad": "{{fourthRad}}",
            "interflowDn": "{{interflowDn}}",
            "pathUnavailableDn": "{{pathUnavailableDn}}",
            "primaryIcpAddress": "{{primaryIcpAddress}}"{{#secondaryIcpAddress}},
            "secondaryIcpAddress": "{{secondaryIcpAddress}}"{{/secondaryIcpAddress}}
            {{/pathName}}
        }`)
    }

    advGetCallStatus(params, callback) {
        var _this = this
        return _this._execute(params, callback, "advGetCallStatus", `{
            "sessionId": "{{sessionId}}",
            "objectId": "{{objectId}}"
        }`, `{
            "result": {{attributes.result}}{{#errorDescription}}, 
            "errorDescription": {{errorDescription}}{{/errorDescription}}{{#eventType}},
            "eventType": "{{eventType}}",
            "eventData": {
                {{#callEvent}}
                "callEvent": {
                    "objectId": "{{callEvent.attributes.objectId}}",
                    {{#callEvent.type}}"type": "{{callEvent.type}}", {{/callEvent.type}}
                    {{#callEvent.cause}}"cause": "{{callEvent.cause}}", {{/callEvent.cause}}
                    {{#callEvent.callState}}"callState": "{{callEvent.callState}}",{{/callEvent.callState}}
                    {{#callEvent.callEventAttribute}}
                    "{{attributeName}}": "{{attributeValue}}",{{/callEvent.callEventAttribute}}
                    {{#featuresAllowed}}"featuresAllowed": "{{featuresAllowed}}",{{/featuresAllowed}}
                    "callEventTime": "{{callEvent.attributes.callEventTime}}",
                    {{#device}}"deviceName": "{{deviceName}}",
                    {{#deviceAttribute}}"device{{attributeName}}": "{{attributeValue}}",
                    {{/deviceAttribute}}
                    {{/device}}
                    "localCallId": "{{callEvent.attributes.localCallId}}"
                }{{/callEvent}}
            }{{/eventType}}
        }`)
    }

    advGetACD2GroupId(params, callback) {
        var _this = this
        return _this._execute(params, callback, "advGetACD2GroupId", `{
            "sessionId": "{{sessionId}}",
            "icpId": "{{icpId}}",
            "acd2GroupDn": "{{acd2GroupDn}}"
        }`,`{
            "objectId": "{{attributes.objectId}}"
        }`)
    }

    advGetACDGroupStatus(params, callback) {
        var _this = this
        return _this._execute(params, callback, "advGetACDGroupStatus", `{
            "sessionId": "{{sessionId}}",
            "objectId": "{{objectId}}"
        }`, `{
            "result": {{attributes.result}}{{#errorDescription}}, 
            "errorDescription": {{errorDescription}}{{/errorDescription}}{{#attributes.callsWaiting}},
            "callsWaiting": {{attributes.callsWaiting}}{{/attributes.callsWaiting}}{{#attributes.membersBusy}},
            "membersBusy": {{attributes.membersBusy}}{{/attributes.membersBusy}}{{#attributes.membersIdle}},
            "membersIdle": {{attributes.membersIdle}}{{/attributes.membersIdle}}{{#attributes.membersInDND}},
            "membersInDND": {{attributes.membersInDND}}{{/attributes.membersInDND}}{{#attributes.membersLoggedIn}},
            "membersLoggedIn": {{attributes.membersLoggedIn}}{{/attributes.membersLoggedIn}}{{#attributes.membersLoggedInPresent}},
            "membersLoggedInPresent": {{attributes.membersLoggedInPresent}}{{/attributes.membersLoggedInPresent}}{{#attributes.numOfMembers}},
            "numOfMembers": {{attributes.numOfMembers}}{{/attributes.numOfMembers}}
        }`)
    }

    // TODO: Need to format result, result - true or false
    advSetGroupPresence(params, callback) {
        var _this = this
        return _this._execute(params, callback, "advSetGroupPresence", `{
            "sessionId": "{{sessionId}}",
            "objectId": "{{objectId}}",
            "groupDn": "{{groupDn}}",
            "presenceValue": "{{presenceValue}}"{{#invokerDn}}, 
            "invokerDn": {{invokerDn}}{{/invokerDn}}
        }`, `{}`)
    }
}
module.exports.callControlClient = function(options) {
    return new oigCallControlClient(options)
}