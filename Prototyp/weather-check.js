// RabbitMQ
const amqp = require('amqplib/callback_api');

// Globals
const listener = 'weather-check';
const listener_topics = ['telegram'];
const topic = 'weather-check';

// Weather Channel Listener
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

// OpenWeatherMap API
const request = require('request');
const apiKey = 'a28f1339b0f555fc2f7ca45ab124d37e';
var city = 'Gummersbach';
var currentTemp;

function checkWeather(city) {
    let url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&appid=${apiKey}`;

    request(url, function (err, response, body) {
        if (err) throw err;
        let weather = JSON.parse(body);
        let temp = weather.main.temp;

        if (currentTemp != temp) {
            currentTemp = temp;
            sendRMQMessage('telegram-module', currentTemp.toString());
        }

        setTimeout(function() {
            process.exit(0)
        }, 60);
    });
}
checkWeather(city);
