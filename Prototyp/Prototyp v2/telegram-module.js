// RabbitMQ
const amqp = require('amqplib/callback_api');

// Globals
const listener = 'telegram-module';
const listener_topics = ['broker'];
const topic = 'telegram';

// Data Files
const fs = require('fs');
const eventFile = 'events.json';
const userFile = 'users_telegram.json';

var eventData = [];
var userData = [];

if (fs.existsSync(eventFile)) {
    console.log('[*] Event Data Found.');
    fs.readFile(eventFile, 'utf8', (err, data) => {
        if (err) throw err;
        eventData = JSON.parse(data);
    });
} else {
    console.log('[X] No Existing Event Data.');
}

if (fs.existsSync(userFile)) {
    console.log('[*] User Data Found.');
    fs.readFile(userFile, 'utf8', (err, data) => {
        if (err) throw err;
        userData = JSON.parse(data);
    });
} else {
    console.log('[X] No Existing User Data.');
}

// Telegram Channel Listener
amqp.connect('amqp://localhost', function(err, conn) {
    if (err) throw err;

    conn.createChannel(function(err, channel) {
        if (err) throw err;

        channel.assertExchange(listener, 'topic', {
            durable: false
        });

        channel.assertQueue('', {
            exclusive: true
        }, function(err, q) {
            if (err) throw err;

            console.log('[*] Listening On: ' + listener);

            listener_topics.forEach(function(key) {
                channel.bindQueue(q.queue, listener, key);
            });

            channel.consume(q.queue, function(msg) {
                let text = msg.content.toString();
                console.log("[x] Received Via '%s':'%s'", msg.fields.routingKey, text);

                if (msg.fields.routingKey == 'broker') {
                    let split = text.split(':');
                    let reason = split[0];
                    console.log('[*] Reason: ' + reason);

                    if (reason == 'weather-update') {
                        let city = split[1];
                        let temp = split[2];
                        let humidity = split[3];
                        sendTelegramMessageByCity(city, `Die Wetterbedingungen in ${city} haben sich geändert. Die Temperatur beträgt ${temp}°C und es herrscht eine Luftfeuchtigkeit von ${humidity}%.`);
                    } else if (reason == 'chat') {
                        let event = split[1];
                        let author = split[2];
                        let text = split[3];
                        sendTelegramMessageByEvent(event, author, text);
                    }
                }
            }, {
                noAck: true
            });
        });
    });
});

function sendRMQMessage(listener, msg) {
    amqp.connect('amqp://localhost', function(err, connection) {
        if (err) throw err;

        connection.createChannel(function(err, channel) {
            if (err) throw err;

            channel.assertExchange(listener, 'topic', {
                durable: false
            });
            channel.publish(listener, topic, Buffer.from(msg));
            console.log("[x] Sent To '%s' (%s): '%s'", listener, topic, msg);
        });

        setTimeout(function() {
            connection.close();
        }, 500);
    });
}

// Telegram Bot
const telegram = require('telegram-bot-api');
const telegramBot = new telegram({
    token: 'REMOVED',
    updates: {
        enabled: true
    }
});
const authcode = 'webdev';
var chats = [];

telegramBot.getMe().then(function(data) {
    console.log('[*] Telegram Module Running...');
}).catch(function(err) {
    if (err) throw err;
});

function sendTelegramMessage(msg, chatID) {
    telegramBot.sendMessage({
        chat_id: chatID,
        text: msg,
        parse_mode: 'MarkDown'
    }).then(function(message) {
        console.log(`[*] Telegram Message sent to ${chatID}.`);
    }).catch(function(err) {
        if (err) throw err;
    });
}

function sendTelegramMessageByCity(city, msg) {
    if (userData.length > 0) {
        let events = [];

        for (let i = 0; i < eventData.length; i++) {
            if (eventData[i].location == city) {
                if (!events.includes(eventData[i].name)) {
                    events.push(eventData[i].name);
                }
            }
        }

        let send = [];
        for (let j = 0; j < userData.length; j++) {
            for (let k = 0; k < events.length; k++) {
                if (userData[j].events.includes(events[k])) {
                    if (!send.includes(userData[j].id)) {
                        send.push(userData[j].id);
                        sendTelegramMessage(msg, userData[j].id);
                    }
                }
            }
        }
    }
}

function sendTelegramMessageByEvent(event, author, text) {
    let users = [];
    for (let i = 0; i < userData.length; i++) {
        if (userData[i].events.includes(event))
            users.push(userData[i].id);
    }

    for (let j = 0; j < users.length; j++) {
        sendTelegramMessage(`${author}: ${text}`, users[j]);
    }
}

function sendTelegramByEventID(event, text, userid, author) {
    let users = [];
    for (let i = 0; i < userData.length; i++) {
        if (userData[i].events.includes(event) && userData[i].id != userid)
            users.push(userData[i].id);
    }

    for (let j = 0; j < users.length; j++) {
        sendTelegramMessage(`${author}: ${text}`, users[j]);
    }
}

