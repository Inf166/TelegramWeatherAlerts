// RabbitMQ
const amqp = require('amqplib/callback_api');

// Globals
const listener = 'weather-module';
const listener_topics = ['broker'];
const topic = 'weather';

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

            console.log('[*] Listening On: ' + listener);

            listener_topics.forEach(function(key) {
                channel.bindQueue(q.queue, listener, key);
            });

            channel.consume(q.queue, function(msg) {
                console.log("[x] Received Via '%s':'%s'", msg.fields.routingKey, msg.content.toString());
            }, {
                noAck: true
            });
        });
    });
});

// Send RabbitMQ Message
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

// Create Event Handlers
const events = require('events');
const eventEmitter = new events.EventEmitter();

var eventWeatherUpdate = function(city, temp, humidity) {
    sendRMQMessage('broker-module', `${city}:${temp}:${humidity}`);
}
eventEmitter.on('weatherUpdate', eventWeatherUpdate);

// OpenWeatherMap API
const fs = require('fs');
const request = require('request');
const apiKey = 'a28f1339b0f555fc2f7ca45ab124d37e';
const eventFile = 'events.json';
var cities = [];
var currentWeather = [];

function checkWeather(city) {
    let url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&appid=${apiKey}`;

    request(url, function (err, response, body) {
        if (err) throw err;
        let weather = JSON.parse(body);

        let newTemp = Math.floor(weather.main.temp);
        let newHumidity = Math.floor(weather.main.humidity);

        if (currentWeather[city].temp != newTemp || currentWeather[city].humidity != newHumidity) {
            currentWeather[city].temp = newTemp;
            currentWeather[city].humidity = newHumidity;
            eventEmitter.emit('weatherUpdate', city, newTemp, newHumidity);
        } else {
            console.log(`[*] ${city} - No Update.`);
        }
    });
}

function getCities() {
    if (fs.existsSync(eventFile)) {
        console.log('[*] Event Data Found.');
        fs.readFile(eventFile, 'utf8', (err, data) => {
            if (err) throw err;
            eventData = JSON.parse(data);
            for (let i = 0; i < eventData.length; i++) {
                if (!cities.includes(eventData[i].location))
                    cities.push(eventData[i].location);

                if (!currentWeather[eventData[i].location])
                    currentWeather[eventData[i].location] = {temp: 0, humidity: 0};
            }

            if (cities.length != 0) {
                console.log(`[*] Checking Weather in ${cities.length} Cities.`);
                for (let j = 0; j < cities.length; j++) {
                    checkWeather(cities[j]);
                }
            }
        });
    } else {
        console.log('[X] No Existing Event Data.');
    }

    setTimeout(function() {
        getCities();
    }, 1000 * 60);
}
getCities();
console.log('[*] Weather Service Running...');