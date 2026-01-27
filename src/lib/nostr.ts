/**
 * NOSTR Client Library
 *
 * Unified client-side NOSTR utilities:
 * - Keypair derivation and credentials management
 * - WebSocket connections with backoff
 * - Event publishing and subscribing
 * - Validation utilities
 */

'use client';

import { finalizeEvent, getPublicKey, nip19, type EventTemplate } from 'nostr-tools';
import { verifyNostrEvent, NOSTR_KINDS, type NostrEvent } from './nostr-events';

// Re-export from nostr-events for convenience
export { NOSTR_KINDS, type NostrEvent } from './nostr-events';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const CONNECTION_TIMEOUT = 10_000;
const RESPONSE_TIMEOUT = 15_000;

// Backoff configuration
const BASE_BACKOFF = 5000;
const MAX_BACKOFF = 120000;
const RATE_LIMIT_BACKOFF = 60000;
const BACKOFF_STORAGE_KEY = 'osv_relay_backoff';

// ─────────────────────────────────────────────────────────────────────────────
// Client-side Backoff Management (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

interface BackoffState {
  [url: string]: { until: number; attempts: number };
}

function getBackoffState(): BackoffState {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(BACKOFF_STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored) as BackoffState;
      const now = Date.now();
      const cleaned: BackoffState = {};
      for (const [url, data] of Object.entries(state)) {
        if (data.until > now) cleaned[url] = data;
      }
      return cleaned;
    }
  } catch { /* ignore */ }
  return {};
}

function saveBackoffState(state: BackoffState): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(BACKOFF_STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function isRelayInBackoff(url: string): { inBackoff: boolean; waitTime: number } {
  const state = getBackoffState();
  const entry = state[url];
  if (!entry) return { inBackoff: false, waitTime: 0 };
  const now = Date.now();
  if (now >= entry.until) {
    delete state[url];
    saveBackoffState(state);
    return { inBackoff: false, waitTime: 0 };
  }
  return { inBackoff: true, waitTime: Math.ceil((entry.until - now) / 1000) };
}

export function setRelayBackoff(url: string, isRateLimited: boolean = false): void {
  const state = getBackoffState();
  const entry = state[url] || { until: 0, attempts: 0 };
  entry.attempts++;
  const baseDelay = isRateLimited ? RATE_LIMIT_BACKOFF : BASE_BACKOFF;
  entry.until = Date.now() + Math.min(baseDelay * Math.pow(2, entry.attempts - 1), MAX_BACKOFF);
  state[url] = entry;
  saveBackoffState(state);
}

export function clearRelayBackoff(url: string): void {
  const state = getBackoffState();
  if (state[url]) {
    delete state[url];
    saveBackoffState(state);
  }
}

export function isRateLimitError(error: unknown): boolean {
  const str = String(error);
  return str.includes('429') || str.includes('Too Many') || str.includes('rate limit');
}

// ─────────────────────────────────────────────────────────────────────────────
// Types (for backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

export interface ConnectOptions {
  timeout?: number;
}

export interface PublishOptions {
  timeout?: number;
}

// NostrEventData is the same as NostrEvent - alias for backward compatibility
export type NostrEventData = NostrEvent;

// Type aliases for backward compatibility with nostr-connection.ts
export type RedeemInviteResult = { success: boolean; error?: string };
export type RequestInviteResult = InviteResult;

// ─────────────────────────────────────────────────────────────────────────────
// Relay URLs
// ─────────────────────────────────────────────────────────────────────────────

// Declare the global variables injected by the server
declare global {
  interface Window {
    __OSV_RELAY_URLS__?: string[];
    __OSV_SERVER_NPUB__?: string | null;
  }
}

/**
 * Get the server's npub (injected by server)
 * Used to subscribe to server-published events
 */
export function getServerNpub(): string | null {
  if (typeof window !== 'undefined') {
    return window.__OSV_SERVER_NPUB__ || null;
  }
  return null;
}

export function getRelayUrls(): string[] {
  if (typeof window !== 'undefined') {
    // First check server-injected relay URLs
    if (window.__OSV_RELAY_URLS__ && window.__OSV_RELAY_URLS__.length > 0) {
      return window.__OSV_RELAY_URLS__;
    }
    // Fall back to localStorage (for overrides)
    const stored = localStorage.getItem('osv_relay_urls');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch { /* ignore */ }
    }
  }
  return []; // No relays configured
}

