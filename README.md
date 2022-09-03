# Ns: a Node.js NewSockets library

NS is a simple to use, blazing fast, and thoroughly tested NewSockets client and
server implementation. A WebSocket Fork.

Passes the quite extensive Autobahn test suite: [server][server-report],
[client][client-report].

**Note**: This module does not work in the browser. The client in the docs is a
reference to a back end with the role of a client in the NewSockets
communication. To make the same code work seamlessly on Node.js and the browser, you
can use one of the many wrappers available on npm, like
[isomorphic-ns](https://github.com/heineiuo/isomorphic-ns).

## Table of Contents

- [Protocol support](#protocol-support)
- [Installing](#installing)
  - [Opt-in for performance](#opt-in-for-performance)
- [API docs](#api-docs)
- [NewSockets compression](#newsockets-compression)
- [Usage examples](#usage-examples)
  - [Sending and receiving text data](#sending-and-receiving-text-data)
  - [Sending binary data](#sending-binary-data)
  - [Simple server](#simple-server)
  - [External HTTP/S server](#external-https-server)
  - [Multiple servers sharing a single HTTP/S server](#multiple-servers-sharing-a-single-https-server)
  - [Client authentication](#client-authentication)
  - [Server broadcast](#server-broadcast)
  - [Use the Node.js streams API](#use-the-nodejs-streams-api)
  - [Other examples](#other-examples)
- [FAQ](#faq)
  - [How to get the IP address of the client?](#how-to-get-the-ip-address-of-the-client)
  - [How to detect and close broken connections?](#how-to-detect-and-close-broken-connections)
  - [How to connect via a proxy?](#how-to-connect-via-a-proxy)
- [Changelog](#changelog)
- [License](#license)

## Protocol support

- **HyBi drafts 07-12** (Use the option `protocolVersion: 8`)
- **HyBi drafts 13-17** (Current default, alternatively option
  `protocolVersion: 13`)

## Installing

```
npm install newsockets
```

### Opt-in for performance

There are 2 optional modules that can be installed along side with the ns
module. These modules are binary addons which improve certain operations.
Prebuilt binaries are available for the most popular platforms so you don't
necessarily need to have a C++ compiler installed on your machine.

- `npm install --save-optional bufferutil`: Allows to efficiently perform
  operations such as masking and unmasking the data payload of the NewSockets
  frames.
- `npm install --save-optional utf-8-validate`: Allows to efficiently check if a
  message contains valid UTF-8.

## API docs

See [`/doc/newsockets.md`](./doc/newsockets.md) for Node.js-like documentation of ns classes and
utility functions.

## NewSockets compression

NS supports the [permessage-deflate extension][permessage-deflate] which enables
the client and server to negotiate a compression algorithm and its parameters,
and then selectively apply it to the data payloads of each NewSockets message.

The extension is disabled by default on the server and enabled by default on the
client. It adds a significant overhead in terms of performance and memory
consumption so we suggest to enable it only if it is really needed.

Note that Node.js has a variety of issues with high-performance compression,
where increased concurrency, especially on Linux, can lead to [catastrophic
memory fragmentation][node-zlib-bug] and slow performance. If you intend to use
permessage-deflate in production, it is worthwhile to set up a test
representative of your workload and ensure Node.js/zlib will handle it with
acceptable performance and memory usage.

Tuning of permessage-deflate can be done via the options defined below. You can
also use `zlibDeflateOptions` and `zlibInflateOptions`, which is passed directly
into the creation of [raw deflate/inflate streams][node-zlib-deflaterawdocs].

```js
const NewSockets = require('ns');

const ns = new NewSockets.Server({
  port: 8080,
  perMessageDeflate: {
    zlibDeflateOptions: {
      // See zlib defaults.
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    // Other options settable:
    clientNoContextTakeover: true, // Defaults to negotiated value.
    serverNoContextTakeover: true, // Defaults to negotiated value.
    serverMaxWindowBits: 10, // Defaults to negotiated value.
    // Below options specified as default values.
    concurrencyLimit: 10, // Limits zlib concurrency for perf.
    threshold: 1024 // Size (in bytes) below which messages
    // should not be compressed.
  }
});
```

The client will only use the extension if it is supported and enabled on the
server. To always disable the extension on the client set the
`perMessageDeflate` option to `false`.

```js
const NewSockets = require('ns');

const ns = new NewSockets('ns://www.host.com/path', {
  perMessageDeflate: false
});
```

## Usage examples

### Sending and receiving text data

```js
const NewSockets = require('ns');

const ns = new NewSockets('ns://www.host.com/path');

ns.on('open', function open() {
  ns.send('something');
});

ns.on('message', function incoming(data) {
  console.log(data);
});
```

### Sending binary data

```js
const NewSockets = require('ns');

const ns = new NewSockets('ns://www.host.com/path');

ns.on('open', function open() {
  const array = new Float32Array(5);

  for (var i = 0; i < array.length; ++i) {
    array[i] = i / 2;
  }

  ns.send(array);
});
```

### Simple server

```js
const NewSockets = require('nss');

const nss = new NewSockets.Server({ port: 8080 });

nss.on('connection', function connection(ws) {
  ns.on('message', function incoming(message) {
    console.log('received: %s', message);
  });

  ns.send('something');
});
```

### External HTTP/S server

```js
const fs = require('fs');
const https = require('https');
const NewSockets = require('ns');

const server = https.createServer({
  cert: fs.readFileSync('/path/to/cert.pem'),
  key: fs.readFileSync('/path/to/key.pem')
});
const nss = new NewSockets.Server({ server });

nss.on('connection', function connection(ns) {
  ns.on('message', function incoming(message) {
    console.log('received: %s', message);
  });

  ns.send('something');
});

server.listen(8080);
```

### Multiple servers sharing a single HTTP/S server

```js
const http = require('http');
const NewSockets = require('ns');
const url = require('url');

const server = http.createServer();
const nss1 = new NewSockets.Server({ noServer: true });
const nss2 = new NewSockets.Server({ noServer: true });

nss1.on('connection', function connection(ns) {
  // ...
});

nss2.on('connection', function connection(ns) {
  // ...
});

server.on('upgrade', function upgrade(request, socket, head) {
  const pathname = url.parse(request.url).pathname;

  if (pathname === '/foo') {
    nss1.handleUpgrade(request, socket, head, function done(ns) {
      nss1.emit('connection', ns, request);
    });
  } else if (pathname === '/bar') {
    nss2.handleUpgrade(request, socket, head, function done(ns) {
      nss2.emit('connection', ns, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(8080);
```

### Client authentication

```js
const http = require('http');
const NewSockets = require('ns');

const server = http.createServer();
const nss = new NewSockets.Server({ noServer: true });

nss.on('connection', function connection(ns, request, client) {
  ns.on('message', function message(msg) {
    console.log(`Received message ${msg} from user ${client}`);
  });
});

server.on('upgrade', function upgrade(request, socket, head) {
  // This function is not defined on purpose. Implement it with your own logic.
  authenticate(request, (err, client) => {
    if (err || !client) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    nss.handleUpgrade(request, socket, head, function done(ns) {
      nss.emit('connection', ns, request, client);
    });
  });
});

server.listen(8080);
```

### Server broadcast

A client NewSockets broadcasting to all connected NewSockets clients, including
itself.

```js
const NewSockets = require('ns');

const nss = new NewSockets.Server({ port: 8080 });

nss.on('connection', function connection(ns) {
  ns.on('message', function incoming(data) {
    nss.clients.forEach(function each(client) {
      if (client.readyState === NewSockets.OPEN) {
        client.send(data);
      }
    });
  });
});
```

A client NewSockets broadcasting to every other connected NewSockets clients,
excluding itself.

```js
const NewSockets = require('ns');

const nss = new NewSockets.Server({ port: 8080 });

nss.on('connection', function connection(ns) {
  ns.on('message', function incoming(data) {
    nss.clients.forEach(function each(client) {
      if (client !== ns && client.readyState === NewSockets.OPEN) {
        client.send(data);
      }
    });
  });
});
```

```js
const NewSockets = require('ns');

const ns = new NewSockets('nss://puzzleartcollection.website/', {
  origin: 'https://puzzleartcollection.website'
});

ns.on('open', function open() {
  console.log('connected');
  ns.send(Date.now());
});

ns.on('close', function close() {
  console.log('disconnected');
});

ns.on('message', function incoming(data) {
  console.log(`Roundtrip time: ${Date.now() - data} ms`);

  setTimeout(function timeout() {
    ns.send(Date.now());
  }, 500);
});
```

### Use the Node.js streams API

```js
const NewSockets = require('ns');

const ns = new NewSockets('nss://puzzleartcollection.website/', {
  origin: 'https://puzzleartcollection.website'
});

const duplex = NewSockets.createNewSocketsStream(ns, { encoding: 'utf8' });

duplex.pipe(process.stdout);
process.stdin.pipe(duplex);
```

### Other examples

For a full example with a browser client communicating with a ns server, see the
examples folder.

Otherwise, see the test cases.

## FAQ

### How to get the IP address of the client?

The remote IP address can be obtained from the raw socket.

```js
const NewSockets = require('ns');

const nss = new NewSockets.Server({ port: 8080 });

nss.on('connection', function connection(ns, req) {
  const ip = req.socket.remoteAddress;
});
```

When the server runs behind a proxy like NGINX, the de-facto standard is to use
the `X-Forwarded-For` header.

```js
nss.on('connection', function connection(ns, req) {
  const ip = req.headers['x-forwarded-for'].split(',')[0].trim();
});
```

### How to detect and close broken connections?

Sometimes the link between the server and the client can be interrupted in a way
that keeps both the server and the client unaware of the broken state of the
connection (e.g. when pulling the cord).

In these cases ping messages can be used as a means to verify that the remote
endpoint is still responsive.

```js
const NewSockets = require('ns');

function noop() {}

function heartbeat() {
  this.isAlive = true;
}

const nss = new NewSockets.Server({ port: 8080 });

nss.on('connection', function connection(ns) {
  ns.isAlive = true;
  ns.on('pong', heartbeat);
});

const interval = setInterval(function ping() {
  nss.clients.forEach(function each(ns) {
    if (ns.isAlive === false) return ns.terminate();

    ns.isAlive = false;
    ns.ping(noop);
  });
}, 30000);

nss.on('close', function close() {
  clearInterval(interval);
});
```

Pong messages are automatically sent in response to ping messages as required by
the spec.

Just like the server example above your clients might as well lose connection
without knowing it. You might want to add a ping listener on your clients to
prevent that. A simple implementation would be:

```js
const NewSockets = require('ns');

function heartbeat() {
  clearTimeout(this.pingTimeout);

  // Use `NewSockets#terminate()`, which immediately destroys the connection,
  // instead of `NewSockets#close()`, which waits for the close timer.
  // Delay should be equal to the interval at which your server
  // sends out pings plus a conservative assumption of the latency.
  this.pingTimeout = setTimeout(() => {
    this.terminate();
  }, 30000 + 1000);
}

const client = new NewSockets('nss://puzzleartcollection.website/');

client.on('open', heartbeat);
client.on('ping', heartbeat);
client.on('close', function clear() {
  clearTimeout(this.pingTimeout);
});
```

### How to connect via a proxy?

Use a custom `http.Agent` implementation.

## Changelog

We're using the GitHub [releases][changelog] for changelog entries.

## License

[MIT](LICENSE)
