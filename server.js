import ws from 'ws';
import mysql from 'mysql2';

const server = new ws.Server({port: 8000});

console.log("Server started")

let db;
connectToDb();

let onlineNames = [];
let onlineId = [];
let forbiddenWords = ['блять', 'сука', 'ебать', 'ебля', 'ебаный', 'ёбаный', 'пизда', 'долбоёб', 'хуй', 'хуёвый', 'хуевый'];

const sendOnlineUsersList = (infoMessage) => {
    server.clients.forEach(client => client.send(JSON.stringify({
        event: 'eventUser',
        payload: {onlineNames, infoMessage}
    })));
}

function censorship(userMessage) {
    const words = userMessage.split();
    for (let i in words) {
        let word = words[i].toLowerCase();
        if (forbiddenWords.indexOf(word) !== -1) {
            userMessage = userMessage.replace(words[i], '*'.repeat(word.length))
        }
    }
    return userMessage;
}

function connectToDb() {
    db = mysql.createConnection({
        host: "localhost",
        port: "8787",
        user: "dev",
        database: "chat",
        password: "dev"
    });
    db.connect(function (err) {
        if (err) {
            return console.error("Ошибка: " + err.message);
        }
        console.log("Подключение к серверу MySQL успешно установлено");
    });
}

function sendAllMessages(ws) {
    db.query("select * from messages", function (err, results) {
        ws.send(JSON.stringify({event: 'getMessagesFromDb', payload: {results}}))
    });
}

function saveMessage(data) {
    console.log(data);
    db.query("insert into messages  (id, userName, message) values (null, ?, ?)", data, function (err, results) {
    });
}

const dispatchEvent = (message, ws) => {

    const json = JSON.parse(message);
    const userName = json.payload.curUserName;

    switch (json.event) {

        case "sendMessage": {
            let userMessage = json.payload.message;
            userMessage = censorship(userMessage);
            saveMessage([userName, userMessage]);
            server.clients.forEach(client => client.send(JSON.stringify({
                event: 'sendMessage',
                payload: {userName, userMessage}
            })));
        }
            break;

        case "addUser": {
            const userId = json.payload.curUserId;
            if (onlineId.indexOf(userId) !== -1) return;
            onlineNames.push(userName);
            onlineId.push(userId);
            sendAllMessages(ws);
            sendOnlineUsersList(userName + ' подключился к чату');
        }
            break;

        case "deleteUser": {
            const userId = json.payload.curUserId;
            const index = onlineId.indexOf(userId);
            onlineNames.splice(index, 1);
            onlineId.splice(index, 1);
            sendOnlineUsersList(userName + ' отключился от чата');
        }
            break;
    }
}

server.on('connection', ws => {
    ws.on('message', m => dispatchEvent(m, ws));
    ws.on("error", e => ws.send(JSON.stringify({event: 'error', payload: e})));
});