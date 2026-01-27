/**
 * Integration test: publish booking events to Nostr relay
 *
 * Requires:
 * - NOSTR_NSEC env var (bech32, nsec1...) - MUST be a member of the pyramid relay
 * - Running relay at ws://localhost:3334
 *
 * What it tests:
 * - We can publish a calendar event (kind 31922) for a pending booking
 * - We can publish a payment request event (kind 1734) referencing the booking
 * - Both events are accepted by the relay (OK success=true)
 *
 * IMPORTANT: If tests fail with "not authorized", the NOSTR_NSEC key is not a relay member.
 * The key must be:
 * 1. The root key used to initialize the pyramid relay, OR
 * 2. A key that has been invited and joined via kind 28934
 *
 * @jest-environment node
 */

import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import WebSocket from 'ws';
import { finalizeEvent, getPublicKey, nip19, type EventTemplate } from 'nostr-tools';

// Load .env.test if NOSTR_NSEC not already set
if (!process.env.NOSTR_NSEC) {
  const envTestPath = path.join(__dirname, '..', '.env.test');
  if (fs.existsSync(envTestPath)) {
    const envContent = fs.readFileSync(envTestPath, 'utf-8');
    const match = envContent.match(/^NOSTR_NSEC=(.+)$/m);
    if (match) {
      process.env.NOSTR_NSEC = match[1].trim();
    }
  }
}

const RELAY_URL = 'ws://localhost:3334';
// For AUTH, use the same URL as connection (relay expects exact match)
const RELAY_AUTH_URL = process.env.NOSTR_RELAY_AUTH_URL || RELAY_URL;

// NOSTR kinds
const NOSTR_KINDS = {
  CALENDAR_EVENT: 31922,
  PAYMENT_REQUEST: 1734,
};

function isRelayReachableSync(url: string, timeoutMs: number = 500): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const port = Number(u.port || (u.protocol === 'wss:' ? '443' : '80'));
    if (!host || !Number.isFinite(port)) return false;

    const script = `
      const net = require('net');
      const s = net.connect({ host: ${JSON.stringify(host)}, port: ${port} });
      const t = setTimeout(() => { try { s.destroy(); } catch {} process.exit(1); }, ${timeoutMs});
      s.on('connect', () => { clearTimeout(t); try { s.end(); } catch {} process.exit(0); });
      s.on('error', () => { clearTimeout(t); process.exit(1); });
    `;

    const res = spawnSync(process.execPath, ['-e', script], { stdio: 'ignore' });
    return res.status === 0;
  } catch {
    return false;
  }
}

const HAS_SERVER_NSEC = !!process.env.NOSTR_NSEC;
const RELAY_REACHABLE = isRelayReachableSync(RELAY_URL, 800);
const SHOULD_RUN_INTEGRATION_TESTS = HAS_SERVER_NSEC && RELAY_REACHABLE;

if (!SHOULD_RUN_INTEGRATION_TESTS) {
  const reasons: string[] = [];
  if (!HAS_SERVER_NSEC) reasons.push('NOSTR_NSEC env var is not set');
  if (!RELAY_REACHABLE) reasons.push(`relay not reachable at ${RELAY_URL}`);
  console.warn(`[booking.nostr.test] Skipping tests: ${reasons.join('; ')}`);
}

function decodeNsecToSecretKey(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') {
    throw new Error(`Expected nsec bech32 string, got type="${decoded.type}"`);
  }
  if (!(decoded.data instanceof Uint8Array)) {
    return Uint8Array.from(decoded.data as unknown as number[]);
  }
  return decoded.data;
}

