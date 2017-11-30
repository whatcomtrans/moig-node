const oigServer = require("../index.js")
var options = require("./config.json")
var oigSessionClient = oigServer.sessionClient(options.session)
var oigCallControlClient = oigServer.callControlClient(options.callControl)
const oigACDPath = oigServer.oigACDPath


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
        
        /*oigCallControlClient.on("getEvent", function(eventData) {
            console.log(eventData)  // TODO: debug only
        })*/
        
        //return oigCallControlClient.getEvent({"timeout": 1})  // A really short timeout allows this process to continue but still sets up the ongoing getEvent cycle.  TODO: this could probably be done better
        return success
    })
    .then(function(ret) {
        //console.log("oigCallControlClient.getEvent: " + ret.success)
        return oigCallControlClient.getIcpId()
    })
    .then(function(ret) {
        console.log("oigCallControlClient.getIcpId: " + ret.success)
        console.log("startup: " + ret.success)
        return ret.success
    }, function(err) {
        console.log("startup error")
        console.log (err)
        return err
    })
}

function _shutdown() {
    console.log("Beginning shutdown")
    
    // Get one last event and then stop
    oigCallControlClient.getEventContinuously = false
    // Logout of session
    return oigSessionClient.logout()
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

function test2() {
    var objectId = null
    // startup
    return _startup()
    .then(function(ret) {
        // Get path
        return oigCallControlClient.advGetACD2PathId({"pathDn": "6109"})
    })
    .then(function(ret) {
        objectId = ret.result.objectId
        console.log(ret)
        return ret
    })
    .then(function(ret) {
        return oigCallControlClient.monitorObject({"objectId": objectId})
    })
    .then(function() {
        return oigCallControlClient.advGetEvent()
    })
    .then(function(ret) {
        //console.log(ret)
        return ret
    })
    .then(function(ret) {
        //return oigCallControlClient.redirectCall({"objectId": ret.result.eventData.callEvent.objectId, "redirectDn": "9710", "localCallId": ret.result.eventData.callEvent.localCallId})
        return ret
    })  // Done, now clean up, same for either success or error
    .then(function(ret){
        console.log("----------------------success: " + JSON.stringify(ret))
        return oigCallControlClient.stopMonitor({"objectId": objectId}).then(function() {return _shutdown})
    }, function(err){
        console.log("----------------------error: " + JSON.stringify(err))
        return oigCallControlClient.stopMonitor({"objectId": objectId}).then(function() {return _shutdown})
    })
}

function test3() {

    oigCallControlClient.on("advGetEvent", function(eventData) {
        console.log("----EVENT START-----")
        console.log(eventData)  // TODO: debug only
        console.log("----EVENT END-------")
        var callEvent = eventData.result.eventData.callEvent
        if (callEvent.type == "ACD2_PATH" && callEvent.cause == "ACD_CALL_QUEUED") {
            return oigCallControlClient.redirectCall({"objectId": callEvent.objectId, "redirectDn": "9710", "localCallId": callEvent.localCallId})
            .then(function(ret) {
                console.log(ret)
            })
        }
    })
    

    // startup
    return _startup()
    .then(function(ret) {
        // Get path
        return oigCallControlClient.advGetACD2PathId({"pathDn": "6109"})
    })
    .then(function(ret) {
        oigCallControlClient.objectId = ret.result.objectId
        console.log(ret)
        return ret
    })
    .then(function(ret) {
        return oigCallControlClient.monitorObject()
    })
    .then(function() {
        return oigCallControlClient.advGetEvent()
    })
    .then(function(ret){
        console.log("Awaiting events...")
        setTimeout(function() {
            console.log("SHUTDOWN TIMER EXECUTING...")
            _shutdownPlusMonitor()
        }, 1000 * 60 * 1)
    }, function(err){
        console.log("----------------------error: " + JSON.stringify(err))
        return _shutdownPlusMonitor()
    })
}

function _shutdownPlusMonitor () {
    return oigCallControlClient.stopMonitor()
    .then(function(ret) {
        return _shutdown
    })
    .then(function(ret) {
        process.exit()
        return true
    })
}


function test4() {
    // startup
    return _startup()
    .then(function(ret) {
        // Get path
        return oigCallControlClient.getPhoneNumberId({"primeDn": "9341"})
    })
    .catch(function(err) {
        console.log("error:------------------" + err)
    })
}

function test5() {
    return _startup()
    .then(function(ret) {
        // Get path
        return oigCallControlClient.getPhoneNumberId({"primeDn": "9341"})
    })
    .then(function(ret) {
        oigCallControlClient.objectId = ret.result.objectId
        return ret
    })
    .then(function(ret) {
        return oigCallControlClient.monitorObject()
    })
    .then(function() {
        // return oigCallControlClient.advGetEvent()
    })
    .then(function(ret){
        console.log("Awaiting events...")
        setTimeout(function() {
            console.log("SHUTDOWN TIMER EXECUTING...")
            _shutdownPlusMonitor()
        }, 1000 * 60 * 1)
    }, function(err){
        console.log("----------------------error: " + JSON.stringify(err))
        return _shutdownPlusMonitor()
    })
}

function test6() {
    var objectId = null
    // startup
    return _startup()
    .then(function(ret) {
        return oigCallControlClient.advGetACD2PathId({"pathDn": "6109"})
    })
    .then(function(ret) {
        return oigCallControlClient.advGetACD2PathDescription({"objectId": ret.result.objectId})
    })
    .then(function(ret) {
        console.log("PATH DESCRIPTION")
        console.log(ret)
    })
    .then(function() {
        return _shutdown()
    })
    .catch(function(err) {
        console.log("ERROR: " + err)
    })
}


/*
oigCallControlClient.on("advGetEvent", function(eventData) {
    console.log("----EVENT START-----")
    console.log(eventData)  // TODO: debug only
    console.log("----EVENT END-------")
    var callEvent = eventData.result.eventData.callEvent
    if (callEvent.type == "ACD2_PATH" && callEvent.cause == "ACD_CALL_QUEUED") {
        return oigCallControlClient.redirectCall({"objectId": callEvent.objectId, "redirectDn": "9710", "localCallId": callEvent.localCallId})
        .then(function(ret) {
            console.log(ret)
        })
    }
})*/

function captureRawEvents() {
    oigCallControlClient.on("rawResult", function(data) {
        // save the data to a file?
        // console.log(JSON.stringify(data))
    })

    oigCallControlClient.on("CALL_EVENT", function(data) {
        // save the data to a file?
        console.log(JSON.stringify(data))
    })

    return _startup()
    .then(function(ret) {
        return oigCallControlClient.advGetACD2PathId({"pathDn": "6109"})
    })
    .then(function(ret) {
        oigCallControlClient.objectId = ret.result.objectId
        return ret
    })
    .then(function(ret) {
        return oigCallControlClient.monitorObject({"objectId": ret.result.objectId})
    })
    /*
    .then(function(ret) {
        return oigCallControlClient.getEvent({"timeout": 1})
    })
    */
    .then(function (ret) {
        return oigCallControlClient.advGetEvent({"timeout": 1})
    })
    .then(function(ret){
        console.log("Awaiting events...")
        setTimeout(function() {
            console.log("SHUTDOWN TIMER EXECUTING...")
            _shutdownPlusMonitor()
        }, 1000 * 60 * 1)
    }, function(err){
        console.log("----------------------error: " + JSON.stringify(err))
        return _shutdownPlusMonitor()
    })
}

// captureRawEvents()

function monitorPath() {
    var path = null
    return _startup()
    .then(function(ret) {
        return oigCallControlClient.getEvent({"timeout": 1})
    })
    .then(function (ret) {
        return oigCallControlClient.advGetEvent({"timeout": 1})
    })
    .then(function(ret) {
        path = new oigACDPath({"pathDn": "6109", "callControlClient": oigCallControlClient})
        return path.connect()
    })
    .then(function(ret) {
        console.log(path.sharablePath)
    })
    .then(function(ret){
        console.log("Awaiting events...")
        path.on("changed", function(data){
            console.log("----------------------------------------------------")
            console.log("Something changed...")
            console.log(data)
            if (data.pendingCallsCount > 0) {
                var localCallId = data.pendingCalls[0].localCallId
                path.redirectCall({"localCallId": localCallId, "redirectDn": "9341"})
            }
        })
        setTimeout(function() {
            console.log(path.sharablePath)
            console.log("SHUTDOWN TIMER EXECUTING...")
            path.stopMonitor().then(function(ret) {
                return _shutdown()
            })
        }, 1000 * 60 * 2)
    }, function(err){
        console.log("----------------------error: " + JSON.stringify(err))
        path.stopMonitor().then(function (ret) {
            return _shutdown()
        })
    })
}

function getPathCalls() {
    oigCallControlClient.acd2GroupDn = "5999"
    return _startup()
    .then(function(ret) {
        return oigCallControlClient.getEvent({"timeout": 1})
    })
    .then(function(ret) {
        return oigCallControlClient.advGetEvent({"timeout": 1})
    })
    .then(function(ret) {
        return oigCallControlClient.advGetACD2GroupId()
    })
    .then(function(ret) {
        oigCallControlClient.objectId = ret.result.objectId
        return oigCallControlClient.monitorObject()
    })
    .then(function(ret) {
        return oigCallControlClient.advGetACDGroupStatus()
    })
    .then(function(ret) {
        console.log(JSON.stringify(ret))
    })
    .then(function(ret) {
        setTimeout(function() {
            console.log("SHUTDOWN TIMER EXECUTING...")
            return oigCallControlClient.stopMonitor()
            .then(function(ret) {
                return _shutdown()
            })
        }, 1000 * 60 * 1)
    }, function(err){
        console.log("----------------------error: " + JSON.stringify(err))
        return oigCallControlClient.stopMonitor()
        .then(function(ret) {
            return _shutdown()
        })
    })
}

getPathCalls()