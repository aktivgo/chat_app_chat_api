import ws from 'ws';

const server = new ws.Server({port: 8000});

console.log("Server started")

let onlineUsersList = new Map();

/*server.on('connection', ws => {
    ws.on('message', messageClient => {
        const messageArr = JSON.parse(messageClient);
        const name = messageArr.name;
        const message = messageArr.message;
        if (onlineUsersList.indexOf(name) === -1) {
            onlineUsersList.push(name);
        }
        server.clients.forEach(client => {
            if (client.readyState === ws.OPEN) {
                client.send(JSON.stringify({name, message, onlineUsersList}));
            }
        });
    });
});*/

const sendOnlineUsersList = (infoMessage) => {
    console.log(onlineUsersList);
    server.clients.forEach(client => client.send(JSON.stringify({
        event: 'eventUser',
        payload: {onlineUsersList, infoMessage}
    })))
}

const dispatchEvent = (message) => {

    const json = JSON.parse(message);
    const userName = json.payload.userName;

    switch (json.event) {

        case "sendMessage": {
            const userMessage = json.payload.message;
            server.clients.forEach(client => client.send(JSON.stringify({
                event: 'sendMessage',
                payload: {userName, userMessage}
            })));
        }
            break;

        case "addUser": {
            const userId = json.payload.userId;
            onlineUsersList.set(userId, userName);
            sendOnlineUsersList(userName + ' подключился к чату');
        }
            break;

        case "deleteUser": {
            const userId = json.payload.userId;
            onlineUsersList.delete(userId);
            sendOnlineUsersList(userName + ' отключился от чата');
        }
            break;
    }
}


server.on('connection', ws => {
    ws.on('message', m => dispatchEvent(m, ws));
    ws.on("error", e => ws.send(JSON.stringify({event: 'error', payload: e})));
});

/*ws.on('message', m => {
    server.clients.forEach(client => client.send(m));
});*/

/*
import ws from "ws";
const {Server} = ws;
import {v4 as uuid} from "uuid";
import {writeFile, readFileSync, existsSync} from "fs";
const clients = {};
const log = existsSync('log') && readFileSync('log', 'utf-8');
const messages = log ? JSON.parse(log) : [];

const wss = new Server({port: 8000});
wss.on("connection", (ws) => {
    const id = uuid();
    clients[id] = ws;

    console.log(`New client ${id}`);
    ws.send(JSON.stringify(messages));

    ws.on('message', (rawMessage) => {
        const {name, message} = JSON.parse(rawMessage);
        messages.push({name, message});
        for (const id in clients) {
            clients[id].send(JSON.stringify([{name, message}]))
        }
    })

    ws.on('close', () => {
        delete clients[id];
        console.log(`Client is closed ${id}`)
    })
})

process.on('SIGINT', () => {
    wss.close();
    writeFile('log', JSON.stringify(messages), err => {
        if (err) {
            console.log(err);
        }
        process.exit();
    })
})*/