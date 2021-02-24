/* GOALS:
*  1. NO jQuery!
*  2. Explore new ways to solve old problems
*  3. Keep everything secure within React states (no accessing data from console!)
*/
//TODO: make sessions not fully cookie based, make them accessible through App state
let audio = new Audio('buzzer.mp3');
class App extends React.Component {
    constructor(props){
        super(props)
        let gameData=props.gameData
        let interfaceType= this.props.interface
        //if the user is in any active roster, make the interface the active variant
        if (gameData.activeRoster1.includes(gameData.currentUser)||gameData.activeRoster2.includes(gameData.currentUser)) interfaceType="active"
        this.state={
            activeRoster1:gameData.activeRoster1,
            activeRoster2:gameData.activeRoster2,
            totalRoster1:gameData.totalRoster1,
            totalRoster2:gameData.totalRoster2,
            referees:gameData.referees,
            scorekeepers:gameData.scorekeepers,
            team1:gameData.team1,
            team2:gameData.team2,
            score1:gameData.score1,
            score2:gameData.score2, 
            currentUser:gameData.currentUser,
            interfaceType:interfaceType,
            gameID:gameData.id,
            modal:{
                active:false,
                title:"",
                body:"",
                onPopdown:{}
            },
            asked:gameData.asked,
            answered:gameData.answered,
            whoAnswered:gameData.whoAnswered,
            socket:io.connect("https://academic-challenge.com:3001")
        }
        //initializes the socket connection if the player is actually in the game (not joining a team)
        if (this.state.interfaceType!="joining"){
            socketInitializer(this,this.state.socket)
        }
    }
    gameUpdate(gameData){
        //this function is called whenever the socket receives that the game has been updated. it updates the state and interface type accordingly
        let interfaceType;
        let username=this.state.currentUser
        if (gameData.activeRoster1.includes(username)||gameData.activeRoster2.includes(username)) interfaceType="active"
        else if (gameData.referees.includes(username)) interfaceType="admin"
        else if (gameData.scorekeepers.includes(username)) interfaceType="scorekeeper"
        else if (gameData.totalRoster1.includes(username)||gameData.totalRoster2.includes(username)) interfaceType="playing"
        else interfaceType="joining"
       this.setState({activeRoster1:gameData.activeRoster1,activeRoster2:gameData.activeRoster2,totalRoster1:gameData.totalRoster1,totalRoster2:gameData.totalRoster2,referees:gameData.referees,scorekeepers:gameData.scorekeepers,team1:gameData.team1,team2:gameData.team2,score1:gameData.score1,score2:gameData.score2,interfaceType:interfaceType,asked:gameData.asked,answered:gameData.answered,whoAnswered:gameData.whoAnswered}) 

    }
    popup(title,message,callback=()=>{}){
        //popup function, used by a lot of child components, makes the Modal visible and populates it with stuff
        if (title=="Kicked!") this.setState({currentUser:"kickedPlayer"})
        this.setState({modal:{active:true,title:title,body:message,onPopdown:callback}})
    }
    popdown(){
        //closes the popup and calls its callback (onPopdown)
        this.state.modal.onPopdown()
        this.setState({modal:{active:false,title:"",body:"",onPopdown:{}}})
    }
    exit(){
        //exits the game, checking if you're a referee first
        if (this.state.referees.length==1&&this.state.interfaceType=="admin") { 
            this.popup("Are you sure?",(
                <div>
                    <p>Since you're the only referee, if you leave, the game will end!</p>
                    <div id="leaveButton" className="game-button" onClick={()=>{this.popdown();start(true)}}>Leave</div>
                    <div id="stayButton" className="game-button" onClick={()=>{this.popdown()}}>Stay</div>
                </div>
            ),()=>{

            })
        }
        else { start(true) }
    }
    changeScore(num, team){
        // changeScore function, called by button in scorekeeper interface. sends the new score to the backend to update it for all
        // if statement prevents negative scores
        if (this.state["score"+team.charAt(team.length-1)]+num>=0){
            let reqData={
                reqType:"scoreChange",
                amount:num,
                team:team,
                userData:{
                    sessionID:getSession()
                }
            }
             axios.post("https://academic-challenge.com:3001",reqData).catch((err)=>{
                alert("Error: "+err)
            }); 
        }
    }
    askQuestion(){
        // called when ref asks a question
        this.state.socket.emit("question_ask",{sessionID:getSession(),asked:!this.state.asked})
    }
    buzzIn(){
        // called when active players buzz in
        this.state.socket.emit("question_answer",{sessionID:getSession()})
    }
    resetBuzzer() {
        // called when ref resets the buzzer after a player answers
        this.state.socket.emit("buzzer_reset",{sessionID:getSession()})
    }
    componentDidMount(){
        //this attaches event listeners to all p boxes to prevent default right click behavior
        let boxes = document.querySelectorAll(".pBox,.miniBox");
        for (let item of boxes) {
            item.addEventListener("contextmenu", (event) => {
                  event.preventDefault();
            });
        }
    }
    componentDidUpdate(prevProps,prevState){
        // when the game has been updated and then the state changes, this is called to notify players of change. i do this in componentDidUpdate instead of gameUpdate because of access to prevState
        if (prevState.interfaceType=="active"&&this.state.interfaceType=="playing") this.popup("Role Change","You have been made inactive.",()=>{})
        else if (prevState.interfaceType=="playing"&&this.state.interfaceType=="active") this.popup("Role Change","You have been made active.",()=>{})
        else if (prevState.interfaceType!=this.state.interfaceType&&this.state.interfaceType=="admin") this.popup("Role Change","You have been made an admin!",()=>{})
        else if (prevState.interfaceType=="inactive"&&this.state.interfaceType=="scorekeeper") this.popup("Role Change","You have been made a scorekeeper!",()=>{})
        else if (prevState.interfaceType=="scorekeeper"&&this.state.interfaceType=="inactive") this.popup("Role Change","You are no longer a scorekeeper.",()=>{})
        if (!prevState.answered&&this.state.answered) audio.play()
    }
    render(){
        let interfaceEle="";
        // this switch determines what kind of interface a user gets, depending on what kind of player they are.
        switch(this.state.interfaceType) {
            case "playing":
                //non active players have no interactable buttons
                interfaceEle = <div className="interfaceTitle">You are currently inactive. Wait for a referee to make you an active player.</div>
                break;
            case "active":
                // active buzzers can buzz in, but they cant click the button when someone there's no question or the question has been answered
                if (!this.state.asked||this.state.answered){
                    interfaceEle = <div id = "buzzIn" className= 'game-button' style={{cursor:"auto",backgroundColor:"#3A7876"}} > Buzz In</div>
                }
                else interfaceEle = <div id = "buzzIn" className= 'game-button' onClick={()=>{this.buzzIn()}} > Buzz In</div>
                break;
            case "joining":
                // when you have joined but havent picked a team. gives the option to pick a team
                interfaceEle = (
                    <div style={{width:"100%"}}>
                        <div className="interfaceTitle" >Join Team</div>
                        <div id="teamChoice">
                            <div className='game-button' onClick={()=>{chooseTeam("team1",this)
                            }}>{this.state.team1}</div>
                            <div className='game-button' onClick={()=>{chooseTeam("team2",this)
                            }}>{this.state.team2}</div>
                        </div>
                    </div>
                )
                break;
            case "admin":
                // when you're an admin/referee. has tons of options to edit players' states
                let rosterTeam1=[]
                let rosterTeam2=[]
                this.state.totalRoster1.forEach((player)=>{
                    if (!this.state.activeRoster1.includes(player)) rosterTeam1.push(<MiniPlayerBox name={player} app={this}/>) })
                this.state.totalRoster2.forEach((player)=>{
                    if (!this.state.activeRoster2.includes(player)) rosterTeam2.push(<MiniPlayerBox name={player} app={this}/>) })
                interfaceEle = (
                    <div style={{width:"616px",margin:"0 auto"}}>
                        <div id = "qControl" className= 'game-button' onClick={()=>{this.askQuestion()}} >{(this.state.asked)?"End Question":"Ask Question"}</div>
                        {(this.state.answered ) ? (<div  className= 'game-button' onClick={()=>{this.resetBuzzer()}} >Reset Buzzer</div>) : ""}
                        <div id = "playerContainer">
                            <div className="interfaceTitle">Inactive Players:</div>
                            <div className="rosterTitle">{this.state.team1}</div>
                            <div id = "team1-grid" class = "playerGrid">{(rosterTeam1.length==0) ? (<i>nobody</i>) : rosterTeam1}</div>
                            <div className="rosterTitle">{this.state.team2}</div>
                            <div id = "team2-grid" class = "playerGrid">{(rosterTeam2.length==0) ? (<i>nobody</i>) : rosterTeam2}</div>
                        </div>
                    </div>
                )
                break;
            case "scorekeeper":
                // when you're a scorekeeper, lets you increase/decrease score. interface here could be improved a bit to be more efficient, maybe using number inputs
                interfaceEle = (
                    <div id="scorekeeperRow">
                        <div onClick = {()=>{this.changeScore(-1,"team1")}}>Decrease score of {this.state.team1}</div>
                        <div onClick = {()=>{this.changeScore(1,"team1")}}>Increase score of {this.state.team1} </div>
                        <div onClick = {()=>{this.changeScore(-1,"team2")}}>Decrease score of {this.state.team2}</div>
                        <div onClick = {()=>{this.changeScore(1,"team2")}}>Increase score of {this.state.team2} </div>
                    </div>)
                break;
            default:
                interfaceEle= <div></div>
        }
        return ( 
            <div id="content" style={{width:"inherit"}}>
                < Modal active={this.state.modal.active} message={this.state.modal.body} heading={this.state.modal.title} parent={this} />
                <div id ="topRow">
                    <div id ="backButton" onClick={()=>{this.exit()}}><img src="arrow.png"></img></div>
                    <div id="topcenter">
                        <div id= "matchup"> 
                            <div style = {{textAlign:"right"}}>{this.state.team1}</div>
                            <div style = {{flex:"0",margin:"0 20px"}}>vs</div>
                            <div style = {{textAlign:"left"}}>{this.state.team2}</div>
                        </div>
                        <div id="gameID">Game ID: {this.state.gameID}</div>
                    </div>
                </div>
                <div id = "gameContainer" >
                    <div id ="pRows" style ={{}}>
                        < PlayerRow names = {this.state.activeRoster1} teamName={this.state.team1} score={this.state.score1} app={this}/>
                        < Divider height = {"220px"} teamNames={[this.state.team1,this.state.team2]}  scores={[this.state.score1,this.state.score2]}/>
                        < PlayerRow names = {this.state.activeRoster2} teamName={this.state.team2} score={this.state.score2} app={this}/>
                    </div>
                    < RefColumn names = {this.state.referees} app= {this}/>
                </div>
                <div id = "gameInterface">
                    {interfaceEle}
                </div>
            </div>
        )
    }
}
class Modal extends React.Component {
    // this is the popup component for some error messages and the like
    render(){
        return (
            <div style={{display:(this.props.active) ? "block" : "none"}} id="popupContainer">
                <div id="popup">
                    <div id="popupHead">
                        <div id="popupTitle">{this.props.heading}</div>
                        <img src="close.png" id="closeIcon" onClick={()=>{this.props.parent.popdown()}}></img>
                    </div>
                    <div id="popupContent">{this.props.message}</div>
                </div>
            </div>
        ) 
    }
}
class PlayerRow extends React.Component {
    // rows of player boxes, used to represent the two teams
    render(){
        return (
            <div className="pRow">
                <div className="mobile-scoreboard">
                    <div>{this.props.teamName}</div>
                    <div>{this.props.score}</div>
                </div>
                < PlayerBox name = {(this.props.names[0]!=undefined) ? this.props.names[0]:(<i>nobody</i>)} app={this.props.app}/>
                < PlayerBox name = {(this.props.names[1]!=undefined) ? this.props.names[1]:(<i>nobody</i>)} app={this.props.app}/>
                < PlayerBox name = {(this.props.names[2]!=undefined) ? this.props.names[2]:(<i>nobody</i>)} app={this.props.app}/>
                < PlayerBox name = {(this.props.names[3]!=undefined) ? this.props.names[3]:(<i>nobody</i>)} app={this.props.app}/>
            </div>

        )
    }
}
class RefColumn extends React.Component {
    // column of players, representing the judges/referees
    render(){
        return (
            <div className="rCol">
                < PlayerBox name= {(this.props.names[0]!=undefined) ? this.props.names[0]:(<i>nobody</i>)} status="admin" app={this.props.app}/>
                < PlayerBox name= {(this.props.names[1]!=undefined) ? this.props.names[1]:(<i>nobody</i>)} status="admin" app={this.props.app}/>
            </div>
        )
    }
}
//TODO combine PlayerBox and MiniPlayerBox into one component
class PlayerBox extends React.Component {
    // boxes to represent players and judges/referees
    constructor(props){
        super(props)

        this.state={status:(this.props.status!=undefined) ? this.props.status : "active",hover:false,menuActive:false} 
    } 
    render(){
        return (
            <div className="pBox" 
                style={{background:(this.props.app.state.whoAnswered==this.props.name) ? "red" : ""}} 
                // complicated boolean checks if the box contains someone (seeing if it has a string rather than an <i> nobody </i> element), if its the current user, and makes sure the user is an admin before allowing the user to edit it on mouseover
                onMouseEnter={()=>{if (typeof this.props.name=='string' && this.props.name!=this.props.app.state.currentUser && this.props.app.state.interfaceType=="admin") this.setState({hover:true})}} onMouseLeave={()=>{this.setState({hover:false,menuActive:false})}}>
                
                < PlayerMenu active={this.state.menuActive} playerType={this.state.status} name={this.props.name} app={this.props.app}/>
                <div class="editButton" style={{display:(this.state.hover) ? "block" : "none"}} onClick={()=>{this.setState({menuActive:true})}}><img src="edit.png"></img></div>
                <span>{(this.props.name==this.props.app.state.currentUser) ? this.props.name+" (You)" : this.props.name}</span>
            </div>
        )
    }
}
class MiniPlayerBox extends React.Component{
    // smaller player box, used by admin when players are inactive
    constructor(props){
        super(props)
        if (this.props.app.state.scorekeepers.includes(this.props.name)) this.props.status="scorekeeper"
        this.state={status:(this.props.status!=undefined) ? this.props.status : "inactive",hover:false,menuActive:false}
    }
    render(){
        return (
            <div className="miniBox" 
                onMouseEnter={()=>{if (this.props.app.state.interfaceType=="admin") this.setState({hover:true})}} 
                onMouseLeave={()=>{this.setState({hover:false,menuActive:false})}}>
                
                < PlayerMenu active={this.state.menuActive} playerType={this.state.status} name={this.props.name} app={this.props.app} box={this}/>
                <div class="editButton" style={{display:(this.state.hover) ? "block" : "none"}} onClick={()=>{this.setState({menuActive:true})}}><img src="edit.png"></img></div>
                <span>{this.props.name}</span> 
                <div style={{color:"#5C8C54",fontSize:"8px"}}>{(this.state.status=="scorekeeper") ? "Scorekeeper": ""}</div>
            </div>
        )
    }
}
class PlayerMenu extends React.Component {
    // admin menu that pops up when a ref/admin hovers over a player
    constructor(props){
        super(props)
    }
    kickPlayer(name){
        adminCommand({command:"kickPlayer",name:name},(result,reason)=>{
            if (!result) alert(reason)
        })
    }
    toggleAdmin(name){
        adminCommand({command:"toggleAdmin", name:name},(result,reason)=>{
            if (!result) alert(reason)
            this.props.app.popup("Admin Removal","The other referee must now agree to be removed.")
        })
    }
    toggleScorekeeper(name){
        adminCommand({command:"toggleScorekeeper",name:name},(result,reason)=>{
            if (!result) alert(reason)
            this.props.app.componentDidUpdate=(prevProps,prevState)=>{
                if (this.props.app.state.scorekeepers.includes(this.props.name)) this.props.box.setState({status:"scorekeeper"})
                else this.props.box.setState({status:"inactive"})
            }
        })
    }
    toggleActive(name){
        adminCommand({command:"toggleActive", name:name},(result,reason)=>{
            if (!result) alert(reason)
        })
    }
    toggleCaptain(){}
    render(){
        // this menuOptions array contains the variety of options for an admin to edit a user state. the following if statements add the options to the appropriate players
        let menuOptions=[(<PlayerMenuOption message="Kick from Match" callback={()=>{this.kickPlayer(this.props.name)}} />),]
        
        if (this.props.playerType=="scorekeeper") {
            menuOptions.unshift((<PlayerMenuOption message="Remove Scorekeeper" callback={()=>{this.toggleScorekeeper(this.props.name)}}/>))
        }
        else if (this.props.playerType=="inactive"&&this.props.playerType!="scorekeeper") {
            menuOptions.unshift((<PlayerMenuOption message="Make Scorekeeper" callback={()=>{this.toggleScorekeeper(this.props.name)}}/>))
        }
        
        if (this.props.playerType=="inactive"||this.props.playerType=="scorekeeper") {
            menuOptions.unshift((<PlayerMenuOption message="Make Active" callback={()=>{this.toggleActive(this.props.name)}}/>),
                                (<PlayerMenuOption message="Make Admin" callback={()=>{this.toggleAdmin(this.props.name)}}/>)
                                )}

        if (this.props.playerType=="active"||this.props.playerType=="captain") menuOptions.unshift((<PlayerMenuOption message="Make Inactive" callback={()=>{this.toggleActive(this.props.name)}} />))
        
        //TODO?: implement captain feature. may not be necessary 
        //if (this.props.playerType=="captain") menuOptions.unshift((<PlayerMenuOption message="Remove Captain" callback={this.toggleCaptain} />))
        //else if (this.props.playerType=="active"&&this.props.playerType!="captain") menuOptions.unshift((<PlayerMenuOption message="Make Captain" callback={this.toggleCaptain} />))

        if (this.props.playerType=="admin") menuOptions=[(<PlayerMenuOption message="Remove Admin" callback={()=>{this.toggleAdmin(this.props.name)}}/>)]

        return (
            <div id ="playerMenu" style={{display:(this.props.active) ? "block" : "none"}}>
                {menuOptions}
            </div>
        )
    }
}
class PlayerMenuOption extends React.Component {
    // Option Component for Player Menu to make adding options easier
    render(){
        return <div id="playerMenuOption" onClick={()=>{this.props.callback()}}> {this.props.message}</div>
    }
}

