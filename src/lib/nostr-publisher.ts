/**
 * Server-side NOSTR event publisher
 * Publishes events to configured NOSTR relays
 * Includes NIP-42 authentication and exponential backoff for rate limiting
 */

import { finalizeEvent, type EventTemplate } from 'nostr-tools';
import { type NostrEvent } from './nostr-events';
import settings from '../../settings.json';

// Dynamic import of ws to avoid webpack bundling issues with native bindings
async function getWebSocket(): Promise<typeof import('ws').default> {
  const wsModule = await import('ws');
  return wsModule.default;
}

// Track rate limiting state per relay
const relayBackoff: Map<string, { until: number; attempts: number }> = new Map();

const BASE_BACKOFF = 5000; // 5 seconds
const MAX_BACKOFF = 120000; // 2 minutes
const RATE_LIMIT_BACKOFF = 60000; // 1 minute for 429 errors

/**
 * Check if a relay is in backoff period
 */
function isRelayInBackoff(url: string): boolean {
  const state = relayBackoff.get(url);
  if (!state) return false;
  if (Date.now() >= state.until) {
    // Backoff period expired, reset
    relayBackoff.delete(url);
    return false;
  }
  return true;
}

/**
 * Set backoff for a relay
 */
function setRelayBackoff(url: string, isRateLimited: boolean = false): void {
  const state = relayBackoff.get(url) || { until: 0, attempts: 0 };
  state.attempts++;

  const baseDelay = isRateLimited ? RATE_LIMIT_BACKOFF : BASE_BACKOFF;
  const delay = Math.min(baseDelay * Math.pow(2, state.attempts - 1), MAX_BACKOFF);
  state.until = Date.now() + delay;

  relayBackoff.set(url, state);
  console.log(`[NOSTR Publisher] Set backoff for ${url}: ${delay / 1000}s (attempt ${state.attempts})`);
}

/**
 * Clear backoff for a relay on success
 */
function clearRelayBackoff(url: string): void {
  relayBackoff.delete(url);
}

/**
 * Get the relay URL for NIP-42 AUTH events.
 * Use NOSTR_RELAY_AUTH_URL env var to override if pyramid's ServiceURL differs from connection URL.
 */
function getRelayAuthUrl(relayUrl: string): string {
  // Allow override via env var
  if (process.env.NOSTR_RELAY_AUTH_URL) {
    return process.env.NOSTR_RELAY_AUTH_URL;
  }

  try {
    const u = new URL(relayUrl);
    u.pathname = '';
    u.search = '';
    u.hash = '';
    // Don't strip port - use the full URL as configured
    return u.toString().replace(/\/$/, '');
  } catch {
    return relayUrl;
  }
}

export interface PublishOptions {
  /** Secret key for NIP-42 authentication (if relay requires auth) */
  secretKey?: Uint8Array;
  /** Connection timeout in milliseconds (default: 15000) */
  timeout?: number;
  /** Custom relay URLs (overrides settings.json) */
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
 * Server-side implementation using WebSocket with NIP-42 auth support
 */
export async function publishNostrEvent(
  event: NostrEvent,
  options: PublishOptions = {}
): Promise<PublishResult> {
  console.log('[NOSTR Publisher] Publishing event to relays...');
  console.log('[NOSTR Publisher] Event:', {
    id: event.id,
    kind: event.kind,
    pubkey: event.pubkey.substring(0, 16) + '...',
  });

  // Get relay URLs from options or settings
  const relayUrls = options.relayUrls || getRelayUrls();

  if (relayUrls.length === 0) {
    console.error('[NOSTR Publisher] No relay URLs configured');
    return {
      success: false,
      published: [],
      failed: [{ url: 'none', error: 'No relay URLs configured' }],
      eventId: event.id,
    };
  }

  console.log(`[NOSTR Publisher] Target relays (${relayUrls.length}):`, relayUrls);

  // Filter out relays in backoff period
  const availableRelays = relayUrls.filter(url => {
    if (isRelayInBackoff(url)) {
      const state = relayBackoff.get(url);
      const waitTime = state ? Math.ceil((state.until - Date.now()) / 1000) : 0;
      console.log(`[NOSTR Publisher] Skipping ${url} (in backoff, ${waitTime}s remaining)`);
      return false;
    }
    return true;
  });

  if (availableRelays.length === 0) {
    console.warn('[NOSTR Publisher] All relays are in backoff period');
    return {
      success: false,
      published: [],
      failed: relayUrls.map(url => ({ url, error: 'Relay in backoff period' })),
      eventId: event.id,
    };
  }

  // Publish to available relays in parallel
  const results = await Promise.allSettled(
    availableRelays.map((url) => publishToSingleRelay(url, event, options))
  );

  const published: string[] = [];
  const failed: Array<{ url: string; error: string }> = [];

  results.forEach((result, index) => {
    const url = availableRelays[index];

    if (result.status === 'fulfilled') {
      console.log(`[NOSTR Publisher] ✓ Successfully published to ${url}`);
      clearRelayBackoff(url);
      published.push(url);
    } else {
      const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error(`[NOSTR Publisher] ✗ Failed to publish to ${url}:`, errorMsg);

      // Check if it's a rate limit error
      const isRateLimited = errorMsg.includes('429') || errorMsg.includes('Too Many') || errorMsg.includes('rate');
      setRelayBackoff(url, isRateLimited);

      failed.push({ url, error: errorMsg });
    }
  });

  console.log('[NOSTR Publisher] Publication summary:', {
    total: relayUrls.length,
    published: published.length,
    failed: failed.length,
  });

  return {
    success: published.length > 0,
    published,
    failed,
    eventId: event.id,
  };
}

/**
 * Publish event to a single relay with NIP-42 auth support
 *
 * Flow:
 * 1. Connect to relay
 * 2. Send EVENT immediately
 * 3. If rejected with "not authorized" or receive AUTH challenge, authenticate
 * 4. After auth OK, resend the EVENT
 */
async function publishToSingleRelay(
  url: string,
  event: NostrEvent,
  options: PublishOptions
): Promise<void> {
  console.log(`[NOSTR Publisher] Connecting to ${url}...`);

  const WebSocket = await getWebSocket();
  const timeout = options.timeout || 15000;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { skipUTF8Validation: true });
    let resolved = false;
    let authenticated = false;
    let eventSentCount = 0;
    let pendingAuthChallenge: string | null = null;

