#!/usr/bin/env npx tsx
/**
 * NOSTR Listener - Unified Event Recorder and Receipt Processor
 *
 * This service combines the functionality of:
 * - record-nostr-events: Records all NOSTR events to disk
 * - receipt-listener: Processes payment receipts and confirms bookings/workshops
 *
 * Events are stored in:
 * - DATA_DIR/nostr_events.jsonl (all events, for /nostr page)
 * - DATA_DIR/npubs/{npub}/nostr_events.jsonl (per-user events)
 *
 * Usage:
 *   npm run nostr-listener
 *   # or directly:
 *   npx tsx scripts/nostr-listener.ts
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
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
    return true;
  }
  return false;
}

if (!loadEnvFile('.env.local')) {
  loadEnvFile('.env');
}

import { getPublicKey, nip19 } from 'nostr-tools';
import {
  NOSTR_KINDS,
  decodeNsec,
  parsePaymentReceiptEvent,
  createCalendarEventClient,
  type NostrEvent,
  type CalendarEventOptions,
} from '../src/lib/nostr-events';
import {
  NostrConnectionPool,
  getRelayUrls,
} from '../src/lib/nostr-server';
import {
  addProposalEvent,
  getRoomSlug,
  generateIcsFile,
  getProposalEvent,
} from '../src/lib/local-calendar';

// ============================================================================
// Configuration
// ============================================================================

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const NPUBS_DIR = path.join(DATA_DIR, 'npubs');
const USERNAMES_DIR = path.join(DATA_DIR, 'usernames');
const ALL_EVENTS_FILE = path.join(DATA_DIR, 'nostr_events.jsonl');
const OFFERS_DIR = path.join(DATA_DIR, 'offers');
const LISTENER_DIR = path.join(DATA_DIR, 'nostrListener');
const PROCESSED_RECEIPTS_FILE = path.join(LISTENER_DIR, 'processed_receipts.json');

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

// ============================================================================
// Logging
// ============================================================================

function getTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(message: string, ...args: unknown[]): void {
  console.log(`[${getTimestamp()}] ${message}`, ...args);
}

function logError(message: string, ...args: unknown[]): void {
  console.error(`[${getTimestamp()}] ${message}`, ...args);
}

function printEventKindsTable(): void {
  console.log('');
  console.log('Event Kinds Being Recorded:');
  console.log('+-------+------------------+----------------------------------------------+');
  console.log('| Kind  | Name             | Description                                  |');
  console.log('+-------+------------------+----------------------------------------------+');
  for (const kind of RECORDED_KINDS) {
    const info = EVENT_KIND_INFO[kind];
    const kindStr = kind.toString().padEnd(5);
    const nameStr = info.name.padEnd(16);
    const descStr = info.description.slice(0, 44).padEnd(44);
    console.log(`| ${kindStr} | ${nameStr} | ${descStr} |`);
  }
  console.log('+-------+------------------+----------------------------------------------+');
  console.log('');
}

// ============================================================================
// State
// ============================================================================

interface ListenerState {
  processedEvents: Set<string>;
  processedReceiptIds: Set<string>;
  secretKey: Uint8Array | null;
}

const state: ListenerState = {
  processedEvents: new Set(),
  processedReceiptIds: new Set(),
  secretKey: null,
};

const MAX_PROCESSED_EVENTS = 50000;
let connectionPool: NostrConnectionPool | null = null;

// ============================================================================
// Utility Functions
// ============================================================================

function hexToNpub(hexPubkey: string): string {
  return nip19.npubEncode(hexPubkey);
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getEventsFilePath(npub: string): string {
  return path.join(NPUBS_DIR, npub, 'nostr_events.jsonl');
}

function createUsernameSymlink(username: string, npub: string): void {
  ensureDir(USERNAMES_DIR);
  ensureDir(path.join(NPUBS_DIR, npub));

  const symlinkPath = path.join(USERNAMES_DIR, username);
  const targetPath = path.join(NPUBS_DIR, npub);

  try {
    const stats = fs.lstatSync(symlinkPath);
    if (stats.isSymbolicLink()) {
      fs.unlinkSync(symlinkPath);
    }
  } catch {
    // Doesn't exist
  }

  const relativePath = path.relative(USERNAMES_DIR, targetPath);
  fs.symlinkSync(relativePath, symlinkPath);
  log(`[NostrListener] Created symlink: ${username} -> ${relativePath}`);
}

// ============================================================================
// Processed Receipts Storage
// ============================================================================

function loadProcessedReceipts(): void {
  ensureDir(LISTENER_DIR);
  try {
    if (fs.existsSync(PROCESSED_RECEIPTS_FILE)) {
      const content = fs.readFileSync(PROCESSED_RECEIPTS_FILE, 'utf-8');
      const data = JSON.parse(content);
      state.processedReceiptIds = new Set(data.processedIds || []);
      log(`[NostrListener] Loaded ${state.processedReceiptIds.size} processed receipt IDs`);
    }
  } catch (error) {
    logError('[NostrListener] Failed to load processed receipts:', error);
    state.processedReceiptIds = new Set();
  }
}

function saveProcessedReceipts(): void {
  ensureDir(LISTENER_DIR);
  try {
    const data = {
      lastUpdated: new Date().toISOString(),
      count: state.processedReceiptIds.size,
      processedIds: Array.from(state.processedReceiptIds),
    };
    fs.writeFileSync(PROCESSED_RECEIPTS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    logError('[NostrListener] Failed to save processed receipts:', error);
  }
}

// ============================================================================
// Event Recording
// ============================================================================

function recordEvent(event: NostrEvent, source: string): void {
  const npub = hexToNpub(event.pubkey);
  const npubDir = path.join(NPUBS_DIR, npub);
  ensureDir(npubDir);

  const logEntry = {
    timestamp: new Date().toISOString(),
    source,
    event,
  };

  const line = JSON.stringify(logEntry) + '\n';

  // Record to per-user file
  const eventsFile = getEventsFilePath(npub);
  fs.appendFileSync(eventsFile, line);

  // Record to global events file (for /nostr page)
  fs.appendFileSync(ALL_EVENTS_FILE, line);

  const kindInfo = EVENT_KIND_INFO[event.kind];
  const kindName = kindInfo ? kindInfo.name : `kind ${event.kind}`;
  log(`[NostrListener] Recorded ${kindName} (${event.kind}) event ${event.id.slice(0, 8)}... for ${npub.slice(0, 15)}...`);
}

function recordEventForMentioned(event: NostrEvent, mentionedNpub: string, source: string): void {
  const npubDir = path.join(NPUBS_DIR, mentionedNpub);
  ensureDir(npubDir);

  const logEntry = {
    timestamp: new Date().toISOString(),
    source,
    mentioned: true,
    event,
  };

  const line = JSON.stringify(logEntry) + '\n';
  const eventsFile = getEventsFilePath(mentionedNpub);
  fs.appendFileSync(eventsFile, line);

  const kindInfo = EVENT_KIND_INFO[event.kind];
  const kindName = kindInfo ? kindInfo.name : `kind ${event.kind}`;
  log(`[NostrListener] Recorded ${kindName} for mentioned ${mentionedNpub.slice(0, 15)}...`);
}

// ============================================================================
// Receipt Processing (from receipt-listener)
// ============================================================================

interface Offer {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  room?: string;
  startTime?: string;
  endTime?: string;
  minRsvps?: number;
  authors?: string[];
  updatedAt?: string;
}

async function publishCalendarEvent(
  offerId: string,
  title: string,
  description: string,
  startTime: string,
  endTime: string,
  room: string,
  status: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED'
): Promise<void> {
  if (!state.secretKey || !connectionPool) {
    logError('[NostrListener] Cannot publish calendar event: missing secretKey or connectionPool');
    return;
  }

  try {
    const calendarEventOptions: CalendarEventOptions = {
      dTag: offerId,
      title,
      description,
      startTime,
      endTime,
      location: room,
      status,
      relatedEventId: offerId,
    };

    const calendarEvent = createCalendarEventClient(state.secretKey, calendarEventOptions);
    log(`[NostrListener] Publishing calendar event (kind ${NOSTR_KINDS.CALENDAR_EVENT}):`, {
      id: calendarEvent.id.slice(0, 8) + '...',
      status,
      title,
    });

    const result = await connectionPool.publishToAll(calendarEvent);
    log(`[NostrListener] Calendar event published to ${result.successful} relay(s), ${result.failed} failed`);
  } catch (error) {
    logError('[NostrListener] Failed to publish calendar event:', error);
  }
}

async function confirmBookingOrOffer(
  relatedEventId: string,
  context: string,
  sender: string,
  bookingDetails?: { title?: string; description?: string; room?: string; startTime?: string; endTime?: string }
): Promise<void> {
  ensureDir(OFFERS_DIR);

  if (context === 'booking') {
    const offerId = relatedEventId;
    const offerPath = path.join(OFFERS_DIR, `${offerId}.json`);

    const title = bookingDetails?.title || 'Room Booking';
    const description = bookingDetails?.description || '';
    const room = bookingDetails?.room || '';
    const startTime = bookingDetails?.startTime || '';
    const endTime = bookingDetails?.endTime || '';

    if (!room || !startTime || !endTime) {
      logError(`[NostrListener] Booking missing required fields:`, { room, startTime, endTime });
      return;
    }

    if (fs.existsSync(offerPath)) {
      log(`[NostrListener] Offer ${offerId} already exists, updating status`);
      const existing = JSON.parse(fs.readFileSync(offerPath, 'utf-8'));
      if (existing.status !== 'confirmed') {
        existing.status = 'confirmed';
        existing.updatedAt = new Date().toISOString();
        fs.writeFileSync(offerPath, JSON.stringify(existing, null, 2));
      }
    } else {
      const offer: Offer = {
        id: offerId,
        type: 'private',
        title,
        description,
        status: 'confirmed',
        room,
        startTime,
        endTime,
        authors: [sender],
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(offerPath, JSON.stringify(offer, null, 2));
      log(`[NostrListener] Created confirmed booking: ${offerId}`);
    }

    // Add to calendar
    try {
      const roomSlug = getRoomSlug(room);
      log(`[NostrListener] Adding booking to calendar:`, {
        offerId,
        room,
        roomSlug,
        startTime,
        endTime,
      });
      await addProposalEvent(roomSlug, {
        offerId,
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        room,
        status: 'CONFIRMED',
        minRsvps: 0,
        attendees: [],
        author: sender,
        authorUsername: '',
      });
      await generateIcsFile(roomSlug);
      log(`[NostrListener] Added booking to calendar: ${offerId} in room ${room} (slug: ${roomSlug})`);
    } catch (calError) {
      logError(`[NostrListener] Failed to add booking to calendar:`, calError);
    }

    // Publish NOSTR calendar event
    await publishCalendarEvent(offerId, title, description, startTime, endTime, room, 'CONFIRMED');
    return;
  }

  // For workshop proposals
  const offerPath = path.join(OFFERS_DIR, `${relatedEventId}.json`);

  try {
    if (!fs.existsSync(offerPath)) {
      log(`[NostrListener] Offer not found: ${relatedEventId}`);
      return;
    }

    const content = fs.readFileSync(offerPath, 'utf-8');
    const offer: Offer = JSON.parse(content);
    const newStatus = 'tentative';

    if (offer.status === newStatus || offer.status === 'confirmed') {
      log(`[NostrListener] Offer ${relatedEventId} already has status: ${offer.status}`);
      return;
    }

    offer.status = newStatus;
    offer.updatedAt = new Date().toISOString();
    fs.writeFileSync(offerPath, JSON.stringify(offer, null, 2));
    log(`[NostrListener] Updated offer ${relatedEventId} status to: ${newStatus}`);

    if (offer.room && offer.startTime && offer.endTime) {
      try {
        const roomSlug = getRoomSlug(offer.room);
        const existingEvent = await getProposalEvent(roomSlug, relatedEventId);

        await addProposalEvent(roomSlug, {
          offerId: offer.id,
          title: offer.title,
          description: offer.description,
          startTime: new Date(offer.startTime),
          endTime: new Date(offer.endTime),
          room: offer.room,
          status: 'TENTATIVE',
          minRsvps: offer.minRsvps || 0,
          attendees: existingEvent?.attendees || [],
          author: offer.authors?.[0] || existingEvent?.author || '',
          authorUsername: existingEvent?.authorUsername || '',
        });

        await generateIcsFile(roomSlug);
        log(`[NostrListener] Updated calendar for workshop: ${relatedEventId}`);

        // Publish NOSTR calendar event
        await publishCalendarEvent(
          offer.id,
          offer.title,
          offer.description,
          offer.startTime,
          offer.endTime,
          offer.room,
          'TENTATIVE'
        );
      } catch (calError) {
        logError(`[NostrListener] Failed to update calendar:`, calError);
      }
    }
  } catch (error) {
    logError(`[NostrListener] Failed to confirm offer ${relatedEventId}:`, error);
  }
}

async function processPaymentReceipt(receiptEvent: NostrEvent): Promise<void> {
  if (state.processedReceiptIds.has(receiptEvent.id)) {
    return;
  }

  log(`[NostrListener] Processing payment receipt: ${receiptEvent.id.slice(0, 8)}...`);

  const receipt = parsePaymentReceiptEvent(receiptEvent);
  if (!receipt) {
    logError(`[NostrListener] Failed to parse payment receipt: ${receiptEvent.id}`);
    state.processedReceiptIds.add(receiptEvent.id);
    saveProcessedReceipts();
    return;
  }

  if (!receipt.success) {
    log(`[NostrListener] Receipt indicates failure, skipping: ${receiptEvent.id.slice(0, 8)}...`);
    state.processedReceiptIds.add(receiptEvent.id);
    saveProcessedReceipts();
    return;
  }

  const context = receipt.context;
  const relatedEventId = receipt.relatedEventId;
  const sender = receipt.sender && receipt.sender !== 'system'
    ? nip19.npubEncode(receipt.sender)
    : undefined;

  log(`[NostrListener] Receipt details:`, {
    requestId: receipt.requestEventId.slice(0, 8) + '...',
    txHash: receipt.txHash.slice(0, 16) + '...',
    context,
    relatedEventId: relatedEventId?.slice(0, 8) + '...',
  });

  if (relatedEventId && sender && (context === 'booking' || context === 'workshop_proposal')) {
    let bookingDetails: { title?: string; description?: string; room?: string; startTime?: string; endTime?: string } | undefined;

    if (context === 'booking' && receipt.embeddedRequest) {
      try {
        const bookingData = JSON.parse(receipt.embeddedRequest.content);
        if (bookingData.type === 'booking') {
          bookingDetails = {
            title: bookingData.title,
            description: `Private room booking for ${bookingData.roomName || bookingData.room}`,
            room: bookingData.room,
            startTime: bookingData.startTime,
            endTime: bookingData.endTime,
          };
          log(`[NostrListener] Parsed booking details:`, bookingDetails);
        }
      } catch (e) {
        logError(`[NostrListener] Failed to parse booking data from request:`, e);
      }
    }

    await confirmBookingOrOffer(relatedEventId, context, sender, bookingDetails);
  }

  state.processedReceiptIds.add(receiptEvent.id);
  saveProcessedReceipts();
}

// ============================================================================
// Event Processing
// ============================================================================

async function processEvent(event: NostrEvent, relayUrl: string): Promise<void> {
  if (state.processedEvents.has(event.id)) {
    return;
  }

  state.processedEvents.add(event.id);

  // Cleanup if too many events tracked
  if (state.processedEvents.size > MAX_PROCESSED_EVENTS) {
    const iterator = state.processedEvents.values();
    for (let i = 0; i < 10000; i++) {
      const result = iterator.next();
      if (result.done || !result.value) break;
      state.processedEvents.delete(result.value);
    }
  }

  // Record event for the author
  recordEvent(event, relayUrl);

  // For payment events, also record for recipient and sender
  if (event.kind === NOSTR_KINDS.PAYMENT_REQUEST || event.kind === NOSTR_KINDS.PAYMENT_RECEIPT) {
    const recipientTag = event.tags.find(t => t[0] === 'p');
    if (recipientTag && recipientTag[1]) {
      try {
        const recipientNpub = hexToNpub(recipientTag[1]);
        if (recipientNpub !== hexToNpub(event.pubkey)) {
          recordEventForMentioned(event, recipientNpub, relayUrl);
        }
      } catch { /* Invalid pubkey */ }
    }

    const senderTag = event.tags.find(t => t[0] === 'P');
    if (senderTag && senderTag[1] && senderTag[1] !== 'system') {
      try {
        const senderNpub = hexToNpub(senderTag[1]);
        if (senderNpub !== hexToNpub(event.pubkey)) {
          recordEventForMentioned(event, senderNpub, relayUrl);
        }
      } catch { /* Invalid pubkey */ }
    }

    // Process payment receipts for booking confirmations
    if (event.kind === NOSTR_KINDS.PAYMENT_RECEIPT) {
      await processPaymentReceipt(event);
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
      } catch { /* Invalid pubkey */ }
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  console.log('');
  console.log('='.repeat(60));
  console.log(`  NOSTR Listener - Started at ${getTimestamp()}`);
  console.log('='.repeat(60));

  const nostrNsec = process.env.NOSTR_NSEC;
  if (!nostrNsec) {
    logError('[NostrListener] ERROR: NOSTR_NSEC environment variable is required');
    process.exit(1);
  }

  let secretKey: Uint8Array;
  try {
    secretKey = decodeNsec(nostrNsec);
    state.secretKey = secretKey;
  } catch (error) {
    logError(`[NostrListener] ERROR: Failed to decode NOSTR_NSEC: ${error}`);
    process.exit(1);
  }

  const pubkey = getPublicKey(secretKey);
  const serverNpub = nip19.npubEncode(pubkey);

  // Create symlinks
  try {
    createUsernameSymlink('server', serverNpub);
    createUsernameSymlink('paymentProcessor', serverNpub);
  } catch (error) {
    log(`[NostrListener] Warning: Could not create symlinks: ${error}`);
  }

  // Load processed receipts
  loadProcessedReceipts();

  printEventKindsTable();

  log('[NostrListener] ------------------------------------');
  log(`[NostrListener] Server npub: ${serverNpub}`);
  log(`[NostrListener] Data directory: ${DATA_DIR}`);
  log(`[NostrListener] All events file: ${ALL_EVENTS_FILE}`);
  log('[NostrListener] ------------------------------------');

  const relayUrls = getRelayUrls();
  if (relayUrls.length === 0) {
    logError('[NostrListener] ERROR: No relay URLs configured. Set NOSTR_RELAYS env variable');
    process.exit(1);
  }

  log(`[NostrListener] Connecting to ${relayUrls.length} relay(s)...`);

  connectionPool = new NostrConnectionPool(
    {
      secretKey,
      autoReconnect: true,
      reconnectDelay: 5000,
      onConnect: (url) => log(`[NostrListener] Connected to ${url}`),
      onDisconnect: (url) => log(`[NostrListener] Disconnected from ${url}`),
      onAuth: (url) => log(`[NostrListener] Authenticated with ${url}`),
      onError: (url, error) => logError(`[NostrListener] Error from ${url}: ${error.message}`),
    },
    '[NostrListener]'
  );

  const { connected, failed } = await connectionPool.connectToRelays(relayUrls);
  log(`[NostrListener] Connected to ${connected} relay(s), ${failed} failed`);

  if (connected === 0) {
    logError('[NostrListener] ERROR: Failed to connect to any relay');
    process.exit(1);
  }

  // Subscribe to all recorded event kinds
  connectionPool.subscribeAll({
    filters: [{
      kinds: RECORDED_KINDS,
      since: Math.floor(Date.now() / 1000) - 3600, // Last hour
    }],
    onEvent: async (event, relayUrl) => {
      if (RECORDED_KINDS.includes(event.kind)) {
        await processEvent(event, relayUrl);
      }
    },
    onEose: (relayUrl) => {
      log(`[NostrListener] ${relayUrl}: End of stored events`);
    },
  });

  log(`[NostrListener] Subscribed to kinds ${RECORDED_KINDS.join(', ')}`);
  log('[NostrListener] Listening for events...');
  log('[NostrListener] Press Ctrl+C to stop');

  const shutdown = () => {
    console.log('');
    log('[NostrListener] Shutting down...');
    saveProcessedReceipts();
    connectionPool?.closeAll();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  logError(`[NostrListener] Fatal error: ${error}`);
  process.exit(1);
});