export function setRelayUrls(urls: string[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('osv_relay_urls', JSON.stringify(urls));
  }
}

export function getPrimaryRelayUrl(): string {
  return getRelayUrls()[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection Pool
// ─────────────────────────────────────────────────────────────────────────────

const connectionPool: Map<string, {
  ws: WebSocket;
  status: 'connecting' | 'connected' | 'disconnected';
  subscriptions: Set<string>;
}> = new Map();

export interface ConnectResult {
  success: boolean;
  ws?: WebSocket;
  error?: string;
}

export async function connect(relayUrl: string, timeout = CONNECTION_TIMEOUT): Promise<ConnectResult> {
  console.log(`[NOSTR:connect] Connecting to ${relayUrl}...`);

  const backoff = isRelayInBackoff(relayUrl);
  if (backoff.inBackoff) {
    console.log(`[NOSTR:connect] Relay in backoff for ${backoff.waitTime}s`);
    return { success: false, error: `Rate limited, retry in ${backoff.waitTime}s` };
  }

  const existing = connectionPool.get(relayUrl);
  if (existing?.status === 'connected' && existing.ws.readyState === WebSocket.OPEN) {
    console.log(`[NOSTR:connect] Reusing existing connection, readyState=${existing.ws.readyState}`);
    return { success: true, ws: existing.ws };
  }

  console.log(`[NOSTR:connect] Creating new WebSocket connection...`);
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(relayUrl);
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          console.log(`[NOSTR:connect] Connection timeout after ${timeout}ms`);
          resolved = true;
          ws.close();
          setRelayBackoff(relayUrl, false);
          resolve({ success: false, error: 'Connection timeout' });
        }
      }, timeout);

      ws.onopen = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        clearRelayBackoff(relayUrl);
        connectionPool.set(relayUrl, { ws, status: 'connected', subscriptions: new Set() });
        console.log(`[NOSTR:connect] Connected to ${relayUrl}, readyState=${ws.readyState}`);
        resolve({ success: true, ws });
      };

      ws.onerror = (err) => {
        console.log(`[NOSTR:connect] WebSocket error:`, err);
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        setRelayBackoff(relayUrl, isRateLimitError(err));
        resolve({ success: false, error: 'Connection error' });
      };

      ws.onclose = (event) => {
        console.log(`[NOSTR:connect] WebSocket closed: code=${event.code}, reason=${event.reason}`);
        connectionPool.delete(relayUrl);
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          setRelayBackoff(relayUrl, event.code === 429 || (event.reason ? isRateLimitError(event.reason) : false));
          resolve({ success: false, error: `Connection closed (${event.code})` });
        }
      };
    } catch (err) {
      console.log(`[NOSTR:connect] Exception creating WebSocket:`, err);
      const msg = err instanceof Error ? err.message : 'Failed to connect';
      setRelayBackoff(relayUrl, isRateLimitError(msg));
      resolve({ success: false, error: msg });
    }
  });
}

export function disconnect(relayUrl: string): void {
  const conn = connectionPool.get(relayUrl);
  if (conn) {
    for (const subId of conn.subscriptions) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(JSON.stringify(['CLOSE', subId]));
      }
    }
    conn.ws.close();
    connectionPool.delete(relayUrl);
  }
}

