//------------------------------
//  Initialize
//------------------------------

const _DEBUG = false;

const express = require("express");
const bodyParser = require("body-parser");
const uid = require("uid");
const mongoose = require("mongoose");
const {
    body,
    query,
    oneOf,
    validationResult
} = require("express-validator");

const LobbyKeySchema = {
    title: "",
    ip: "",
    port: 0,
    player: 0,
    maxPlayer: 0,
    id: "",
    createDate: "",
    pingDate: ""
};

const ip = "0.0.0.0";
const port = 8080;
const maxUIDLength = 32;

const checkAliveInterval = 1000 * 60 * 2;

let app = express();

app.use(bodyParser.json({ strict: false }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static("public"));

let server = require("http").createServer(app);
let io = require("socket.io")(server);
let date = new Date();

let data = {
    createDate: date.toISOString(),
    total: 0,
    lobby: {}
};

let token = {};

//------------------------------
//  Request handler
//------------------------------

function getLobbyList(id) {
    let isGetSpecificLobbyID = id == undefined || data.lobby[id] == undefined;

    if (isGetSpecificLobbyID) {
        return data;
    }

    return { total: 1, lobby: data.lobby[id] };
}

function addLobby(info) {
    let id = "";
    let date = new Date();

    do {
        id = uid(maxUIDLength);
    } while (data.lobby[id] != undefined);

    info.id = id;
    info.createDate = date.toISOString();
    info.pingDate = info.createDate;

    token[id] = uid(maxUIDLength);

    data.lobby[info.id] = info;
    data.total = Object.keys(data.lobby).length;

    // console.log(info);
    // console.log("secret : " + token[id]);

    io.emit("add-lobby", info);
    return info.id;
}

function updateLobby(info) {
    let id = info.id;
    if (data.lobby[id] == undefined) throw "lobby not found";

    for (var key in info) {
        if (data.lobby[id].hasOwnProperty(key)) {
            data.lobby[id][key] = info[key];
        }
    }

    let now = new Date();
    data.lobby[id].pingDate = now.toISOString();

    let result = {
        total: 1,
        lobby: data.lobby[id]
    };

    io.emit("update-lobby", data.lobby[id]);
    return result;
}

function removeLobby(id) {
    delete token[id];
    delete data.lobby[id];

    let temp = data.total - 1;
    if (temp < 0) temp = 0;

    data.total = temp;
    io.emit("remove-lobby", { id: id });
}

function lobbyNotFoundRespond(res) {
    let error = {
        // type: "https://example.net/validation-error",
        type: "",
        title: "Lobby not found",
        detail: "There is no lobby with request lobby id",
        status: 404
    };
    res.status(404);
    res.set("Content-Type", "application/problem+json");
    res.send(JSON.stringify(error));
}

function incorrectQueryParameterRespond(res) {
    let error = {
        // type: "https://example.net/validation-error",
        type: "",
        title: "Incorrect query parameters",
        detail: "Some query is not exists, please send appropiate query",
        status: 400
    };
    res.status(400);
    res.set("Content-Type", "application/problem+json");
    res.send(JSON.stringify(error));
}

function incorrectBodyParameterRespond(res) {
    let error = {
        // type: "https://example.net/validation-error",
        type: "",
        title: "Incorrect body parameters",
        detail: "Some parameter is missing, please send appropiate parameters",
        status: 400
    };
    res.set("Content-Type", "application/problem+json");
    res.status(400);
    res.send(JSON.stringify(error));
}

function forbiddenRespond(res) {
    let error = {
        // type: "https://example.net/validation-error",
        type: "",
        title: "Forbidden",
        detail: "Require permission....",
        status: 403
    };
    res.status(403);
    res.set("Content-Type", "application/problem+json");
    res.send(JSON.stringify(error));
}

function isKeyMatch(id, key) {
    if (token[id] == undefined) throw "Key not exists";
    if (token[id] == key) return true;
    return false;
}

// app.get("/ip", (req, res) => {
//     let result = {
//         ip: req.ip
//     }
//     res.json(result);
// });

//serve homepage
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

//ping specific lobby (keep entry of lobby from delete schedule)
app.get("/lobby/ping", [query("id").exists()], (req, res) => {
    let id = req.query.id;
    if (data.lobby[id] == undefined) {
        lobbyNotFoundRespond(res);
    } else {
        let date = new Date();
        data.lobby[id].pingDate = date.toISOString();
        res.status(204);
        res.end();
    }
});

//get lobby list
app.get(
    "/lobby",
    oneOf([
        query("id")
            .not()
            .exists(),
        query("id").exists()
    ]),
    (req, res) => {
        try {
            validationResult(req).throw();
            let id = req.query.id;
            if (id == undefined) {
                let result = getLobbyList();
                res.json(result);
            } else {
                if (data.lobby[id] == undefined) {
                    lobbyNotFoundRespond(res);
                } else {
                    let result = getLobbyList(id);
                    res.json(result);
                }
            }
        } catch (err) {
            incorrectQueryParameterRespond(res);
        }
    }
);

//create new lobby list
app.post(
    "/lobby",
    [
        body("id")
            .not()
            .exists(),
        body("title").exists(),
        body("ip").exists(),
        body("port").exists(),
        body("player").exists(),
        body("maxPlayer").exists()
    ],
    (req, res) => {
        try {
            validationResult(req).throw();
            let info = {
                title: req.body.title,
                ip: req.body.ip,
                port: req.body.port,
                player: req.body.player,
                maxPlayer: req.body.maxPlayer
            };
            let id = addLobby(info);
            let result = {
                id: id,
                token: token[id]
            };
            res.status(201);
            res.json(result);
        } catch (err) {
            incorrectBodyParameterRespond(res);
        }
    }
);

//update specific lobby info
app.put("/lobby", [body("id").exists(), body("token").exists()], (req, res) => {
    try {
        validationResult(req).throw();

        let id = req.body.id;
        let isMatch = false;

        try {
            isMatch = isKeyMatch(id, req.body.token);
        } catch (err) {
            lobbyNotFoundRespond(res);
            return;
        }

        if (isMatch) {
            let info = {};

            for (var key in LobbyKeySchema) {
                if (req.body.hasOwnProperty(key)) {
                    info[key] = req.body[key];
                }
            }

            let result = updateLobby(info);

            res.status(201);
            res.json(result);
        } else {
            forbiddenRespond(res);
            return;
        }
    } catch (err) {
        incorrectBodyParameterRespond(res);
    }
});

//update specific lobby's player info
app.put("/lobby/player", [
        body("id").exists(),
        body("token").exists(),
        body("player").exists(),
        body("maxPlayer").exists()
    ],
    (req, res) => {
        try {
            validationResult(req).throw();

            let id = req.body.id;
            let isMatch = false;

            try {
                isMatch = isKeyMatch(id, req.body.token);

                if (isMatch) {
                    let info = {
                        id: id
                    };

                    let player = req.body.player;
                    let maxPlayer = req.body.maxPlayer;

                    if (player != undefined)
                        info.player = player;

                    if (maxPlayer != undefined)
                        info.maxPlayer = maxPlayer;

                    updateLobby(info);

                    res.status(204);
                    res.end();
                } else {
                    forbiddenRespond(res);
                }
            } catch (err) {
                lobbyNotFoundRespond(res);
                return;
            }
        }
        catch (err) {
            incorrectBodyParameterRespond(res);
        }
    }
);

//delete specific lobby
app.delete(
    "/lobby",
    [body("id").exists(), body("token").exists()],
    (req, res) => {
        try {
            validationResult(req).throw();

            let id = req.body.id;
            let isMatch = false;

            try {
                isMatch = isKeyMatch(id, req.body.token);
            } catch (err) {
                lobbyNotFoundRespond(res);
                return;
            }

            if (isMatch) {
                removeLobby(id);
                res.status(204);
                res.end();
            } else {
                forbiddenRespond(res);
            }
        } catch (err) {
            incorrectBodyParameterRespond(res);
        }
    }
);

//------------------------------
//  Server
//------------------------------

//set timer to check if we should drop specific lobby entry
if (!_DEBUG) {
    setInterval(() => {
        let currentDate = new Date();
        for (var key in data.lobby) {
            let pingDate = new Date(data.lobby[key].pingDate);
            let diff = currentDate - pingDate;

            if (diff >= checkAliveInterval) {
                removeLobby(key);
            }
        }
    }, checkAliveInterval);
}

//------------------------------
//  Web socket handler
//------------------------------
io.on("connection", socket => {
    console.log("a user connected");
    socket.emit("ping-respond", { createDate: data.createDate });

    socket.on("ping", () => {
        socket.emit("ping-respond", { createDate: data.createDate });
    });

    socket.on("disconnect", () => {
        socket.disconnect();
    });
});

server.listen(port, ip, () => {
    console.log("Server start at port : " + port);
});