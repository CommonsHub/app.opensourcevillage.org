/**
 * Integration test: Mint tokens via NOSTR payment request (kind 21734)
 *
 * Requires:
 * - NOSTR_NSEC env var (bech32, nsec1...)
 * - Local relay running at ws://localhost:3334
 *
 * What it tests:
 * - We can create a payment request event (kind 21734) for minting
 * - We can publish the event to the relay
 * - The relay accepts the event (OK response)
 *
 * @jest-environment node
 */

import { beforeAll, afterAll, describe, expect, it, jest } from '@jest/globals';
import { spawnSync } from 'child_process';
import WebSocket from 'ws';
import { finalizeEvent, getPublicKey, nip19, type EventTemplate } from 'nostr-tools';

const RELAY_URL = 'ws://localhost:3334';
const RELAY_AUTH_URL =
  process.env.NOSTR_RELAY_AUTH_URL ||
  (() => {
    try {
      const u = new URL(RELAY_URL);
      u.pathname = '';
      u.search = '';
      u.hash = '';
      if (u.hostname === 'localhost') {
        u.port = '';
      }
      return u.toString().replace(/\/$/, '');
    } catch {
      return RELAY_URL;
    }
  })();

// Payment request kind (custom kind for token payments, avoids NIP-57 zap validation)
const KIND_PAYMENT_REQUEST = 21734;

/**
 * Convert npub to hex pubkey, or return as-is if already hex or special value
 */
function npubToHex(npubOrPubkey: string): string {
  if (npubOrPubkey === 'system') return npubOrPubkey;
  if (/^[0-9a-f]{64}$/i.test(npubOrPubkey)) return npubOrPubkey.toLowerCase();
  if (npubOrPubkey.startsWith('npub1')) {
    const decoded = nip19.decode(npubOrPubkey);
    if (decoded.type === 'npub') return decoded.data as string;
  }
  return npubOrPubkey;
}

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
  console.warn(`[nostr.mint.test] Skipping mint integration tests: ${reasons.join('; ')}`);
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
      try { ws.close(); } catch {}
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

function waitForOk(
  ws: WebSocket,
  eventId: string,
  timeoutMs: number
): Promise<{ accepted: boolean; message: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for OK after ${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!Array.isArray(msg) || msg.length < 2) return;
        const [type, ...rest] = msg;

        console.log('[Test] Received message:', type, rest[0]?.substring?.(0, 16) || rest[0]);

        if (type === 'OK') {
          const [id, accepted, message] = rest as [string, boolean, string];
          if (id === eventId) {
            cleanup();
            resolve({ accepted: !!accepted, message: String(message ?? '') });
          }
        }

        if (type === 'NOTICE') {
          console.log('[Test] Relay NOTICE:', rest[0]);
        }
      } catch {}
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
        if (type === 'AUTH' && typeof challenge === 'string') {
          cleanup();
          resolve(challenge);
        }
      } catch {}
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
  console.log('[Test] Sending AUTH response...');
  ws.send(JSON.stringify(['AUTH', authEvent]));

  const ok = await waitForOk(ws, authEvent.id, 12_000);
  if (!ok.accepted) {
    throw new Error(`Failed to authenticate: ${ok.message || '(no message)'}`);
  }
  console.log('[Test] AUTH accepted');
}

function createPaymentRequestEvent(
  secretKey: Uint8Array,
  options: {
    recipient: string;
    recipientAddress: string;
    sender: string;
    amount: number;
    tokenAddress: string;
    chainId: number;
    tokenSymbol?: string;
    context: string;
    description?: string;
    method: 'mint' | 'transfer';
  }
) {
  const TOKEN_DECIMALS = 6;
  const amountInSmallestUnit = BigInt(Math.floor(options.amount * 10 ** TOKEN_DECIMALS));

  // Convert npubs to hex pubkeys (NOSTR standard requires hex in p tags)
  const recipientPubkey = npubToHex(options.recipient);
  const senderPubkey = npubToHex(options.sender);

  const tags: string[][] = [
    ['p', recipientPubkey],    // Recipient pubkey (hex, 64 chars)
    ['P', senderPubkey],       // Sender pubkey (hex) or 'system' for mints
    ['amount', String(amountInSmallestUnit)],
    ['chain', String(options.chainId)],
    ['token', options.tokenAddress],
    ['toAddress', options.recipientAddress],
    ['context', options.context],
    ['method', options.method],
  ];

  if (options.tokenSymbol) {
    tags.push(['symbol', options.tokenSymbol]);
  }

  const content = options.description || `Payment of ${options.amount} ${options.tokenSymbol || 'tokens'}`;

  const event: EventTemplate = {
    kind: KIND_PAYMENT_REQUEST,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };

  return finalizeEvent(event, secretKey);
}

