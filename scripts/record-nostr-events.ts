#!/usr/bin/env npx tsx
/**
 * NOSTR Event Recorder
 *
 * Standalone process that subscribes to NOSTR relays and records events
 * to their respective npub directories.
 *
 * Events are stored in: DATA_DIR/npubs/{npub}/nostr_events.jsonl
 *
 * For server and paymentProcessor, symlinks are created in:
 * DATA_DIR/usernames/server -> DATA_DIR/npubs/{server-npub}
 * DATA_DIR/usernames/paymentProcessor -> DATA_DIR/npubs/{paymentProcessor-npub}
 *
 * Usage:
 *   npm run record-nostr-events
 *   # or directly:
 *   npx tsx scripts/record-nostr-events.ts
 *
 * Required environment variables:
 *   - NOSTR_NSEC: NOSTR secret key for authentication (nsec1... format)
 *
 * Optional environment variables:
 *   - DATA_DIR: Directory for storing data (default: ./data)
 */

// Load environment variables from .env.local or .env
import * as fs from 'fs';
import * as path from 'path';

function loadEnvFile(filename: string): boolean {
  const envPath = path.join(process.cwd(), filename);
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        // Only set if not already in environment
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
    return true;
  }
  return false;
}

// Try .env.local first, then .env
if (!loadEnvFile('.env.local')) {
  loadEnvFile('.env');
}

import WebSocket from 'ws';
import { finalizeEvent, type EventTemplate, getPublicKey, nip19 } from 'nostr-tools';
import {
  NOSTR_KINDS,
  decodeNsec,
  type NostrEvent,
} from '../src/lib/nostr-events';

// Load settings
import settings from '../settings.json';

// ============================================================================
// Configuration
// ============================================================================

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const NPUBS_DIR = path.join(DATA_DIR, 'npubs');
const USERNAMES_DIR = path.join(DATA_DIR, 'usernames');

// Event kinds to record with descriptions
const EVENT_KIND_INFO: Record<number, { name: string; description: string }> = {
  [NOSTR_KINDS.PROFILE]: { name: 'Profile', description: 'User profile metadata (name, bio, avatar)' },
  [NOSTR_KINDS.NOTE]: { name: 'Note', description: 'Text notes and offer announcements' },
  [NOSTR_KINDS.REACTION]: { name: 'Reaction', description: 'Reactions and RSVPs to events' },
  [NOSTR_KINDS.PAYMENT_REQUEST]: { name: 'Payment Request', description: 'Token mint/transfer/burn requests' },
  [NOSTR_KINDS.PAYMENT_RECEIPT]: { name: 'Payment Receipt', description: 'Confirmed token transactions' },
  [NOSTR_KINDS.CALENDAR_EVENT]: { name: 'Calendar Event', description: 'Workshop/calendar events (NIP-52)' },
  31923: { name: 'Calendar RSVP', description: 'Calendar event RSVPs (NIP-52)' },
};

const RECORDED_KINDS = Object.keys(EVENT_KIND_INFO).map(Number);

/**
 * Get current datetime string for logging
 */
function getTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Log with timestamp prefix
 */
function log(message: string): void {
  console.log(`[${getTimestamp()}] ${message}`);
}

/**
 * Log error with timestamp prefix
 */
function logError(message: string): void {
  console.error(`[${getTimestamp()}] ${message}`);
}

/**
 * Print table of recorded event kinds
 */
