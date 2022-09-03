'use strict';

module.exports = {
  BINARY_TYPES: ['nodebuffer', 'arraybuffer', 'fragments'],
  GUID: '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',
  kStatusCode: Symbol('status-code'),
  kNewSockets: Symbol('newsockets'),
  EMPTY_BUFFER: Buffer.alloc(0),
  NOOP: () => {}
};
