import ws from 'ws';
import mysql from 'mysql2';
import jwt from 'jsonwebtoken';

const server = new ws.Server({port: 8000});

console.log('Server started')

let db;
connectToDb();

let onlineNames = [];
let onlineId = [];
let activeSessions = new Map();
let forbiddenWords = ['блять', 'сука', 'ебать', 'ебля', 'ебаный', 'ёбаный', 'пизда', 'долбоёб', 'хуй', 'хуёвый', 'хуевый'];

server.on('connection', ws => {
    ws.on('message', m => dispatchEvent(m, ws));
    ws.on('error', e => ws.send(JSON.stringify({event: 'error', payload: e})));
});

const dispatchEvent = (message, ws) => {

    const json = JSON.parse(message);
    if (!json || !json.event || !json.payload) return;

    switch (json.event) {

        case 'connection': {
            const token = json.payload.token;
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
            break;

        case 'sendMessage': {
            const username = json.payload.userName;
            const message = json.payload.message;
            const time = json.payload.time;
            if (!username || !message || message === '' || !time) return;

            saveMessage([username, message, time]);
            sendMessage(username, censor(message), time);
        }
            break;

        case 'getPageMessagesFromDb': {
            const page = json.payload.page;
            if (!page) return;

            sendMessagesFromDb(page, ws);
        }
            break;

        case 'disconnection': {
            const userId = json.payload.userId;
            const userName = json.payload.userName;
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
            break;

        case 'exit': {
            const userId = json.payload.userId;
            const userName = json.payload.userName;
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
            break;
    }
}

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

function sendMessage(userName, message, time) {
    if (!userName || !message || !time) return;

    server.clients.forEach(client => client.send(JSON.stringify({
        event: 'sendMessage',
        payload: {userName, message, time}
    })));
    console.log('Message sand to clients');
}

function censor(userMessage) {
    if (!userMessage) return;

    const words = userMessage.split(' ');
    for (let i in words) {
        let word = words[i].toLowerCase();
        if (forbiddenWords.indexOf(word) !== -1) {
            userMessage = userMessage.replace(words[i], '*'.repeat(word.length))
        }
    }
    return userMessage;
}

function saveMessage(data) {
    db.query("insert into messages  (id, userName, message, time) values (null, ?, ?, ?)", data, function (err, results) {
    });
    console.log('Message saved to Db');
}

function isSingleActiveSession(userId) {
    if (!userId) return false;

    return activeSessions.get(userId) === 1;
}

function addUserToOnlineList(userId, userName) {
    if (!userId || !userName) return;

    onlineNames.push(userName);
    onlineId.push(userId);
}

function deleteUserFromOnline(userId, userName) {
    if (!userId || !userName) return;

    onlineNames.splice(onlineId.indexOf(userId), 1);
    onlineId.splice(onlineId.indexOf(userId), 1);
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

function sendOnlineList() {
    server.clients.forEach(client => client.send(JSON.stringify({
        event: 'sendOnlineList',
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