/**
 * Server-side NOSTR event logging
 * Appends events to nostr_events.jsonl files organized by npub
 *
 * Storage location: DATA_DIR/npubs/:npub/nostr_events.jsonl
 *
 * Events are logged for:
 * - The author of the event (event.pubkey)
 * - All npubs mentioned in p tags
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { nip19 } from 'nostr-tools';

/**
 * NOSTR Event type (simplified for our needs)
 */
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/**
 * Get the data directory (reads env at runtime for testing)
 */
function getDataDir(): string {
  return process.env.DATA_DIR || join(process.cwd(), 'data');
}

/**
 * Get the directory path for an npub's data
 */
function getNpubDir(npub: string): string {
  return join(getDataDir(), 'npubs', npub);
}

/**
 * Get the log file path for an npub
 */
function getLogFilePath(npub: string): string {
  return join(getNpubDir(npub), 'nostr_events.jsonl');
}

/**
 * Convert a hex pubkey to npub format
 */
function pubkeyToNpub(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    // If encoding fails, return as-is (shouldn't happen with valid pubkeys)
    return pubkey;
  }
}

/**
 * Extract all npubs mentioned in p tags from an event
 */
function extractMentionedPubkeys(event: NostrEvent): string[] {
  const pubkeys: string[] = [];

  for (const tag of event.tags) {
    // p tags contain pubkeys of mentioned users
    if (tag[0] === 'p' && tag[1]) {
      pubkeys.push(tag[1]);
    }
  }

  return pubkeys;
}

/**
 * Log a NOSTR event to a specific npub's nostr_events.jsonl file
 *
 * @param npub - User's NOSTR public key in npub format
 * @param event - The signed NOSTR event to log
 */
export function logNostrEvent(npub: string, event: NostrEvent): void {
  const npubDir = getNpubDir(npub);
  const logFile = getLogFilePath(npub);

  // Ensure directory exists
  mkdirSync(npubDir, { recursive: true });

  // Append event as JSON line
  const line = JSON.stringify(event) + '\n';
  appendFileSync(logFile, line, 'utf-8');
}

/**
 * Log a NOSTR event to the author and all mentioned npubs
 *
 * This logs the event to:
 * 1. The author's npub (derived from event.pubkey)
 * 2. All npubs mentioned in p tags
 *
 * @param event - The signed NOSTR event to log
 */
export function logNostrEventToAll(event: NostrEvent): void {
  const loggedNpubs = new Set<string>();

  // Log to the author
  const authorNpub = pubkeyToNpub(event.pubkey);
  logNostrEvent(authorNpub, event);
  loggedNpubs.add(authorNpub);

  // Log to all mentioned pubkeys (p tags)
  const mentionedPubkeys = extractMentionedPubkeys(event);
  for (const pubkey of mentionedPubkeys) {
    const mentionedNpub = pubkeyToNpub(pubkey);

    // Avoid duplicate logging
    if (!loggedNpubs.has(mentionedNpub)) {
      logNostrEvent(mentionedNpub, event);
      loggedNpubs.add(mentionedNpub);
    }
  }
}

/**
 * Event log entry format (from record-nostr-events.ts)
 */
interface EventLogEntry {
  timestamp: string;
  source: string;
  mentioned?: boolean;
  event: NostrEvent;
}

/**
 * Read all NOSTR events for a user by npub
 *
 * Handles both formats:
 * - New format: {"timestamp": "...", "source": "...", "event": {...}}
 * - Old format: {"id": "...", "pubkey": "...", ...} (raw event)
 *
 * @param npub - User's NOSTR public key in npub format
 * @returns Array of NOSTR events
 */
export function readNostrEvents(npub: string): NostrEvent[] {
  const logFile = getLogFilePath(npub);

  try {
    if (!existsSync(logFile)) {
      return [];
    }

    const content = readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);

    // Parse events and deduplicate by event ID
    const eventsMap = new Map<string, NostrEvent>();
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);

        // Handle new wrapped format: { timestamp, source, event }
        // Check if it has an 'event' property with an 'id'
        let event: NostrEvent;
        if (parsed.event && typeof parsed.event === 'object' && parsed.event.id) {
          event = parsed.event as NostrEvent;
        } else if (parsed.id && parsed.pubkey) {
          // Old format: raw event
          event = parsed as NostrEvent;
        } else {
          // Unknown format, skip
          continue;
        }

        // Validate event has required fields
        if (!event.id || !event.pubkey) {
          continue;
        }

        // Use Map to deduplicate by event ID (in case same event was logged multiple times)
        eventsMap.set(event.id, event);
      } catch {
        // Skip malformed lines
      }
    }

    return Array.from(eventsMap.values());
  } catch (error) {
    // File doesn't exist yet or is empty
    return [];
  }
}

/**
 * Read NOSTR events by hex pubkey (converts to npub internally)
 *
 * @param pubkey - User's NOSTR public key in hex format
 * @returns Array of NOSTR events
 */
export function readNostrEventsByPubkey(pubkey: string): NostrEvent[] {
  const npub = pubkeyToNpub(pubkey);
  return readNostrEvents(npub);
}

/**
 * Get the most recent NOSTR event of a specific kind for a user
 *
 * @param npub - User's NOSTR public key in npub format
 * @param kind - NOSTR event kind to filter by
 * @returns The most recent event of that kind, or null
 */
export function getLatestEventByKind(npub: string, kind: number): NostrEvent | null {
  const events = readNostrEvents(npub);
  const filtered = events.filter(event => event.kind === kind);

  if (filtered.length === 0) {
    return null;
  }

  // Sort by created_at descending and return first
  filtered.sort((a, b) => b.created_at - a.created_at);
  return filtered[0];
}

/**
 * Count NOSTR events by kind for a user
 * Useful for analytics and debugging
 *
 * @param npub - User's NOSTR public key in npub format
 * @returns Object mapping event kinds to counts
 */
export function countEventsByKind(npub: string): Record<number, number> {
  const events = readNostrEvents(npub);
  const counts: Record<number, number> = {};

  for (const event of events) {
    counts[event.kind] = (counts[event.kind] || 0) + 1;
  }

  return counts;
}

// ============================================================================
// Legacy support - these functions accept serialNumber but won't work anymore
// They are kept for reference during migration
// ============================================================================

/**
 * @deprecated Use logNostrEvent with npub instead
 */
export function logNostrEventBySerial(serialNumber: string, event: NostrEvent): void {
  console.warn('[DEPRECATED] logNostrEventBySerial called - events should be logged by npub');
  // This won't store in the correct location anymore
  // Callers should be updated to use npub
}

/**
 * @deprecated Use readNostrEvents with npub instead
 */
export function readNostrEventsBySerial(serialNumber: string): NostrEvent[] {
  console.warn('[DEPRECATED] readNostrEventsBySerial called - events should be read by npub');
  return [];
}
