let app;
let viewData;
let socket;
let isDisconnectOnce = false;

window.addEventListener("load", () => {
    initialize();
    subscribe();
});

function initialize() {
    viewData = {};
    socket = io();

    app = new Vue({
        el: "#app",
        data: {
            title: "Game Lobby",
            viewData: {}
        }
    });

    fetchGameLobby();
}

function fetchGameLobby() {
    fetch("/lobby")
        .then(response => {
            if (response.status !== 200) {
                console.log(
                    "Looks like there was a problem. Status Code: " +
                        response.status
                );
                return;
            }
            response.json().then(data => {
                updateView(data);
            });
        })
        .catch(err => {
            console.log("Fetch Error :-S", err);
        });
}

function subscribe() {
    socket.on("ping-respond", data => {
        if (!isDisconnectOnce) return;
        if (data.createDate == undefined) return;

        let isMiss = isCacheMiss(viewData.createDate, data.createDate);
        // console.log("Cache miss : " + isMiss);

        if (isMiss) {
            fetchGameLobby();
        }

        isDisconnectOnce = false;
        // console.log("Receive ping respond event... : " + JSON.stringify(data));
    });

    socket.on("add-lobby", data => {
        let id = data.id;

        viewData.lobby[id] = data;
        viewData.total += 1;

        updateView(viewData);
        // console.log("Receive add lobby event... : " + JSON.stringify(data));
    });

    socket.on("update-lobby", data => {
        let id = data.id;

        viewData.lobby[id] = data;
        updateView(viewData);

        // console.log("Receive update lobby event... : " + JSON.stringify(data));
    });

    socket.on("remove-lobby", data => {
        let id = data.id;

        delete viewData.lobby[id];
        viewData.total -= 1;

        updateView(viewData);
        // console.log("Receive delete lobby event... : " + JSON.stringify(data));
    });

    socket.on("disconnect", () => {
        isDisconnectOnce = true;
    });
}

function updateView(data) {
    viewData = data;
    app.viewData = data;
}

function isCacheMiss(current, expect) {
    let cacheDate = new Date(current);
    let reportDate = new Date(expect);

    let isSameDate = cacheDate.getTime() == reportDate.getTime();
    return !isSameDate;
}
