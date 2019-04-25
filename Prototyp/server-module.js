// RabbitMQ
const amqp = require('amqplib/callback_api');

// Globals
const listener = 'server-module';
const listener_topics = ['weather', 'telegram'];
const topic = 'server';

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

            console.log(' [*] Listening On: ' + listener);

            listener_topics.forEach(function(key) {
                channel.bindQueue(q.queue, listener, key);
            });

            // React to Messages
            channel.consume(q.queue, function(msg) {
                console.log(" [x] Received Via '%s':'%s'", msg.fields.routingKey, msg.content.toString());

                // React to Weather Service
                if (msg.fields.routingKey == 'weather') {
                    console.log(' [*] Temperature has changed! Informing Telegram Users.');
                    sendRMQMessage('telegram-module', `The temperature at the venue has changed to _${msg.content.toString()} °C_.`);
                }
                // React to Telegram Wheather Update Service
                if (msg.fields.routingKey == 'telegram') {
                    console.log(' [*] Informing Telegram Users about Temperature.');
                    //REQUEST WEATHER
                    sendRMQMessage('telegram-module', `The temperature at the venue has changed to _${msg.content.toString()} °C_.`);
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
            console.log(" [x] Sent To '%s' (%s): '%s'", listener, topic, msg);
        });

        setTimeout(function() {
            connection.close();
        }, 500);
    });
}