function printEventKindsTable(): void {
  console.log('');
  console.log('Event Kinds Being Recorded:');
  console.log('┌───────┬──────────────────┬──────────────────────────────────────────────┐');
  console.log('│ Kind  │ Name             │ Description                                  │');
  console.log('├───────┼──────────────────┼──────────────────────────────────────────────┤');

  for (const kind of RECORDED_KINDS) {
    const info = EVENT_KIND_INFO[kind];
    const kindStr = kind.toString().padEnd(5);
    const nameStr = info.name.padEnd(16);
    const descStr = info.description.slice(0, 44).padEnd(44);
    console.log(`│ ${kindStr} │ ${nameStr} │ ${descStr} │`);
  }

  console.log('└───────┴──────────────────┴──────────────────────────────────────────────┘');
  console.log('');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert hex pubkey to npub
 */
function hexToNpub(hexPubkey: string): string {
  return nip19.npubEncode(hexPubkey);
}

/**
 * Ensure directory exists
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get the events file path for an npub
 */
function getEventsFilePath(npub: string): string {
  return path.join(NPUBS_DIR, npub, 'nostr_events.jsonl');
}

/**
 * Create a symlink for a special username (server, paymentProcessor)
 */
function createUsernameSymlink(username: string, npub: string): void {
  ensureDir(USERNAMES_DIR);
  ensureDir(path.join(NPUBS_DIR, npub));

  const symlinkPath = path.join(USERNAMES_DIR, username);
  const targetPath = path.join(NPUBS_DIR, npub);

  // Remove existing symlink if it exists
  try {
    const stats = fs.lstatSync(symlinkPath);
    if (stats.isSymbolicLink()) {
      fs.unlinkSync(symlinkPath);
    }
  } catch {
    // Doesn't exist, that's fine
  }

  // Create relative symlink
  const relativePath = path.relative(USERNAMES_DIR, targetPath);
  fs.symlinkSync(relativePath, symlinkPath);
  log(`[NostrRecorder] Created symlink: ${username} -> ${relativePath}`);
}

/**
 * Record an event to the author's npub directory
 */
function recordEvent(event: NostrEvent, source: string): void {
  const npub = hexToNpub(event.pubkey);
  const npubDir = path.join(NPUBS_DIR, npub);
  ensureDir(npubDir);

  const eventsFile = getEventsFilePath(npub);

  const logEntry = {
    timestamp: new Date().toISOString(),
    source,
    event,
  };

  const line = JSON.stringify(logEntry) + '\n';
  fs.appendFileSync(eventsFile, line);

  const kindInfo = EVENT_KIND_INFO[event.kind];
  const kindName = kindInfo ? kindInfo.name : `kind ${event.kind}`;
  log(`[NostrRecorder] Recorded ${kindName} (${event.kind}) event ${event.id.slice(0, 8)}... for ${npub.slice(0, 15)}...`);
}

/**
 * Record an event for a mentioned/recipient npub (e.g., payment recipient)
 */
function recordEventForMentioned(event: NostrEvent, mentionedNpub: string, source: string): void {
  const npubDir = path.join(NPUBS_DIR, mentionedNpub);
  ensureDir(npubDir);

  const eventsFile = getEventsFilePath(mentionedNpub);

  const logEntry = {
    timestamp: new Date().toISOString(),
    source,
    mentioned: true, // Flag that this user is mentioned, not the author
    event,
  };

  const line = JSON.stringify(logEntry) + '\n';
  fs.appendFileSync(eventsFile, line);

  const kindInfo = EVENT_KIND_INFO[event.kind];
  const kindName = kindInfo ? kindInfo.name : `kind ${event.kind}`;
  log(`[NostrRecorder] Recorded ${kindName} (${event.kind}) event ${event.id.slice(0, 8)}... for mentioned ${mentionedNpub.slice(0, 15)}...`);
}

// ============================================================================
// Event Processing
// ============================================================================

// Set of processed event IDs to prevent duplicates
const processedEvents = new Set<string>();
const MAX_PROCESSED_EVENTS = 50000;

function processEvent(event: NostrEvent, relayUrl: string): void {
  // Prevent duplicate processing
  if (processedEvents.has(event.id)) {
    return;
  }

  processedEvents.add(event.id);

  // Cleanup if too many events tracked
  if (processedEvents.size > MAX_PROCESSED_EVENTS) {
    const iterator = processedEvents.values();
    for (let i = 0; i < 10000; i++) {
      const result = iterator.next();
      if (result.done || !result.value) break;
      processedEvents.delete(result.value);
    }
  }

  // Record for the author
  recordEvent(event, relayUrl);

  // For payment events, also record for the recipient
  if (event.kind === NOSTR_KINDS.PAYMENT_REQUEST || event.kind === NOSTR_KINDS.PAYMENT_RECEIPT) {
    // Get recipient from 'p' tag
    const recipientTag = event.tags.find(t => t[0] === 'p');
    if (recipientTag && recipientTag[1]) {
      try {
        const recipientNpub = hexToNpub(recipientTag[1]);
        if (recipientNpub !== hexToNpub(event.pubkey)) {
          recordEventForMentioned(event, recipientNpub, relayUrl);
        }
      } catch {
        // Invalid pubkey, skip
      }
    }

    // Get sender from 'P' tag (for payment events)
    const senderTag = event.tags.find(t => t[0] === 'P');
    if (senderTag && senderTag[1] && senderTag[1] !== 'system') {
      try {
        const senderNpub = hexToNpub(senderTag[1]);
        if (senderNpub !== hexToNpub(event.pubkey)) {
          recordEventForMentioned(event, senderNpub, relayUrl);
        }
      } catch {
        // Invalid pubkey, skip
      }
    }
  }

  // For reactions (RSVPs), record for the referenced event author
  if (event.kind === NOSTR_KINDS.REACTION) {
    const pTag = event.tags.find(t => t[0] === 'p');
    if (pTag && pTag[1]) {
      try {
        const referencedNpub = hexToNpub(pTag[1]);
        if (referencedNpub !== hexToNpub(event.pubkey)) {
          recordEventForMentioned(event, referencedNpub, relayUrl);
        }
      } catch {
        // Invalid pubkey, skip
      }
    }
  }
}

// ============================================================================
// Relay Connection
// ============================================================================

/**
 * Get the relay URL for NIP-42 AUTH events.
 */
function getRelayAuthUrl(relayUrl: string): string {
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

let relayConnections: Map<string, WebSocket> = new Map();

function connectToRelay(
  url: string,
  secretKey: Uint8Array
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    log(`[NostrRecorder] Connecting to ${url}...`);

    const ws = new WebSocket(url);
    let authenticated = false;
    let subscribed = false;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Connection timeout: ${url}`));
    }, 15000);

    // Helper to subscribe after connection/auth
    const subscribe = () => {
      if (subscribed) return;
      subscribed = true;

      const subId = `recorder_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const filter = {
        kinds: RECORDED_KINDS,
        // Get events from the last hour to catch up
        since: Math.floor(Date.now() / 1000) - 3600,
      };

      ws.send(JSON.stringify(['REQ', subId, filter]));
      log(`[NostrRecorder] Subscribed to kinds ${RECORDED_KINDS.join(', ')} on ${url}`);
    };

    // Helper to handle NIP-42 AUTH challenge
    const handleAuth = (challenge: string) => {
      log(`[NostrRecorder] Handling AUTH challenge from ${url}`);
      const authUrl = getRelayAuthUrl(url);

      const authTemplate: EventTemplate = {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['challenge', challenge],
          ['relay', authUrl],
        ],
        content: '',
      };

      const authEvent = finalizeEvent(authTemplate, secretKey);
      ws.send(JSON.stringify(['AUTH', authEvent]));
    };

    ws.on('open', () => {
      clearTimeout(timeout);
      log(`[NostrRecorder] Connected to ${url}`);
      relayConnections.set(url, ws);

      // Wait a bit to see if AUTH challenge comes, otherwise subscribe
      setTimeout(() => {
        if (!authenticated && !subscribed) {
          subscribe();
        }
      }, 500);

      resolve(ws);
    });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (!Array.isArray(message) || message.length < 2) return;

        const [type, ...args] = message;

        switch (type) {
          case 'AUTH':
            // NIP-42 AUTH challenge
            if (typeof args[0] === 'string') {
              handleAuth(args[0]);
            }
            break;

          case 'EVENT':
            if (args[1] && RECORDED_KINDS.includes(args[1].kind)) {
              processEvent(args[1] as NostrEvent, url);
            }
            break;

          case 'OK':
            // Check if this is an AUTH OK
            if (!authenticated && args[1] === true && !subscribed) {
              log(`[NostrRecorder] AUTH accepted by ${url}`);
              authenticated = true;
              subscribe();
            }
            break;

          case 'EOSE':
            log(`[NostrRecorder] ${url}: End of stored events`);
            break;

          case 'NOTICE':
            log(`[NostrRecorder] ${url} notice: ${args[0]}`);
            break;
        }
      } catch (error) {
        logError(`[NostrRecorder] Error parsing message: ${error}`);
      }
    });

    ws.on('error', (error) => {
      logError(`[NostrRecorder] WebSocket error for ${url}: ${error.message}`);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      log(`[NostrRecorder] Connection closed: ${url}`);
      relayConnections.delete(url);

      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        log(`[NostrRecorder] Reconnecting to ${url}...`);
        connectToRelay(url, secretKey).catch((err) => {
          logError(`[NostrRecorder] Reconnection failed: ${err.message}`);
        });
      }, 5000);
    });
  });
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  console.log('');
  console.log('='.repeat(60));
  console.log(`  NOSTR Event Recorder - Started at ${getTimestamp()}`);
  console.log('='.repeat(60));

  // Check required environment variables
  const nostrNsec = process.env.NOSTR_NSEC;

  if (!nostrNsec) {
    logError('[NostrRecorder] ERROR: NOSTR_NSEC environment variable is required');
    process.exit(1);
  }

  // Decode NOSTR secret key
  let secretKey: Uint8Array;
  try {
    secretKey = decodeNsec(nostrNsec);
  } catch (error) {
    logError(`[NostrRecorder] ERROR: Failed to decode NOSTR_NSEC: ${error}`);
    process.exit(1);
  }

  // Derive npub from secret key (this is the server/paymentProcessor npub)
  const pubkey = getPublicKey(secretKey);
  const serverNpub = nip19.npubEncode(pubkey);

  // Create symlinks for server and paymentProcessor
  try {
    createUsernameSymlink('server', serverNpub);
    createUsernameSymlink('paymentProcessor', serverNpub);
  } catch (error) {
    log(`[NostrRecorder] Warning: Could not create symlinks: ${error}`);
  }

  // Print table of recorded event kinds
  printEventKindsTable();

  // Display startup information
  log('[NostrRecorder] ------------------------------------');
  log(`[NostrRecorder] Server npub: ${serverNpub}`);
  log(`[NostrRecorder] Data directory: ${DATA_DIR}`);
  log('[NostrRecorder] ------------------------------------');

  // Get relay URLs from environment variable
  const envRelays = process.env.NOSTR_RELAYS;
  const relayUrls = envRelays
    ? envRelays.split(',').map(r => r.trim()).filter(Boolean)
    : [];
  if (relayUrls.length === 0) {
    logError('[NostrRecorder] ERROR: No relay URLs configured. Set NOSTR_RELAYS env variable (comma-separated)');
    process.exit(1);
  }

  log(`[NostrRecorder] Connecting to ${relayUrls.length} relay(s)...`);

  // Connect to all relays
  const results = await Promise.allSettled(
    relayUrls.map((url) => connectToRelay(url, secretKey))
  );

  const connected = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  log(`[NostrRecorder] Connected to ${connected} relay(s), ${failed} failed`);

  if (connected === 0) {
    logError('[NostrRecorder] ERROR: Failed to connect to any relay');
    process.exit(1);
  }

  log('[NostrRecorder] Listening for events...');
  log('[NostrRecorder] Press Ctrl+C to stop');

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('');
    log('[NostrRecorder] Shutting down...');
    for (const ws of relayConnections.values()) {
      ws.close();
    }
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('');
    log('[NostrRecorder] Received SIGTERM, shutting down...');
    for (const ws of relayConnections.values()) {
      ws.close();
    }
    process.exit(0);
  });
}

// Run the recorder
main().catch((error) => {
  logError(`[NostrRecorder] Fatal error: ${error}`);
  process.exit(1);
});
