// RabbitMQ
const amqp = require('amqplib/callback_api');

// Globals
const listener = 'discord-module';
const listener_topics = ['broker'];
const topic = 'discord';

// Data Files
const fs = require('fs');
const eventFile = 'events.json';
const userFile = 'users_discord.json';

var eventData = [];
var userData = [];

function checkEventFile() {
    if (fs.existsSync(eventFile)) {
        console.log('[*] Event Data Found.');
        fs.readFile(eventFile, 'utf8', (err, data) => {
            if (err) throw err;
            eventData = JSON.parse(data);
            console.log(`[*] Got ${eventData.length} Events.`);
        });
    } else {
        console.log('[X] No Existing Event Data.');
    }

    setTimeout(checkEventFile, 1000 * 30);
}
checkEventFile();

if (fs.existsSync(userFile)) {
    console.log('[*] User Data Found.');
    fs.readFile(userFile, 'utf8', (err, data) => {
        if (err) throw err;
        userData = JSON.parse(data);
    });
} else {
    console.log('[X] No Existing User Data.');
}

function updateUserFile() {
    fs.writeFile(userFile, JSON.stringify(userData, null, 4), 'utf8', (err) => {
        if (err) throw err;
        console.log("[*] User File Updated.");
    });
}

// Discord Channel Listener
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
                        sendDiscordWeatherUpdate(`Die Wetterbedingungen in ${city} haben sich geändert. Die Temperatur beträgt ${temp}°C und es herrscht eine Luftfeuchtigkeit von ${humidity}%.`);
                    } else if (reason == 'chat') {
                        let event = split[1];
                        let author = split[2];
                        let text = split[3];
                        sendDiscordChatMessage(event, author, text);
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

// Discord BOT API
const discord = require('discord.js');
const discordClient = new discord.Client();
const discordToken = 'REMOVED';
const authcode = 'webdev';

const defaultchannel = 'REMOVED';
const weatherchannel = 'REMOVED';

discordClient.on('ready', () => {
  console.log(`[*] Logged into Discord as ${discordClient.user.tag}.`);
});

discordClient.on('message', msg => {
    let text = msg.content;
    let type = msg.channel.type;

    // Normal Message
    if (msg.content.indexOf('/') !== 0) {
        if (type == 'dm') { // DM

        } else if (type == 'text') { // Channel Message
            // Check if channel 'allgemein'
            if (msg.channel.id == defaultchannel) {
                if (msg.content.startsWith('+')) { // Chat Message
                    if (!msg.author.bot) { // Dont react to Bot Messages LOL
                        let args = msg.content.slice(1).trim().split(/ +/g);
                        let event = args.shift().toLowerCase();
                        
                        for (let i = 0; i < userData.length; i++) {
                            if (userData[i].id == msg.author.id) {
                                if (userData[i].events.includes(event)) {
                                    let author = msg.author.username;
                                    let text = args.join(' ');
                                    sendRMQMessage('broker-module', `chat:${event}:${author}:${text}`);
                                } else {
                                    msg.reply('Du bist kein Mitglied dieser Veranstaltung.');
                                }
                            }
                        }
                    }
                }
            }
        }
    } else { // Command
        let args = msg.content.slice(1).trim().split(/ +/g);
        let command = args.shift().toLowerCase();
    
        if (type == 'dm') { // DM
            if (command === 'register') {
                if (args.length != 1) {
                    msg.reply('Syntax: /register <password>');
                } else {
                    let pw = args.join();
                    if (pw == authcode) {

                        let exists = false;
                        for (let i = 0; i < userData.length; i++) {
                            if (userData[i].id == msg.author.id)
                                exists = true;
                        }
            
                        if (!exists) {
                            let user = {
                                id: msg.author.id,
                                name: msg.author.username,
                                events: []
                            };
                            userData.push(user);
                            updateUserFile();
                        }

                        msg.reply('Du hast dich erfolgreich registriert.');
                    } else {
                        msg.reply('Das Passwort ist falsch.');
                    }
                }
            } else if (command === 'join') {
                if (args.length != 1) {
                    msg.reply('Syntax: /join <name>');
                } else {
                    let eventname = args.join();

                    let exists = false;
                    for (let i = 0; i < eventData.length; i++) {
                        if (eventData[i].name == eventname)
                            exists = true;
                    }

                    if (!exists) {
                        msg.reply(`Die Veranstaltung mit dem Namen ${eventname} existiert nicht.`);
                    } else {
                        for (let i = 0; i < userData.length; i++) {
                            if (userData[i].id == msg.author.id) {
                                if (userData[i].events.includes(eventname)) {
                                    msg.reply(`Du bist der Veranstaltung _${eventname}_ bereits beigetreten.`);
                                } else {
                                    userData[i].events.push(eventname);
                                    updateUserFile();
                                    msg.reply(`Du bist der Veranstaltung _${eventname}_ erfolgreich beigetreten.`);
                                    console.log('[*] Ein Discord-Nutzer ist einer Veranstaltung beigetreten.');
                                }
                            }
                        }
                    }
                }
            }
        } else if (type == 'text') { // Channel Message
            if (command === 'register') {
                msg.reply('Bitte verwende eine Direktnachricht um dich zu registrieren.');
            } else if (command === 'join') {
                if (args.length != 1) {
                    msg.reply('Syntax: /join <name>');
                } else {
                    let eventname = args.join();

                    let exists = false;
                    for (let i = 0; i < eventData.length; i++) {
                        if (eventData[i].name == eventname)
                            exists = true;
                    }

                    if (!exists) {
                        msg.reply(`Die Veranstaltung mit dem Namen ${eventname} existiert nicht.`);
                    } else {
                        for (let i = 0; i < userData.length; i++) {
                            if (userData[i].id == msg.author.id) {
                                if (userData[i].events.includes(eventname)) {
                                    msg.reply(`Du bist der Veranstaltung _${eventname}_ bereits beigetreten.`);
                                } else {
                                    userData[i].events.push(eventname);
                                    updateUserFile();
                                    msg.reply(`Du bist der Veranstaltung _${eventname}_ erfolgreich beigetreten.`);
                                    console.log('[*] Ein Discord-Nutzer ist einer Veranstaltung beigetreten.');
                                }
                            }
                        }
                    }
                }
            }
        }
    }
});

discordClient.login(discordToken);
 
function sendDiscordWeatherUpdate(msg) {
    discordClient.channels.get(weatherchannel).send(msg);
}

function sendDiscordChatMessage(event, author, text) {
    discordClient.channels.get(defaultchannel).send(`(${event}) ${author}: ${text}`);
}