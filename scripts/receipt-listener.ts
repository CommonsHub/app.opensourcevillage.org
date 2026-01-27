#!/usr/bin/env npx tsx
/**
 * Payment Receipt Listener
 *
 * Listens for payment receipt events (kind 9735) and confirms bookings/workshops
 * when payment is successful.
 *
 * Usage:
 *   npm run receipt-listener
 *   # or directly:
 *   npx tsx scripts/receipt-listener.ts
 *
 * Required environment variables:
 *   - NOSTR_NSEC: NOSTR secret key for relay authentication (nsec1... format)
 *
 * Optional environment variables:
 *   - DATA_DIR: Directory for storing data (default: ./data)
 */

// Load environment variables from .env.local or .env
import * as fs from 'fs';
import * as path from 'path';

// Logging helper with timestamp
function log(...args: unknown[]): void {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${timestamp}]`, ...args);
}

function logError(...args: unknown[]): void {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.error(`[${timestamp}]`, ...args);
}

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

import { getPublicKey, nip19 } from 'nostr-tools';
import {
  NOSTR_KINDS,
  parsePaymentReceiptEvent,
  decodeNsec,
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
const LISTENER_DIR = path.join(DATA_DIR, 'receiptListener');
const PROCESSED_FILE = path.join(LISTENER_DIR, 'processed_receipts.json');
const OFFERS_DIR = path.join(DATA_DIR, 'offers');

// ============================================================================
// State Management
// ============================================================================

interface ListenerState {
  processedReceiptIds: Set<string>;
  secretKey: Uint8Array | null;
}

const state: ListenerState = {
  processedReceiptIds: new Set(),
  secretKey: null,
};

// ============================================================================
// File Storage
// ============================================================================

function ensureListenerDir(): void {
  if (!fs.existsSync(LISTENER_DIR)) {
    fs.mkdirSync(LISTENER_DIR, { recursive: true });
    log(`[ReceiptListener] Created directory: ${LISTENER_DIR}`);
  }
}

function loadProcessedReceipts(): void {
  ensureListenerDir();

  try {
    if (fs.existsSync(PROCESSED_FILE)) {
      const content = fs.readFileSync(PROCESSED_FILE, 'utf-8');
      const data = JSON.parse(content);
      state.processedReceiptIds = new Set(data.processedIds || []);
      log(`[ReceiptListener] Loaded ${state.processedReceiptIds.size} processed receipt IDs`);
    }
  } catch (error) {
    logError('[ReceiptListener] Failed to load processed receipts:', error);
    state.processedReceiptIds = new Set();
  }
}

function saveProcessedReceipts(): void {
  ensureListenerDir();

  try {
    const data = {
      lastUpdated: new Date().toISOString(),
      count: state.processedReceiptIds.size,
      processedIds: Array.from(state.processedReceiptIds),
    };
    fs.writeFileSync(PROCESSED_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    logError('[ReceiptListener] Failed to save processed receipts:', error);
  }
}

// ============================================================================
// Offer/Booking Confirmation
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

interface BookingData {
  type: string;
  id: string;
  title: string;
  room: string;
  roomName: string;
  startTime: string;
  endTime: string;
  author: string;
  authorUsername: string;
}

/**
 * Confirm an offer/booking after successful payment
 * For bookings: creates the offer from the payment request data
 * For workshops: updates existing offer status
 */
async function confirmBookingOrOffer(
  relatedEventId: string,
  context: string,
  sender: string,
  bookingDetails?: { title?: string; description?: string; room?: string; startTime?: string; endTime?: string }
): Promise<void> {
  // Ensure offers directory exists
  if (!fs.existsSync(OFFERS_DIR)) {
    fs.mkdirSync(OFFERS_DIR, { recursive: true });
  }

  // For bookings, the relatedEventId is the booking ID
  // Booking details come from the payment request description (JSON)
  if (context === 'booking') {
    const offerId = relatedEventId;
    const offerPath = path.join(OFFERS_DIR, `${offerId}.json`);

    // Use provided booking details
    const title = bookingDetails?.title || 'Room Booking';
    const description = bookingDetails?.description || '';
    const room = bookingDetails?.room || '';
    const startTime = bookingDetails?.startTime || '';
    const endTime = bookingDetails?.endTime || '';

    if (!room || !startTime || !endTime) {
      logError(`[ReceiptListener] Booking missing required fields:`, { room, startTime, endTime });
      return;
    }

    // Check if offer already exists
    if (fs.existsSync(offerPath)) {
      log(`[ReceiptListener] Offer ${offerId} already exists, updating status`);
      const existing = JSON.parse(fs.readFileSync(offerPath, 'utf-8'));
      if (existing.status !== 'confirmed') {
        existing.status = 'confirmed';
        existing.updatedAt = new Date().toISOString();
        fs.writeFileSync(offerPath, JSON.stringify(existing, null, 2));
      }
    } else {
      // Create new offer from booking details
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
      log(`[ReceiptListener] Created confirmed booking: ${offerId}`);
    }

    // Add to calendar
    try {
      const roomSlug = getRoomSlug(room);

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
      log(`[ReceiptListener] Added booking to calendar: ${offerId}`);
    } catch (calError) {
      logError(`[ReceiptListener] Failed to add booking to calendar:`, calError);
    }

    // Publish NOSTR calendar event so frontend can update
    await publishCalendarEvent(
      offerId,
      title,
      description,
      startTime,
      endTime,
      room,
      'CONFIRMED'
    );

    return;
  }

  // For workshop proposals, update existing offer
  const offerPath = path.join(OFFERS_DIR, `${relatedEventId}.json`);

  try {
    if (!fs.existsSync(offerPath)) {
      log(`[ReceiptListener] Offer not found: ${relatedEventId}`);
      return;
    }

    const content = fs.readFileSync(offerPath, 'utf-8');
    const offer: Offer = JSON.parse(content);

    const newStatus = 'tentative'; // Workshops need RSVPs to confirm

    if (offer.status === newStatus || offer.status === 'confirmed') {
      log(`[ReceiptListener] Offer ${relatedEventId} already has status: ${offer.status}`);
      return;
    }

    offer.status = newStatus;
    offer.updatedAt = new Date().toISOString();
    fs.writeFileSync(offerPath, JSON.stringify(offer, null, 2));
    log(`[ReceiptListener] Updated offer ${relatedEventId} status to: ${newStatus}`);

    // Update calendar event
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
        log(`[ReceiptListener] Updated calendar for workshop: ${relatedEventId}`);

        // Publish NOSTR calendar event so frontend can update
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
        logError(`[ReceiptListener] Failed to update calendar:`, calError);
      }
    }

    // Update user profile
    if (offer.authors?.[0]) {
      try {
        await updateProfileOfferStatus(offer.authors[0], relatedEventId, newStatus);
      } catch (profileError) {
        logError(`[ReceiptListener] Failed to update profile:`, profileError);
      }
    }
  } catch (error) {
    logError(`[ReceiptListener] Failed to confirm offer ${relatedEventId}:`, error);
  }
}

/**
 * Publish a NOSTR calendar event to notify clients of booking/workshop status changes
 */
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
    logError('[ReceiptListener] Cannot publish calendar event: missing secretKey or connectionPool');
    return;
  }

  try {
    const calendarEventOptions: CalendarEventOptions = {
      dTag: offerId, // Use offer ID as d-tag for replaceability
      title,
      description,
      startTime,
      endTime,
      location: room,
      status,
      relatedEventId: offerId,
    };

    const calendarEvent = createCalendarEventClient(state.secretKey, calendarEventOptions);
    log(`[ReceiptListener] Publishing calendar event (kind ${NOSTR_KINDS.CALENDAR_EVENT}):`, {
      id: calendarEvent.id.slice(0, 8) + '...',
      status,
      title,
    });

    const result = await connectionPool.publishToAll(calendarEvent);
    log(`[ReceiptListener] Calendar event published to ${result.successful} relay(s), ${result.failed} failed`);
  } catch (error) {
    logError('[ReceiptListener] Failed to publish calendar event:', error);
  }
}

/**
 * Update offer status in user's profile
 */
async function updateProfileOfferStatus(
  npub: string,
  offerId: string,
  newStatus: string
): Promise<void> {
  const badgesDir = path.join(DATA_DIR, 'badges');

  if (!fs.existsSync(badgesDir)) return;

  const badges = fs.readdirSync(badgesDir);

  for (const serialNumber of badges) {
    const profilePath = path.join(badgesDir, serialNumber, 'profile.json');
    try {
      if (!fs.existsSync(profilePath)) continue;

      const content = fs.readFileSync(profilePath, 'utf-8');
      const profile = JSON.parse(content);

      if (profile.npub !== npub) continue;

      // Find and update the offer in profile
      const offerIndex = profile.offers?.findIndex((o: Offer) => o.id === offerId);
      if (offerIndex !== undefined && offerIndex !== -1) {
        profile.offers[offerIndex].status = newStatus;
        fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
        log(`[ReceiptListener] Updated profile offer status for ${offerId}`);
      }
      break;
    } catch {
      continue;
    }
  }
}

// ============================================================================
// Receipt Processing
// ============================================================================

async function processPaymentReceipt(receiptEvent: NostrEvent): Promise<void> {
  // Check if already processed
  if (state.processedReceiptIds.has(receiptEvent.id)) {
    return;
  }

  log(`[ReceiptListener] Processing payment receipt: ${receiptEvent.id.slice(0, 8)}...`);

  // Parse the receipt (includes embedded request from content)
  const receipt = parsePaymentReceiptEvent(receiptEvent);
  if (!receipt) {
    logError(`[ReceiptListener] Failed to parse payment receipt: ${receiptEvent.id}`);
    state.processedReceiptIds.add(receiptEvent.id);
    saveProcessedReceipts();
    return;
  }

  // Only process successful receipts
  if (!receipt.success) {
    log(`[ReceiptListener] Receipt indicates failure, skipping: ${receiptEvent.id.slice(0, 8)}...`);
    state.processedReceiptIds.add(receiptEvent.id);
    saveProcessedReceipts();
    return;
  }

  // Get context and relatedEventId from receipt tags (copied from request)
  const context = receipt.context;
  const relatedEventId = receipt.relatedEventId;
  // receipt.sender is hex pubkey (or 'system') - convert to npub
  const sender = receipt.sender && receipt.sender !== 'system'
    ? nip19.npubEncode(receipt.sender)
    : undefined;

  log(`[ReceiptListener] Receipt details:`, {
    requestId: receipt.requestEventId.slice(0, 8) + '...',
    txHash: receipt.txHash.slice(0, 16) + '...',
    context,
    relatedEventId: relatedEventId?.slice(0, 8) + '...',
  });

  // Confirm booking/workshop if applicable
  if (relatedEventId && sender && (context === 'booking' || context === 'workshop_proposal')) {
    // For bookings, extract booking details from embedded request content
    let bookingDetails: { title?: string; description?: string; room?: string; startTime?: string; endTime?: string } | undefined;

    if (context === 'booking' && receipt.embeddedRequest) {
      try {
        // The payment request content contains JSON booking data
        const bookingData = JSON.parse(receipt.embeddedRequest.content);
        if (bookingData.type === 'booking') {
          bookingDetails = {
            title: bookingData.title,
            description: `Private room booking for ${bookingData.roomName || bookingData.room}`,
            room: bookingData.room,
            startTime: bookingData.startTime,
            endTime: bookingData.endTime,
          };
          log(`[ReceiptListener] Parsed booking details:`, bookingDetails);
        }
      } catch (e) {
        logError(`[ReceiptListener] Failed to parse booking data from request:`, e);
      }
    }

    await confirmBookingOrOffer(relatedEventId, context, sender, bookingDetails);
  }

  // Mark as processed
  state.processedReceiptIds.add(receiptEvent.id);
  saveProcessedReceipts();
}

// ============================================================================
// Main Entry Point
// ============================================================================

let connectionPool: NostrConnectionPool | null = null;

async function main(): Promise<void> {
  log('='.repeat(60));
  log('Payment Receipt Listener - Starting');
  log('='.repeat(60));

  // Check required environment variables
  const nostrNsec = process.env.NOSTR_NSEC;

  if (!nostrNsec) {
    console.error('[ReceiptListener] ERROR: NOSTR_NSEC environment variable is required');
    process.exit(1);
  }

  // Decode NOSTR secret key
  let secretKey: Uint8Array;
  try {
    secretKey = decodeNsec(nostrNsec);
    state.secretKey = secretKey; // Store for publishing calendar events
  } catch (error) {
    console.error('[ReceiptListener] ERROR: Failed to decode NOSTR_NSEC:', error);
    process.exit(1);
  }

  // Derive npub from secret key
  const pubkey = getPublicKey(secretKey);
  const npub = nip19.npubEncode(pubkey);

  // Display startup information
  console.log('[ReceiptListener] ------------------------------------');
  log(`[ReceiptListener] npub: ${npub}`);
  console.log('[ReceiptListener] ------------------------------------');

  // Load processed receipts
  loadProcessedReceipts();

  // Get relay URLs from environment variable
  const relayUrls = getRelayUrls();
  if (relayUrls.length === 0) {
    console.error('[ReceiptListener] ERROR: No relay URLs configured. Set NOSTR_RELAYS env variable (comma-separated)');
    process.exit(1);
  }

  log(`[ReceiptListener] Connecting to ${relayUrls.length} relay(s)...`);
  log(`[ReceiptListener] Data directory: ${LISTENER_DIR}`);

  // Set up connection pool
  connectionPool = new NostrConnectionPool(
    {
      secretKey,
      autoReconnect: true,
      reconnectDelay: 5000,
      onConnect: (url) => log(`[ReceiptListener] Connected to ${url}`),
      onDisconnect: (url) => log(`[ReceiptListener] Disconnected from ${url}`),
      onAuth: (url) => log(`[ReceiptListener] Authenticated with ${url}`),
      onError: (url, error) => logError(`[ReceiptListener] Error from ${url}:`, error.message),
    },
    '[ReceiptListener]'
  );

  const { connected, failed } = await connectionPool.connectToRelays(relayUrls);

  log(`[ReceiptListener] Connected to ${connected} relay(s), ${failed} failed`);

  if (connected === 0) {
    console.error('[ReceiptListener] ERROR: Failed to connect to any relay');
    process.exit(1);
  }

  // Subscribe only to payment receipts
  // The receipt contains the full embedded request with all booking details
  connectionPool.subscribeAll({
    filters: [
      {
        kinds: [NOSTR_KINDS.PAYMENT_RECEIPT],
        since: Math.floor(Date.now() / 1000) - 3600, // Last hour
      },
    ],
    onEvent: async (event, relayUrl) => {
      if (event.kind === NOSTR_KINDS.PAYMENT_RECEIPT) {
        await processPaymentReceipt(event);
      }
    },
    onEose: (relayUrl) => {
      log(`[ReceiptListener] ${relayUrl}: End of stored events`);
    },
  });

  log(`[ReceiptListener] Subscribed to kind ${NOSTR_KINDS.PAYMENT_RECEIPT}`);
  console.log('[ReceiptListener] Listening for payment receipts...');
  console.log('[ReceiptListener] Press Ctrl+C to stop');

  // Handle shutdown
  const shutdown = () => {
    log('\n[ReceiptListener] Shutting down...');
    saveProcessedReceipts();
    connectionPool?.closeAll();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run the listener
main().catch((error) => {
  logError('[ReceiptListener] Fatal error:', error);
  process.exit(1);
});
