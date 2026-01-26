/**
 * NOSTR Relay Client
 *
 * Handles connections to NOSTR relays and publishing events.
 * Includes comprehensive logging for debugging.
 */

import { type NostrEvent } from './nostr-events';

interface RelayConnection {
  url: string;
  ws: WebSocket | null;
  status: 'disconnected' | 'connecting' | 'connected' | 'error' | 'rate_limited';
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  lastAttempt: number;
  backoffUntil: number;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 5000; // 5 seconds base
const MAX_RECONNECT_DELAY = 120000; // 2 minutes max
const RATE_LIMIT_BACKOFF = 60000; // 1 minute backoff on 429

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number, wasRateLimited: boolean = false): number {
  if (wasRateLimited) {
    // For rate limiting, use longer backoff: 1min, 2min, 4min...
    return Math.min(RATE_LIMIT_BACKOFF * Math.pow(2, attempt), MAX_RECONNECT_DELAY * 2);
  }
  // Normal exponential backoff: 5s, 10s, 20s, 40s...
  return Math.min(BASE_RECONNECT_DELAY * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
}

// Global relay connections
const relayConnections: Map<string, RelayConnection> = new Map();

// Default fallback relays if none configured
const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'];

/**
 * Get relay URLs from NOSTR_RELAYS env variable (comma-separated)
 */
export function getRelayUrls(): string[] {
  // In the browser, try localStorage first
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('osv_relay_urls');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        // Fall through to defaults
      }
    }
  }

  // Server-side: check environment variable
  if (typeof process !== 'undefined' && process.env?.NOSTR_RELAYS) {
    const envRelays = process.env.NOSTR_RELAYS
      .split(',')
      .map(r => r.trim())
      .filter(r => r.length > 0);

    if (envRelays.length > 0) {
      return envRelays;
    }
  }

  // Use defaults as last resort
  return DEFAULT_RELAYS;
}

/**
 * Connect to a NOSTR relay
 *
 * @param url - WebSocket URL of the relay
 * @returns Promise that resolves when connected
 */