function waitForOpen(ws: WebSocket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      reject(new Error(`WebSocket open timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });

    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

type SubEnvelope =
  | { type: 'EVENT'; payload: [string, unknown] }
  | { type: 'EOSE'; payload: [] }
  | { type: 'CLOSED'; payload: [string] }
  | { type: 'NOTICE'; payload: [string] };

function waitForSubEnvelope(ws: WebSocket, subId: string, timeoutMs: number): Promise<SubEnvelope> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for subscription response after ${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!Array.isArray(msg) || msg.length < 2) return;
        const [type, ...rest] = msg;

        if (type === 'EOSE' && rest[0] === subId) {
          cleanup();
          resolve({ type: 'EOSE', payload: [] });
          return;
        }

        if (type === 'EVENT' && rest[0] === subId && rest.length >= 2) {
          cleanup();
          resolve({ type: 'EVENT', payload: [String(rest[0]), rest[1]] });
          return;
        }

        if (type === 'CLOSED' && rest[0] === subId) {
          const reason = typeof rest[1] === 'string' ? rest[1] : '';
          cleanup();
          resolve({ type: 'CLOSED', payload: [reason] });
          return;
        }

        if (type === 'NOTICE') {
          const notice = typeof rest[0] === 'string' ? rest[0] : '';
          cleanup();
          resolve({ type: 'NOTICE', payload: [notice] });
          return;
        }
      } catch {
        // ignore
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const onClose = () => {
      cleanup();
      reject(new Error('WebSocket closed before receiving subscription response'));
    };

    function cleanup() {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
      ws.off('close', onClose);
    }

    ws.on('message', onMessage);
    ws.once('error', onError);
    ws.once('close', onClose);
  });
}

function waitForAuthChallenge(ws: WebSocket, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for AUTH challenge after ${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!Array.isArray(msg) || msg.length < 2) return;
        const [type, challenge] = msg as [string, string];
        if (type !== 'AUTH' || typeof challenge !== 'string') return;
        cleanup();
        resolve(challenge);
      } catch {
        // ignore
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const onClose = () => {
      cleanup();
      reject(new Error('WebSocket closed before receiving AUTH challenge'));
    };

    function cleanup() {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
      ws.off('close', onClose);
    }

    ws.on('message', onMessage);
    ws.once('error', onError);
    ws.once('close', onClose);
  });
}

function waitForOk(
  ws: WebSocket,
  eventId: string,
  timeoutMs: number
): Promise<{ accepted: boolean; message: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      reject(new Error(`Timed out waiting for OK after ${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!Array.isArray(msg) || msg.length < 2) return;
        const [type, ...rest] = msg;
        if (type !== 'OK') return;

        const [id, accepted, message] = rest as [string, boolean, string];
        if (id !== eventId) return;

        cleanup();
        resolve({ accepted: !!accepted, message: String(message ?? '') });
      } catch {
        // ignore
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const onClose = () => {
      cleanup();
      reject(new Error('WebSocket closed before receiving OK'));
    };

    function cleanup() {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
      ws.off('close', onClose);
    }

    ws.on('message', onMessage);
    ws.once('error', onError);
    ws.once('close', onClose);
  });
}

async function authenticate(ws: WebSocket, secretKey: Uint8Array, challenge?: string): Promise<void> {
  const actualChallenge = challenge ?? (await waitForAuthChallenge(ws, 12_000));

  const authTemplate: EventTemplate = {
    kind: 22242,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['challenge', actualChallenge],
      ['relay', RELAY_AUTH_URL],
    ],
    content: '',
  };

  const authEvent = finalizeEvent(authTemplate, secretKey);
  ws.send(JSON.stringify(['AUTH', authEvent]));

  const ok = await waitForOk(ws, authEvent.id, 12_000);
  if (!ok.accepted) {
    throw new Error(`Failed to authenticate: ${ok.message || '(no message)'}`);
  }
}

/**
 * Create a calendar event (kind 31922) for a pending booking
 */
function createCalendarEvent(
  secretKey: Uint8Array,
  options: {
    dTag: string;
    title: string;
    description: string;
    startTime: number;
    endTime: number;
    location?: string;
  }
) {
  const eventTags: string[][] = [
    ['d', options.dTag],
    ['title', options.title],
    ['start', options.startTime.toString()],
    ['end', options.endTime.toString()],
  ];

  if (options.location) {
    eventTags.push(['location', options.location]);
  }

  const template: EventTemplate = {
    kind: NOSTR_KINDS.CALENDAR_EVENT,
    created_at: Math.floor(Date.now() / 1000),
    tags: eventTags,
    content: options.description,
  };

  return finalizeEvent(template, secretKey);
}

/**
 * Create a payment request event (kind 1734) for a booking
 */