telegramBot.on('message', function(message) {
    // Chat Message
    if (message.text.startsWith('+')) {
        if (chats.includes(message.chat.id)) {
            let args = message.text.slice(1).trim().split(/ +/g);
            let event = args.shift().toLowerCase();

            for (let i = 0; i < userData.length; i++) {
                if (userData[i].id == message.chat.id) {
                    if (userData[i].events.includes(event)) {
                        let author = message.chat.username;
                        let text = args.join(' ');
                        sendRMQMessage('broker-module', `chat:${event}:${author}:${text}`);
                        sendTelegramByEventID(event, text, message.chat.id, author);
                    } else {
                        sendTelegramMessage('Du bist kein Mitglied dieser Veranstaltung.', message.chat.id);
                    }
                }
            }
        } else {
            sendTelegramMessage('Du musst dich anmelden, um diese Funktion nutzen zu können.', message.chat.id);
        }
    }

    if (message.text == '/start') {
        sendTelegramMessage('Hallo. Bitte melde dich mittels _/login <password>_ an, um einer Veranstaltung beizutreten oder eine Veranstaltung zu erstellen.', message.chat.id);
    }

    if (message.text == `/login ${authcode}`) {
        if (!chats.includes(message.chat.id)) {
            chats.push(message.chat.id);

            let exists = false;
            for (let i = 0; i < userData.length; i++) {
                if (userData[i].id == message.chat.id)
                    exists = true;
            }

            let username = 'No Username';
            if (message.chat.username)
                username = message.chat.username;

            if (!exists) {
                let user = {
                    id: message.chat.id,
                    name: username,
                    events: []
                };
                userData.push(user);
                updateUserFile();
            }
            
            sendTelegramMessage('Du hast dich erfolgreich angemeldet.\n\nDu kannst nun einer Veranstaltung über den Befehl _/join <name>_ beitreten oder selbst eine Veranstaltung mittels _/create <name> <ort>_ erstellen.', message.chat.id);
            console.log('[*] Ein Telegram-Nutzer hat sich angemeldet.');
        } else {
            sendTelegramMessage('Du bist bereits angemeldet.', message.chat.id);
        }
    }

    if (message.text.startsWith('/join')) {
        if (chats.includes(message.chat.id)) {
            let split = message.text.split(' ');
            if (split.length != 2) {
                sendTelegramMessage('Syntax: /join <name>', message.chat.id);
            } else {
                let eventname = split[1];

                let exists = false;
                for (let i = 0; i < eventData.length; i++) {
                    if (eventData[i].name == eventname)
                        exists = true;
                }

                if (!exists) {
                    sendTelegramMessage(`Die Veranstaltung mit dem Namen _${eventname}_ existiert nicht!`, message.chat.id);
                } else {
                    for (let i = 0; i < userData.length; i++) {
                        if (userData[i].id == message.chat.id) {
                            if (userData[i].events.includes(eventname)) {
                                sendTelegramMessage(`Du bist der Veranstaltung _${eventname}_ bereits beigetreten.`, message.chat.id);
                            } else {
                                userData[i].events.push(eventname);
                                updateUserFile();
                                sendTelegramMessage(`Du bist der Veranstaltung _${eventname}_ erfolgreich beigetreten.`, message.chat.id);
                                console.log('[*] Ein Telegram-Nutzer ist einer Veranstaltung beigetreten.');
                            }
                        }
                    }
                }
            }
        } else {
            sendTelegramMessage('Du musst dich anmelden, um diese Funktion nutzen zu können.', message.chat.id);
        }
    }

    if (message.text.startsWith('/create')) {
        if (chats.includes(message.chat.id)) {
            let split = message.text.split(' ');
            if (split.length != 3) {
                sendTelegramMessage('Syntax: /create <name> <ort>', message.chat.id);
            } else {
                let eventname = split[1].toLowerCase();

                let exists = false;
                for (let i = 0; i < eventData.length; i++) {
                    if (eventData[i].name == eventname)
                        exists = true;
                }

                if (exists) {
                    sendTelegramMessage('Eine Veranstaltung mit diesem Namen existiert bereits.', message.chat.id);
                } else {
                    let event = {
                        owner: message.chat.id,
                        name: eventname,
                        created: Date.now(),
                        location: split[2]
                    };
                    eventData.push(event);
                    updateEventFile();
                    sendTelegramMessage('Die Veranstaltung wurde erfolgreich erstellt.', message.chat.id);

                    for (let i = 0; i < userData.length; i++) {
                        if (userData[i].id == message.chat.id)
                            userData[i].events.push(eventname);
                    }
                    updateUserFile();
                }
            }
        } else {
            sendTelegramMessage('Du musst dich anmelden, um diese Funktion nutzen zu können.', message.chat.id);
        }
    }

    if (message.text == `/events`) {
        let eventnames = [];
        for (let k = 0; k < eventData.length; k++) {
            eventnames.push(eventData[k].name);
        }
        sendTelegramMessage(`Es gibt zur Zeit ${eventData.length} Event${eventData.length > 1 ? 's' : ''}: ${eventnames.join(', ')}`, message.chat.id);
    }
});

function updateUserFile() {
    fs.writeFile(userFile, JSON.stringify(userData, null, 4), 'utf8', (err) => {
        if (err) throw err;
        console.log("[*] User File Updated.");
    });
}

function updateEventFile() {
    fs.writeFile(eventFile, JSON.stringify(eventData, null, 4), 'utf8', (err) => {
        if (err) throw err;
        console.log("[*] Event File Updated.");
    });
}