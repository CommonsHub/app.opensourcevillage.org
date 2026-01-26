/**
 * Integration test: connect to Commonshub Nostr relay using NOSTR_NSEC
 *
 * Requires:
 * - NOSTR_NSEC env var (bech32, nsec1...)
 *
 * What it tests:
 * - We can derive the associated pubkey/npub from NOSTR_NSEC
 * - We can open a WebSocket connection to the relay
 * - The relay responds to a REQ using that derived pubkey (EOSE/EVENT/NOTICE)
 *
 * @jest-environment node
 */

import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { spawnSync } from 'child_process';
import WebSocket from 'ws';
import { finalizeEvent, generateSecretKey, getPublicKey, nip19, type EventTemplate } from 'nostr-tools';

const RELAY_URL = 'ws://localhost:3334';
// NIP-42 expects the relay URL tag to match what the relay thinks its base URL is.
// For local pyramid runs, relay.ServiceURL is often set to `ws://localhost` (no port),
// even if we connect to a forwarded port like `ws://localhost:3334`.
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
  console.warn(`[nostr.connect.test] Skipping Nostr relay integration tests: ${reasons.join('; ')}`);
}

function decodeNsecToSecretKey(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') {
    throw new Error(`Expected nsec bech32 string, got type="${decoded.type}"`);
  }
  if (!(decoded.data instanceof Uint8Array)) {
    // nostr-tools sometimes returns a Uint8Array-like; be explicit for Node/jest
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

function waitForRelayResponse(
  ws: WebSocket,
  subId: string,
  timeoutMs: number
): Promise<{ type: string; payload: unknown[] }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      reject(new Error(`Timed out waiting for relay response after ${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!Array.isArray(msg) || msg.length < 1) return;
        const [type, ...rest] = msg;

        // Typical responses we care about:
        // - ["EOSE", <subId>]
        // - ["EVENT", <subId>, <event>]
        // - ["NOTICE", <string>]
        if (type === 'EOSE' && rest[0] === subId) {
          cleanup();
          resolve({ type, payload: rest });
          return;
        }

        if (type === 'EVENT' && rest[0] === subId) {
          cleanup();
          resolve({ type, payload: rest });
          return;
        }

        if (type === 'NOTICE') {
          cleanup();
          resolve({ type, payload: rest });
          return;
        }
      } catch {
        // ignore malformed messages (some relays may send non-json notices)
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const onClose = () => {
      cleanup();
      reject(new Error('WebSocket closed before receiving expected relay response'));
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

async function publishProfileKind0(ws: WebSocket, secretKey: Uint8Array, name: string, about: string) {
  const pubkeyHex = getPublicKey(secretKey);
  const template: EventTemplate = {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify({ name, about }),
  };
  const event = finalizeEvent(template, secretKey);
  ws.send(JSON.stringify(['EVENT', event]));
  const ok = await waitForOk(ws, event.id, 12_000);
  return { ok, event, pubkeyHex };
}

async function requestInviteCode(serverSecretKey: Uint8Array): Promise<string> {
  const ws = new WebSocket(RELAY_URL, { handshakeTimeout: 10_000 });
  try {
    await waitForOpen(ws, 12_000);

    // Buffer AUTH challenges to avoid races (relay may send AUTH before we start waiting for it).
    let bufferedChallenge: string | null = null;
    const challengeListener = (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!Array.isArray(msg) || msg.length < 2) return;
        const [type, challenge] = msg as [string, string];
        if (type === 'AUTH' && typeof challenge === 'string') {
          bufferedChallenge = challenge;
        }
      } catch {
        // ignore
      }
    };
    ws.on('message', challengeListener);

    try {
      // First attempt: ask for kind 28935. If we're not authed, pyramid will reply
      // ["CLOSED", <subId>, "auth-required: ..."] and also send an ["AUTH", <challenge>].
      const firstSubId = `invite_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      ws.send(JSON.stringify(['REQ', firstSubId, { kinds: [28935], limit: 1 }]));

      const first = await waitForSubEnvelope(ws, firstSubId, 12_000);
      if (first.type === 'NOTICE') {
        throw new Error(`Relay NOTICE while requesting invite code: ${first.payload[0]}`);
      }

      if (first.type === 'EVENT') {
        const event = first.payload[1] as { kind?: number; tags?: string[][] };
        const claimTag = event.tags?.find((t) => t[0] === 'claim');
        if (event?.kind === 28935 && claimTag?.[1]) return claimTag[1];
        throw new Error('Unexpected EVENT while requesting invite code');
      }

      if (first.type === 'CLOSED') {
        const reason = first.payload[0] || '';
        if (reason.startsWith('auth-required:')) {
          await authenticate(ws, serverSecretKey, bufferedChallenge ?? undefined);
        } else {
          throw new Error(`Invite code request rejected: ${reason || '(no reason)'}`);
        }
      } else {
        // EOSE without event means the invite generation didn't happen.
        await authenticate(ws, serverSecretKey, bufferedChallenge ?? undefined);
      }

      const subId = `invite2_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      ws.send(JSON.stringify(['REQ', subId, { kinds: [28935], limit: 1 }]));

      const second = await waitForSubEnvelope(ws, subId, 12_000);
      if (second.type === 'EVENT') {
        const event = second.payload[1] as { kind?: number; tags?: string[][] };
        if (event?.kind !== 28935) {
          throw new Error(`Expected kind 28935 invite code event, got kind=${String(event?.kind)}`);
        }
        const claimTag = event.tags?.find((t) => t[0] === 'claim');
        if (!claimTag?.[1]) {
          throw new Error('Invite code event missing claim tag');
        }
        return claimTag[1];
      }

      if (second.type === 'CLOSED') {
        throw new Error(`Invite code request rejected after auth: ${second.payload[0] || '(no reason)'}`);
      }
      if (second.type === 'NOTICE') {
        throw new Error(`Relay NOTICE while requesting invite code: ${second.payload[0]}`);
      }
      throw new Error('Invite code request returned EOSE without an invite event');
    } finally {
      ws.off('message', challengeListener);
    }
  } finally {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }
}

const describeWhenReady = SHOULD_RUN_INTEGRATION_TESTS ? describe : describe.skip;

describeWhenReady('nostr relay connection (nostr.commonshub.brussels)', () => {
  // Network tests can be slow/flaky; give it a bit more time.
  jest.setTimeout(25_000);

  let nonMemberSecretKey: Uint8Array;
  let nonMemberPubkeyHex: string;
  let nonMemberNsec: string;
  let nonMemberNpub: string;
  let inviteCode: string | null = null;

  beforeAll(async () => {
    nonMemberSecretKey = generateSecretKey();
    nonMemberPubkeyHex = getPublicKey(nonMemberSecretKey);
    nonMemberNsec = nip19.nsecEncode(nonMemberSecretKey);
    nonMemberNpub = nip19.npubEncode(nonMemberPubkeyHex);
  });

  it('connects and accepts a REQ scoped to the derived pubkey', async () => {
    const nsec = process.env.NOSTR_NSEC!;
    const secretKey = decodeNsecToSecretKey(nsec);
    const pubkeyHex = getPublicKey(secretKey);
    const npub = nip19.npubEncode(pubkeyHex);

    // Sanity checks for the derived identity
    expect(secretKey).toBeInstanceOf(Uint8Array);
    expect(secretKey.length).toBe(32);
    expect(pubkeyHex).toMatch(/^[0-9a-f]{64}$/i);
    expect(npub).toMatch(/^npub1[0-9a-z]+$/);

    const ws = new WebSocket(RELAY_URL, {
      handshakeTimeout: 10_000,
    });

    try {
      await waitForOpen(ws, 12_000);

      const subId = `jest_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      // Ask for most recent metadata (kind 0) for this pubkey.
      // Even if there are no stored events, a compliant relay should reply with EOSE.
      const req = ['REQ', subId, { authors: [pubkeyHex], kinds: [0], limit: 1 }];
      ws.send(JSON.stringify(req));

      const response = await waitForRelayResponse(ws, subId, 12_000);

      // Any of these indicates the relay is responding and the subscription was processed.
      expect(['EOSE', 'EVENT', 'NOTICE']).toContain(response.type);

      // Cleanup subscription if still open
      try {
        ws.send(JSON.stringify(['CLOSE', subId]));
      } catch {
        // ignore
      }
    } finally {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  });

  it('publishes a replaceable profile event (kind 0) signed by NOSTR_NSEC', async () => {
    const nsec = process.env.NOSTR_NSEC!;
    const secretKey = decodeNsecToSecretKey(nsec);
    const pubkeyHex = getPublicKey(secretKey);

    const ws = new WebSocket(RELAY_URL, {
      handshakeTimeout: 10_000,
    });

    try {
      await waitForOpen(ws, 12_000);
      const { ok } = await publishProfileKind0(
        ws,
        secretKey,
        `osv-jest-${Date.now()}`,
        'Test profile update from Jest integration test'
      );
      expect(ok.accepted).toBe(true);
    } finally {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  });

  it('fails to publish a profile event (kind 0) for a newly generated nsec/npub', async () => {
    // Sanity checks for the generated identity
    expect(nonMemberSecretKey).toBeInstanceOf(Uint8Array);
    expect(nonMemberSecretKey.length).toBe(32);
    expect(nonMemberPubkeyHex).toMatch(/^[0-9a-f]{64}$/i);
    expect(nonMemberNsec).toMatch(/^nsec1[0-9a-z]+$/);
    expect(nonMemberNpub).toMatch(/^npub1[0-9a-z]+$/);

    const ws = new WebSocket(RELAY_URL, {
      handshakeTimeout: 10_000,
    });

    try {
      await waitForOpen(ws, 12_000);
      const { ok } = await publishProfileKind0(
        ws,
        nonMemberSecretKey,
        `osv-nonmember-${Date.now()}`,
        'This publish should be rejected (non-member key)'
      );
      expect(ok.accepted).toBe(false);
    } finally {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  });

  it('server member can request a new invitation code (kind 28935)', async () => {
    const serverNsec = process.env.NOSTR_NSEC!;
    const serverSecretKey = decodeNsecToSecretKey(serverNsec);
    inviteCode = await requestInviteCode(serverSecretKey);

    // Pyramid expects an invite code to be 64 (parent pubkey) + 128 (sig) hex chars.
    expect(inviteCode).toMatch(/^[0-9a-f]{192}$/i);
  });

  it('non-member key can redeem invitation code via join request (kind 28934)', async () => {
    if (!inviteCode) {
      throw new Error('Missing invite code from previous test');
    }

    const ws = new WebSocket(RELAY_URL, { handshakeTimeout: 10_000 });
    try {
      await waitForOpen(ws, 12_000);

      const joinTemplate: EventTemplate = {
        kind: 28934,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['claim', inviteCode]],
        content: '',
      };
      const joinEvent = finalizeEvent(joinTemplate, nonMemberSecretKey);
      ws.send(JSON.stringify(['EVENT', joinEvent]));

      const ok = await waitForOk(ws, joinEvent.id, 12_000);
      expect(ok.accepted).toBe(true);
    } finally {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  });

  it('after redeeming, the previously-nonmember key can publish kind 0', async () => {
    const ws = new WebSocket(RELAY_URL, { handshakeTimeout: 10_000 });
    try {
      await waitForOpen(ws, 12_000);

      // Membership may take a moment to propagate; retry a few times.
      let lastOk: { accepted: boolean; message: string } | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { ok } = await publishProfileKind0(
          ws,
          nonMemberSecretKey,
          `osv-member-now-${Date.now()}`,
          'Publish should succeed after join'
        );
        lastOk = ok;
        if (ok.accepted) break;
        await new Promise((r) => setTimeout(r, 400));
      }

      expect(lastOk?.accepted).toBe(true);
    } finally {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  });
});

