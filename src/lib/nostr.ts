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

export function getRelayUrls(): string[] {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('osv_relay_urls');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch { /* ignore */ }
    }
  }
  return []; // No default relays - must be configured via localStorage or fetched from server
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
  const backoff = isRelayInBackoff(relayUrl);
  if (backoff.inBackoff) {
    return { success: false, error: `Rate limited, retry in ${backoff.waitTime}s` };
  }

  const existing = connectionPool.get(relayUrl);
  if (existing?.status === 'connected' && existing.ws.readyState === WebSocket.OPEN) {
    return { success: true, ws: existing.ws };
  }

  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(relayUrl);
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
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
        console.log(`[NOSTR] Connected to ${relayUrl}`);
        resolve({ success: true, ws });
      };

      ws.onerror = (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        setRelayBackoff(relayUrl, isRateLimitError(err));
        resolve({ success: false, error: 'Connection error' });
      };

      ws.onclose = (event) => {
        connectionPool.delete(relayUrl);
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          setRelayBackoff(relayUrl, event.code === 429 || (event.reason ? isRateLimitError(event.reason) : false));
          resolve({ success: false, error: `Connection closed (${event.code})` });
        }
      };
    } catch (err) {
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
  timeout = RESPONSE_TIMEOUT
): Promise<PublishResult> {
  const conn = await connect(relayUrl);
  if (!conn.success || !conn.ws) return { success: false, error: conn.error };

  const ws = conn.ws;
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; resolve({ success: true, eventId: event.id }); }
    }, timeout);

    const handler = (msg: MessageEvent) => {
      try {
        const data = JSON.parse(msg.data);
        if (Array.isArray(data) && data[0] === 'OK' && data[1] === event.id) {
          resolved = true;
          clearTimeout(timer);
          ws.removeEventListener('message', handler);
          if (data[2]) {
            clearRelayBackoff(relayUrl);
            resolve({ success: true, eventId: event.id });
          } else {
            if (isRateLimitError(data[3])) setRelayBackoff(relayUrl, true);
            resolve({ success: false, eventId: event.id, error: data[3] || 'Event rejected' });
          }
        }
      } catch { /* ignore */ }
    };

    ws.addEventListener('message', handler);
    ws.send(JSON.stringify(['EVENT', event]));
  });
}

export async function publishToAllRelays(event: NostrEvent): Promise<{
  successful: string[];
  failed: Array<{ url: string; error: string }>;
}> {
  const urls = getRelayUrls();
  const results = await Promise.allSettled(urls.map(url => publishEvent(url, event)));

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
  const backoff = isRelayInBackoff(relayUrl);
  if (backoff.inBackoff) return { success: false, error: `Rate limited, retry in ${backoff.waitTime}s` };

  const conn = await connect(relayUrl);
  if (!conn.success || !conn.ws) return { success: false, error: conn.error };

  const ws = conn.ws;
  return new Promise((resolve) => {
    let authChallenge: string | null = null;
    let resolved = false;
    const finish = (result: InviteResult) => { if (!resolved) { resolved = true; resolve(result); } };
    const timer = setTimeout(() => finish({ success: false, error: 'Timeout' }), RESPONSE_TIMEOUT);

    const handler = (msg: MessageEvent) => {
      try {
        const data = JSON.parse(msg.data);
        if (!Array.isArray(data)) return;
        const [type, ...rest] = data;

        if (type === 'AUTH' && typeof rest[0] === 'string') {
          authChallenge = rest[0];
          const authEvent = finalizeEvent({
            kind: 22242,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['challenge', authChallenge], ['relay', relayUrl]],
            content: '',
          }, secretKey);
          ws.send(JSON.stringify(['AUTH', authEvent]));
        } else if (type === 'OK' && rest[1] && authChallenge) {
          setTimeout(() => ws.send(JSON.stringify(['REQ', `inv_${Date.now()}`, { kinds: [28935], limit: 1 }])), 100);
        } else if (type === 'EVENT' && rest[1]?.kind === 28935) {
          const claim = rest[1].tags?.find((t: string[]) => t[0] === 'claim')?.[1];
          if (claim) { clearTimeout(timer); clearRelayBackoff(relayUrl); finish({ success: true, inviteCode: claim }); }
        } else if (type === 'EOSE') {
          setTimeout(() => { if (!resolved) finish({ success: false, error: 'No invite available' }); }, 2000);
        }
      } catch { /* ignore */ }
    };

    ws.addEventListener('message', handler);
    ws.send(JSON.stringify(['REQ', `inv_${Date.now()}`, { kinds: [28935], limit: 1 }]));
  });
}

export async function getOrRequestInviteCode(secretKey: Uint8Array): Promise<InviteResult> {
  const stored = localStorage.getItem('osv_invite_code');
  if (stored && /^[0-9a-f]{192}$/i.test(stored)) return { success: true, inviteCode: stored };
  const result = await requestInviteCode(secretKey);
  if (result.success && result.inviteCode) localStorage.setItem('osv_invite_code', result.inviteCode);
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