export function disconnectAll(): void {
  for (const url of connectionPool.keys()) disconnect(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Publishing
// ─────────────────────────────────────────────────────────────────────────────

export interface PublishResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

export async function publishEvent(
  relayUrl: string,
  event: NostrEvent,
  timeout = RESPONSE_TIMEOUT,
  secretKey?: Uint8Array
): Promise<PublishResult> {
  console.log(`[NOSTR:publish] ========== PUBLISHING EVENT ==========`);
  console.log(`[NOSTR:publish] Relay: ${relayUrl}`);
  console.log(`[NOSTR:publish] Event ID: ${event.id}`);
  console.log(`[NOSTR:publish] Kind: ${event.kind}`);
  console.log(`[NOSTR:publish] Pubkey: ${event.pubkey}`);
  console.log(`[NOSTR:publish] Created: ${event.created_at}`);
  console.log(`[NOSTR:publish] Tags:`, JSON.stringify(event.tags, null, 2));
  console.log(`[NOSTR:publish] Content: ${event.content}`);
  console.log(`[NOSTR:publish] Sig: ${event.sig?.slice(0, 32)}...`);
  console.log(`[NOSTR:publish] Full event JSON:`, JSON.stringify(event));
  console.log(`[NOSTR:publish] hasSecretKey: ${!!secretKey}`);

  const conn = await connect(relayUrl);
  if (!conn.success || !conn.ws) {
    console.log(`[NOSTR:publish] Connection failed: ${conn.error}`);
    return { success: false, error: conn.error };
  }

  console.log(`[NOSTR:publish] Connected, ws.readyState=${conn.ws.readyState}`);
  const ws = conn.ws;

  return new Promise((resolve) => {
    let resolved = false;
    let authSent = false;
    let eventSentAfterAuth = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        console.log(`[NOSTR:publish] Timeout reached, authSent=${authSent}, eventSentAfterAuth=${eventSentAfterAuth}`);
        resolved = true;
        resolve({ success: true, eventId: event.id });
      }
    }, timeout);

    const handler = (msg: MessageEvent) => {
      try {
        const data = JSON.parse(msg.data);
        console.log(`[NOSTR:publish] Received message:`, JSON.stringify(data).slice(0, 200));

        if (!Array.isArray(data)) {
          console.log(`[NOSTR:publish] Message is not an array, ignoring`);
          return;
        }

        const [type, ...rest] = data;

        // Handle AUTH challenge
        if (type === 'AUTH' && typeof rest[0] === 'string') {
          console.log(`[NOSTR:publish] Got AUTH challenge, hasSecretKey=${!!secretKey}, authSent=${authSent}`);
          if (secretKey && !authSent) {
            const authChallenge = rest[0];
            console.log(`[NOSTR:publish] Responding to AUTH challenge: ${authChallenge.slice(0, 20)}...`);
            const authEvent = finalizeEvent({
              kind: 22242,
              created_at: Math.floor(Date.now() / 1000),
              tags: [['challenge', authChallenge], ['relay', relayUrl]],
              content: '',
            }, secretKey);
            authSent = true;
            console.log(`[NOSTR:publish] Sending AUTH event: ${authEvent.id?.slice(0, 8)}`);
            ws.send(JSON.stringify(['AUTH', authEvent]));
          } else {
            console.log(`[NOSTR:publish] Cannot respond to AUTH: no secretKey or already sent`);
          }
          return;
        }

        // Handle OK response
        if (type === 'OK') {
          const okEventId = rest[0];
          const okSuccess = rest[1];
          const okMessage = rest[2] || '';
          console.log(`[NOSTR:publish] Got OK: eventId=${okEventId?.slice(0, 8)}, success=${okSuccess}, message="${okMessage}"`);

          // Check if this is OK for our auth event
          if (authSent && !eventSentAfterAuth && okEventId !== event.id) {
            if (okSuccess) {
              console.log(`[NOSTR:publish] AUTH succeeded, now sending original event`);
              eventSentAfterAuth = true;
              ws.send(JSON.stringify(['EVENT', event]));
            } else {
              console.log(`[NOSTR:publish] AUTH failed: ${okMessage}`);
              resolved = true;
              clearTimeout(timer);
              ws.removeEventListener('message', handler);
              resolve({ success: false, eventId: event.id, error: `Auth failed: ${okMessage}` });
            }
            return;
          }

          // Check if this is OK for our actual event
          if (okEventId === event.id) {
            console.log(`[NOSTR:publish] Got OK for our event, success=${okSuccess}`);
            resolved = true;
            clearTimeout(timer);
            ws.removeEventListener('message', handler);
            if (okSuccess) {
              clearRelayBackoff(relayUrl);
              resolve({ success: true, eventId: event.id });
            } else {
              // Check if it's an auth-required error
              if (okMessage.includes('auth-required') && secretKey && !authSent) {
                console.log(`[NOSTR:publish] Auth required but not sent yet, waiting for AUTH challenge`);
                resolved = false;
                return;
              }
              if (isRateLimitError(okMessage)) setRelayBackoff(relayUrl, true);
              resolve({ success: false, eventId: event.id, error: okMessage || 'Event rejected' });
            }
          }
        }

        // Handle NOTICE
        if (type === 'NOTICE') {
          console.log(`[NOSTR:publish] Got NOTICE: ${rest[0]}`);
        }

        // Handle CLOSED
        if (type === 'CLOSED') {
          console.log(`[NOSTR:publish] Got CLOSED: ${rest[0]} - ${rest[1]}`);
        }
      } catch (e) {
        console.log(`[NOSTR:publish] Error parsing message:`, e);
      }
    };

    ws.addEventListener('message', handler);
    console.log(`[NOSTR:publish] Sending EVENT message for kind=${event.kind}`);
    ws.send(JSON.stringify(['EVENT', event]));
  });
}