const describeWhenReady = SHOULD_RUN_INTEGRATION_TESTS ? describe : describe.skip;

describeWhenReady('nostr mint integration (kind 21734)', () => {
  jest.setTimeout(30_000);

  let secretKey: Uint8Array;
  let pubkeyHex: string;
  let npub: string;

  beforeAll(() => {
    const nsec = process.env.NOSTR_NSEC!;
    secretKey = decodeNsecToSecretKey(nsec);
    pubkeyHex = getPublicKey(secretKey);
    npub = nip19.npubEncode(pubkeyHex);
    console.log('[Test] Using npub:', npub.slice(0, 20) + '...');
  });

  it('creates payment request with hex pubkeys in p tags (not npub)', () => {
    // Create a payment request event
    const paymentEvent = createPaymentRequestEvent(secretKey, {
      recipient: npub, // Pass npub, should be converted to hex
      recipientAddress: '0x0000000000000000000000000000000000000001',
      sender: 'system',
      amount: 10,
      tokenAddress: '0x2E70c02060Fc87009Be2f5C94591f6df4Bc4873e',
      chainId: 31337,
      tokenSymbol: 'OSV',
      context: 'badge_claim',
      method: 'mint',
    });

    // Find the p tag (recipient)
    const pTag = paymentEvent.tags.find(t => t[0] === 'p');
    expect(pTag).toBeDefined();
    expect(pTag![1]).toMatch(/^[0-9a-f]{64}$/i); // Should be 64 hex chars
    expect(pTag![1]).not.toMatch(/^npub1/); // Should NOT be an npub
    expect(pTag![1]).toBe(pubkeyHex); // Should match our pubkey

    // Find the P tag (sender)
    const PTag = paymentEvent.tags.find(t => t[0] === 'P');
    expect(PTag).toBeDefined();
    expect(PTag![1]).toBe('system'); // For mints, sender is 'system'

    console.log('[Test] p tag value:', pTag![1].slice(0, 16) + '...');
    console.log('[Test] P tag value:', PTag![1]);
  });

  it('can publish a payment request event (kind 21734) for minting', async () => {
    const ws = new WebSocket(RELAY_URL, { handshakeTimeout: 10_000 });
    let bufferedChallenge: string | null = null;

    // Buffer AUTH challenges
    const challengeListener = (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (Array.isArray(msg) && msg[0] === 'AUTH' && typeof msg[1] === 'string') {
          bufferedChallenge = msg[1];
          console.log('[Test] Buffered AUTH challenge');
        }
      } catch {}
    };

    try {
      await waitForOpen(ws, 12_000);
      console.log('[Test] Connected to relay');

      ws.on('message', challengeListener);

      // Create payment request event
      const paymentEvent = createPaymentRequestEvent(secretKey, {
        recipient: npub,
        recipientAddress: '0x0000000000000000000000000000000000000001',
        sender: 'system', // 'system' indicates mint
        amount: 10,
        tokenAddress: '0x2E70c02060Fc87009Be2f5C94591f6df4Bc4873e',
        chainId: 31337,
        tokenSymbol: 'OSV',
        context: 'badge_claim',
        description: 'Test mint of 10 OSV tokens',
        method: 'mint',
      });

      // Verify p tag is hex pubkey, not npub
      const pTag = paymentEvent.tags.find(t => t[0] === 'p');
      expect(pTag![1]).toMatch(/^[0-9a-f]{64}$/i);

      console.log('[Test] Created payment request event:', paymentEvent.id.slice(0, 16) + '...');
      console.log('[Test] Event kind:', paymentEvent.kind);
      console.log('[Test] Event tags:', paymentEvent.tags.map(t => t[0]).join(', '));

      // Try to publish
      ws.send(JSON.stringify(['EVENT', paymentEvent]));
      console.log('[Test] Sent EVENT to relay');

      // Wait for OK response
      let ok: { accepted: boolean; message: string };
      try {
        ok = await waitForOk(ws, paymentEvent.id, 12_000);
      } catch (err) {
        // Maybe we need to authenticate first
        console.log('[Test] First attempt failed, trying with authentication...');

        if (bufferedChallenge) {
          await authenticate(ws, secretKey, bufferedChallenge);
        } else {
          await authenticate(ws, secretKey);
        }

        // Resend the event after auth
        ws.send(JSON.stringify(['EVENT', paymentEvent]));
        console.log('[Test] Resent EVENT after auth');

        ok = await waitForOk(ws, paymentEvent.id, 12_000);
      }

      console.log('[Test] Relay response - accepted:', ok.accepted, 'message:', ok.message);

      // The event should be accepted
      if (!ok.accepted && ok.message.includes('not allowed')) {
        console.error('\n=======================================================');
        console.error('RELAY CONFIGURATION ISSUE');
        console.error('=======================================================');
        console.error('The relay is blocking kind 21734 events.');
        console.error('You need to configure pyramid to allow kinds 21734 and 21735.');
        console.error('');
        console.error('In your pyramid config, add to AllowedKinds:');
        console.error('  - 21734  (payment request)');
        console.error('  - 21735  (payment receipt)');
        console.error('=======================================================\n');
      }
      expect(ok.accepted).toBe(true);
    } finally {
      ws.off('message', challengeListener);
      try { ws.close(); } catch {}
    }
  });

  it('publishes mint event and can query it back', async () => {
    const ws = new WebSocket(RELAY_URL, { handshakeTimeout: 10_000 });
    let bufferedChallenge: string | null = null;

    const challengeListener = (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (Array.isArray(msg) && msg[0] === 'AUTH' && typeof msg[1] === 'string') {
          bufferedChallenge = msg[1];
        }
      } catch {}
    };

    try {
      await waitForOpen(ws, 12_000);
      ws.on('message', challengeListener);

      // Authenticate first
      if (bufferedChallenge) {
        await authenticate(ws, secretKey, bufferedChallenge);
      } else {
        // Wait a bit for potential AUTH challenge
        await new Promise(r => setTimeout(r, 500));
        if (bufferedChallenge) {
          await authenticate(ws, secretKey, bufferedChallenge);
        }
      }

      // Create and publish payment request
      const paymentEvent = createPaymentRequestEvent(secretKey, {
        recipient: npub,
        recipientAddress: '0x0000000000000000000000000000000000000002',
        sender: 'system',
        amount: 5,
        tokenAddress: '0x2E70c02060Fc87009Be2f5C94591f6df4Bc4873e',
        chainId: 31337,
        tokenSymbol: 'OSV',
        context: 'badge_claim',
        description: 'Test mint for query test',
        method: 'mint',
      });

      ws.send(JSON.stringify(['EVENT', paymentEvent]));

      let ok: { accepted: boolean; message: string };
      try {
        ok = await waitForOk(ws, paymentEvent.id, 12_000);
      } catch {
        // Authenticate if needed
        if (bufferedChallenge) {
          await authenticate(ws, secretKey, bufferedChallenge);
        } else {
          await authenticate(ws, secretKey);
        }
        ws.send(JSON.stringify(['EVENT', paymentEvent]));
        ok = await waitForOk(ws, paymentEvent.id, 12_000);
      }

      expect(ok.accepted).toBe(true);

      // Now query for kind 21734 events
      const subId = `test_${Date.now()}`;
      ws.send(JSON.stringify(['REQ', subId, { kinds: [KIND_PAYMENT_REQUEST], limit: 5 }]));

      // Wait for events or EOSE
      const events: any[] = [];
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Timeout waiting for events'));
        }, 10_000);

        const handler = (raw: WebSocket.RawData) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (!Array.isArray(msg)) return;
            const [type, ...rest] = msg;

            if (type === 'EVENT' && rest[0] === subId) {
              events.push(rest[1]);
            }
            if (type === 'EOSE' && rest[0] === subId) {
              clearTimeout(timer);
              ws.off('message', handler);
              resolve();
            }
          } catch {}
        };

        ws.on('message', handler);
      });

      console.log('[Test] Received', events.length, 'payment request events');

      // We should have at least our event
      expect(events.length).toBeGreaterThan(0);

      // Find our event
      const ourEvent = events.find(e => e.id === paymentEvent.id);
      expect(ourEvent).toBeDefined();
      expect(ourEvent?.kind).toBe(KIND_PAYMENT_REQUEST);

    } finally {
      ws.off('message', challengeListener);
      try { ws.close(); } catch {}
    }
  });
});