function createPaymentRequestEvent(
  secretKey: Uint8Array,
  options: {
    sender: string;
    senderAddress: string;
    recipient: string;
    recipientAddress: string;
    amount: number;
    tokenAddress: string;
    chainId: number;
    tokenSymbol: string;
    context: string;
    relatedEventId: string;
    description: string;
    method: 'transfer' | 'mint' | 'burn';
  }
) {
  const TOKEN_DECIMALS = 6;
  const amountInSmallestUnit = BigInt(Math.floor(options.amount * 10 ** TOKEN_DECIMALS));

  // Convert npubs to hex pubkeys
  const senderPubkeyHex = nip19.decode(options.sender).data as string;
  const recipientPubkeyHex = nip19.decode(options.recipient).data as string;

  // Create EIP-681 payment URL
  const paymentUrl = `ethereum:${options.tokenAddress}@${options.chainId}/${options.method}?address=${options.recipientAddress}&uint256=${amountInSmallestUnit}`;

  const tags: string[][] = [
    ['P', nip19.npubEncode(senderPubkeyHex)],
    ['p', nip19.npubEncode(recipientPubkeyHex)],
    ['amount', String(amountInSmallestUnit)],
    ['paymentUrl', paymentUrl],
    ['chain', String(options.chainId)],
    ['token', options.tokenAddress],
    ['context', options.context],
    ['method', options.method],
    ['toAddress', options.recipientAddress],
    ['fromAddress', options.senderAddress],
    ['symbol', options.tokenSymbol],
    ['e', nip19.noteEncode(options.relatedEventId), '', 'related'],
  ];

  const template: EventTemplate = {
    kind: NOSTR_KINDS.PAYMENT_REQUEST,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: options.description,
  };

  return finalizeEvent(template, secretKey);
}

const describeWhenReady = SHOULD_RUN_INTEGRATION_TESTS ? describe : describe.skip;

