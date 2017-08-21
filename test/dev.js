const oigServer = require("../index.js")
var options = require("./config.json")
var oigSessionClient = oigServer.sessionClient(options)

oigSessionClient.serviceVersions().then(function(success) {
    console.log("Success")
    console.log(oigSessionClient.serviceVersionsResults)
}, function(success){
    console.log("Failed")
    console.log(oigSessionClient.lastError)
}).then(function(success){
    setTimeout(function() {
        oigSessionClient.logout()
    }, 2000);
})


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