/**
 * Server-side NOSTR Library
 *
 * Complete server-side NOSTR utilities:
 * - Backoff management for rate limiting
 * - Event publishing with NIP-42 authentication
 * - Connection pool for long-running scripts
 * - NIP-29 group management
 * - Validation utilities
 */

import { finalizeEvent, getPublicKey, nip19, type EventTemplate, utils } from 'nostr-tools';
import type WebSocket from 'ws';
import { type NostrEvent } from './nostr-events';
import settings from '../../settings.json';

const { hexToBytes, bytesToHex } = utils;

// Re-export types from nostr-events
export { NOSTR_KINDS, type NostrEvent } from './nostr-events';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'];
const CONNECTION_TIMEOUT = 15_000;
const RECONNECT_DELAY = 5_000;

// Backoff configuration
const BASE_BACKOFF = 5000; // 5 seconds
const MAX_BACKOFF = 120000; // 2 minutes
const RATE_LIMIT_BACKOFF = 60000; // 1 minute for 429 errors

// ─────────────────────────────────────────────────────────────────────────────
// Backoff Management
// ─────────────────────────────────────────────────────────────────────────────

interface BackoffEntry {
  until: number;
  attempts: number;
}

// Server-side in-memory backoff storage
const backoffState: Map<string, BackoffEntry> = new Map();

/**
 * Check if a relay is in backoff period
 */
export function isRelayInBackoff(url: string): { inBackoff: boolean; waitTime: number } {
  const entry = backoffState.get(url);
  if (!entry) return { inBackoff: false, waitTime: 0 };

  const now = Date.now();
  if (now >= entry.until) {
    backoffState.delete(url);
    return { inBackoff: false, waitTime: 0 };
  }
  return { inBackoff: true, waitTime: Math.ceil((entry.until - now) / 1000) };
}

/**
 * Set backoff for a relay after a failure
 */
export function setRelayBackoff(url: string, isRateLimited: boolean = false): void {
  const entry = backoffState.get(url) || { until: 0, attempts: 0 };
  entry.attempts++;
  const baseDelay = isRateLimited ? RATE_LIMIT_BACKOFF : BASE_BACKOFF;
  entry.until = Date.now() + Math.min(baseDelay * Math.pow(2, entry.attempts - 1), MAX_BACKOFF);
  backoffState.set(url, entry);
  console.log(`[NOSTR Server] Backoff for ${url}: ${Math.ceil((entry.until - Date.now()) / 1000)}s`);
}

/**
 * Clear backoff for a relay after successful connection
 */
export function clearRelayBackoff(url: string): void {
  backoffState.delete(url);
}

/**
 * Check if an error indicates rate limiting
 */
export function isRateLimitError(error: unknown): boolean {
  const str = String(error);
  return str.includes('429') || str.includes('Too Many') || str.includes('rate limit');
}

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket Helper
// ─────────────────────────────────────────────────────────────────────────────

async function getWebSocket(): Promise<typeof import('ws').default> {
  // @ts-expect-error - Bun global
  if (typeof Bun !== 'undefined') {
    const ws = require('ws');
    return ws.default || ws;
  }
  const wsModule = await import('ws');
  return wsModule.default;
}

// ─────────────────────────────────────────────────────────────────────────────
// Relay URLs
// ─────────────────────────────────────────────────────────────────────────────

export function getRelayUrls(): string[] {
  const envRelays = process.env.NOSTR_RELAYS;
  if (envRelays) {
    return envRelays.split(',').map(r => r.trim()).filter(Boolean);
  }
  return DEFAULT_RELAYS;
}

export function getPrimaryRelayUrl(): string {
  return getRelayUrls()[0];
}

/**
 * Get the relay URL for NIP-42 AUTH events
 */
