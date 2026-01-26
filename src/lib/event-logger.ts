/**
 * Unified Event Logger
 *
 * File-based logging for NOSTR events.
 *
 * Logs to DATA_DIR/npubs/:npub/nostr_events.jsonl
 *
 * @see specs/logging.md
 */

import { NostrEvent, logNostrEvent, logNostrEventToAll, readNostrEvents } from './nostr-logger';

/**
 * Log options for event logging
 */
export interface LogOptions {
  /** If true, also log to all mentioned npubs (default: true) */
  logToMentioned?: boolean;
}

/**
 * Log a NOSTR event
 *
 * @param npub - User's NOSTR public key in npub format
 * @param event - NOSTR event to log
 * @param options - Logging options
 * @returns Promise resolving to logging result
 */
export async function logEvent(
  npub: string,
  event: NostrEvent,
  options: LogOptions = {}
): Promise<{ file: boolean }> {
  const { logToMentioned = true } = options;

  const results = { file: false };

  try {
    if (logToMentioned) {
      // Log to author and all mentioned npubs
      logNostrEventToAll(event);
    } else {
      // Log only to the specified npub
      logNostrEvent(npub, event);
    }
    results.file = true;
  } catch (error) {
    console.error('Failed to log to file:', error);
  }

  return results;
}

/**
 * Log multiple events in batch
 *
 * @param npub - User's NOSTR public key in npub format
 * @param events - Array of NOSTR events
 * @param options - Logging options
 * @returns Promise resolving to logging result
 */
export async function logEventBatch(
  npub: string,
  events: NostrEvent[],
  options: LogOptions = {}
): Promise<{ file: number }> {
  const { logToMentioned = true } = options;

  const results = { file: 0 };

  for (const event of events) {
    try {
      if (logToMentioned) {
        logNostrEventToAll(event);
      } else {
        logNostrEvent(npub, event);
      }
      results.file++;
    } catch (error) {
      console.error('Failed to log event to file:', error);
    }
  }

  return results;
}

/**
 * Read events for a user by npub
 *
 * @param npub - User's NOSTR public key in npub format
 * @returns Array of logged events
 */
export function readUserEvents(npub: string): NostrEvent[] {
  return readNostrEvents(npub);
}

/**
 * Create a logger instance for a specific user
 *
 * @param npub - User's NOSTR public key in npub format
 * @returns Logger instance
 */
export function createLogger(npub: string) {
  return {
    /**
     * Log an event for this user
     */
    log: (event: NostrEvent, options?: LogOptions) => {
      return logEvent(npub, event, options);
    },

    /**
     * Log multiple events for this user
     */
    logBatch: (events: NostrEvent[], options?: LogOptions) => {
      return logEventBatch(npub, events, options);
    },

    /**
     * Read all events for this user
     */
    readEvents: () => {
      return readUserEvents(npub);
    },

    /**
     * Get event count for this user
     */
    getEventCount: () => {
      return readUserEvents(npub).length;
    },
  };
}

/**
 * Middleware helper to add logger to request context
 *
 * Usage in API routes:
 * ```typescript
 * const logger = getLoggerFromRequest(request, npub);
 * await logger.log(event);
 * ```
 */
export function getLoggerFromRequest(
  request: { headers: { get: (key: string) => string | null } },
  npub?: string
) {
  // Try to get npub from various sources
  const userNpub =
    npub ||
    request.headers.get('x-npub') ||
    request.headers.get('x-nostr-pubkey') ||
    'unknown';

  return createLogger(userNpub);
}
