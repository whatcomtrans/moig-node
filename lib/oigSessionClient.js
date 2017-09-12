"use strict";
// Private

const EventEmitter = require('events')

// https://www.promisejs.org/
const Promise = require('promise');

// Setup crypto support
// https://nodejs.org/api/crypto.html#crypto_sign_sign_privatekey_outputformat
const crypto = require('crypto');

// Setup SOAP client
// https://github.com/vpulim/node-soap
const soap = require('soap')

// Public

// TODO: I need to add emiters to all of the methods below
// TODO: Add @return as Promise to the functions below

/** class representing an OIG session client */
class oigSessionClient extends EventEmitter {

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
     * @param {string} [Options[].localPassword] - Each application requires a local password defined in the Mitel OIG. The application must allow entry of the local password at run-time. The Mitel OIG administrator of a specific Mitel OIG creates a local password for each application. The application local password is unique to each Mitel OIG installation. Optional if previously set on the client.
     * @param {string} [Options[].companyName] - The company name is known to the developer at application creation. companyName is NOT provided to the application at run-time; it is hard coded. companyName is provided to Mitel as part of Application Registration. Optional if previously set on the client.
     * @param {string} [Options[].applicationName] - The application name is known to the developer at application creation. applicationName is NOT provided to the application at run-time; it is hard coded. applicationName is provided to Mitel as part of Application Registration. Optional if previously set on the client.
     * @param {string} [Options[].applicationPassword] - The application password is known to the developer at application creation. applicationPassword is NOT provided to the application at run-time; it is hard coded. applicationPassword is provided to Mitel as part of Application Registration. Optional if previously set on the client.
     * @param {string} [Options[].version=4.0] - The Version attribute must be set to match the version of the Mitel OIG server being used (eg, 2.1). If the application does not set this value, the Mitel OIG assumes the application is using a WSDL version matching its software version. For example, Mitel OIG 2.1 uses WSDL 2.1. The version attribute is used to identify the version of WSDL that the application is using.
     * @param {string} [Options[].certificate] - Each application that requires advanced services from an Mitel OIG requires a Mitel certificate. Application developers request a Mitel certificate using the Mitel OnLine MSA web portal. The same certificate is used in all instances of an application.
     * @param {boolean} [Options[].autoAuthenticate=true] - Advanced applications need to authenticate after they login.  If true AND the privateKey is set, loginEx will automatically attempt authenticate prior to callback
     * @param {string} [Options[].privateKey] - The private key to sign authenticate method.  Only used in advanced applications if signing loginEx result within module
     * @param {boolean} [Options[].autoKeepAlive=true] - After loginEx or authenticate (Advanced applications), should a timer be set to call resetSessionTimer every sessionTimer seconds
     * @param {number} [Options[].sessionTimer=5] - In Seconds.  The application must call resetSessionTimer with a frequency less than every 10 seconds.  Used with autoKeepAlive.
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
            "autoAuthenticate": true,
            "privateKey": null,
            "signedAuthenticationData": null,
            "authenticationData": null,
            "autoKeepAlive": true,
            "sessionTimer": 5,  // In seconds
            "_keepAliveSet": null,  // set to Timeout after setInterval for autoKeepAlive
            "serviceVersionsResults": null,
            "lastError": null
        }
        
        // Setup defaults and overide with passed options
        Object.assign(_this, _this._defaults, options)
    }

    /**
     * Get whether keepAlive timer has been set
     * @return {boolean}
     */
    get keepAlive() {
        var _this = this;
        if (_this._keepAliveSet != null) {
            return true
        } else {
            return false
        }
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
            callback(null, true)
            //TODO: emit something here
            return true
        }, function(err) {
            _this.lastError = err
            callback(err, false)
            //TODO: emit something here
            return false
        })
    }

    /**
     * @callback loginExCallback
     * @param {Error} err - Error object, null if sucess is true
     * @param {boolean} success - boolean indicating success or failure
     * @param {number} [sessionId] - If success, the resulting sessionId.  Also set on client.
     * @param {string} [applicationData] - If success and ADVANCED login, returns the applicationData to sign.  Also set on client.  aka authenticationData
     */

    /**
     * Performs a login, establishing a sessionId
     * @param {Options} [options] - Takes the same options as the constructor
     * @param {loginExCallback} [callback] - If no callback, function returns a promise with success as value
     */

    loginEx (options, callback) {
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
        
        if (_this._soap_client == null) {  // Need to call connect first
            return _this.connect().then(function() {
                return _this.loginEx(options, callback)
            }, function(err) {
                _this.lastError = err
                callback(err)
                return 
            })
        } else {  // Already have a soap client, attempt to login

            var params = {
                "req": {
                    "ns1:applicationName": _this.applicationName,
                    "ns1:companyName": _this.companyName,
                    "ns1:applicationPassword": _this.applicationPassword,
                    "ns1:localPassword": _this.localPassword,
                    "ns1:version": _this.version,
                }
            }

            if (_this.certificate != null) {
                // Advanced login
                params.req["ns1:certificate"] = _this.certificate
            }

            return _this._soap_client.loginExAsync(params).then(function(result) {
                // Note, keep this as a string
                _this.sessionId = result.return.attributes.sessionId
                return result
            }).then(function(result){
                if (_this.autoKeepAlive && (_this._keepAliveSet === null)) {
                    setInterval(_this.resetSessionTimer, _this.sessionTimer * 1000, _this)
                    _this._keepAliveSet = true
                }
                return result
            }).then(function(result) {
                if (_this.certificate != null) {
                    _this.authenticationData = result.return.authenticationData
                    _this.signedAuthenticationData = _this._signAuthenticationData(_this.authenticationData, _this.privateKey)
                    if (_this.autoAuthenticate) {   // Now attempt to authenticate the login
                        // TODO: emit something here
                        return _this.authenticate(callback)
                    } else {
                        // TODO: emit something here
                        callback(null, true, _this.sessionId, _this.authenticationData)
                        return true
                    }
                } else {
                    // TODO: emit something here
                    callback(null, true, _this.sessionId)
                    return true
                }
            }, function(err) {
                _this.lastError = err
                callback(err, false)
                // TODO: emit something here
                return false
            })
        }
    }

    /**
     * For ADVANCED applications, authenticate using private key
     * @param {Options} [options] - Takes the same options as the constructor
     * @param {loginExCallback} [callback] - If no callback, function returns a promise with success as value
     */

    authenticate(options, callback) {
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

        if (_this._soap_client == null || _this.sessionID === null) {
            return _this.loginEx(callback).then(function(success){
                if (success == true) {
                    return _this.authenticate(callback)
                }
            })
        } else {  // Already have a soap client, attempt to authenticate
            var params = {
                "req": {
                    "attributes": {
                        "sessionId": _this.sessionId
                    },
                    "ns1:signedAuthenticationData": _this.signedAuthenticationData
                }
            }

            return _this._soap_client.authenticateAsync(params).then(function(result) {
                if (result.return.attributes.result == "false") {
                    // Error
                    callback((new Error(result.return.errorDescription)), false)
                    // TODO: emit something here
                    return false
                } else {
                    // Success
                    // Note, keep this as a string
                    _this.sessionId = result.return.attributes.sessionId
                    // Set KeepAlive if not already set
                    if (_this.autoKeepAlive && (_this._keepAliveSet === null)) {
                        _this._keepAliveSet = setInterval(_this.resetSessionTimer, _this.sessionTimer * 1000, _this)
                    }
                    callback(null, true, _this.sessionId, null)
                    // TODO: emit something here
                    return true
                }
            }, function(err) {
                // Error
                _this.lastError = err
                callback(err, false)
                // TODO: emit something here
                return false
            })
        }
    }

    /**
     * Logs out of a session.  Note: If an application does not close all monitors before logging out, the Mitel OIG ensures that monitors are closed properly.
     * @param {number} [sessionId] - Defaults to this sessionId
     * @param {errorSuccessCallback} [callback] - If no callback, function returns a promise with success as value
     */

    logout(options, callback) {
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

        if (_this._soap_client == null || _this.sessionID === null) {
            // No need to logout
            return new Promise(function (resolve, reject) {
                resolve(true)
            })
        } else {  // Attempt to logout
            var params = {
                "sessionId": _this.sessionId
            }

            return _this._soap_client.logoutAsync(params).then(function(result){
                _this.sessionId = null
                if (_this._keepAliveSet != null) {
                    clearInterval(_this._keepAliveSet)
                } 
                callback(null, true)
                // TODO: emit something here
                return true
            }, function(err){
                _this.lastError = err
                callback(err, false)
                // TODO: emit something here
                return false
            })
        }
    }

    /**
     * Resets the session timer.  The application must call resetSessionTimer with a frequency less than every 10 seconds.  If autoKeepAlive is true then this is called automatically via a timer every sessionTimer seconds.
     * @param {oigSessionClient} [client] - ONLY provide if calling with a timer so that I can get the client object, otherwise assumes calling instance.
     * @param {errorSuccessCallback} [callback] - If no callback, function returns a promise with success as value
     */

    resetSessionTimer(client, callback) {
        var _this = this

        if (client === undefined) {
            // No parameters provided
            callback = function(err, success) {}
        } else if (typeof client === 'function') {
            // Callback is first provided parameter
            callback = client
        } else {
            _this = client
            callback = (typeof callback === 'function') ? callback : function() {};
        }

        if (_this._soap_client == null || _this.sessionID === null) {
            // No timer set, no need to act
            return new Promise(function (resolve, reject) {
                callback(null, true)
                resolve(true)
            })
        } else {  // Already have a soap client, attempt to resetSessionTimer
            var params = {
                "sessionId": _this.sessionId
            }

            return _this._soap_client.resetSessionTimerAsync(params).then(function(result){
                // TODO: emit something here
                callback(null, true)
                return true
            }, function(err){
                _this.lastError = err
                callback(err, false)
                // TODO: emit something here
                return false
            })

        }
    }

    /**
     * @callback serviceVersionsCallback
     * @param {Error} err
     * @param {boolean} success
     * @param {string} [serviceVersionsResults] - if success true, the software versions for Mitel OIG and the connected MiVoice Business.
     */

    /**
     * This operation obtains the software version of the Mitel OIG and the version of any connected MiVoice Business.
     * @param {number} [sessionId] - Defaults to this sessionId
     * @param {serviceVersionsCallback} [callback] - If no callback, function returns a promise with success as value
     */

    serviceVersions(options, callback) {
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

        if (_this._soap_client == null || _this.sessionID === null) {
            return _this.loginEx(callback).then(function(success){
                if (success == true) {
                    return _this.serviceVersions(callback)
                }
            })
        } else {  // Already have a soap client, attempt to logout
            var params = {
                "sessionId": _this.sessionId
            }

            return _this._soap_client.serviceVersionsAsync(params).then(function(result){
                if (result.return.attributes.result) {
                    _this.serviceVersionsResults = result.return.serviceVersions
                    callback(null, true, _this.serviceVersionsResults)
                    // TODO: emit something here
                    return true
                } else {
                    _this.lastError = false
                    callback(null, false)
                    // TODO: emit something here
                    return false
                }
            }, function(err){
                _this.lastError = err
                callback(err, false)
                // TODO: emit something here
                return false
            })
        }
    }

    /**
     * Sign the authentication data, private function
     * @param {string} data
     * @param {string} privateKey - PEM key as a string
     * @return {string} - the MD5 signed data put into an array of INTs as a string 
     */
    _signAuthenticationData (data, privateKey) {
        const sign = crypto.createSign('MD5')

        sign.write(data);
        sign.end();

        var bufResult = sign.sign(privateKey)
        var strResult = "["
        var len = bufResult.length
        var cntr = 0
        var anInt = 0
        var aString = ""
        while (cntr < len) {
            anInt = bufResult.readInt8(cntr)
            aString = anInt.toString()
            strResult += aString
            cntr = cntr + 1
            if (cntr < len) {
            strResult += ","
            }
        }
        strResult += "]"

        return strResult
        // Need to get the buffer instead of hex, convert to signed integers then convert again to a comma seperated list of signed values
    }

}
module.exports.sessionClient = function(options) {
    return new oigSessionClient(options)
}
