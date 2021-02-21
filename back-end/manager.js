const fs = require('fs')
const express = require('express')
const mongo = require('mongodb')
const app = express()
const cors = require('cors')

const http = require('http');
const https = require('https');
const privateKey  = fs.readFileSync('/etc/letsencrypt/live/academic-challenge.com/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/academic-challenge.com/cert.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/academic-challenge.com/chain.pem', 'utf8');
const credentials = {key: privateKey, cert: certificate, ca:ca};
const httpsServer = https.createServer(credentials, app);
const io = require('socket.io')(httpsServer,{
  cors: {
    origin: "https://academic-challenge.com",
    methods: ["GET", "POST"]
  }  
})

const MongoClient = mongo.MongoClient
const url= "mongodb://localhost:27017/"
//TODO: divide into different files
app.use(cors())
app.use((req, res, next) =>{
    res.setHeader('charset', 'utf-8')
    //all responses will be in JSON so we can use this header for all of them
    res.setHeader('Content-Type',"application/json")
    next();
});
io.on('connection',socket=>{
    let emptyGame = {referees:[],team1:[],team2:[],scorekeepers:[]}
    socket.on("user_connect",(data)=>{
        MongoClient.connect(url,(err,db)=>{
            if (err) throw err
            const dbo=db.db("gamedb")
            dbo.collection("sessions").findOne({id:data.sessionID},(err,result)=>{
                if (err) throw err
                if (result!=null) {
                    userData=result.userData
                    socket.join(userData.gameID)
                }
            })
        })
    })
    socket.on("admin_remove",(data)=>{
        checkAdminSession(data.sessionID).then((valid)=>{
            if (valid[0]){
                MongoClient.connect(url,(err,db)=>{
                    if (err) throw err
                    const dbo=db.db("gamedb")
                    dbo.collection("sessions").updateOne({id:data.sessionID},{$set:{"userData.playerType":"joining"}},(err,sessionResult)=>{
                        if (err) throw err
                        dbo.collection("activeGames").updateOne({id:data.gameID},{$pull:{referees:data.name}},(err,matchResult)=>{
                            if (err) throw err
                            updateGame(data.gameID)
                        })
                    })
                })
            }
        })   
    })
    socket.on("question_ask",(data)=>{
        checkAdminSession(data.sessionID).then((valid)=>{
            MongoClient.connect(url,(err,db)=>{
                if (err) throw err
                const dbo=db.db("gamedb")
                let updateQuery={$set:{asked:data.asked}}
                if (!data.asked) {
                    updateQuery.$set["answered"]=false
                    updateQuery.$set["whoAnswered"]=""
                }
                dbo.collection("activeGames").updateOne({id:valid[1]},updateQuery,(err,result)=>{
                    if (err) throw err
                    console.log(data)
                    db.close()
                    updateGame(valid[1])
                })
            })
            
        })
    })
    socket.on("question_answer",(data)=>{
        MongoClient.connect(url,(err,db)=>{
            if (err) throw err
            const dbo=db.db("gamedb")
            dbo.collection("sessions").findOne({id:data.sessionID},(err,result)=>{
                if (err) throw err
                let gameID=result.userData.gameID
                let username =result.userData.name
                dbo.collection("activeGames").updateOne({id:gameID},{$set:{answered:true,whoAnswered:username}},(err,match)=>{
                    if (err) throw err
                    db.close()
                    updateGame(gameID)
                })
            })
        })
    })
    socket.on("buzzer_reset",(data)=>{
        checkAdminSession(data.sessionID).then((valid)=>{
            MongoClient.connect(url,(err,db)=>{
                if (err) throw err
                const dbo=db.db("gamedb")
                dbo.collection("activeGames").update({id:valid[1]},{$set:{answered:false,whoAnswered:""}},(err,match)=>{
                    if (err) throw err
                    db.close()
                    updateGame(valid[1])
                })
            })
        })
    })
})
app.get('/',(req,res)=>{
    let data=JSON.parse(req.query.data)
    if(data.hasOwnProperty("reqType")){
        if (data.reqType=="joinGame"){
            let gameID=data.gameData.gameID
            MongoClient.connect(url,(err,db)=>{
                if (err) throw err
                const dbo=db.db("gamedb")
                dbo.collection("activeGames").findOne({id:gameID},(err,result)=>{
                    if (err) throw err
                    if (result==null) res.end(failure("Game ID Not Found"))
                    else {
                        let username=data.gameData.name
                        if (result.team1.totalRoster.includes(username)||result.team2.totalRoster.includes(username)||result.referees.includes(username)){
                            res.end(failure("Name Already in Use"))
                        }
                        else if (username =="nobody"||username=="kickedPlayer") res.end(failure("Name Forbidden"))
                        else res.end(success("Game Data Retrieved!",reformatGameData(result)))
                    }
                })
            })
        }
        else if (data.reqType=="sessionRetrieve"){
            let sessionID = data.sessionID
            MongoClient.connect(url,(err,db)=>{
                if (err) throw err
                const dbo=db.db("gamedb")
                dbo.collection("sessions").findOne({id:sessionID},(err,user)=>{
                    if (err) throw err
                    if (user==null) {
                        res.end(failure("Session ID Nonexistent"))}
                    else {
                        dbo.collection("activeGames").findOne({id:user.userData.gameID},(err,match)=>{
                            if (err) throw err
                            if (match==null||match==undefined||match=="") res.end(JSON.stringify(new Error("Nonexistent Game ID Associated with Session")))
                            else {
                                res.end(success("Session Data Retrieved!",{userData:user.userData,gameData:reformatGameData(match)}))
                            }
                        })
                        
                    }
                    db.close()
                })
            })
        }
    }
    else { res.end(JSON.stringify(new Error("No Request Type Given"))) }
    
})

