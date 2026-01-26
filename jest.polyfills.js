// Polyfills that need to be set before any other modules load
// This file is loaded via setupFiles (runs before setupFilesAfterEnv)

const { TextEncoder, TextDecoder } = require('util');
const { webcrypto } = require('crypto');
const path = require('path');
const { ReadableStream, WritableStream, TransformStream } = require('stream/web');
const { MessageChannel, MessagePort } = require('worker_threads');
const { Blob } = require('buffer');

// Set text encoding globals
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.crypto = webcrypto;

// Set Web Streams globals
global.ReadableStream = ReadableStream;
global.WritableStream = WritableStream;
global.TransformStream = TransformStream;

// Set worker globals
global.MessageChannel = MessageChannel;
global.MessagePort = MessagePort;

// Set Blob
global.Blob = Blob;

// Set DATA_DIR to tests/data for all tests
process.env.DATA_DIR = path.join(process.cwd(), 'tests', 'data');

// Set test NOSTR_NSEC for tests that need it
if (!process.env.NOSTR_NSEC) {
  // Test nsec - DO NOT use in production!
  process.env.NOSTR_NSEC = 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5';
}