export async function publishToAllRelays(event: NostrEvent, secretKey?: Uint8Array): Promise<{
  successful: string[];
  failed: Array<{ url: string; error: string }>;
}> {
  const urls = getRelayUrls();
  const results = await Promise.allSettled(urls.map(url => publishEvent(url, event, RESPONSE_TIMEOUT, secretKey)));

  const successful: string[] = [];
  const failed: Array<{ url: string; error: string }> = [];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.success) successful.push(urls[i]);
    else failed.push({ url: urls[i], error: r.status === 'fulfilled' ? r.value.error || 'Unknown' : String(r.reason) });
  });

  return { successful, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscribing
// ─────────────────────────────────────────────────────────────────────────────

export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  '#e'?: string[];
  '#p'?: string[];
  since?: number;
  until?: number;
  limit?: number;
}

export interface SubscribeOptions {
  onEvent: (event: NostrEvent) => void;
  onEose?: () => void;
  onError?: (error: string) => void;
}

export async function subscribe(
  relayUrl: string,
  filters: NostrFilter[],
  options: SubscribeOptions
): Promise<string | null> {
  const conn = await connect(relayUrl);
  if (!conn.success || !conn.ws) {
    options.onError?.(conn.error || 'Failed to connect');
    return null;
  }

  const ws = conn.ws;
  const subId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const poolEntry = connectionPool.get(relayUrl);
  poolEntry?.subscriptions.add(subId);

  const handler = (msg: MessageEvent) => {
    try {
      const data = JSON.parse(msg.data);
      if (!Array.isArray(data)) return;
      const [type, ...rest] = data;
      if (type === 'EVENT' && rest[0] === subId) options.onEvent(rest[1] as NostrEvent);
      else if (type === 'EOSE' && rest[0] === subId) options.onEose?.();
      else if (type === 'CLOSED' && rest[0] === subId) options.onError?.(rest[1] || 'Closed');
    } catch { /* ignore */ }
  };

  ws.addEventListener('message', handler);
  ws.send(JSON.stringify(['REQ', subId, ...filters]));
  return subId;
}

export function unsubscribe(relayUrl: string, subId: string): void {
  const conn = connectionPool.get(relayUrl);
  if (conn?.ws.readyState === WebSocket.OPEN) {
    conn.ws.send(JSON.stringify(['CLOSE', subId]));
    conn.subscriptions.delete(subId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invite Codes
// ─────────────────────────────────────────────────────────────────────────────

export interface InviteResult {
  success: boolean;
  inviteCode?: string;
  error?: string;
}

export async function redeemInviteCode(inviteCode: string, secretKey: Uint8Array): Promise<{ success: boolean; error?: string }> {
  const relayUrl = getPrimaryRelayUrl();
  const backoff = isRelayInBackoff(relayUrl);
  if (backoff.inBackoff) return { success: false, error: `Rate limited, retry in ${backoff.waitTime}s` };

  const conn = await connect(relayUrl);
  if (!conn.success || !conn.ws) return { success: false, error: conn.error };

  const template: EventTemplate = {
    kind: 28934,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['claim', inviteCode]],
    content: '',
  };
  const event = finalizeEvent(template, secretKey);
  const ws = conn.ws;

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ success: false, error: 'Timeout' }), RESPONSE_TIMEOUT);
    const handler = (msg: MessageEvent) => {
      try {
        const data = JSON.parse(msg.data);
        if (Array.isArray(data) && data[0] === 'OK' && data[1] === event.id) {
          clearTimeout(timer);
          ws.removeEventListener('message', handler);
          if (data[2]) { clearRelayBackoff(relayUrl); resolve({ success: true }); }
          else resolve({ success: false, error: data[3] || 'Rejected' });
        }
      } catch { /* ignore */ }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify(['EVENT', event]));
  });
}

