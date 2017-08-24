const oigServer = require("../index.js")
var options = require("./config.json")
var oigSessionClient = oigServer.sessionClient(options.session)
var oigCallControlClient = oigServer.callControlClient(options.callControl)

function _startup() {
    console.log("Beginning startup")
    return oigSessionClient.connect()
    .then(function(success){
        console.log("oigSessionClient.connect: " + success)
        return oigSessionClient.loginEx()
    })
    .then(function(success){
        console.log("oigSessionClient.loginEx: " + success)
        console.log("sessionId: " + oigSessionClient.sessionId)
        return oigCallControlClient.connect({"sessionId": oigSessionClient.sessionId})
    })  
    .then(function(success){
        console.log("oigCallControlClient.connect: " + success)
        oigCallControlClient.on("standardEvent", function(eventData) {
            console.log(eventData)  // TODO: debug only
        })
        return oigCallControlClient.getEvent({"timeout": 1})  // A really short timeout allows this process to continue but still sets up the ongoing getEvent cycle.  TODO: this could probably be done better
    })
    .then(function(ret) {
        console.log("oigCallControlClient.getEvent: " + ret.success)
        return oigCallControlClient.getIcpId()
    })
    .then(function(ret) {
        console.log("oigCallControlClient.getIcpId: " + ret.success)
        console.log("startup: " + ret.success)
        return ret.success
    })
}

function _shutdown() {
    console.log("Beginning shutdown")
    // Get one last event and then stop
    return oigCallControlClient.getEvent({"getEventContinuously": false})
    // Logout of session
    .then(function(success) {
        console.log("oigCallControlClient.getEventContinuously to false: " + success)
        return oigSessionClient.logout()
    })
    // Shutdown complete
    .then(function(success) {
        console.log("shutdown: " + success)
        return success
    })
}

var phoneObjectId = null
_startup()
.then(function(success){
    return oigCallControlClient.getPhoneNumberId({"primeDn": 9341})
})
.then(function(ret) {
    // Monitor a phone
    phoneObjectId = ret.result.objectId
    return oigCallControlClient.monitorObject({"objectId": ret.result.objectId})
})
.then(function(ret) {
    // Make a phone call    
    return oigCallControlClient.makeCall({"objectId": phoneObjectId, "number": "813602240377"})
})
.then(function(ret){
    // stopMonitor
    return oigCallControlClient.stopMonitor({"objectId": phoneObjectId})
})
.then(function(success) {
    return _shutdown()
})
