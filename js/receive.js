var amqp = require('amqplib/callback_api');

amqp.connect('amqp://localhost', function(err, conn) {
  conn.createChannel(function(err, ch) {
    var channelname = 'Chatconnect';

    ch.assertQueue(channelname, {durable: true});
    ch.prefetch(1);

    console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", channelname);
    ch.consume(channelname, function(msg) {
      var secs = msg.content.toString().split('.').length - 1;

        // if(msg.content.toString() == 'Login')
        console.log(" [x] Received %s erfolgreich", msg.content.toString());
      
        setTimeout(function() {
          console.log(" [x] Done");
          ch.ack(msg);
        }, secs * 1000);
      }
    );
  });
});