export async function requestInviteCode(secretKey: Uint8Array): Promise<InviteResult> {
  const relayUrl = getPrimaryRelayUrl();
  console.log('[InviteCode] Starting request to relay:', relayUrl);
  if (!relayUrl) {
    console.log('[InviteCode] No relay URL configured!');
    return { success: false, error: 'No relay configured' };
  }

  const backoff = isRelayInBackoff(relayUrl);
  if (backoff.inBackoff) {
    console.log('[InviteCode] Relay in backoff, wait time:', backoff.waitTime);
    return { success: false, error: `Rate limited, retry in ${backoff.waitTime}s` };
  }

  console.log('[InviteCode] Connecting to relay...');
  const conn = await connect(relayUrl);
  if (!conn.success || !conn.ws) {
    console.log('[InviteCode] Connection failed:', conn.error);
    return { success: false, error: conn.error };
  }
  console.log('[InviteCode] Connected successfully, ws readyState:', conn.ws.readyState);

  const ws = conn.ws;
  return new Promise((resolve) => {
    let authChallenge: string | null = null;
    let authSent = false;
    let resolved = false;
    const finish = (result: InviteResult) => {
      if (!resolved) {
        resolved = true;
        console.log('[InviteCode] Finishing with result:', result.success ? 'success' : result.error);
        resolve(result);
      }
    };
    const timer = setTimeout(() => {
      console.log('[InviteCode] Request timed out. authChallenge received:', !!authChallenge, 'authSent:', authSent);
      finish({ success: false, error: 'Timeout' });
    }, RESPONSE_TIMEOUT);

    const handler = (msg: MessageEvent) => {
      try {
        const data = JSON.parse(msg.data);
        if (!Array.isArray(data)) return;
        const [type, ...rest] = data;
        console.log('[InviteCode] Received message type:', type);

        if (type === 'AUTH' && typeof rest[0] === 'string') {
          authChallenge = rest[0];
          console.log('[InviteCode] Got AUTH challenge:', authChallenge.substring(0, 20) + '...');
          const authEvent = finalizeEvent({
            kind: 22242,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['challenge', authChallenge], ['relay', relayUrl]],
            content: '',
          }, secretKey);
          authSent = true;
          ws.send(JSON.stringify(['AUTH', authEvent]));
          console.log('[InviteCode] AUTH event sent, id:', authEvent.id.substring(0, 16));
        } else if (type === 'OK' && authChallenge) {
          console.log('[InviteCode] Got OK response for:', rest[0]?.substring?.(0, 16), 'success:', rest[1], 'msg:', rest[2]);
          if (rest[1]) {
            console.log('[InviteCode] Auth succeeded, requesting invite code (kind 28935)...');
            setTimeout(() => ws.send(JSON.stringify(['REQ', `inv_${Date.now()}`, { kinds: [28935], limit: 1 }])), 100);
          } else {
            console.log('[InviteCode] AUTH failed:', rest[2]);
            clearTimeout(timer);
            // Check if it's a "not a member" error
            const errorMsg = rest[2] || 'unknown';
            const isNotMember = errorMsg.toLowerCase().includes('not a member') ||
                               errorMsg.toLowerCase().includes('not found') ||
                               errorMsg.toLowerCase().includes('unauthorized');
            finish({ success: false, error: isNotMember ? 'not_a_member' : `Auth failed: ${errorMsg}` });
          }
        } else if (type === 'EVENT' && rest[1]?.kind === 28935) {
          console.log('[InviteCode] Got invite event, tags:', JSON.stringify(rest[1].tags));
          const claim = rest[1].tags?.find((t: string[]) => t[0] === 'claim')?.[1];
          if (claim) {
            console.log('[InviteCode] Found claim tag, invite code length:', claim.length);
            clearTimeout(timer);
            clearRelayBackoff(relayUrl);
            finish({ success: true, inviteCode: claim });
          } else {
            console.log('[InviteCode] No claim tag in event');
          }
        } else if (type === 'EOSE') {
          console.log('[InviteCode] Got EOSE, waiting 2s for late events...');
          setTimeout(() => {
            if (!resolved) {
              console.log('[InviteCode] No invite found after EOSE');
              finish({ success: false, error: 'No invite available' });
            }
          }, 2000);
        } else if (type === 'CLOSED') {
          console.log('[InviteCode] Subscription closed:', rest[0], rest[1]);
        } else if (type === 'NOTICE') {
          console.log('[InviteCode] Server notice:', rest[0]);
        }
      } catch (e) {
        console.log('[InviteCode] Error parsing message:', e);
      }
    };

    ws.addEventListener('message', handler);
    console.log('[InviteCode] Sending initial REQ for kind 28935...');
    ws.send(JSON.stringify(['REQ', `inv_${Date.now()}`, { kinds: [28935], limit: 1 }]));
  });
}

