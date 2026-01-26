// Note: TextEncoder/TextDecoder and crypto are set in jest.polyfills.js (setupFiles)

// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Add Web API polyfills for Node.js test environment
// These need TextEncoder/TextDecoder to already be defined (done in jest.polyfills.js)
import { Request, Response, Headers, fetch } from 'undici';

// Add Web API globals
global.Request = Request;
global.Response = Response;
global.Headers = Headers;
global.fetch = fetch;