export async function connectToRelay(url: string): Promise<WebSocket> {
  console.log(`[NOSTR Relay] Connecting to relay: ${url}`);

  return new Promise((resolve, reject) => {
    // Check if already connected
    const existing = relayConnections.get(url);
    if (existing?.status === 'connected' && existing.ws) {
      console.log(`[NOSTR Relay] Already connected to ${url}`);
      resolve(existing.ws);
      return;
    }

    // Check if we're in backoff period
    if (existing?.backoffUntil && Date.now() < existing.backoffUntil) {
      const waitTime = Math.ceil((existing.backoffUntil - Date.now()) / 1000);
      console.log(`[NOSTR Relay] Rate limited, waiting ${waitTime}s before connecting to ${url}`);
      reject(new Error(`Rate limited, retry in ${waitTime}s`));
      return;
    }

    // Create or update connection record
    const connection: RelayConnection = existing || {
      url,
      ws: null,
      status: 'connecting',
      reconnectAttempts: 0,
      maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      lastAttempt: Date.now(),
      backoffUntil: 0,
    };

    connection.status = 'connecting';
    connection.lastAttempt = Date.now();
    relayConnections.set(url, connection);

    try {
      const ws = new WebSocket(url);
      connection.ws = ws;

      ws.onopen = () => {
        console.log(`[NOSTR Relay] ✓ Connected to ${url}`);
        connection.status = 'connected';
        connection.reconnectAttempts = 0;
        resolve(ws);
      };

      ws.onerror = (error) => {
        console.error(`[NOSTR Relay] ✗ Connection error for ${url}:`, error);

        // Check if it's a rate limit error (429)
        const errorStr = String(error);
        const isRateLimited = errorStr.includes('429') || errorStr.includes('Too Many Requests');

        if (isRateLimited) {
          connection.status = 'rate_limited';
          const backoffDelay = getBackoffDelay(connection.reconnectAttempts, true);
          connection.backoffUntil = Date.now() + backoffDelay;
          console.warn(`[NOSTR Relay] Rate limited by ${url}, backing off for ${backoffDelay / 1000}s`);
        } else {
          connection.status = 'error';
        }
      };

      ws.onclose = (event) => {
        console.log(`[NOSTR Relay] Connection closed for ${url}:`, {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });

        // Check for rate limiting in close reason
        const isRateLimited = event.code === 429 ||
          !!(event.reason && (event.reason.includes('429') || event.reason.includes('Too Many')));

        if (isRateLimited) {
          connection.status = 'rate_limited';
        } else {
          connection.status = 'disconnected';
        }
        connection.ws = null;

        // Attempt reconnection with exponential backoff
        if (!event.wasClean && connection.reconnectAttempts < connection.maxReconnectAttempts) {
          connection.reconnectAttempts++;
          const backoffDelay = getBackoffDelay(connection.reconnectAttempts, isRateLimited);
          connection.backoffUntil = Date.now() + backoffDelay;

          console.log(
            `[NOSTR Relay] Attempting reconnection (${connection.reconnectAttempts}/${connection.maxReconnectAttempts}) in ${backoffDelay / 1000}s...`
          );

          setTimeout(() => {
            connectToRelay(url).catch((err) => {
              console.error(`[NOSTR Relay] Reconnection failed for ${url}:`, err);
            });
          }, backoffDelay);
        } else if (connection.reconnectAttempts >= connection.maxReconnectAttempts) {
          console.error(`[NOSTR Relay] Max reconnection attempts reached for ${url}, giving up`);
        }
      };

      ws.onmessage = (event) => {
        console.log(`[NOSTR Relay] Message from ${url}:`, event.data);
        try {
          const message = JSON.parse(event.data);
          handleRelayMessage(url, message);
        } catch (err) {
          console.error(`[NOSTR Relay] Failed to parse message from ${url}:`, err);
        }
      };

      // Timeout after 10 seconds
      setTimeout(() => {
        if (connection.status === 'connecting') {
          console.error(`[NOSTR Relay] Connection timeout for ${url}`);
          ws.close();
          reject(new Error(`Connection timeout: ${url}`));
        }
      }, 10000);
    } catch (error) {
      console.error(`[NOSTR Relay] Failed to create WebSocket for ${url}:`, error);
      connection.status = 'error';
      reject(error);
    }
  });
}

/**
 * Handle messages from relay
 */
function handleRelayMessage(relayUrl: string, message: unknown) {
  if (!Array.isArray(message) || message.length < 2) {
    console.warn(`[NOSTR Relay] Invalid message format from ${relayUrl}:`, message);
    return;
  }

  const [type, ...args] = message;

  switch (type) {
    case 'EVENT':
      console.log(`[NOSTR Relay] Received EVENT from ${relayUrl}:`, args[1]);
      break;

    case 'OK':
      console.log(`[NOSTR Relay] Received OK from ${relayUrl}:`, {
        eventId: args[0],
        accepted: args[1],
        message: args[2],
      });
      break;

    case 'EOSE':
      console.log(`[NOSTR Relay] End of stored events (EOSE) from ${relayUrl} for subscription:`, args[0]);
      break;

    case 'NOTICE':
      console.log(`[NOSTR Relay] Notice from ${relayUrl}:`, args[0]);
      break;

    default:
      console.log(`[NOSTR Relay] Unknown message type "${type}" from ${relayUrl}:`, args);
  }
}

/**
 * Publish event to a specific relay
 *
 * @param relayUrl - URL of the relay
 * @param event - NOSTR event to publish
 * @returns Promise that resolves when event is sent
 */