app.post('/',(req,res)=>{
    let data='';
    req.on('data',chunk=>{data+=chunk})
    req.on('end',()=>{
        data=JSON.parse(data)
        if (data.hasOwnProperty("reqType")){
            if (data.reqType=="newGame"){
                let gameData = data.gameData;
                MongoClient.connect(url,(err,db)=>{
                    if (err) throw err
                    const dbo = db.db("gamedb")
                    IDGenerator("gamedb","activeGames","1234567890",4).then((matchID)=>{
                            let match = {referees:[gameData.admin],scorekeepers:[],team1:{name:gameData.team1,score:0,activeRoster:[],totalRoster:[],captain:""},team2:{name:gameData.team2,score:0,activeRoster:[],totalRoster:[],captain:""},asked:false,answered:false,whoAnswered:"",began:Date.now(),id:matchID}
                            dbo.collection("activeGames").insertOne(match,(err,result)=>{
                                if (err) throw err
                                console.log("New match "+matchID+" between '"+gameData.team1+"' and '"+gameData.team2+"' began.")  
                            res.end(success("New match successfully started!",reformatGameData(match)))
                            db.close()
                        })
                    })
                })
            }
            else if (data.reqType=="sessionAdd") {
                let userData = data.userData
                MongoClient.connect(url,(err,db)=>{
                    if (err) throw err
                    const dbo=db.db("gamedb")
                    IDGenerator("gamedb","sessions","1234567890qwertyuiopasdfghjklzxcvbnm",12).then((sessionID)=>{
                        let session = {id:sessionID,userData:userData}
                        dbo.collection("sessions").insertOne(session,(err,result)=>{
                            if (err) throw err
                            res.end(success("New session successfully added!",sessionID))
                            db.close()
                        })
                    })
                })
            }
            else if (data.reqType=="sessionEnd") {
                let userData = data.userData
                MongoClient.connect(url,(err,db)=>{
                    if (err) throw err
                    const dbo=db.db("gamedb")
                    dbo.collection("sessions").findOneAndDelete({id:userData.sessionID},(err,result)=>{
                        result=result.value
                        let gameID = result.userData.gameID
                        //if the user is still joining (hasn't been added to a game yet), then just stop here without editing games
                        if (userData.playerType=="joining") {
                            res.end(success("Session successfully removed!",sessionID))
                            db.close()
                        }
                        else {
                            if (result.userData.playerType=="admin"){
                                dbo.collection("activeGames").findOneAndUpdate({id:gameID},{$pull:{referees:result.userData.name}},(err,match)=>{
                                    if (err) throw err
                                    match=match.value
                                    
                                    //if this is the only ref and they leave, the game will end!
                                    updateGame(gameID)
                                    if (match.referees.length==1){endGame(match.id,"Referees left")}
                                    res.end(success("Session successfully removed!",userData.sessionID))
                                    db.close()
                                })
                            }
                            else if (result.userData.playerType=="playing"||result.userData.playerType=="scorekeeper"||result.userData.playerType=="active"){
                                dbo.collection("activeGames").updateOne({id:gameID},{$pull:{"team1.totalRoster":result.userData.name,"team2.totalRoster":result.userData.name,"team1.activeRoster":result.userData.name,"team2.activeRoster":result.userData.name,scorekeepers:result.userData.name}},(err,match)=>{
                                    if (err) throw err
                                    updateGame(gameID)
                                    res.end(success("Session successfully removed!",userData.sessionID))
                                    db.close()
                                })
                            }
                            
                        }
                        
                    })
                })
            }
            else if (data.reqType=="teamJoin") {
                let userData = data.userData
                MongoClient.connect(url,(err,db)=>{
                    if (err) throw err
                    const dbo=db.db("gamedb")
                    dbo.collection("sessions").findOne({id:userData.sessionID},(err,result)=>{
                        if (err) throw err
                        if (result!=null&&result.userData.playerType=="joining"){
                            let newUserData= result.userData
                            newUserData.playerType="playing"
                            newUserData.team=userData.team
                            dbo.collection("sessions").findOneAndUpdate({id:userData.sessionID},{$set:{userData:newUserData}},(err,session)=>{
                                if (err) throw err
                                let updateQuery = {}
                                updateQuery.$push={}
                                updateQuery.$push[userData.team+".totalRoster"]=session.value.userData.name
                                dbo.collection("activeGames").updateOne({id:session.value.userData.gameID},updateQuery,(err,match)=>{
                                    if (err) throw err
                                    updateGame(session.value.userData.gameID)
                                    db.close()
                                    res.end(success("Player successfully added to game!",{playerType:"playing"}))
                                    
                                })
                            })
                            
                        }
                    })
                })
            }
            else if (data.reqType=="adminCommand"){
                
                checkAdminSession(data.session).then((valid)=>{
                    if (valid[0]) {
                        let gameID= valid[1]
                        let username=data.commandQuery.name
                        MongoClient.connect(url,(err,db)=>{
                            if (err) throw err
                            const dbo = db.db("gamedb")
                            switch(data.commandQuery.command) {
                                case "toggleActive":
                                    dbo.collection("activeGames").findOne({id:gameID},(err,match)=>{
                                        if (err) throw err
                                        //first, check if active rosters are full (sorry for the big if statement, wanted to do this without client sending team)
                                        if ((!match.team1.activeRoster.includes(username)&&match.team1.totalRoster.includes(username)&&match.team1.activeRoster.length>=4)||(!match.team2.activeRoster.includes(username)&&match.team2.totalRoster.includes(username)&&match.team2.activeRoster.length>=4)) {
                                            res.end(failure("Active Roster is Full"))
                                            db.close()
                                        }
                                        else{
                                           let pushTarget=""
                                            let pullTarget=""
                                            // this series of if statements makes it so it will remove from active roster if the user is in or add if they're not
                                            
                                            if (!match.team1.activeRoster.includes(username)&&match.team1.totalRoster.includes(username)) pushTarget="team1.activeRoster"
                                            else if (!match.team2.activeRoster.includes(username)&&match.team2.totalRoster.includes(username)) pushTarget="team2.activeRoster"
                                            if (match.team1.activeRoster.includes(username)) pullTarget="team1.activeRoster"
                                            else if (match.team2.activeRoster.includes(username)) pullTarget="team2.activeRoster"
                                            let queryObj = {"$push":{},"$pull":{}}
                                            if (pushTarget!="") {
                                                queryObj.$push[pushTarget]=username
                                                delete queryObj.$pull
                                            }
                                            if (pullTarget!="") {
                                                queryObj.$pull[pullTarget]=username
                                                delete queryObj.$push
                                            }
                                            dbo.collection("activeGames").updateOne({id:gameID},queryObj,(err,result)=>{
                                                if (err) throw err
                                                updateGame(gameID)
                                                db.close()
                                                res.end(success("Player's active status successfully toggled!"))
                                            }) 
                                        }
                                    })
                                    break;
                                case "toggleAdmin":
                                    dbo.collection("activeGames").findOne({id:gameID},(err,match)=>{
                                        if (err) throw err
                                        if (!match.referees.includes(username)) {
                                            if(match.referees.length>=2) res.end(failure("Max Number of Referees Reached"))
                                            else {
                                                dbo.collection("sessions").updateOne({"userData.gameID":gameID,"userData.name":username},{$set:{"userData.playerType":"admin"}},(err,result)=>{
                                                    if (err) throw err
                                                    dbo.collection("activeGames").updateOne({id:gameID},{$pull:{"team1.totalRoster":username,"team2.totalRoster":username},$push:{referees:username}},(err,result)=>{
                                                        if (err) throw err
                                                        updateGame(gameID)
                                                        res.end(success("Player's admin status successfully toggled!"))
                                                        db.close()

                                                    })
                                                })
                                            }
                                        }
                                        else {
                                            io.to(gameID).emit('admin_remove',{name:username})
                                            res.end(success("Message successfully sent to other referee!"))
                                        }
                                    })
                                    break;
                                case "toggleScorekeeper":
                                    dbo.collection("activeGames").findOne({id:gameID},(err,match)=>{
                                        if (err) throw err
                                        
                                        if (!match.scorekeepers.includes(username)){
                                            dbo.collection("sessions").updateOne({"userData.gameID":gameID,"userData.name":username},{$set:{"userData.playerType":"scorekeeper"}},(err,result)=>{
                                                if (err) throw err
                                                dbo.collection("activeGames").updateOne({id:gameID},{$push:{scorekeepers:username}},(err,result)=>{
                                                    if (err) throw err
                                                    updateGame(gameID)
                                                    db.close()
                                                    res.end(success("Player successfully made scorekeeper!"))
                                                })
                                            })
                                        }
                                        else {
                                            dbo.collection("sessions").updateOne({"userData.gameID":gameID,"userData.name":username},{$set:{"userData.playerType":"playing"}},(err,result)=>{
                                                if (err) throw err
                                                dbo.collection("activeGames").updateOne({id:gameID},{$pull:{scorekeepers:username}},(err,result)=>{
                                                    if (err) throw err
                                                    updateGame(gameID)
                                                    
                                                    db.close()
                                                    res.end(success("Player successfully unmade scorekeeper!"))
                                                })
                                            })
                                        }
                                    })
                                    break;
                                case "kickPlayer":
                                    console.log("kick")
                                    dbo.collection("sessions").deleteOne({"userData.gameID":gameID,"userData.name":username},(err,result)=>{
                                        if (err) throw err
                                        dbo.collection("activeGames").updateOne({id:gameID},{$pull:{"team1.activeRoster":username,"team2.activeRoster":username,"team1.totalRoster":username,"team2.totalRoster":username,"scorekeepers":username}},(err,match)=>{
                                            if (err) throw err
                                            updateGame(gameID)
                                            io.to(gameID).emit('player_kick',{name:username})
                                            db.close()
                                            res.end(success("Player kicked!"))
                                        })
                                    })
                                    break;
                            }
                        })
                        
                            
                    }
                    else res.end(failure("Admin Session Invalid"))
                })
            }
            else if (data.reqType=="scoreChange") {
                MongoClient.connect(url,(err,db)=>{
                    if (err) throw err
                    const dbo=db.db("gamedb")
                    dbo.collection("sessions").findOne({id:data.userData.sessionID},(err,result)=>{
                        if (err) throw err
                        if (result.userData.playerType=="scorekeeper"){
                            let query = {$inc:{}}
                            query.$inc[data.team+".score"]=data.amount
                            dbo.collection("activeGames").updateOne({id:result.userData.gameID},query,(err,match)=>{
                                if (err) throw err
                                updateGame(result.userData.gameID)
                                db.close()
                                res.end(success("Score successfully changed!"))
                            })
                        }
                        else res.end(failure("Scorekeeper Session Invalid"))
                    })
                })
            }
        }
        else  res.end(JSON.stringify(new Error("No Request Type Given"))) 
    })
})
const endGame = (gameID,reason)=>{
    return new Promise((resolve,reject)=>{
        MongoClient.connect(url,(err,db)=>{
            if (err) throw err
            const dbo=db.db("gamedb")
            dbo.collection("activeGames").deleteOne({id:gameID},(err,matchResult)=>{
                if (err) throw err
                if (matchResult.result.ok==1) {
                    dbo.collection("sessions").deleteMany({"userData.gameID":gameID},(err,sessionResult)=>{
                        if (err) throw err
                        if (sessionResult.result.ok==1){
                            console.log("Game ID "+gameID+" has been ended.")
                            io.to(gameID).emit('game_end',reason)
                            
                            resolve(gameID)
                        }
                        else {
                            reject("Deletion unsuccessful.")
                        }
                        db.close()
                    })
                    
                }
                else {
                    reject("Deletion unsuccessful.")
                    db.close()
                }
            })
        })
    })
}
const updateGame = (gameID)=>{
    MongoClient.connect(url,(err,db)=>{
        if (err) throw err
        const dbo= db.db("gamedb")
        dbo.collection("activeGames").findOne({id:gameID},(err,result)=>{
            io.to(gameID).emit("game_update",reformatGameData(result))
        })
    })
    
}
//IDGenerator taken from previous social media project for DALI 21W application
const IDGenerator= async(mydb,collection,chars,size)=>{
    return new Promise(resolve =>{
        let ID=""
        for (let i = 0;i<size;i++){
            ID+=chars.charAt(Math.floor(Math.random()*chars.length))
        }
        //connects to db to check if ID already is assigned
        MongoClient.connect(url,(err,db)=>{
            if (err) throw err
            const dbo = db.db(mydb)
            dbo.collection(collection).findOne({"id":ID},(err,result)=>{
                if (err) throw err
                db.close()
                //if there are no users with current ID, this ID is good to return
                if (result==null) resolve(ID)
                //if there are users with this ID, call IDGenerator again to attempt to get a new ID
                else resolve(IDGenerator(db,collection))
            })
        })
    })
}
const checkAdminSession =(sessionID)=>{
    return new Promise((resolve,reject)=>{
        MongoClient.connect(url,(err,db)=>{
            if (err) throw err
            const dbo = db.db("gamedb")
            dbo.collection('sessions').findOne({id:sessionID},(err,result)=>{
                if (err) throw err
                db.close()
                if (result==null||result.userData.playerType!="admin") resolve(false)
                else resolve([true,result.userData.gameID])
            })
        })
    })
}
const success =(reason,data)=>{ return JSON.stringify({result:true,reason:reason,respData:data}) }
const failure =(reason)=>{return JSON.stringify({result:false,reason:reason})}
const reformatGameData = (match)=>{
    //reformats game data for front-end friendly form
    if (match !=null) {
        return {
                    team1:match.team1.name,
                    team2:match.team2.name,
                    score1:match.team1.score,
                    score2:match.team2.score,
                    activeRoster1:match.team1.activeRoster,
                    activeRoster2:match.team2.activeRoster,
                    totalRoster1:match.team1.totalRoster,
                    totalRoster2:match.team2.totalRoster,
                    referees:match.referees,
                    scorekeepers:match.scorekeepers,
                    captain1:match.team1.captain,
                    captain2:match.team2.captain, 
                    id:match.id,
                    asked:match.asked,
                    answered:match.answered,
                    whoAnswered:match.whoAnswered
                }
        }
    else return ""
}
const removeInactiveMatches = async() =>{
    //TODO: remove matches based on inactivity, not time elapsed
    MongoClient.connect(url,(err,db)=>{
        if (err) throw err
        const dbo = db.db("gamedb")
        let cutoff = Date.now()-18000000
        dbo.collection("activeGames").find({began:{$lt:cutoff}},(err,result)=>{
            if (err) throw err
            let matchEndPromises = []
            result.forEach((match)=>{
                matchEndPromises.push(endGame(match.id,"Inactive for too long."))
            })
            Promise.all(matchEndPromises).then((deletedIDs)=>{
                db.close()
            })
        })
    })
}

setInterval(async()=>{ await removeInactiveMatches() }, 3000000);
httpsServer.listen(3001, ()=>{
    console.log("manager.js listening on 3001")
});