class Divider extends React.Component {
    // divider between two roster rows, contains scoreboard
    constructor(props) {
        super(props)
        this.state={team1:this.props.teamNames[0],team2:this.props.teamNames[1],score1:this.props.scores[0],score2:this.props.scores[1]}
    }
    render(){
        return (
            <div id="divider" style={{height:this.props.height}}>
                <div id = "team1" className="teamName" style={{top:"16px"}}>
                    <span>{this.props.teamNames[0]}</span>
                    <br></br>
                    <span>{this.props.scores[0]}</span>
                </div>
                <div id = "team2" className="teamName" style={{bottom:"16px"}}>
                    <span>{this.props.teamNames[1]}</span>
                    <br></br>
                    <span>{this.props.scores[1]}</span>
                </div>
            </div>
        )
    }
}

class Start extends React.Component {
    // initial Component/State, gives the two options of joining or creating games
    constructor(props){
        super(props)
        this.state={modal:{active:false,title:"",body:"",onPopdown:{}}}
    }
    popup(title,message,callback){
        //popup function, same as in < App />
        this.setState({modal:{active:true,title:title,body:message,onPopdown:callback}})
    }
    popdown(){
        //removing popup function, same as in < App />
        this.setState({modal:{active:false,title:"",body:"",onPopdown:{}}})
    }
    render(){
        return (  
            <div id="start">
                <div id = "startAbout" onClick={()=>{this.popup("About","This is a site I (Julian George) made to enable online academic trivia competitions. This site enables referees to more effectively track players when they buzz in, and it also allows for more reliable scorekeeping and role management. This site is designed to be used in conjunction with Zoom: referees will ask questions over Zoom, players will buzz in here and then answer verbally over Zoom. In our current pandemic age where everything has to be digital, this site intends to make academic challenge or quiz bowl as similar and fair as it is in real life.")}}><img src="question.png" /></div>
                < Modal active={this.state.modal.active} message={this.state.modal.body} heading={this.state.modal.title} parent={this} />
                <h1 style={{width:"100%",textAlign:"center",fontFamily:'Roboto Condensed',marginBottom:"32px",fontSize:"48px"}}>ACADEMIC CHALLENGE</h1>
                <div className='game-button' onClick={()=>{createGame()}}>Create Game</div>
                <div className='game-button' onClick={()=>{joinGame()}}>Join Game</div>
            </div>
        )
    }
}  
class CreateGame extends React.Component {
    // Component for creating a game, has the form
    constructor(props){
        super(props);
        this.state={loading:false}
    }
    load(){
        // this is called after the http request is sent with inputCheck to show loading gif, and it disappears since the CreateGame component is replaced
        this.setState({loading:true})
    }
    render(){
        return(   
            <div id="gameForm">
                <div id ="backButton" onClick={()=>{start(false)}}><img src="arrow.png"></img></div>
                <div>Your Name:</div>
                <div><input className= "form-input" id="name" type="text"></input></div>
                <div>Team 1:</div>
                <div><input className= "form-input" id="team1" type="text"></input></div>
                <div>Team 2:</div>
                <div><input className= "form-input" id="team2" type="text"></input></div>
                <div className= 'game-button' onClick={()=>{inputCheck(create,this)}}>Submit</div>
                {this.state.loading ? <img id="loading" src="loading.gif"></img> : ""}
            </div>  
        )
    }
}
class JoinGame extends React.Component {
    // Component for joining a game with form for doing so
    constructor(props){
        super(props);
        this.state={loading:false,modal:{active:false,title:"",body:"",onPopdown:{}}}
    }
    load(){
        this.setState({loading:true})
    }
    popup(title,message,callback){
        //popup function, same as in < App />
        this.setState({modal:{active:true,title:title,body:message,onPopdown:callback}})
    }
    popdown(){
        //removing popup function, same as in < App />
        this.state.modal.onPopdown()
        this.setState({modal:{active:false,title:"",body:"",onPopdown:{}}})
    }

