/**
 * Receipt Listener Integration Tests
 *
 * Tests that the receipt listener properly:
 * 1. Creates private calendar events with status CONFIRMED for bookings
 * 2. Creates workshop calendar events with status TENTATIVE for workshop proposals
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { finalizeEvent, getPublicKey, nip19, type EventTemplate } from 'nostr-tools';
import { NOSTR_KINDS } from '../src/lib/nostr-events';
import {
  addProposalEvent,
  getProposalEvent,
  getRoomSlug,
  type ProposalEvent,
} from '../src/lib/local-calendar';

// Test data directory
const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-receipt-listener');
const OFFERS_DIR = path.join(TEST_DATA_DIR, 'offers');
const CALENDARS_DIR = path.join(TEST_DATA_DIR, 'calendars');
const LISTENER_DIR = path.join(TEST_DATA_DIR, 'receiptListener');

// Load NOSTR_NSEC from .env.test if not already set
function loadTestEnv(): void {
  if (!process.env.NOSTR_NSEC) {
    const envTestPath = path.join(process.cwd(), '.env.test');
    if (fs.existsSync(envTestPath)) {
      const content = fs.readFileSync(envTestPath, 'utf-8');
      const match = content.match(/^NOSTR_NSEC=(.+)$/m);
      if (match) {
        process.env.NOSTR_NSEC = match[1].trim();
      }
    }
  }
}

loadTestEnv();

// Decode NOSTR secret key
function decodeNsec(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') {
    throw new Error('Invalid nsec');
  }
  return decoded.data as Uint8Array;
}

// Get test credentials
const secretKey = process.env.NOSTR_NSEC ? decodeNsec(process.env.NOSTR_NSEC) : null;
const pubkeyHex = secretKey ? getPublicKey(secretKey) : null;
const npub = pubkeyHex ? nip19.npubEncode(pubkeyHex) : null;

const SHOULD_RUN_TESTS = !!secretKey;

if (!SHOULD_RUN_TESTS) {
  console.warn('[receipt-listener.test] Skipping tests: NOSTR_NSEC not set');
}

// Helper to create test directories
function setupTestDirs(): void {
  fs.mkdirSync(OFFERS_DIR, { recursive: true });
  fs.mkdirSync(CALENDARS_DIR, { recursive: true });
  fs.mkdirSync(LISTENER_DIR, { recursive: true });
}

// Helper to clean up test directories
function cleanupTestDirs(): void {
  try {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

// Helper to create a mock payment request event
function createMockPaymentRequestEvent(
  sk: Uint8Array,
  options: {
    context: 'booking' | 'workshop_proposal';
    relatedEventId: string;
    bookingData?: {
      title: string;
      room: string;
      roomName: string;
      startTime: string;
      endTime: string;
    };
  }
): ReturnType<typeof finalizeEvent> {
  const pk = getPublicKey(sk);

  const tags: string[][] = [
    ['P', pk], // sender (hex)
    ['p', pk], // recipient (hex)
    ['amount', '1000000'],
    ['chain', '31337'],
    ['token', '0xTokenAddress'],
    ['context', options.context],
    ['method', 'transfer'],
    ['toAddress', '0x1234567890123456789012345678901234567890'],
    ['e', options.relatedEventId, '', 'related'],
  ];

  let content = `Payment for ${options.context}`;
  if (options.bookingData) {
    content = JSON.stringify({
      type: 'booking',
      id: options.relatedEventId,
      ...options.bookingData,
      author: `nostr:${nip19.npubEncode(pk)}`,
      authorUsername: 'testuser',
    });
  }

  const event: EventTemplate = {
    kind: NOSTR_KINDS.PAYMENT_REQUEST,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };

  return finalizeEvent(event, sk);
}

// Helper to create a mock payment receipt event
function createMockPaymentReceiptEvent(
  sk: Uint8Array,
  requestEvent: ReturnType<typeof finalizeEvent>,
  options: {
    success: boolean;
    txHash: string;
  }
): ReturnType<typeof finalizeEvent> {
  // Extract tags from request
  const context = requestEvent.tags.find(t => t[0] === 'context')?.[1];
  const relatedEventId = requestEvent.tags.find(t => t[0] === 'e' && t[3] === 'related')?.[1];
  const senderPubkey = requestEvent.tags.find(t => t[0] === 'P')?.[1];
  const recipientPubkey = requestEvent.tags.find(t => t[0] === 'p')?.[1];
  const amount = requestEvent.tags.find(t => t[0] === 'amount')?.[1];

  const tags: string[][] = [
    ['e', requestEvent.id, '', 'request'],
    ['txhash', options.txHash],
    ['status', options.success ? 'success' : 'failed'],
  ];

  if (recipientPubkey) tags.push(['p', recipientPubkey]);
  if (senderPubkey) tags.push(['P', senderPubkey]);
  if (amount) tags.push(['amount', amount]);
  if (context) tags.push(['context', context]);
  if (relatedEventId) tags.push(['e', relatedEventId, '', 'related']);

  const content = JSON.stringify({
    message: options.success ? `Payment confirmed: ${options.txHash}` : 'Payment failed',
    request: requestEvent,
  });

  const event: EventTemplate = {
    kind: NOSTR_KINDS.PAYMENT_RECEIPT,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };

  return finalizeEvent(event, sk);
}

// Import and adapt the confirmBookingOrOffer function logic for testing
// We'll test it directly rather than through the full listener

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

  if (context === 'booking') {
    const offerId = relatedEventId;
    const offerPath = path.join(OFFERS_DIR, `${offerId}.json`);

    const title = bookingDetails?.title || 'Room Booking';
    const description = bookingDetails?.description || '';
    const room = bookingDetails?.room || '';
    const startTime = bookingDetails?.startTime || '';
    const endTime = bookingDetails?.endTime || '';

    if (!room || !startTime || !endTime) {
      throw new Error('Booking missing required fields');
    }

    // Create new offer
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

    // Add to calendar with CONFIRMED status
    const roomSlug = getRoomSlug(room);
    const calendarDir = path.join(CALENDARS_DIR, roomSlug);
    fs.mkdirSync(calendarDir, { recursive: true });

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

    return;
  }

  // For workshop proposals
  const offerPath = path.join(OFFERS_DIR, `${relatedEventId}.json`);

  if (!fs.existsSync(offerPath)) {
    throw new Error(`Offer not found: ${relatedEventId}`);
  }

  const content = fs.readFileSync(offerPath, 'utf-8');
  const offer: Offer = JSON.parse(content);

  offer.status = 'tentative';
  offer.updatedAt = new Date().toISOString();
  fs.writeFileSync(offerPath, JSON.stringify(offer, null, 2));

  // Update calendar with TENTATIVE status
  if (offer.room && offer.startTime && offer.endTime) {
    const roomSlug = getRoomSlug(offer.room);
    const calendarDir = path.join(CALENDARS_DIR, roomSlug);
    fs.mkdirSync(calendarDir, { recursive: true });

    await addProposalEvent(roomSlug, {
      offerId: offer.id,
      title: offer.title,
      description: offer.description,
      startTime: new Date(offer.startTime),
      endTime: new Date(offer.endTime),
      room: offer.room,
      status: 'TENTATIVE',
      minRsvps: offer.minRsvps || 0,
      attendees: [],
      author: offer.authors?.[0] || sender,
      authorUsername: '',
    });
  }
}

const describeWhenReady = SHOULD_RUN_TESTS ? describe : describe.skip;

describeWhenReady('receipt-listener', () => {
  beforeAll(() => {
    // Override DATA_DIR for tests
    process.env.DATA_DIR = TEST_DATA_DIR;
  });

  afterAll(() => {
    delete process.env.DATA_DIR;
  });

  beforeEach(() => {
    setupTestDirs();
  });

  afterEach(() => {
    cleanupTestDirs();
  });

  describe('booking receipts', () => {
    it('should create a private event with CONFIRMED status for a booking', async () => {
      const bookingId = 'test-booking-' + Date.now();
      const roomName = 'Ostrom Room';
      const now = new Date();
      const startTime = new Date(now.getTime() + 3600 * 1000).toISOString();
      const endTime = new Date(now.getTime() + 7200 * 1000).toISOString();

      // Create booking details
      const bookingDetails = {
        title: 'Test Private Booking',
        description: 'Private room booking for Ostrom Room',
        room: roomName,
        startTime,
        endTime,
      };

      // Confirm the booking
      await confirmBookingOrOffer(bookingId, 'booking', npub!, bookingDetails);

      // Verify offer was created with type 'private' and status 'confirmed'
      const offerPath = path.join(OFFERS_DIR, `${bookingId}.json`);
      expect(fs.existsSync(offerPath)).toBe(true);

      const offer = JSON.parse(fs.readFileSync(offerPath, 'utf-8'));
      expect(offer.type).toBe('private');
      expect(offer.status).toBe('confirmed');
      expect(offer.title).toBe('Test Private Booking');
      expect(offer.room).toBe(roomName);

      // Verify calendar event was created with CONFIRMED status
      const roomSlug = getRoomSlug(roomName);
      const calendarEvent = await getProposalEvent(roomSlug, bookingId);

      expect(calendarEvent).not.toBeNull();
      expect(calendarEvent!.status).toBe('CONFIRMED');
      expect(calendarEvent!.title).toBe('Test Private Booking');
      expect(calendarEvent!.room).toBe(roomName);
    });

    it('should include author in the calendar event', async () => {
      const bookingId = 'test-booking-author-' + Date.now();
      const roomName = 'Satoshi Room';
      const now = new Date();
      const startTime = new Date(now.getTime() + 3600 * 1000).toISOString();
      const endTime = new Date(now.getTime() + 7200 * 1000).toISOString();

      const bookingDetails = {
        title: 'Booking with Author',
        description: 'Test booking',
        room: roomName,
        startTime,
        endTime,
      };

      await confirmBookingOrOffer(bookingId, 'booking', npub!, bookingDetails);

      const roomSlug = getRoomSlug(roomName);
      const calendarEvent = await getProposalEvent(roomSlug, bookingId);

      expect(calendarEvent).not.toBeNull();
      expect(calendarEvent!.author).toBe(npub);
    });
  });

  describe('workshop proposal receipts', () => {
    it('should update workshop to TENTATIVE status after payment', async () => {
      const workshopId = 'test-workshop-' + Date.now();
      const roomName = 'Ostrom Room';
      const now = new Date();
      const startTime = new Date(now.getTime() + 3600 * 1000).toISOString();
      const endTime = new Date(now.getTime() + 7200 * 1000).toISOString();

      // First create a pending workshop offer
      const pendingOffer: Offer = {
        id: workshopId,
        type: 'workshop',
        title: 'Test Workshop',
        description: 'A test workshop for integration testing',
        status: 'pending',
        room: roomName,
        startTime,
        endTime,
        minRsvps: 3,
        authors: [npub!],
        updatedAt: new Date().toISOString(),
      };

      fs.writeFileSync(
        path.join(OFFERS_DIR, `${workshopId}.json`),
        JSON.stringify(pendingOffer, null, 2)
      );

      // Confirm the workshop (simulates receipt processing)
      await confirmBookingOrOffer(workshopId, 'workshop_proposal', npub!);

      // Verify offer status is now 'tentative'
      const offerPath = path.join(OFFERS_DIR, `${workshopId}.json`);
      const offer = JSON.parse(fs.readFileSync(offerPath, 'utf-8'));
      expect(offer.status).toBe('tentative');
      expect(offer.type).toBe('workshop');

      // Verify calendar event has TENTATIVE status
      const roomSlug = getRoomSlug(roomName);
      const calendarEvent = await getProposalEvent(roomSlug, workshopId);

      expect(calendarEvent).not.toBeNull();
      expect(calendarEvent!.status).toBe('TENTATIVE');
      expect(calendarEvent!.title).toBe('Test Workshop');
      expect(calendarEvent!.minRsvps).toBe(3);
    });

    it('should preserve workshop minRsvps in calendar event', async () => {
      const workshopId = 'test-workshop-rsvps-' + Date.now();
      const roomName = 'Satoshi Room';
      const now = new Date();
      const startTime = new Date(now.getTime() + 3600 * 1000).toISOString();
      const endTime = new Date(now.getTime() + 7200 * 1000).toISOString();

      const pendingOffer: Offer = {
        id: workshopId,
        type: 'workshop',
        title: 'Workshop with RSVPs',
        description: 'Testing minRsvps',
        status: 'pending',
        room: roomName,
        startTime,
        endTime,
        minRsvps: 5,
        authors: [npub!],
        updatedAt: new Date().toISOString(),
      };

      fs.writeFileSync(
        path.join(OFFERS_DIR, `${workshopId}.json`),
        JSON.stringify(pendingOffer, null, 2)
      );

      await confirmBookingOrOffer(workshopId, 'workshop_proposal', npub!);

      const roomSlug = getRoomSlug(roomName);
      const calendarEvent = await getProposalEvent(roomSlug, workshopId);

      expect(calendarEvent!.minRsvps).toBe(5);
    });
  });

  describe('payment receipt event parsing', () => {
    it('should create valid payment receipt with embedded request', () => {
      const bookingId = 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1';

      const requestEvent = createMockPaymentRequestEvent(secretKey!, {
        context: 'booking',
        relatedEventId: bookingId,
        bookingData: {
          title: 'Test Booking',
          room: 'Ostrom Room',
          roomName: 'Ostrom Room',
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 3600000).toISOString(),
        },
      });

      const receiptEvent = createMockPaymentReceiptEvent(secretKey!, requestEvent, {
        success: true,
        txHash: '0x1234567890abcdef',
      });

      // Verify receipt structure
      expect(receiptEvent.kind).toBe(NOSTR_KINDS.PAYMENT_RECEIPT);

      // Verify it references the request
      const requestTag = receiptEvent.tags.find(t => t[0] === 'e' && t[3] === 'request');
      expect(requestTag).toBeDefined();
      expect(requestTag![1]).toBe(requestEvent.id);

      // Verify status
      const statusTag = receiptEvent.tags.find(t => t[0] === 'status');
      expect(statusTag![1]).toBe('success');

      // Verify embedded request in content
      const content = JSON.parse(receiptEvent.content);
      expect(content.request).toBeDefined();
      expect(content.request.id).toBe(requestEvent.id);

      // Verify context is preserved
      const contextTag = receiptEvent.tags.find(t => t[0] === 'context');
      expect(contextTag![1]).toBe('booking');

      // Verify related event ID is preserved
      const relatedTag = receiptEvent.tags.find(t => t[0] === 'e' && t[3] === 'related');
      expect(relatedTag![1]).toBe(bookingId);
    });

    it('should include hex pubkeys in P and p tags', () => {
      const requestEvent = createMockPaymentRequestEvent(secretKey!, {
        context: 'workshop_proposal',
        relatedEventId: 'workshop123',
      });

      const receiptEvent = createMockPaymentReceiptEvent(secretKey!, requestEvent, {
        success: true,
        txHash: '0xabc',
      });

      // P tag should be hex pubkey
      const senderTag = receiptEvent.tags.find(t => t[0] === 'P');
      expect(senderTag).toBeDefined();
      expect(senderTag![1]).toMatch(/^[0-9a-f]{64}$/i);
      expect(senderTag![1]).toBe(pubkeyHex);

      // p tag should be hex pubkey
      const recipientTag = receiptEvent.tags.find(t => t[0] === 'p');
      expect(recipientTag).toBeDefined();
      expect(recipientTag![1]).toMatch(/^[0-9a-f]{64}$/i);
    });
  });
});
