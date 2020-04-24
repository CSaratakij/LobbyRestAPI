let app;
let store = {
    title: "Game Lobby",
    total: 0,
    createDate: "",
    lobby: []
}
let socket;
let isDisconnectOnce = false;

window.addEventListener("load", () => {
    initialize();
    subscribe();
});

function initialize() {
    socket = io();
    fetchGameLobby();

    app = new Vue({
        el: "#app",
        data: store,
        methods: {
            reRender: function() {
                this.forceUpdate();
            },
            localeDate: function() {
                if (this.createDate == undefined) return "";
                let date = new Date(this.createDate);
                return date.toLocaleString();
            },
            removeLobby: function(id) {
                Vue.delete(this.lobby, id);
                this.total -= 1;
            }
        }
    });
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
                initializeView(data);
            });
        })
        .catch(err => {
            console.log("Fetch Error :-S", err);
        });
}

function subscribe() {
    //onerr -> keep alive
    socket.on("disconnect", (reason) => {
        if (reason === "transport close") {
            let alertConfig =  {
                icon: 'error',
                title: 'Offline',
                text: 'Connection has been closed',
                confirmButtonText: 'Refresh',
                showLoaderOnConfirm: true,
                allowOutsideClick: false,
                preConfirm: () => {
                    return fetch("/lobby")
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(response.statusText);
                        }
                        return response.json();
                    })
                    .catch(err => {
                        Swal.showValidationMessage(
                            'connection timeout...'
                        )
                    })
                }
            }

            Swal.fire(alertConfig).then(result => {
                if (result.value) {
                    initializeView(result.value);
                    Swal.fire({
                        icon: 'success',
                        title: 'Online',
                        text: 'Reconnect successful',
                    });
                }
            });
        }
    });

    //SSE -> on open -> keep alive
    socket.on("ping-respond", data => {
        if (!isDisconnectOnce) return;
        if (data.createDate == undefined) return;

        let isMiss = isCacheMiss(store.createDate, data.createDate);
        // console.log("Cache miss : " + isMiss);

        if (isMiss) {
            fetchGameLobby();
        }

        isDisconnectOnce = false;

        Swal.fire({
            icon: 'success',
            title: 'Online',
            text: 'Reconnect successful',
        });

        // console.log("Receive ping respond event... : " + JSON.stringify(data));
    });

    //SSE - > custom event (don't forget to addEventListener)
    socket.on("add-lobby", data => {
        store.lobby.push(data);
        store.total += 1;

        // console.log("Receive add lobby event... : " + JSON.stringify(data));
    });

    //SSE - > custom event (don't forget to addEventListener)
    socket.on("update-lobby", data => {
        let id = data.id;
        let index = store.lobby.findIndex(element => id == element.id);

        if (index > -1) {
            Vue.set(store.lobby, index, data);
        }

        // console.log("Receive update lobby event... : " + JSON.stringify(data));
    });

    //SSE - > custom event (don't forget to addEventListener)
    socket.on("remove-lobby", data => {
        let id = data.id;
        let index = store.lobby.findIndex(element => id == element.id);

        if (index > -1) {
            Vue.delete(store.lobby, index);
            store.total -= 1;
        }
        else {
            console.log("Not found id : " + id);
        }

        // console.log("Receive delete lobby event... : " + JSON.stringify(data));
    });

    //sse -> onerr -> ?
    socket.on("disconnect", () => {
        isDisconnectOnce = true;
    });
}

function initializeView(data) {
    store.createDate = data.createDate;
    store.total = data.total;
    store.lobby.splice(0, store.lobby.length);

    Object.keys(data.lobby).forEach((key) => {
        let value = data.lobby[key];
        store.lobby.push(value);
    });
}

function isCacheMiss(current, expect) {
    let cacheDate = new Date(current);
    let reportDate = new Date(expect);

    let isSameDate = cacheDate.getTime() == reportDate.getTime();
    return !isSameDate;
}