export async function getOrRequestInviteCode(secretKey: Uint8Array): Promise<InviteResult> {
  console.log('[InviteCode] getOrRequestInviteCode called');
  const stored = localStorage.getItem('osv_invite_code');
  if (stored && /^[0-9a-f]{192}$/i.test(stored)) {
    console.log('[InviteCode] Found valid stored invite code');
    return { success: true, inviteCode: stored };
  }
  console.log('[InviteCode] No stored code, requesting from relay...');
  const result = await requestInviteCode(secretKey);
  if (result.success && result.inviteCode) {
    console.log('[InviteCode] Got invite code, storing in localStorage');
    localStorage.setItem('osv_invite_code', result.inviteCode);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status
// ─────────────────────────────────────────────────────────────────────────────

export function getRelayStatus(): Array<{ url: string; status: string }> {
  return getRelayUrls().map(url => {
    const conn = connectionPool.get(url);
    return { url, status: conn?.status === 'connected' && conn.ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected' };
  });
}

export function getConnectionStatus(): Array<{ url: string; connected: boolean }> {
  return getRelayUrls().map(url => {
    const conn = connectionPool.get(url);
    return { url, connected: conn?.status === 'connected' && conn.ws.readyState === WebSocket.OPEN };
  });
}

export async function initializeRelayConnections(): Promise<void> {
  const results = await Promise.allSettled(getRelayUrls().map(url => connect(url)));
  const ok = results.filter(r => r.status === 'fulfilled' && (r.value as ConnectResult).success).length;
  console.log(`[NOSTR] Connected to ${ok}/${results.length} relays`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Keypair & Credentials
// ─────────────────────────────────────────────────────────────────────────────

export async function deriveNostrKeypair(serialNumber: string, password: string): Promise<{ nsec: string; npub: string; secretKey: Uint8Array }> {
  const data = new TextEncoder().encode(`${serialNumber}:${password}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const secretKey = new Uint8Array(hash);
  const pubkey = getPublicKey(secretKey);
  return { nsec: nip19.nsecEncode(secretKey), npub: nip19.npubEncode(pubkey), secretKey };
}

export function storeCredentials(username: string, npub: string): void {
  localStorage.setItem('osv_username', username);
  localStorage.setItem('osv_npub', npub);
}

export function getStoredCredentials(): { username: string; npub: string } | null {
  const username = localStorage.getItem('osv_username');
  const npub = localStorage.getItem('osv_npub');
  return username && npub ? { username, npub } : null;
}

export function clearCredentials(): void {
  localStorage.removeItem('osv_username');
  localStorage.removeItem('osv_npub');
}

export async function hashSerialNumber(serialNumber: string): Promise<string> {
  const data = new TextEncoder().encode(serialNumber);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function getSerialNumberFromURL(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  return hash.length > 1 ? hash.substring(1) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export function isNostrEvent(obj: unknown): obj is NostrEvent {
  return obj !== null && typeof obj === 'object' &&
    typeof (obj as NostrEvent).id === 'string' &&
    typeof (obj as NostrEvent).pubkey === 'string' &&
    typeof (obj as NostrEvent).created_at === 'number' &&
    typeof (obj as NostrEvent).kind === 'number' &&
    Array.isArray((obj as NostrEvent).tags) &&
    typeof (obj as NostrEvent).content === 'string' &&
    typeof (obj as NostrEvent).sig === 'string';
}

export function validateNpub(npub: string): boolean {
  if (!npub?.startsWith('npub1') || npub.length !== 63) return false;
  try {
    return nip19.decode(npub).type === 'npub';
  } catch { return false; }
}

export function pubkeyToNpub(pubkey: string): string {
  return nip19.npubEncode(pubkey);
}

export function npubToPubkey(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== 'npub') throw new Error('Invalid npub');
  return decoded.data as string;
}

export function validateNostrEvent(event: NostrEvent, options: { expectedKind?: number; maxAgeSeconds?: number } = {}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isNostrEvent(event)) { errors.push('Invalid structure'); return { valid: false, errors }; }
  if (!verifyNostrEvent(event)) errors.push('Invalid signature');
  if (options.expectedKind !== undefined && event.kind !== options.expectedKind) errors.push(`Expected kind ${options.expectedKind}`);
  if (options.maxAgeSeconds) {
    const age = Math.floor(Date.now() / 1000) - event.created_at;
    if (age > options.maxAgeSeconds) errors.push('Event too old');
  }
  return { valid: errors.length === 0, errors };
}