export async function publishToRelay(relayUrl: string, event: NostrEvent): Promise<void> {
  console.log(`[NOSTR Relay] Publishing event to ${relayUrl}...`);
  console.log(`[NOSTR Relay] Event ID: ${event.id}`);
  console.log(`[NOSTR Relay] Event kind: ${event.kind}`);

  return new Promise(async (resolve, reject) => {
    try {
      const connection = relayConnections.get(relayUrl);

      let ws: WebSocket;

      // Connect if not already connected
      if (!connection?.ws || connection.status !== 'connected') {
        console.log(`[NOSTR Relay] Not connected to ${relayUrl}, connecting now...`);
        ws = await connectToRelay(relayUrl);
      } else {
        ws = connection.ws;
      }

      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error(`Failed to connect to relay: ${relayUrl}`);
      }

      // Send EVENT message
      const message = JSON.stringify(['EVENT', event]);

      console.log(`[NOSTR Relay] Sending event to ${relayUrl}:`, {
        eventId: event.id.substring(0, 8) + '...',
        kind: event.kind,
        messageSize: message.length,
      });

      // Set up one-time listener for OK response
      const originalOnMessage = ws.onmessage;
      const timeout = setTimeout(() => {
        ws.onmessage = originalOnMessage;
        console.log(`[NOSTR Relay] ✓ Event sent to ${relayUrl} (no response, assuming success)`);
        resolve();
      }, 3000);

      ws.onmessage = (event) => {
        // Call original handler if it exists
        if (originalOnMessage) {
          originalOnMessage.call(ws, event);
        }

        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data) && data[0] === 'OK') {
            clearTimeout(timeout);
            ws.onmessage = originalOnMessage;
            console.log(`[NOSTR Relay] ✓ Event accepted by ${relayUrl}:`, data[2] || 'OK');
            resolve();
          }
        } catch (err) {
          // Ignore parse errors
        }
      };

      ws.send(message);

    } catch (error) {
      console.error(`[NOSTR Relay] ✗ Error publishing to ${relayUrl}:`, error);
      reject(error);
    }
  });
}

/**
 * Publish event to all configured relays
 *
 * @param event - NOSTR event to publish
 * @returns Promise that resolves with results from each relay
 */