describeWhenReady('booking nostr events', () => {
  jest.setTimeout(25_000);

  let secretKey: Uint8Array;
  let pubkeyHex: string;
  let npub: string;

  beforeAll(() => {
    const nsec = process.env.NOSTR_NSEC!;
    secretKey = decodeNsecToSecretKey(nsec);
    pubkeyHex = getPublicKey(secretKey);
    npub = nip19.npubEncode(pubkeyHex);
  });

  it('publishes a calendar event (kind 31922) for a pending booking', async () => {
    const ws = new WebSocket(RELAY_URL, { handshakeTimeout: 10_000 });

    try {
      await waitForOpen(ws, 12_000);

      // Buffer AUTH challenge - relay sends it when a restricted REQ is made
      let bufferedChallenge: string | null = null;
      const challengeListener = (raw: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (Array.isArray(msg) && msg[0] === 'AUTH' && typeof msg[1] === 'string') {
            bufferedChallenge = msg[1];
            console.log('[TEST] Received AUTH challenge');
          }
        } catch {
          // ignore
        }
      };
      ws.on('message', challengeListener);

      // Trigger AUTH challenge by sending a REQ for protected kind
      // (the relay sends AUTH alongside CLOSED response)
      console.log('[TEST] Triggering AUTH challenge via REQ...');
      const triggerSubId = `auth_trigger_${Date.now()}`;
      ws.send(JSON.stringify(['REQ', triggerSubId, { kinds: [28935], limit: 1 }]));

      // Wait for CLOSED or EOSE response (and AUTH challenge should arrive too)
      await waitForSubEnvelope(ws, triggerSubId, 12_000).catch(() => {});

      // Authenticate if we got a challenge
      if (bufferedChallenge) {
        console.log('[TEST] Got AUTH challenge, authenticating...');
        await authenticate(ws, secretKey, bufferedChallenge);
        console.log('[TEST] Authentication successful');
      } else {
        console.log('[TEST] No AUTH challenge received, proceeding without auth');
      }

      // Create the calendar event
      const now = Math.floor(Date.now() / 1000);
      const calendarEvent = createCalendarEvent(secretKey, {
        dTag: `booking-test-${now}`,
        title: 'Test Booking',
        description: 'Test room booking from integration test',
        startTime: now + 3600, // 1 hour from now
        endTime: now + 7200,   // 2 hours from now
        location: 'Test Room',
      });

      console.log('[TEST] Calendar event created:');
      console.log('[TEST]   Event ID:', calendarEvent.id);
      console.log('[TEST]   Kind:', calendarEvent.kind);
      console.log('[TEST]   Tags:', JSON.stringify(calendarEvent.tags));
      console.log('[TEST]   Content:', calendarEvent.content);

      // Publish after authentication
      ws.send(JSON.stringify(['EVENT', calendarEvent]));
      const ok = await waitForOk(ws, calendarEvent.id, 12_000);

      ws.off('message', challengeListener);

      console.log('[TEST] Calendar event OK result:', ok);
      expect(ok.accepted).toBe(true);
    } finally {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  });

  it('publishes a payment request (kind 1734) referencing a booking', async () => {
    const ws = new WebSocket(RELAY_URL, { handshakeTimeout: 10_000 });

    try {
      await waitForOpen(ws, 12_000);

      // Buffer AUTH challenge - relay sends it when a restricted REQ is made
      let bufferedChallenge: string | null = null;
      const challengeListener = (raw: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (Array.isArray(msg) && msg[0] === 'AUTH' && typeof msg[1] === 'string') {
            bufferedChallenge = msg[1];
            console.log('[TEST] Received AUTH challenge');
          }
        } catch {
          // ignore
        }
      };
      ws.on('message', challengeListener);

      // Trigger AUTH challenge by sending a REQ for protected kind
      console.log('[TEST] Triggering AUTH challenge via REQ...');
      const triggerSubId = `auth_trigger_${Date.now()}`;
      ws.send(JSON.stringify(['REQ', triggerSubId, { kinds: [28935], limit: 1 }]));

      // Wait for CLOSED or EOSE response
      await waitForSubEnvelope(ws, triggerSubId, 12_000).catch(() => {});

      // Authenticate if we got a challenge
      if (bufferedChallenge) {
        console.log('[TEST] Got AUTH challenge, authenticating...');
        await authenticate(ws, secretKey, bufferedChallenge);
        console.log('[TEST] Authentication successful');
      }

      // First create a calendar event to reference
      const now = Math.floor(Date.now() / 1000);
      const calendarEvent = createCalendarEvent(secretKey, {
        dTag: `booking-payment-test-${now}`,
        title: 'Test Booking for Payment',
        description: 'Test room booking for payment request test',
        startTime: now + 3600,
        endTime: now + 7200,
        location: 'Test Room',
      });

      // Publish calendar event
      ws.send(JSON.stringify(['EVENT', calendarEvent]));
      const calendarOk = await waitForOk(ws, calendarEvent.id, 12_000);

      console.log('[TEST] Calendar event for payment test OK:', calendarOk);
      expect(calendarOk.accepted).toBe(true);

      // Create payment request referencing the calendar event
      // Content matches the frontend's booking data structure with nostr: prefix for author
      const bookingData = {
        type: 'booking',
        id: calendarEvent.id,
        title: 'Test Booking for Payment',
        room: 'test-room',
        roomName: 'Test Room',
        startTime: new Date((now + 3600) * 1000).toISOString(),
        endTime: new Date((now + 7200) * 1000).toISOString(),
        author: `nostr:${npub}`,  // Must use nostr: prefix for relay policy
        authorUsername: 'testuser',
      };
      const paymentRequest = createPaymentRequestEvent(secretKey, {
        sender: npub,
        senderAddress: '0x1234567890123456789012345678901234567890',
        recipient: npub, // Self-transfer for test
        recipientAddress: '0x0987654321098765432109876543210987654321',
        amount: 10,
        tokenAddress: '0xTokenAddress000000000000000000000000000',
        chainId: 31337,
        tokenSymbol: 'CHT',
        context: 'booking',
        relatedEventId: calendarEvent.id, // Reference the calendar event
        description: JSON.stringify(bookingData),  // Realistic content with author field
        method: 'transfer',
      });

      console.log('[TEST] Payment request created:');
      console.log('[TEST]   Event ID:', paymentRequest.id);
      console.log('[TEST]   Kind:', paymentRequest.kind);
      console.log('[TEST]   Tags:', JSON.stringify(paymentRequest.tags));
      console.log('[TEST]   Content:', paymentRequest.content);

      // Publish payment request
      ws.send(JSON.stringify(['EVENT', paymentRequest]));
      const paymentOk = await waitForOk(ws, paymentRequest.id, 12_000);

      ws.off('message', challengeListener);

      console.log('[TEST] Payment request OK result:', paymentOk);
      expect(paymentOk.accepted).toBe(true);
    } finally {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  });
});