export function getRelayAuthUrl(relayUrl: string): string {
  if (process.env.NOSTR_RELAY_AUTH_URL) {
    return process.env.NOSTR_RELAY_AUTH_URL;
  }
  try {
    const u = new URL(relayUrl);
    u.pathname = '';
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return relayUrl;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Publishing
// ─────────────────────────────────────────────────────────────────────────────

export interface PublishOptions {
  /** Secret key for NIP-42 authentication (if relay requires auth) */
  secretKey?: Uint8Array;
  /** Connection timeout in milliseconds (default: 15000) */
  timeout?: number;
  /** Custom relay URLs (overrides env config) */
  relayUrls?: string[];
}

export interface PublishResult {
  success: boolean;
  published: string[];
  failed: Array<{ url: string; error: string }>;
  eventId?: string;
}

/**
 * Publish a NOSTR event to all configured relays
 */
export async function publishNostrEvent(
  event: NostrEvent,
  options: PublishOptions = {}
): Promise<PublishResult> {
  console.log('[NOSTR Server] Publishing event...', {
    id: event.id,
    kind: event.kind,
    pubkey: event.pubkey.substring(0, 16) + '...',
  });

  const relayUrls = options.relayUrls || getRelayUrls();

  if (relayUrls.length === 0) {
    console.error('[NOSTR Server] No relay URLs configured');
    return {
      success: false,
      published: [],
      failed: [{ url: 'none', error: 'No relay URLs configured' }],
      eventId: event.id,
    };
  }

  // Filter out relays in backoff
  const availableRelays = relayUrls.filter(url => {
    const backoff = isRelayInBackoff(url);
    if (backoff.inBackoff) {
      console.log(`[NOSTR Server] Skipping ${url} (backoff ${backoff.waitTime}s)`);
      return false;
    }
    return true;
  });

  if (availableRelays.length === 0) {
    console.warn('[NOSTR Server] All relays in backoff');
    return {
      success: false,
      published: [],
      failed: relayUrls.map(url => ({ url, error: 'Relay in backoff period' })),
      eventId: event.id,
    };
  }

  const results = await Promise.allSettled(
    availableRelays.map(url => publishToSingleRelay(url, event, options))
  );

  const published: string[] = [];
  const failed: Array<{ url: string; error: string }> = [];

  results.forEach((result, index) => {
    const url = availableRelays[index];
    if (result.status === 'fulfilled') {
      clearRelayBackoff(url);
      published.push(url);
    } else {
      const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      setRelayBackoff(url, isRateLimitError(errorMsg));
      failed.push({ url, error: errorMsg });
    }
  });

  console.log('[NOSTR Server] Published:', published.length, 'Failed:', failed.length);
  return { success: published.length > 0, published, failed, eventId: event.id };
}

async function publishToSingleRelay(
  url: string,
  event: NostrEvent,
  options: PublishOptions
): Promise<void> {
  const WebSocket = await getWebSocket();
  // @ts-expect-error - Bun global check
  const https = typeof Bun !== 'undefined' ? require('https') : eval('require')('https');
  const timeout = options.timeout || CONNECTION_TIMEOUT;

  const agent = url.startsWith('wss://')
    ? new https.Agent({ ALPNProtocols: ['http/1.1'] })
    : undefined;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { skipUTF8Validation: true, agent });
    let resolved = false;
    let authenticated = false;
    let pendingAuthChallenge: string | null = null;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(new Error('Connection timeout'));
      }
    }, timeout);

    const cleanup = () => {
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
    };

    const handleSuccess = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve();
    };

    const handleError = (error: string) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(new Error(error));
    };

    const sendEvent = () => {
      ws.send(JSON.stringify(['EVENT', event]));
    };

    const handleAuth = (challenge: string) => {
      if (!options.secretKey) {
        handleError('Authentication required but no secret key provided');
        return;
      }
      const authEvent = finalizeEvent({
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['challenge', challenge], ['relay', url]],
        content: '',
      }, options.secretKey);
      ws.send(JSON.stringify(['AUTH', authEvent]));
    };

    const triggerAuth = () => {
      ws.send(JSON.stringify(['REQ', `auth_${Date.now()}`, { kinds: [28935], limit: 1 }]));
    };

    ws.on('open', () => {
      if (options.secretKey) {
        triggerAuth();
      } else {
        sendEvent();
      }
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (!Array.isArray(msg) || msg.length < 2) return;
        const [type, ...rest] = msg;

        if (type === 'AUTH' && typeof rest[0] === 'string') {
          pendingAuthChallenge = rest[0];
          handleAuth(rest[0]);
        } else if (type === 'OK') {
          const [eventId, accepted, message] = rest;
          if (eventId !== event.id && accepted) {
            authenticated = true;
            sendEvent();
          } else if (eventId === event.id) {
            if (accepted) {
              handleSuccess();
            } else {
              const errorMsg = message || 'Unknown rejection';
              if ((errorMsg.includes('not authorized') || errorMsg.includes('auth')) &&
                  !authenticated && options.secretKey && pendingAuthChallenge) {
                return;
              }
              handleError(errorMsg);
            }
          }
        }
      } catch { /* ignore */ }
    });

    ws.on('error', (error) => {
      handleError(isRateLimitError(error.message) ? `Rate limited: ${url}` : `WebSocket error: ${error.message}`);
    });

    ws.on('close', (code) => {
      if (!resolved) handleError(`Connection closed (${code})`);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection Pool (for long-running scripts)
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

export interface ConnectionOptions {
  secretKey: Uint8Array;
  timeout?: number;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  onConnect?: (url: string) => void;
  onDisconnect?: (url: string) => void;
  onAuth?: (url: string) => void;
  onError?: (url: string, error: Error) => void;
}

export interface SubscriptionOptions {
  filters: NostrFilter[];
  onEvent: (event: NostrEvent, relayUrl: string) => void;
  onEose?: (relayUrl: string) => void;
}

/**
 * Single relay connection with auto-reconnect
 */
export class NostrConnection {
  private ws: WebSocket | null = null;
  private url: string;
  private options: ConnectionOptions;
  private authenticated = false;
  private subscriptionId: string | null = null;
  private subscriptionOptions: SubscriptionOptions | null = null;
  private closed = false;
  private logPrefix: string;

  constructor(url: string, options: ConnectionOptions, logPrefix = '[NostrConnection]') {
    this.url = url;
    this.options = { timeout: CONNECTION_TIMEOUT, autoReconnect: true, reconnectDelay: RECONNECT_DELAY, ...options };
    this.logPrefix = logPrefix;
  }

  async connect(): Promise<void> {
    const backoff = isRelayInBackoff(this.url);
    if (backoff.inBackoff) {
      throw new Error(`Relay ${this.url} in backoff, ${backoff.waitTime}s remaining`);
    }

    return new Promise(async (resolve, reject) => {
      console.log(`${this.logPrefix} Connecting to ${this.url}...`);
      const WebSocket = (await import('ws')).default;
      this.ws = new WebSocket(this.url);
      this.authenticated = false;
      let resolved = false;
      let subscribed = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.ws?.close();
          setRelayBackoff(this.url, false);
          reject(new Error(`Connection timeout: ${this.url}`));
        }
      }, this.options.timeout);

      const subscribe = () => {
        if (subscribed || !this.subscriptionOptions) return;
        subscribed = true;
        this.subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        this.ws?.send(JSON.stringify(['REQ', this.subscriptionId, ...this.subscriptionOptions.filters]));
      };

      const handleAuth = (challenge: string) => {
        const authEvent = finalizeEvent({
          kind: 22242,
          created_at: Math.floor(Date.now() / 1000),
          tags: [['challenge', challenge], ['relay', getRelayAuthUrl(this.url)]],
          content: '',
        }, this.options.secretKey);
        this.ws?.send(JSON.stringify(['AUTH', authEvent]));
      };

      this.ws.on('open', () => {
        clearTimeout(timeout);
        console.log(`${this.logPrefix} Connected to ${this.url}`);
        clearRelayBackoff(this.url);
        this.options.onConnect?.(this.url);
        setTimeout(() => { if (!this.authenticated && !subscribed && this.subscriptionOptions) subscribe(); }, 500);
        if (!resolved) { resolved = true; resolve(); }
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (!Array.isArray(message) || message.length < 2) return;
          const [type, ...args] = message;

          if (type === 'AUTH' && typeof args[0] === 'string') handleAuth(args[0]);
          else if (type === 'EVENT' && args[1] && this.subscriptionOptions) this.subscriptionOptions.onEvent(args[1] as NostrEvent, this.url);
          else if (type === 'OK' && !this.authenticated && args[1] === true && !subscribed) { this.authenticated = true; this.options.onAuth?.(this.url); subscribe(); }
          else if (type === 'EOSE') this.subscriptionOptions?.onEose?.(this.url);
        } catch { /* ignore */ }
      });

      this.ws.on('error', (error) => {
        setRelayBackoff(this.url, isRateLimitError(error.message));
        this.options.onError?.(this.url, error);
      });

      this.ws.on('close', () => {
        clearTimeout(timeout);
        this.ws = null;
        this.authenticated = false;
        this.options.onDisconnect?.(this.url);
        if (!resolved) { resolved = true; reject(new Error(`Connection closed: ${this.url}`)); return; }
        if (this.options.autoReconnect && !this.closed) {
          setTimeout(() => { if (!this.closed) this.connect().catch(() => {}); }, this.options.reconnectDelay);
        }
      });
    });
  }

  subscribe(options: SubscriptionOptions): void {
    this.subscriptionOptions = options;
    if (this.ws && this.ws.readyState === 1) {
      this.subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      this.ws.send(JSON.stringify(['REQ', this.subscriptionId, ...options.filters]));
    }
  }

  async publish(event: NostrEvent): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== 1) return false;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(true), 10000);
      const handler = (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (Array.isArray(msg) && msg[0] === 'OK' && msg[1] === event.id) {
            clearTimeout(timer);
            this.ws?.off('message', handler);
            resolve(msg[2] === true);
          }
        } catch { /* ignore */ }
      };
      this.ws!.on('message', handler);
      this.ws!.send(JSON.stringify(['EVENT', event]));
    });
  }

  close(): void {
    this.closed = true;
    if (this.subscriptionId && this.ws?.readyState === 1) this.ws.send(JSON.stringify(['CLOSE', this.subscriptionId]));
    this.ws?.close();
    this.ws = null;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === 1;
  }
}