    const timer = setTimeout(() => {
      if (!resolved) {
        console.error(`[NOSTR Publisher] Timeout for ${url} after ${timeout / 1000}s`);
        resolved = true;
        ws.close();
        reject(new Error('Connection timeout'));
      }
    }, timeout);

    const cleanup = () => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // Ignore close errors
      }
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
      eventSentCount++;
      console.log(`[NOSTR Publisher] Sending event to ${url} (attempt ${eventSentCount})...`);
      ws.send(JSON.stringify(['EVENT', event]));
    };

    const handleAuth = (challenge: string) => {
      if (!options.secretKey) {
        console.warn(`[NOSTR Publisher] AUTH required by ${url} but no secret key provided`);
        handleError('Authentication required but no secret key provided');
        return;
      }

      console.log(`[NOSTR Publisher] Handling AUTH challenge from ${url}`);

      // Use the relay URL directly, like nostr-relay-client.ts does
      const authTemplate: EventTemplate = {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['challenge', challenge],
          ['relay', url],
        ],
        content: '',
      };

      const authEvent = finalizeEvent(authTemplate, options.secretKey);
      console.log(`[NOSTR Publisher] Sending AUTH response to ${url}`);
      ws.send(JSON.stringify(['AUTH', authEvent]));
    };

    // Helper to trigger authentication by sending a REQ for kind 28935
    // Pyramid sends AUTH challenges for REQs on protected kinds, not for EVENTs
    const triggerAuth = () => {
      const subId = `auth_trigger_${Date.now()}`;
      console.log(`[NOSTR Publisher] Sending REQ for kind 28935 to trigger auth...`);
      ws.send(JSON.stringify(['REQ', subId, { kinds: [28935], limit: 1 }]));
    };

    ws.on('open', () => {
      console.log(`[NOSTR Publisher] Connected to ${url}`);
      // If we have a secret key, trigger auth first; otherwise send event directly
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

        // Handle AUTH challenge
        if (type === 'AUTH' && typeof rest[0] === 'string') {
          pendingAuthChallenge = rest[0];
          handleAuth(rest[0]);
          return;
        }

        // Handle NOTICE
        if (type === 'NOTICE') {
          console.log(`[NOSTR Publisher] NOTICE from ${url}: ${rest[0]}`);
        }

        // Handle CLOSED (subscription closed, might trigger auth)
        if (type === 'CLOSED') {
          const reason = rest[1] || '';
          console.log(`[NOSTR Publisher] CLOSED from ${url}: ${reason}`);
          // Auth-required is expected, AUTH challenge should follow
        }

        // Handle EOSE (end of stored events)
        if (type === 'EOSE') {
          console.log(`[NOSTR Publisher] EOSE from ${url}`);
        }

        // Handle OK response
        if (type === 'OK') {
          const [eventId, accepted, message] = rest;

          // Check if this is an OK for our auth event (not our main event)
          if (eventId !== event.id && accepted) {
            console.log(`[NOSTR Publisher] AUTH accepted by ${url}`);
            authenticated = true;
            // Resend the actual event after successful auth
            sendEvent();
            return;
          }

          // This is the OK for our main event
          if (eventId === event.id) {
            if (accepted) {
              console.log(`[NOSTR Publisher] Event ACCEPTED by ${url}`);
              handleSuccess();
            } else {
              const errorMsg = message || 'Unknown rejection reason';

              // Check if rejected due to auth requirement and we have a pending auth
              if (errorMsg.includes('not authorized') || errorMsg.includes('auth')) {
                if (!authenticated && options.secretKey && pendingAuthChallenge) {
                  // We have a pending auth challenge, wait for auth to complete
                  console.log(`[NOSTR Publisher] Event rejected (auth pending), waiting for auth to complete...`);
                  return;
                }
                // Note: Pyramid relay doesn't send AUTH challenges for EVENTs,
                // it just rejects them. So if we don't have a pending auth challenge,
                // we should fail immediately rather than waiting.
              }

              console.error(`[NOSTR Publisher] Event REJECTED by ${url}: ${errorMsg}`);
              handleError(errorMsg);
            }
          }
        }
      } catch (e) {
        console.error(`[NOSTR Publisher] Error parsing message from ${url}:`, e);
      }
    });

    ws.on('error', (error) => {
      console.error(`[NOSTR Publisher] WebSocket error for ${url}:`, error.message);
      // Check for rate limiting in error
      const errorStr = error.message || '';
      if (errorStr.includes('429') || errorStr.includes('Too Many')) {
        handleError(`Rate limited (429): ${url}`);
      } else {
        handleError(`WebSocket error: ${error.message}`);
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[NOSTR Publisher] Connection closed to ${url} (code: ${code}, reason: ${reason || 'none'})`);
      if (!resolved) {
        handleError(`Connection closed (code: ${code})`);
      }
    });
  });
}

/**
 * Get relay URLs from settings.json
 */
function getRelayUrls(): string[] {
  return settings.nostrRelays || [];
}