    render(){
        return(   
            <div id="gameForm">
                < Modal active={this.state.modal.active} message={this.state.modal.body} heading={this.state.modal.title} parent={this} />
                <div id ="backButton" onClick={()=>{start(false)}}><img src="arrow.png"></img></div>
                <div>Your Name:</div>
                <div><input className= "form-input" id="name" type="text"></input></div>
                <div>Game Code:</div>
                <div><input className= "form-input" id="code" type="text" ></input></div>
                <div className= 'game-button' onClick={()=>{inputCheck(join,this)}}>Submit</div>
                {this.state.loading ? <img id="loading" src="loading.gif"></img> : ""}
            </div>  
        )
    }
}
let inputCheck=(callback,component)=>{
    // validates the inputs in the Join and Create forms. would want to add to this if this was put to production since it only checks for empty inputs
    let inputs=document.getElementsByClassName('form-input')
    let good=true;
    for (let i=0;i<inputs.length;i++){
       if (inputs[i].value.trim().length==0){ 
           good=false
        } 
    }
    if (good) {
        // if inputs are good, it tells the component that its loading, leading to the loading gif, and then called the callback (join() or start()) which communicates with backend
        component.load();
        callback(component)
    }
    else alert("One or more fields are blank!")
}
const start=(sessionStarted)=>{
    // renders the initial <Start /> component
    if (sessionStarted){
        // if there's already a session, that means the back, exit button has been called to leave the ga,e, so this sends a request to end the player's session
        let reqData={
            reqType:"sessionEnd",
            userData:{
                sessionID:getSession()
            }
        }
         axios.post("https://academic-challenge.com:3001",reqData).then((resp)=>{ endSession() }).catch((err)=>{
            alert("Error: "+err)
        }); 
    }
    ReactDOM.render(< Start />, domContainer)

}
const createGame = () =>{ ReactDOM.render(< CreateGame />, domContainer)}
const joinGame = ()=>{ ReactDOM.render(< JoinGame />, domContainer)}
const create = () =>{
    // takes the info from the < CreateGame /> form, packages it, and sends to the backend
    let adminName=document.getElementById("name").value
    let team1Name=document.getElementById("team1").value
    let team2Name=document.getElementById("team2").value
    let reqData= {
        reqType:"newGame",
        gameData:{
            admin:adminName,
            team1:team1Name,
            team2:team2Name
        }
    }
    axios.post("https://academic-challenge.com:3001",reqData).then((resp)=>{
        resp=resp.data
        if (resp.result) {
            // if the game was created successfully, load the data and begin it!
            let gameData=resp.respData
            gameData.currentUser=adminName
            
            beginGame("admin",gameData)
        }
    }).catch((err)=>{
        alert("Error: "+err)
    }); 
}
const join = (component) => {
    // takes info from < JoinGame /> form and packages it to send to server
    let playerName=document.getElementById("name").value
    let code=document.getElementById("code").value
    let reqData={
        reqType:"joinGame",
        gameData:{
            name:playerName,
            gameID:code
        }
    }
    axios.get("https://academic-challenge.com:3001",{
          params: {
            data:reqData
          }
        }).then((resp)=>{
        resp=resp.data
        if (!resp.result) {
            // if error, popup with error and stop loading (commonly when id is wrong)
            component.popup("Error",resp.reason,()=>{})
            component.setState({loading:false})
        }
        else {
            // if all good, load game data and begin!
            let gameData=resp.respData
            gameData.currentUser=playerName
            beginGame("joining",gameData)
        }
    }).catch((err)=>{
        alert("Error: "+err)
    }); 
}
const beginGame = (playerType,gameData)=>{
    // renders the main <App /> game interface
    if (playerType!=""&&getSession()==""){
        // if there's not already a session (meaning the user is joining/creating game rather than refreshing w/ cookie), create a session
        let reqData = {
            reqType:"sessionAdd",
            userData:{
                name: gameData.currentUser,
                gameID: gameData.id,
                playerType:playerType
            }
        }
        axios.post("https://academic-challenge.com:3001",reqData).then((resp)=>{
            resp=resp.data
            if (resp.result) {
                document.cookie="session="+resp.respData
                gameData.sessionID=resp.respData
            }
        }).catch((err)=>{
            alert("Error: "+err)
        }); 
    }

    ReactDOM.render(< App interface={playerType} gameData={gameData}  />, domContainer);
}
const chooseTeam =(team,component) =>{
    // called when joining players (interfaceType=="joining") choose one of the two teams to join
    // sends data to server to add them to team
    let reqData = {
        reqType:"teamJoin",
        userData:{
            sessionID: getSession(),
            team: team,
        }
    }
    axios.post("https://academic-challenge.com:3001",reqData).then((resp)=>{
        resp=resp.data
        if (resp.result) component.setState({interfaceType:resp.respData.playerType})
    }).catch((err)=>{
        alert("Error: "+err)
    }); 
}
const socketInitializer =(component,socket) =>{
    // initializes connection with backend through socketio sockets
     
    // variable for if game is ended. prevents double popup on "game_end" that happens for some reason
    let ended=false;

    socket.on('connect',()=>{
        // once connected, sends session data to backend to verify that they're in the game and to link this user to the current game
        //console.log("Socket Connected!")
        socket.emit("user_connect",{sessionID:getSession()})
    })
    socket.on('game_update',(data)=>{
        // calls the < App /> gameUpdate() function whenever the backend game changes
        //console.log('Game Update!')
        component.gameUpdate(data)
    })
    socket.on("game_end",(reason)=>{
        // when the game ends, create popup, end the session, and return to start
        console.log('Game Ended')
        if (!ended){
            ended=true;
            component.popup("Game Ended!","Reason: "+reason,()=>{
                socket.close()
                endSession();
                start(false)
            })
        }
    })
    socket.on("admin_remove",(data)=>{
        // when the other ref wants to remove you, creates popup to allow you to agree (prevents mutiny!)
        if (data.name==component.state.currentUser){
            component.popup("Admin Removal",(
                <div>
                    <p>The other referee wants to remove you as an admin. Do you accept?</p>
                    <div id="leaveButton" className="game-button" 
                        onClick={()=>{
                            socket.emit("admin_remove",{name:data.name,gameID:component.state.gameID,sessionID:getSession()});component.setState({interfaceType:"joining"});component.popdown()
                        }}>Accept</div>
                    <div id="stayButton" className="game-button" onClick={()=>{component.popdown()}}>Refuse</div>
                </div>
            ))
        }
    })
    socket.on("player_kick",(data)=>{
        // Kicks the player if their name is the same one as the one being kicked
        if (data.name==component.state.currentUser){
            component.popup("Kicked!","You have been kicked from the game.",()=>{
                endSession();
                location.reload();
            })
        }
    })
}
const adminCommand = (commandObj,callback)=>{
    // function to make admin commands more standardized as theyre sent to backend
    let reqData = {
        reqType:"adminCommand",
        session:getSession(),
        commandQuery:commandObj
    }
    axios.post("https://academic-challenge.com:3001",reqData).then((resp)=>{
        resp=resp.data
        callback(resp.result,resp.reason)

    }).catch((err)=>{
        alert("Error: "+err)
    }); 
}
const getSession = () =>{
    // gets the session from cookies. in future, would want to make session not solely based on cookies because its role became a lot more central to the game's function than I had anticipated
    if (document.cookie.includes("session")) return document.cookie.split("=")[1]
    else return ""
}
const endSession = () =>{ document.cookie="session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;" ;}
window.onload = () =>{
    // if the user already has a session, this checks it, and if it exists, it lets them into the game automatically
    let sessionID = getSession()
    if (sessionID != ""){
        let reqData= {
            reqType:"sessionRetrieve",
            sessionID:sessionID
        }
        
        axios.get("https://academic-challenge.com:3001", {
          params: {
            data:reqData
          }
        }).then((resp)=>{
            console.log("axios")
            resp=resp.data
            if (resp.result) {
                let gameData=resp.respData.gameData
                gameData.currentUser=resp.respData.userData.name
                beginGame(resp.respData.userData.playerType,resp.respData.gameData)
            }
            else endSession()
        }).catch((err)=>{
            alert("Error: "+err)
        }); 
    }
}
// call this here because for some reason it isn't calling automatically
window.onload()
const domContainer = document.getElementById('react-content');
ReactDOM.render(< Start />, domContainer);
