// RabbitMQ
const amqp = require('amqplib/callback_api');

// Globals
const listener = 'telegram-module';
const listener_topics = ['server'];
const topic = 'telegram';

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

            console.log(' [*] Listening On: ' + listener);

            listener_topics.forEach(function(key) {
                channel.bindQueue(q.queue, listener, key);
            });

            channel.consume(q.queue, function(msg) {
                console.log(" [x] Received Via '%s':'%s'", msg.fields.routingKey, msg.content.toString());

                if (msg.fields.routingKey == 'server') {
                    console.log(' [*] Got a new Server Response! Sending to Clients.');
                    sendTelegramMessageAll(msg.content.toString());
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
            console.log(" [x] Sent To '%s' (%s): '%s'", listener, topic, msg);
        });

        setTimeout(function() {
            connection.close();
        }, 500);
    });
}

// Telegram Bot
const telegram = require('telegram-bot-api');
const telegramBot = new telegram({
    token: '779256204:AAEN52D3wPIXQsi_I96MAST4dr427bysl0M',
    updates: {
        enabled: true
    }
});
const authcode = 'webdev';
var chats = [];

telegramBot.getMe().then(function(data) {
    console.log(' [*] Telegram Module Running...');
}).catch(function(err) {
    if (err) throw err;
});

function sendTelegramMessage(msg, chatID) {
    telegramBot.sendMessage({
        chat_id: chatID,
        text: msg,
        parse_mode: 'MarkDown'
    }).then(function(message) {
        //console.log(' [X] Telegram Message Sent.');
    }).catch(function(err) {
        if (err) throw err;
    });
}

function sendTelegramMessageAll(msg) {
    if (chats.length > 0) {
        for (let i = 0; i < chats.length; i++) {
            sendTelegramMessage(msg, chats[i]);
        }
    }
}

telegramBot.on('message', function(message) {
    if (message.text == '/start') {
        sendTelegramMessage('Hello. Please use _/login <password>_ to subscribe to a service.', message.chat.id);
    }

    if (message.text == `/login ${authcode}`) {
        if (!chats.includes(message.chat.id)) {
            chats.push(message.chat.id);
            sendTelegramMessage('You have successfully subscribed to the Service.', message.chat.id);
            
            console.log(' [*] A new Telegram-User has subscribed to the Service.');
            sendRMQMessage('server-module', 'A new Telegram-User has subscribed to the Service.');
        }
    }
});