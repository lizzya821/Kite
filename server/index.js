const path = require("path");
const express = require("express");
const morgan = require("morgan");
const compression = require("compression");
const PORT = process.env.PORT || 8080;
const app = express();
const admin = require("firebase-admin");
const serviceAccount = require("../admin.json");
const { databaseURL } = require("../secrets");

module.exports = app;

/**
 * In your development environment, you can keep all of your
 * app's secret API keys in a file called `secrets.js`, in your project
 * root. This file is included in the .gitignore - it will NOT be tracked
 * or show up on Github. On your production server, you can add these
 * keys as environment variables, so that they can still be read by the
 * Node process on process.env
 */
if (process.env.NODE_ENV !== "production") require("../secrets");

const createApp = () => {
  // logging middleware
  app.use(morgan("dev"));

  // body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // compression middleware
  app.use(compression());

  app.use("/api", require("./api"));

  // static file-serving middleware
  app.use(express.static(path.join(__dirname, "..", "public")));

  // any remaining requests with an extension (.js, .css, etc.) send 404
  app.use((req, res, next) => {
    if (path.extname(req.path).length) {
      const err = new Error("Not found");
      err.status = 404;
      next(err);
    } else {
      next();
    }
  });

  // sends index.html
  app.use("*", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public/index.html"));
  });

  // error handling endware
  app.use((err, req, res, next) => {
    console.error(err);
    console.error(err.stack);
    res.status(err.status || 500).send(err.message || "Internal server error.");
  });
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: databaseURL
});

const startListening = () => {
  // start listening (and create a 'server' object representing our server)
  const server = app.listen(PORT, () =>
    console.log(`Mixing it up on port ${PORT}`)
  );
};

//start of game controller

const db = admin.database();

function endRound(ref, updateRef, status) {
  if (ref) {
    ref.off();
  }
  db.ref(updateRef).set(status);
}

function endGame(deleteRef) {
  db.ref(deleteRef).remove();
}

function respondingNHIE(snapshot) {
  db.ref(`gameSessions/${snapshot.key}/rounds`).push({
    timeStarted: Date.now()
  });
  console.log("in responding");
  //getting total # of players
  let totalPlayers;
  snapshot.ref
    .child("players")
    .once("value")
    .then(playerSnapshot => {
      totalPlayers = playerSnapshot.numChildren();
    });

  //getting the rounds object limited to the last round
  snapshot.ref.child("rounds").on("child_added", roundSnapshot => {
    const rounds = roundSnapshot.val();
    //getting list of rounds values
    if (rounds) {
      const responsesRef = roundSnapshot.ref.child("responses");
      //function to end the round and change the status to confessing.
      //getting the responses
      let responses;
      let refToChange = "gameSessions/" + snapshot.key + "/status";
      //timeout function
      const roundTimeout = setTimeout(function() {
        //if at the end of the round there are responses
        console.log("RESPONSES", responses);
        if (responses) {
          snapshot.ref.child("rounds").off();
          //updating timeStarted for the front end timer
          roundSnapshot.ref.update({
            timeStarted: Date.now()
          });
          //updating to confessing
          endRound(responsesRef, refToChange, "confessing");
          //if no responses
        } else {
          responsesRef.off();
          snapshot.ref.child("rounds").off();
          //deleting that game session
          let refToDelete = "gameSessions/" + snapshot.key;
          let chatToDelete = "lobbyMessages/" + snapshot.key;
          endGame(refToDelete);
          endGame(chatToDelete);
        }
      }, 30000);
      //getting responses
      responsesRef.on("value", roundResponsesSnapshot => {
        responses = roundResponsesSnapshot.val();
        //checking for submitted responses
        if (responses) {
          let resArr = [];
          Object.values(responses).forEach(resObj => {
            if (resObj.text.length > 1) {
              resArr.push(resObj.text);
            }
          });
          // if we have responses for every player in the game session:
          if (resArr.length === totalPlayers) {
            snapshot.ref.child("rounds").off();
            clearTimeout(roundTimeout);
            //updating timeStarted for the front end timer
            roundSnapshot.ref.update({
              timeStarted: Date.now()
            });
            endRound(responsesRef, refToChange, "confessing");
          }
        }
      });
    }
  });
}

function confessingNHIE(sessionSnap) {
  console.log("in confessing");
  // console.log("HELLOOOOO", snapshot.val().players);
  let refToChange = "gameSessions/" + sessionSnap.key + "/status";
  // console.log("refToChange:", refToChange);
  let isGameOver = false;
  let ref = sessionSnap.ref.child("players");

  //checking gameover when confessing time is up
  const roundTimeout = setTimeout(function() {
    if (isGameOver) {
      //changing status to finished if game is over
      endRound(ref, refToChange, "finished");
    } else {
      //chaging status to responding if game is still on
      endRound(ref, refToChange, "responding");
    }
  }, 30000);
  //checking if any player's point is 0
  sessionSnap.ref.child("players").on("value", playersSnap => {
    if (playersSnap.val() != null) {
      const players = Object.values(playersSnap.val());
      players.forEach(player => {
        if (parseInt(player.points) <= 0) {
          isGameOver = true;
        }
      });
    }
  });
  //ending the game right away if at least one player reaches 0 points
}