export async function publishEvent(event: NostrEvent): Promise<{
  successful: string[];
  failed: { url: string; error: string }[];
}> {
  console.log(`[NOSTR Relay] Publishing event ${event.id} to all relays...`);
  console.log(`[NOSTR Relay] Event kind: ${event.kind}`);

  const relayUrls = getRelayUrls();

  console.log(`[NOSTR Relay] Target relays (${relayUrls.length}):`, relayUrls);

  // Add a small delay to ensure all relays are ready
  const results = await Promise.allSettled(
    relayUrls.map(async (url) => {
      try {
        await publishToRelay(url, event);
        return url;
      } catch (error) {
        throw error;
      }
    })
  );

  const successful: string[] = [];
  const failed: { url: string; error: string }[] = [];

  results.forEach((result, index) => {
    const url = relayUrls[index];

    if (result.status === 'fulfilled') {
      console.log(`[NOSTR Relay] ✓ Successfully published to ${url}`);
      successful.push(url);
    } else {
      console.error(`[NOSTR Relay] ✗ Failed to publish to ${url}:`, result.reason);
      failed.push({
        url,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  console.log(`[NOSTR Relay] Publication summary:`, {
    total: relayUrls.length,
    successful: successful.length,
    failed: failed.length,
  });

  if (successful.length === 0) {
    throw new Error('Failed to publish to any relay');
  }

  return { successful, failed };
}

/**
 * Subscribe to events on a relay
 *
 * @param relayUrl - URL of the relay
 * @param filters - Subscription filters
 * @param onEvent - Callback for received events
 * @returns Subscription ID
 */
export async function subscribeToRelay(
  relayUrl: string,
  filters: unknown[],
  onEvent: (event: NostrEvent) => void
): Promise<string> {
  console.log(`[NOSTR Relay] Subscribing to ${relayUrl}...`);
  console.log(`[NOSTR Relay] Filters:`, filters);

  const connection = relayConnections.get(relayUrl);

  // Connect if not already connected
  if (!connection?.ws || connection.status !== 'connected') {
    console.log(`[NOSTR Relay] Not connected to ${relayUrl}, connecting now...`);
    await connectToRelay(relayUrl);
  }

  const ws = relayConnections.get(relayUrl)?.ws;

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error(`Failed to connect to relay: ${relayUrl}`);
  }

  // Generate subscription ID
  const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Send REQ message
  const message = JSON.stringify(['REQ', subId, ...filters]);

  console.log(`[NOSTR Relay] Subscribing with ID: ${subId}`);

  ws.send(message);

  console.log(`[NOSTR Relay] ✓ Subscription sent to ${relayUrl}`);

  // Set up message handler for this subscription
  const originalOnMessage = ws.onmessage;

  ws.onmessage = (event) => {
    // Call original handler
    if (originalOnMessage) {
      originalOnMessage.call(ws, event);
    }

    // Parse and check for our subscription
    try {
      const data = JSON.parse(event.data);
      if (Array.isArray(data) && data[0] === 'EVENT' && data[1] === subId) {
        console.log(`[NOSTR Relay] Received event for subscription ${subId}:`, data[2].id);
        onEvent(data[2] as NostrEvent);
      }
    } catch (err) {
      console.error(`[NOSTR Relay] Error handling subscription message:`, err);
    }
  };

  return subId;
}

/**
 * Unsubscribe from a relay subscription
 *
 * @param relayUrl - URL of the relay
 * @param subId - Subscription ID to close
 */
export function unsubscribeFromRelay(relayUrl: string, subId: string): void {
  console.log(`[NOSTR Relay] Unsubscribing ${subId} from ${relayUrl}...`);

  const connection = relayConnections.get(relayUrl);

  if (!connection?.ws || connection.status !== 'connected') {
    console.warn(`[NOSTR Relay] Not connected to ${relayUrl}, cannot unsubscribe`);
    return;
  }

  const ws = connection.ws;

  if (ws.readyState !== WebSocket.OPEN) {
    console.warn(`[NOSTR Relay] WebSocket not open for ${relayUrl}, cannot unsubscribe`);
    return;
  }

  // Send CLOSE message
  const message = JSON.stringify(['CLOSE', subId]);
  ws.send(message);

  console.log(`[NOSTR Relay] ✓ Unsubscribe message sent for ${subId}`);
}

/**
 * Disconnect from a relay
 *
 * @param url - URL of the relay to disconnect from
 */
export function disconnectFromRelay(url: string): void {
  console.log(`[NOSTR Relay] Disconnecting from ${url}...`);

  const connection = relayConnections.get(url);

  if (!connection) {
    console.log(`[NOSTR Relay] No connection found for ${url}`);
    return;
  }

  if (connection.ws) {
    connection.ws.close();
    console.log(`[NOSTR Relay] ✓ Disconnected from ${url}`);
  }

  relayConnections.delete(url);
}

/**
 * Disconnect from all relays
 */
export function disconnectAll(): void {
  console.log(`[NOSTR Relay] Disconnecting from all relays...`);

  relayConnections.forEach((connection, url) => {
    if (connection.ws) {
      connection.ws.close();
    }
  });

  relayConnections.clear();

  console.log(`[NOSTR Relay] ✓ Disconnected from all relays`);
}

/**
 * Get status of all relay connections
 */
export function getRelayStatus(): Array<{ url: string; status: string }> {
  // If no connections exist yet, return default relays with disconnected status
  if (relayConnections.size === 0) {
    const relayUrls = getRelayUrls();
    return relayUrls.map(url => ({
      url,
      status: 'disconnected',
    }));
  }

  const status = Array.from(relayConnections.entries()).map(([url, connection]) => ({
    url,
    status: connection.status,
  }));

  return status;
}

/**
 * Pre-connect to all relays
 * Useful for establishing connections before publishing
 */
export async function initializeRelayConnections(): Promise<void> {
  console.log('[NOSTR Relay] Pre-connecting to relays...');

  const relayUrls = getRelayUrls();

  const results = await Promise.allSettled(
    relayUrls.map(url => connectToRelay(url))
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  console.log(`[NOSTR Relay] Pre-connection complete: ${successful} successful, ${failed} failed`);
}
