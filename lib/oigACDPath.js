"use strict";
// Private

const EventEmitter = require('events')

// https://www.promisejs.org/
const Promise = require('promise')

// https://github.com/JsCommunity/event-to-promise
var eventToPromise = require('event-to-promise')

// https://github.com/janl/mustache.js
const Mustache = require('mustache')

// Public

/** class representing an OIG Call Control client */
module.exports = class oigACDPath extends EventEmitter {
    /**
     * @typedef Options
     * @type {object}
     * @param {oigCallControlClient} [Options[].callControlClient] - oigCallControlClient to use, must already be connected, logged in and getIcpId completed.
     * @param {string} [Options[].pathDn] - The pathDn of the ACD path to monitor
     */

    /**
     * Create a wrapper around a Mitel ACD Path
     * @param {Options} [options] - Options     * 
     */
    constructor (options) {
        super()
        var _this = this

        // Defaults
        _this._defaults = {
            "callControlClient": null,
            "pathDn": null,
            "_calls": new Array(0),
            "_pendingCalls": new Array(0),
            "objectId": null,
            "_hasMonitor": null
        }
        
        // Setup defaults and overide with passed options
        Object.assign(_this, _this._defaults, options)
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

    /**
     * @callback successCallback
     * @param {Error} error - if success false, returns the error
     * @param {boolean} success
    **/

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
     * Connects to the ACD2Path by looking up objectId, starting a monitor, setting listeners and getting path details
     * 
     * @param {Options} options 
     * @param {successCallback} callback 
     * @returns 
     * 
     * @memberOf oigACDPath
     */
    connect (options, callback) {
        var _this = this
        var p = _this._parameters(options, callback)
        callback = p.callback
        options = p.params

        // Copy over any options to use
        Object.assign(_this, options)

        if (_this.pathDn != null && _this.callControlClient != null) {
            // TODO: not sure if this is the best event to listen for...
            _this.callControlClient.on("CALL_EVENT", function(eventData) {
                _this._processEventData(eventData)
            })

            // Determine objectId and start a monitor
            return _this.callControlClient.advGetACD2PathId({"pathDn": _this.pathDn})
            .then(function(ret) {
                // Store the objectId
                _this.objectId = ret.result.objectId

                // Start a monitor
                return _this.callControlClient.monitorObject({"objectId": _this.objectId})
            })
            .then(function(ret) {
                return _this.callControlClient.advGetACD2PathDescription({"objectId": _this.objectId})
            })
            .then(function(ret) {
                Object.assign(_this, ret.result)
                return ret
            })
            .then(function(ret) {
                // Store sucess
                _this._hasMonitor = true
                callback(null, true)
                return true
            }).catch(function(err) {
                callback(err, false)
                return false
            })
        } else {
            var err = new Error("callControlClient AND pathDn must be specificed in order to connect")
            callback(err, false)
            throw err
        }
    }

    /**
     * Stops monitor on this ACD Path.
     * 
     * @param {Object} [params] - Takes same parameters as oigCallControlClient.stopMonitor
     * @param {callControlCallBack} [callback]
     * @returns {Promise}
     * 
     * @memberOf oigACDPath
     */
    stopMonitor(params, callback) {
        var _this = this
        var p = _this._parameters(params, callback)
        params = Object.assign({}, _this, p.params)

        return _this.callControlClient.stopMonitor(params, p.callback)
    }

    _processEventData (eventData) {
        var _this = this
        console.log("Recieved event with data: " + JSON.stringify(eventData))
        var callEvent = eventData.result.eventData.callEvent
        if ((new String(callEvent.objectId).valueOf() == new String(_this.objectId).valueOf()) && callEvent.type == "ACD2_PATH") {
            // One of ours
            if (callEvent.cause == "ACD_REQUEST") {
                callEvent.pending = false
                callEvent.caller = callEvent.deviceNUMBER
            }

            if (callEvent.cause == "ACD_CALL_QUEUED") {
                callEvent.pending = true
            }

            if (callEvent.cause == "ACD_CALL_ABANDONED") {
                callEvent.pending = false
            }

            if (callEvent.cause == "ACD_CALL_DELIVERED") {
                callEvent.pending = false
            }

            if (callEvent.cause == "ACD_CALL_REDIRECTED") {
                callEvent.pending = false
            }
            _this.updateCall(callEvent)
        }
    }

    /**
     * Redirects a localCallId from this path to a redirectDn.  Wrapper for oigCallControlClient.redirectCall.
     * 
     * @param {Object} params - Parameters to combine with this properties.
     * @param {string} params.localCallId - The localCallId of the call to redirect.
     * @param {string} params.redirectDn - The DN (extension, number, etc) to redirect the call to.
     * @param {callControlCallBack} [callback] - Optional callback
     * @returns {Promise} - Returns a promise with same result set as oigCallControlClient.redirectCall
     * 
     * @memberOf oigACDPath
     */
    redirectCall(params, callback) {
        var _this = this
        var p = _this._parameters(params, callback)
        params = Object.assign({}, _this, p.params)
        var localCallId = params.localCallId
        return _this.callControlClient.redirectCall(params, p.callback).then(function (ret) {
            return ret
        })
    }

    get pendingCalls() {
        var _this = this
        return _this._calls.filter(function (element) {
            return element.pending == true
        })
    }

    get pendingCallsCount() {
        var _this = this
        return _this.pendingCalls.length
    }

    /**
     * Returns the call object represented by the localCallId, returns undefined if not found
     * 
     * @param {String} localCallId 
     * 
     * @memberOf oigACDPath
     */
    getCall(localCallId) {
        var _this = this
        return _this._calls.find(function(element) {
            return element.localCallId == localCallId
        })
    }

    /**
     * Typically based on an event, removes a call from the array
     * 
     * @param {Object} callEvent 
     * @param {callControlCallBack} callback 
     * 
     * @memberOf oigACDPath
     */
    removeCall(callEvent, callback) {
        var _this = this
        var i = _this._calls.findIndex(function(element) {
            return element.localCallId == callEvent.localCallId
        })
        _this._calls.splice(i,1)
        _this._registerChange()
    }

    /**
     * Typically based on an event, adds or updates a calls properties
     * 
     * @param {any} callEvent 
     * @param {any} callback 
     * 
     * @memberOf oigACDPath
     */
    updateCall(callEvent, callback) {
        var _this = this
        var i = _this._calls.findIndex(function(element) {
            return element.localCallId == callEvent.localCallId
        })
        if (i == -1) {
            _this._calls.push(callEvent)
        } else {
            var c = {}
            Object.assign(c, _this._calls[i], callEvent)
            _this._calls[i] = c 
        }
        _this._registerChange()
    }

    _registerChange() {
        var _this = this
        _this.emit("changed", _this.sharablePath)
    }

    /**
     * Returns a promise that resolves once the "changed" event has fired.
     * 
     * @returns Promise - with a value of sharablePath
     */
    onChange() {
        var _this = this
        return eventToPromise(_this, "changed").then(function() {
            return _this.sharablePath
        })
    }

    /**
     * returns an object trimmed down for sharing and export
     * 
     * @readonly
     */
    get sharablePath() {
        var _this = this
        var stringObj = Mustache.render(`{
            "pathDn": "{{pathDn}}",
            "pathName": "{{& pathName}}",
            "pendingCallsCount": {{pendingCallsCount}}
        }`, _this)
        var obj = JSON.parse(stringObj)
        obj.pendingCalls = _this.pendingCalls
        return obj
    }
}
