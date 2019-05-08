// RabbitMQ
const amqp = require('amqplib/callback_api');

// Globals
const listener = 'broker-module';
const listener_topics = ['weather', 'telegram', 'discord'];
const topic = 'broker';

// General Channel Listener
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

            // React to Messages
            channel.consume(q.queue, function(msg) {
                console.log("[x] Received Via '%s':'%s'", msg.fields.routingKey, msg.content.toString());

                let text = msg.content.toString();

                // React to Weather Service
                if (msg.fields.routingKey == 'weather') { // Weather Service
                    eventEmitter.emit('weatherUpdate', msg.content.toString());
                } else if (msg.fields.routingKey == 'discord') { // Discord Service
                    let split = text.split(':');
                    let reason = split[0];
                    console.log('[*] Reason: ' + reason);

                    if (reason == 'chat') {
                        let event = split[1];
                        let author = split[2];
                        let text = split[3];
                        sendChatMessageToOthers('discord', event, author, text);
                    }
                } else if (msg.fields.routingKey == 'telegram') { // Telegram Service
                    let split = text.split(':');
                    let reason = split[0];
                    console.log('[*] Reason: ' + reason);

                    if (reason == 'chat') {
                        let event = split[1];
                        let author = split[2];
                        let text = split[3];
                        sendChatMessageToOthers('telegram', event, author, text);
                    }
                }
            }, {
                noAck: true
            });
        });
    });
});

// Send Message to another Listener
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

// Event Handlers
const events = require('events');
const eventEmitter = new events.EventEmitter();

var eventWeatherUpdate = function(msg) {    
    // Send Weather Update to Telegram
    sendRMQMessage('telegram-module', `weather-update:${msg}`);
    // Send Weather Update to Discord
    sendRMQMessage('discord-module', `weather-update:${msg}`);
}
eventEmitter.on('weatherUpdate', eventWeatherUpdate);

function sendChatMessageToOthers(from, event, author, text) {
    switch (from) {
        case 'discord':
            sendRMQMessage('telegram-module', `chat:${event}:${author}:${text}`);
            break;
        case 'telegram':
            sendRMQMessage('discord-module', `chat:${event}:${author}:${text}`);
            break;
        default:
            break;
    }
}