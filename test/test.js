var should = require("should")

const oigServer = require("../index.js")

var oigSessionClient = null


// TODO: This testing needs work.  Written as a sequential set of tests but not sure it executes like one

describe('oigSessionClient', function(){
    before(function() {
        var options = require("./config.json")
        oigSessionClient = oigServer.sessionClient(options)
    })

    describe('#connect', function(done){
        it('connect should callback with success = true', function(done){
            oigSessionClient.connect({}, function(err, success){
                should.equal(success, true)
                done()
            })
        })
    })

    describe("#loginEx", function(done){
        it('loginEx should callback with success = true', function(done){
            oigSessionClient.loginEx({}, function(err, success){
                should.equal(success, true)
                done()
            })
        })
    })

    describe("#authenticate", function(done){
        it('authenticate should callback with success = true', function(done){
            oigSessionClient.authenticate({}, function(err, success){
                should.equal(success, true)
                done()
            })
        })
    })

    describe("#resetSessionTimer", function(done){
        it('resetSessionTimer should callback with success = true', function(done){
            oigSessionClient.resetSessionTimer({}, function(err, success){
                should.equal(success, true)
                done()
            })
        })
    })

    describe("#serviceVersions", function(done){
        it('serviceVersions should callback with success = true', function(done){
            oigSessionClient.serviceVersions({}, function(err, success){
                should.equal(success, true)
                done()
            })
        })
    })

    describe("#logout", function(done){
        it('logout should callback with success = true', function(done){
            oigSessionClient.logout({}, function(err, success){
                should.equal(success, true)
                done()
            })
        })
    })
})
