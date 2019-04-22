const amqp = require('amqplib/callback_api');

const readline = require('readline').createInterface(
  {
    input: process.stdin,
    output: process.stdout
  }
);
befehlaufforderung();

function befehlaufforderung(){
  // readline.question('Bitte gebe einen Befehl ein:', (name)=>{
    // sendMessage(name);
    // readline.close();
  // });
  sendMessage('1');
}
  
function sendMessage(msg1){
  var msg = process.argv.slice(2).join(' ') || "Hello ...!";
  amqp.connect('amqp://localhost', function(err, conn) {
    conn.createChannel(function(err, ch) {
      var channelname = 'Chatconnect';
      ch.assertQueue(channelname, {durable: true});
      ch.sendToQueue(channelname, Buffer.from(msg), {persistent: true});
      console.log(" [x] Sent %s", msg);
    });
    setTimeout(function() { conn.close(); process.exit(0) }, 500);
  });
}

