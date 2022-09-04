const newday01 = require('newday01');
const http = require('http');
const NewSockets = require('newsockets');

const port = 6969;
const server = http.createServer(newday01);
const ns = new NewSockets.Server({ server })
const $ = newday01();

ns.on('connection', function connection(ns) {
  ns.on('message', function incoming(data) {
    ns.clients.forEach(function each(client) {
      if (client !== ns && client.readyState === NewSockets.OPEN) {
        client.send(data);
      }
    })
  })
})

server.listen(port, function() {
  console.log(`Server is listening on ${port}!`)
})

