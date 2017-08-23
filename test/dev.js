const oigServer = require("../index.js")
var options = require("./config.json")
var oigSessionClient = oigServer.sessionClient(options.session)
var oigCallControlClient = oigServer.callControlClient(options.callControl)


oigSessionClient.loginEx().then(function(success){
    return oigCallControlClient.connect({"sessionId": oigSessionClient.sessionId})
}).then(function(sucess){
    console.log(sucess)
    return sucess
}).then(function(){
    return oigCallControlClient.getEvent()
})


/*
oigSessionClient.on("TEST", function(poj) {
    console.log("TEST: " + poj.success)
})
*/

/*
var promise = new Promise(function(resolve){
    oigSessionClient.on("TEST", function(poj) { // Event name
        if (poj.success) {  // WHERE clause
            resolve(true)
        }
    })
})

promise.then(function(success) {
    console.log("TEST: " + success)
})

oigSessionClient.emit("TEST", {"success": false})

setTimeout(function() {
    console.log("About to emit")
    oigSessionClient.emit("TEST", {"success": true})
}, 1000)

*/


    /**
     * The idea here is to start a process that calls getEvent, emits and then requests again.
     * Lots of events will be coming in, will probably be best to use the event emitter model here.
     * However, I don't want request for next event to delay processing.
     * Maybe a local queue of some sort.
     */

/*
oigSessionClient.loginEx().then(function(success) {
    console.log("Logged in: " + success)
}).then(function(){
    // Setup getEvent synchronouse handler
})
*/

/*
oigSessionClient.loginEx().then(function(success) {
    //console.log(oigSessionClient.sessionId)
    console.log(success)
    return success
}).then(function(success){
    return oigSessionClient.serviceVersions()
})
*/

/*
var p = oigSessionClient.connect()
p.then(function(success){
    console.log(success)
    return success
}).then(function(sucess) {
    return oigSessionClient.loginEx()
}).then(function(success) {
    console.log(oigSessionClient.sessionId)
    console.log(success)
    return success
})
*/

/*
oigSessionClient.connect({server: "junk"}, function(err, success) {
    console.log(success)
})
*/
/*function(err, success){
    console.log(success)
    oigSessionClient.loginEx(null, null, null, null, null, null, function(err, success, sessionId, authData){
        console.log(success)
        var signedAuthData = oigSessionClient.signAuthenticationData(authData, oigSessionClient.privateKey)
        oigSessionClient.authenticate(signedAuthData, null, function(err, success){
            console.log(oigSessionClient._soap_client.lastResponse)
        })
    })
})
*/