/**
 * Manage multiple relay connections
 */
export class NostrConnectionPool {
  private connections: Map<string, NostrConnection> = new Map();
  private options: ConnectionOptions;
  private logPrefix: string;

  constructor(options: ConnectionOptions, logPrefix = '[NostrPool]') {
    this.options = options;
    this.logPrefix = logPrefix;
  }

  async connectToRelays(urls: string[]): Promise<{ connected: number; failed: number }> {
    const results = await Promise.allSettled(
      urls.map(async (url) => {
        const conn = new NostrConnection(url, this.options, this.logPrefix);
        await conn.connect();
        this.connections.set(url, conn);
      })
    );
    return {
      connected: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
    };
  }

  subscribeAll(options: SubscriptionOptions): void {
    for (const conn of this.connections.values()) conn.subscribe(options);
  }

  async publishToAll(event: NostrEvent): Promise<{ successful: number; failed: number }> {
    const results = await Promise.allSettled(Array.from(this.connections.values()).map(c => c.publish(event)));
    const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
    return { successful, failed: results.length - successful };
  }

  closeAll(): void {
    for (const conn of this.connections.values()) conn.close();
    this.connections.clear();
  }

  get size(): number {
    return this.connections.size;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export function validateNpub(npub: string): boolean {
  if (!npub?.startsWith('npub1') || npub.length !== 63) return false;
  try { return nip19.decode(npub).type === 'npub'; } catch { return false; }
}

export function npubToPubkey(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== 'npub') throw new Error('Invalid npub');
  return decoded.data as string;
}

export function pubkeyToNpub(pubkey: string): string {
  return nip19.npubEncode(pubkey);
}

// ─────────────────────────────────────────────────────────────────────────────
// NIP-29 Group Management
// ─────────────────────────────────────────────────────────────────────────────

export const NIP29_KINDS = {
  GROUP_METADATA: 39000,
  GROUP_ADMINS: 39001,
  GROUP_MEMBERS: 39002,
  ADD_USER: 9000,
  REMOVE_USER: 9001,
  EDIT_METADATA: 9002,
  DELETE_EVENT: 9005,
  GROUP_NOTE: 9,
  GROUP_REPLY: 10,
} as const;

export const NIP52_KINDS = {
  CALENDAR_EVENT: 31922,
  CALENDAR_TIME_EVENT: 31923,
} as const;

function getAdminSecretKey(): Uint8Array {
  const nsec = process.env.NOSTR_NSEC;
  if (!nsec) throw new Error('NOSTR_NSEC not found in environment variables');
  try {
    const decoded = nip19.decode(nsec);
    const data = decoded.data as Uint8Array;
    return hexToBytes(bytesToHex(data));
  } catch (err) {
    throw new Error(`Failed to decode NOSTR_NSEC: ${err}`);
  }
}

export function createClosedGroup(groupId: string, name: string, description: string, isPrivate = true, isClosed = true): NostrEvent {
  const secretKey = getAdminSecretKey();
  const publicKey = getPublicKey(secretKey);
  const event: EventTemplate = {
    kind: NIP29_KINDS.GROUP_METADATA,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', groupId], ['name', name], ['about', description], ['picture', ''], ['private', isPrivate ? 'true' : 'false'], ['closed', isClosed ? 'true' : 'false'], ['p', publicKey, '', 'admin']],
    content: description,
  };
  return finalizeEvent(event, secretKey) as NostrEvent;
}

export function addGroupMember(groupId: string, memberNpub: string, role = 'member'): NostrEvent {
  const secretKey = getAdminSecretKey();
  let memberPubkey: string;
  try { memberPubkey = nip19.decode(memberNpub).data as string; } catch { throw new Error(`Invalid npub format: ${memberNpub}`); }
  const event: EventTemplate = {
    kind: NIP29_KINDS.ADD_USER,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['h', groupId], ['p', memberPubkey, '', role]],
    content: `Added ${memberNpub} to group ${groupId} as ${role}`,
  };
  return finalizeEvent(event, secretKey) as NostrEvent;
}

export function removeGroupMember(groupId: string, memberNpub: string): NostrEvent {
  const secretKey = getAdminSecretKey();
  let memberPubkey: string;
  try { memberPubkey = nip19.decode(memberNpub).data as string; } catch { throw new Error(`Invalid npub format: ${memberNpub}`); }
  const event: EventTemplate = {
    kind: NIP29_KINDS.REMOVE_USER,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['h', groupId], ['p', memberPubkey]],
    content: `Removed ${memberNpub} from group ${groupId}`,
  };
  return finalizeEvent(event, secretKey) as NostrEvent;
}

export function getGroupSettings() {
  return (settings as { nip29Group?: { id: string; name: string; description: string; isPrivate: boolean; isClosed: boolean } }).nip29Group;
}

export function initializeGroup(): NostrEvent {
  const groupSettings = getGroupSettings();
  if (!groupSettings) throw new Error('No nip29Group configured in settings.json');
  return createClosedGroup(groupSettings.id, groupSettings.name, groupSettings.description, groupSettings.isPrivate, groupSettings.isClosed);
}
