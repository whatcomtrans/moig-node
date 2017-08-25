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
    
    // Remove listener
    oigCallControlClient.removeListener("standardEvent", function(eventData) {
            console.log(eventData)  // TODO: debug only
    })

    // Get one last event and then stop
    return oigCallControlClient.getEvent({"timeout": 1, "getEventContinuously": false})
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

function makePhoneCall(phoneDn, phoneNumber) {
    var phoneObjectId = null
    _startup()
    .then(function(success){
        return oigCallControlClient.getPhoneNumberId({"primeDn": phoneDn})
    })
    .then(function(ret) {
        // Monitor a phone
        phoneObjectId = ret.result.objectId
        return oigCallControlClient.monitorObject({"objectId": ret.result.objectId})
    }, function(ret) {
        // Handle error setting monitor
        console.log ("Unable to monitor object: " + ret.error)
    })
    .then(function(ret) {
        // Make a phone call    
        return oigCallControlClient.makeCall({"objectId": phoneObjectId, "number": phoneNumber})
    })
    .then(function(ret){
        return oigCallControlClient.stopMonitor({"objectId": phoneObjectId})
    })
    .then(function(ret){
        return _shutdown()
    })
}

function joinACDGroup(agentDn, groupDn) {
    setACDAgentPresence(agentDn, groupDn, true)
}

function leaveACDGroup(agentDn, groupDn) {
    setACDAgentPresence(agentDn, groupDn, false)
}

function setACDAgentPresence(agentDn, groupDn, present) {
    var agentObjectId = null
    oigCallControlClient.advGetACDAgentId({"agentDn": agentDn})
    .then(function(ret) {
        // Monitor a phone
        agentObjectId = ret.result.objectId
        return oigCallControlClient.monitorObject({"objectId": ret.result.objectId})
    }, function(ret) {
        // Handle error setting monitor
        console.log ("Unable to monitor object: " + ret.error)
    })
    .then(function(ret) {
        // Make a phone call    
        return oigCallControlClient.advSetACDAgentPresence({"objectId": agentObjectId, "groupDn": groupDn, "presenceValue": present})
    })
    .then(function(ret){
        return oigCallControlClient.stopMonitor({"objectId": agentObjectId})
    })
}

function pluckCall(agentDn, groupDn) {
    var agentObjectId = null
    oigCallControlClient.advGetACDAgentId({"agentDn": agentDn})
    .then(function(ret) {
        // Monitor a phone
        agentObjectId = ret.result.objectId
        return oigCallControlClient.monitorObject({"objectId": ret.result.objectId})
    })
    .then(function(ret) {
        // Login if not already logged in
        //return oigCallControlClient.loginExtHotDeskUser({"objectId": agentObjectId, "Pin": "1111"})
        return ret
    })
    .then(function(ret) {
        // Join group
        return oigCallControlClient.advSetACDAgentPresence({"objectId": agentObjectId, "groupDn": groupDn, "presenceValue": true})
    })
    .then(function(ret) {
        // Wait until call picked up or time?
        // return ret
        return new Promise((resolve) => setTimeout(resolve,5000));
    })
    .then(function(ret) {
        return oigCallControlClient.advSetACDAgentPresence({"objectId": agentObjectId, "groupDn": groupDn, "presenceValue": false})
        // return true
    })
    .then(function(ret){
        return oigCallControlClient.stopMonitor({"objectId": agentObjectId})
    })
}

function test() {
    return _startup()
    .then(function(ret) {
        // Place test function here
        return pluckCall("2514", "6101")
    })
    .then(function(ret) {
        console.log(ret)
        return ret
        //return _shutdown()
    })
}
test()