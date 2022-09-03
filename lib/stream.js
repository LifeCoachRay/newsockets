'use strict';

const { Duplex } = require('stream');

/**
 * Emits the `'close'` event on a stream.
 *
 * @param {Duplex} stream The stream.
 * @private
 */
function emitClose(stream) {
  stream.emit('close');
}

/**
 * The listener of the `'end'` event.
 *
 * @private
 */
function duplexOnEnd() {
  if (!this.destroyed && this._writableState.finished) {
    this.destroy();
  }
}

/**
 * The listener of the `'error'` event.
 *
 * @param {Error} err The error
 * @private
 */
function duplexOnError(err) {
  this.removeListener('error', duplexOnError);
  this.destroy();
  if (this.listenerCount('error') === 0) {
    // Do not suppress the throwing behavior.
    this.emit('error', err);
  }
}

/**
 * Wraps a `NewSockets` in a duplex stream.
 *
 * @param {NewSockets} ns The `NewSockets` to wrap
 * @param {Object} [options] The options for the `Duplex` constructor
 * @return {Duplex} The duplex stream
 * @public
 */
function createNewSocketsStream(ns, options) {
  let resumeOnReceiverDrain = true;
  let terminateOnDestroy = true;

  function receiverOnDrain() {
    if (resumeOnReceiverDrain) ns._socket.resume();
  }

  if (ns.readyState === ns.CONNECTING) {
    ns.once('open', function open() {
      ns._receiver.removeAllListeners('drain');
      ns._receiver.on('drain', receiverOnDrain);
    });
  } else {
    ns._receiver.removeAllListeners('drain');
    ns._receiver.on('drain', receiverOnDrain);
  }

  const duplex = new Duplex({
    ...options,
    autoDestroy: false,
    emitClose: false,
    objectMode: false,
    writableObjectMode: false
  });

  ns.on('message', function message(msg) {
    if (!duplex.push(msg)) {
      resumeOnReceiverDrain = false;
      ns._socket.pause();
    }
  });

  ns.once('error', function error(err) {
    if (duplex.destroyed) return;

    // Prevent `ns.terminate()` from being called by `duplex._destroy()`.
    //
    // - If the `'error'` event is emitted before the `'open'` event, then
    //   `ns.terminate()` is a noop as no socket is assigned.
    // - Otherwise, the error is re-emitted by the listener of the `'error'`
    //   event of the `Receiver` object. The listener already closes the
    //   connection by calling `ns.close()`. This allows a close frame to be
    //   sent to the other peer. If `ns.terminate()` is called right after this,
    //   then the close frame might not be sent.
    terminateOnDestroy = false;
    duplex.destroy(err);
  });

  ns.once('close', function close() {
    if (duplex.destroyed) return;

    duplex.push(null);
  });

  duplex._destroy = function (err, callback) {
    if (ns.readyState === ns.CLOSED) {
      callback(err);
      process.nextTick(emitClose, duplex);
      return;
    }

    let called = false;

    ns.once('error', function error(err) {
      called = true;
      callback(err);
    });

    ns.once('close', function close() {
      if (!called) callback(err);
      process.nextTick(emitClose, duplex);
    });

    if (terminateOnDestroy) ws.terminate();
  };

  duplex._final = function (callback) {
    if (ns.readyState === ns.CONNECTING) {
      ns.once('open', function open() {
        duplex._final(callback);
      });
      return;
    }

    // If the value of the `_socket` property is `null` it means that `ns` is a
    // client newsockets and the handshake failed. In fact, when this happens, a
    // socket is never assigned to the newsockets. Wait for the `'error'` event
    // that will be emitted by the newsockets.
    if (ns._socket === null) return;

    if (ns._socket._writableState.finished) {
      callback();
      if (duplex._readableState.endEmitted) duplex.destroy();
    } else {
      ns._socket.once('finish', function finish() {
        // `duplex` is not destroyed here because the `'end'` event will be
        // emitted on `duplex` after this `'finish'` event. The EOF signaling
        // `null` chunk is, in fact, pushed when the newsockets emits `'close'`.
        callback();
      });
      ns.close();
    }
  };

  duplex._read = function () {
    if (
      (ns.readyState === ns.OPEN || ns.readyState === ns.CLOSING) &&
      !resumeOnReceiverDrain
    ) {
      resumeOnReceiverDrain = true;
      if (!ns._receiver._writableState.needDrain) ns._socket.resume();
    }
  };

  duplex._write = function (chunk, encoding, callback) {
    if (ns.readyState === ns.CONNECTING) {
      ns.once('open', function open() {
        duplex._write(chunk, encoding, callback);
      });
      return;
    }

    ns.send(chunk, callback);
  };

  duplex.on('end', duplexOnEnd);
  duplex.on('error', duplexOnError);
  return duplex;
}

module.exports = createNewSocketsStream;
