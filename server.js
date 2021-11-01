import ws from 'ws';
import mysql from 'mysql2';
import jwt from 'jsonwebtoken';

const server = new ws.Server({port: process.env.WEBSOCKET_PORT});

console.log('Server started')

let db;
connectToDb();

let onlineNames = [];
let onlineId = [];
let activeSessions = new Map();
let forbiddenWords = ['блять', 'сука', 'ебать', 'ебля', 'ебаный', 'ёбаный', 'пизда', 'долбоёб', 'хуй', 'хуёвый', 'хуевый'];

function connectToDb() {
    db = mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT,
        database: process.env.MYSQL_DATABASE,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD
    });
    db.connect(function (err) {
        if (err) {
            return console.error("Error: " + err.message);
        }
        console.log("The connection to the MySQL server has been successfully established");
    });
}

server.on('connection', ws => {
    ws.on('message', m => dispatchEvent(m, ws));
    ws.on('error', e => ws.send(JSON.stringify({event: 'error', payload: e})));
});

const dispatchEvent = (message, ws) => {

    const json = JSON.parse(message);
    if (!json || !json.event || !json.payload) return;

    switch (json.event) {

        case 'connection': {
            connectionEvent(json.payload.token, ws);
        }
            break;

        case 'sendMessage': {
            sendMessageEvent(json.payload.userName, json.payload.message, json.payload.time);
        }
            break;

        case 'getPageMessagesFromDb': {
            getPageMessagesFromDbEvent(json.payload.page, ws);
        }
            break;

        case 'disconnection': {
            disconnectionEvent(json.payload.userId, json.payload.userName, ws);
        }
            break;

        case 'exit': {
            exitEvent(json.payload.userId, json.payload.userName);
        }
            break;
    }
}

/*
 Событие подключения
 */
function connectionEvent(token, ws) {
    if (!token) return;

    let decoded;
    try {
        // Проверям корректность токена
        decoded = jwt.verify(token, process.env.PRIVATE_KEY);
    } catch (e) {
        console.log('Error: ' + e);
        ws.close();
    }

    const userId = decoded.userId;
    const userName = decoded.userName;
    if (!userId || !userName) return;

    console.log('--------------------------------------------');
    if (onlineId.indexOf(userId) === -1) {
        // Добавляем пользователя в массив онлайн пользователей
        addUserToOnlineList(userId, userName);
        sendInfoMessage(userName, 'подключился к чату');
        activeSessions.set(userId, 1);
        console.log(userName + ' connected');
    } else {
        activeSessions.set(userId, activeSessions.get(userId) + 1)
        console.log(userName + ' connected ' + activeSessions.get(userId) + ' time');
    }

    console.log('Online users: ' + onlineNames);
    console.log('Active sessions: ' + activeSessions.get(userId));
    console.log('--------------------------------------------');

    // Подгружаем первую страницу сообщений из БД
    sendMessagesFromDb(1, ws);
    // Отсылаем клиентам список онлайн пользователей
    sendOnlineList();
}

function addUserToOnlineList(id, name) {
    if (!id || !name) return;

    onlineNames.push(name);
    onlineId.push(id);
}

/*
 Событие отправки сообщения
 */
function sendMessageEvent(userName, message, time) {
    if (!userName || !message || message === '' || !time) return;

    saveMessage([userName, message, time]);
    sendMessage(userName, censor(message), time);
}

function saveMessage(data) {
    db.query("insert into messages  (id, userName, message, time) values (null, ?, ?, ?)", data, function (err, results) {
    });
}

function sendMessage(userName, message, time) {
    if (!userName || !message || !time) return;

    server.clients.forEach(client => client.send(JSON.stringify({
        event: 'sendMessage',
        payload: {userName, message, time}
    })));
}

function censor(message) {
    if (!message) return;

    const words = message.split(' ');
    for (let i in words) {
        let word = words[i].toLowerCase();
        if (forbiddenWords.indexOf(word) !== -1) {
            message = message.replace(words[i], '*'.repeat(word.length))
        }
    }
    return message;
}

/*
 Событие получения страницы сообщений из БД
 */
function getPageMessagesFromDbEvent(page, ws) {
    if (!page) return;

    sendMessagesFromDb(page, ws);
}

function sendMessagesFromDb(page, ws) {
    if (!page) return;

    let event = page === 1 ? 'loadingFirstPageMessagesFromDb' : 'loadingPageMessagesFromDb';

    const limit = 50;
    const offset = (page - 1) * limit;
    db.query("select * from messages ORDER BY id desc limit ?, ?", [offset, limit], function (err, results) {
        ws.send(JSON.stringify({event: event, payload: {results}}));
    });
}

/*
 Событие отключения
 */
function disconnectionEvent(userId, userName, ws) {
    if (!userId || !userName) return;

    console.log('--------------------------------------------');
    if (isSingleActiveSession(userId)) {
        deleteUserFromOnline(userId, userName);
        sendOnlineList();
        sendInfoMessage(userName, 'отключился от чата');
        activeSessions.delete(userId)
        ws.close();
        console.log(userName + ' disconnected');
    } else {
        activeSessions.set(userId, activeSessions.get(userId) - 1)
        console.log(userName + ' connected ' + activeSessions.get(userId) + ' time');
    }

    console.log('Online users: ' + onlineNames);
    console.log('Active sessions: ' + (typeof activeSessions.get(userId) === 'undefined' ? 0 : activeSessions.get(userId)));
    console.log('--------------------------------------------');
}

function isSingleActiveSession(userId) {
    return activeSessions.get(userId) === 1;
}

/*
 Событие выхода
 */
function exitEvent(userId, userName) {
    if (!userId || !userName) return;

    server.clients.forEach(client => {
        client.send(JSON.stringify({event: 'checkToken', payload: {userName}}))
    });

    deleteUserFromOnline(userId, userName);
    sendOnlineList();
    sendInfoMessage(userName, 'отключился от чата');
    activeSessions.delete(userId)

    console.log('--------------------------------------------');
    console.log(userName + ' disconnected');
    console.log('Online users: ' + onlineNames);
    console.log('Active sessions: ' + (typeof activeSessions.get(userId) === 'undefined' ? 0 : activeSessions.get(userId)));
    console.log('--------------------------------------------');
}

function deleteUserFromOnline(userId, userName) {
    if (!userId || !userName) return;

    onlineNames.splice(onlineId.indexOf(userId), 1);
    onlineId.splice(onlineId.indexOf(userId), 1);
}

function sendOnlineList() {
    server.clients.forEach(client => client.send(JSON.stringify({
        event: 'updateOnlineList',
        payload: {onlineNames}
    })));
}

function sendInfoMessage(userName, message) {
    if (!userName || !message) return;

    server.clients.forEach(client => client.send(JSON.stringify({
        event: 'sendInfoMessage',
        payload: {userName, message}
    })));
}