// reusable in other games
function finished(sessionSnap) {
  console.log("in finished");
  let refToDelete = "gameSessions/" + sessionSnap.key;
  let chatToDelete = "lobbyMessages/" + sessionSnap.key;
  //ending finished in specified time and deleted the game session
  setTimeout(function() {
    endGame(refToDelete);
    endGame(chatToDelete);
  }, 200000);
}

function playingRD(snapshot) {
  const sessionRef = db.ref(`gameSessions/${snapshot.key}`);
  sessionRef.child("points").on("value", pointSnapshot => {
    if (pointSnapshot.val() === 0) sessionRef.update({ status: "finished" });
  });
  sessionRef
    .child("players")
    .orderByKey()
    .on("value", playerSnapshot => {
      if (playerSnapshot.val() != null) {
        const players = Object.keys(playerSnapshot.val());
        let turnCounter = 0;
        let missedTurns = 0;
        //setting turn to first player in array
        sessionRef.update({
          turn: players[0],
          turnTimeStarted: Date.now()
        });

        let turnTimeout;
        sessionRef.child("turn").on("value", turnSnap => {
          console.log("inside turn value, what's going on??? ", turnSnap.val());
          if (turnSnap.val() == null) sessionRef.child("turn").off();
          turnTimeout = setTimeout(function() {
            missedTurns += 1;
            if (missedTurns <= players.length) {
              turnCounter += 1;
              //this modulo ensures we loop the player array repeatedly:
              let currentPlayerIdx = turnCounter % players.length;
              sessionRef.update({
                turn: players[currentPlayerIdx],
                turnTimeStarted: Date.now()
              });
            } else {
              const chatToDelete = "lobbyMessages/" + snapshot.key;
              endGame(sessionRef);
              endGame(chatToDelete);
            }
          }, 30000);
        });
        sessionRef.child("finalGuess").on("child_added", finalGuessSnap => {
          if (turnTimeout) clearTimeout(turnTimeout);
        });
        //when a new letter is submitted, change turn to next player:
        sessionRef.child("letterBank").on("child_added", letterSnapshot => {
          console.log("letter added?:", letterSnapshot.key);
          if (turnTimeout) {
            clearTimeout(turnTimeout);
            missedTurns = 0;
          }
          turnCounter += 1;
          //this modulo ensures we loop the player array repeatedly:
          let currentPlayerIdx = turnCounter % players.length;
          sessionRef.update({
            turn: players[currentPlayerIdx],
            turnTimeStarted: Date.now()
          });
          //ADD: timeout

          //if letter bank has all the letters for target word, change game status to finished
          sessionRef.child("letterBank").on("value", letterSnapshot => {
            let letterBank = [];
            if (letterSnapshot.val()) {
              letterBank = Object.keys(letterSnapshot.val());
            }
            sessionRef.child("targetWord").on("value", wordSnapshot => {
              if (wordSnapshot.val() != null) {
                const targetWord = wordSnapshot.val();
                if (gameOverRD(letterBank, targetWord)) {
                  sessionRef.update({ status: "finished" });
                } else wordSnapshot.ref.off();
              }
            });
          });
        });
      } else {
        playerSnapshot.ref.off();
      }
    });
}

function gameOverRD(letterBankArr, target) {
  let done = true;
  if (!target) return done;
  for (let i = 0; i < target.length; i++) {
    let letter = target[i];
    if (!letterBankArr.includes(letter)) {
      done = false;
    }
  }
  return done;
}

// this is the controller specifically for NHIE
function switchStatusNHIE(statusSnap, sessionSnap) {
  const status = statusSnap.val();
  if (status === "responding") {
    respondingNHIE(sessionSnap);
  } else if (status === "confessing") {
    confessingNHIE(sessionSnap);
  } else if (status === "finished") {
    finished(sessionSnap);
  }
}

// this is the controller specifically for ropedude
function switchStatusRD(statusSnap, sessionSnap) {
  const status = statusSnap.val();
  if (status === "playing") {
    playingRD(sessionSnap);
  } else if (status === "finished") {
    finished(sessionSnap);
  }
}

// this is the first function the session child added hits- directs based on gameID
function newGameSession(sessionSnap) {
  //getting the status for each session
  // swtich on snapshot.val().gameID
  if (sessionSnap.val().gameId === "1") {
    sessionSnap.ref.child("status").on("value", statusSnap => {
      switchStatusNHIE(statusSnap, sessionSnap);
    });
  } else if (sessionSnap.val().gameId === "2") {
    sessionSnap.ref.child("status").on("value", statusSnap => {
      switchStatusRD(statusSnap, sessionSnap);
    });
  }
}

db.ref("gameSessions").on("child_added", newGameSession);

//end of game controller

async function bootApp() {
  await createApp();
  await startListening();
}
// This evaluates as true when this file is run directly from the command line,
// i.e. when we say 'node server/index.js' (or 'nodemon server/index.js', or 'nodemon server', etc)
// It will evaluate false when this module is required by another module - for example,
// if we wanted to require our app in a test spec
if (require.main === module) {
  bootApp();
} else {
  createApp();
}
