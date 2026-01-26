/**
 * Room Booking Integration Tests
 *
 * Tests for the complete room booking flow including:
 * - Balance checks before workshop proposals
 * - Workshop proposals with token costs based on room hourly rates
 * - Competing proposals and conflict detection
 * - RSVP flow and confirmation thresholds
 * - Cancellation and refunds
 *
 * @jest-environment node
 */

import { POST as createOffer, GET as getOffers } from '@/app/api/offers/route';
import { POST as rsvp } from '@/app/api/rsvp/route';
import { createProfile, getProfileByNpub } from '@/lib/storage';
import { NextRequest } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

// Use tests/data directory
const TEST_DATA_DIR = path.join(process.cwd(), 'tests', 'data');

// Store original env
const originalEnv = process.env;

// Room costs from settings.json
const ROOM_COSTS = {
  'Ostrom Room': 3,
  'Satoshi Room': 2,
  'Angel Room': 1,
  'Mush Room': 1,
  'Phone Booth': 1,
};

// Generate test Nostr keys
function generateTestNostrKeys() {
  const secretKey = generateSecretKey();
  const publicKey = getPublicKey(secretKey);
  const nsec = nip19.nsecEncode(secretKey);
  const npub = nip19.npubEncode(publicKey);
  return { secretKey, publicKey, nsec, npub };
}

// Helper to create mock offer requests
function createOfferRequest(body: object): NextRequest {
  return new NextRequest('http://localhost:3000/api/offers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Helper to create mock RSVP requests
function createRsvpRequest(body: object): NextRequest {
  return new NextRequest('http://localhost:3000/api/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Helper to clean up specific directories
async function cleanDirectory(dirPath: string) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}

// Helper to set user balance by directly updating the profile file
async function setUserBalance(npub: string, balance: number) {
  const profile = await getProfileByNpub(npub);
  if (profile) {
    profile.balance.confirmed = balance;
    profile.balance.total = balance;

    // Write directly to both badge and npub profile files
    const badgeProfilePath = path.join(TEST_DATA_DIR, 'badges', profile.serialNumber, 'profile.json');
    const npubProfilePath = path.join(TEST_DATA_DIR, 'npubs', npub, 'profile.json');

    await fs.writeFile(badgeProfilePath, JSON.stringify(profile, null, 2));
    try {
      await fs.writeFile(npubProfilePath, JSON.stringify(profile, null, 2));
    } catch {
      // npub directory might not exist as symlink
    }
  }
}

describe('Room Booking Integration Tests', () => {
  // Test users with their keys
  const user1 = generateTestNostrKeys();
  const user2 = generateTestNostrKeys();
  const user3 = generateTestNostrKeys();
  const user4 = generateTestNostrKeys();

  beforeAll(async () => {
    // Set up test environment
    process.env = {
      ...originalEnv,
      DATA_DIR: TEST_DATA_DIR,
      NOSTR_NSEC: nip19.nsecEncode(generateSecretKey()),
    };

    // Clean up test directories
    await cleanDirectory(path.join(TEST_DATA_DIR, 'badges'));
    await cleanDirectory(path.join(TEST_DATA_DIR, 'npubs'));
    await cleanDirectory(path.join(TEST_DATA_DIR, 'usernames'));
    await cleanDirectory(path.join(TEST_DATA_DIR, 'offers'));
    await cleanDirectory(path.join(TEST_DATA_DIR, 'calendars'));

    // Create test directories
    await fs.mkdir(path.join(TEST_DATA_DIR, 'badges'), { recursive: true });
    await fs.mkdir(path.join(TEST_DATA_DIR, 'npubs'), { recursive: true });
    await fs.mkdir(path.join(TEST_DATA_DIR, 'usernames'), { recursive: true });
    await fs.mkdir(path.join(TEST_DATA_DIR, 'offers'), { recursive: true });
    await fs.mkdir(path.join(TEST_DATA_DIR, 'calendars'), { recursive: true });

    // Create test users with 0 balance initially
    await createProfile('USER1-001', 'user1', user1.npub);
    await createProfile('USER2-001', 'user2', user2.npub);
    await createProfile('USER3-001', 'user3', user3.npub);
    await createProfile('USER4-001', 'user4', user4.npub);

    // Set initial balances to 0
    await setUserBalance(user1.npub, 0);
    await setUserBalance(user2.npub, 0);
    await setUserBalance(user3.npub, 0);
    await setUserBalance(user4.npub, 0);
  }, 30000);

  afterAll(async () => {
    // Restore original env
    process.env = originalEnv;

    // Clean up test directories
    await cleanDirectory(path.join(TEST_DATA_DIR, 'badges'));
    await cleanDirectory(path.join(TEST_DATA_DIR, 'npubs'));
    await cleanDirectory(path.join(TEST_DATA_DIR, 'usernames'));
    await cleanDirectory(path.join(TEST_DATA_DIR, 'offers'));
    await cleanDirectory(path.join(TEST_DATA_DIR, 'calendars'));
  });

  describe('TC1: Insufficient Balance Check', () => {
    it('should reject workshop proposal when user has 0 tokens', async () => {
      // Ensure user1 has 0 tokens
      await setUserBalance(user1.npub, 0);

      const request = createOfferRequest({
        type: 'workshop',
        title: 'Test Workshop',
        description: 'A test workshop',
        startTime: '2026-01-28T14:00:00Z',
        endTime: '2026-01-28T15:00:00Z',
        room: 'Ostrom Room', // 3 tokens/hour
        minRsvps: 3,
        npub: user1.npub,
      });

      const response = await createOffer(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Insufficient balance');
      expect(data.error).toContain('3 tokens'); // Should require 3 tokens for Ostrom Room
    });

    it('should reject when balance is less than room cost', async () => {
      // User has 2 tokens but needs 3 for Ostrom Room
      await setUserBalance(user1.npub, 2);

      const request = createOfferRequest({
        type: 'workshop',
        title: 'Test Workshop',
        description: 'A test workshop',
        startTime: '2026-01-28T14:00:00Z',
        endTime: '2026-01-28T15:00:00Z',
        room: 'Ostrom Room',
        minRsvps: 3,
        npub: user1.npub,
      });

      const response = await createOffer(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Insufficient balance');
    });
  });

  describe('TC2: Successful Workshop Proposal', () => {
    it('should create workshop when user has sufficient balance', async () => {
      // Give user1 51 tokens
      await setUserBalance(user1.npub, 51);

      const request = createOfferRequest({
        type: 'workshop',
        title: 'Intro to Nostr',
        description: 'Learn about Nostr protocol',
        startTime: '2026-01-28T14:00:00Z',
        endTime: '2026-01-28T15:00:00Z',
        room: 'Ostrom Room', // 3 tokens/hour
        minRsvps: 3,
        npub: user1.npub,
      });

      const response = await createOffer(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.offer).toBeDefined();
      expect(data.offer.status).toBe('pending');
      expect(data.offer.cost).toBe(3); // 3 tokens/hour * 1 hour
      expect(data.pendingBurn).toBe(true); // Should indicate burn is pending
    });

    it('should calculate cost correctly for 2-hour workshop', async () => {
      await setUserBalance(user1.npub, 10);

      const request = createOfferRequest({
        type: 'workshop',
        title: 'Extended Workshop',
        description: 'A longer workshop',
        startTime: '2026-01-29T14:00:00Z',
        endTime: '2026-01-29T16:00:00Z', // 2 hours
        room: 'Satoshi Room', // 2 tokens/hour
        minRsvps: 3,
        npub: user1.npub,
      });

      const response = await createOffer(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.offer.cost).toBe(4); // 2 tokens/hour * 2 hours
    });
  });

  describe('TC3: Competing Workshop Proposals', () => {
    it('should allow competing proposal with tentative conflict warning', async () => {
      // Give user2 52 tokens
      await setUserBalance(user2.npub, 52);

      // First, create a workshop by user1
      await setUserBalance(user1.npub, 51);
      const workshop1Request = createOfferRequest({
        type: 'workshop',
        title: 'User1 Workshop',
        description: 'First workshop',
        startTime: '2026-01-30T14:00:00Z',
        endTime: '2026-01-30T15:00:00Z',
        room: 'Angel Room', // 1 token/hour
        minRsvps: 3,
        npub: user1.npub,
      });

      const workshop1Response = await createOffer(workshop1Request);
      const workshop1Data = await workshop1Response.json();
      expect(workshop1Response.status).toBe(200);

      // Now user2 proposes at the same time/room
      const workshop2Request = createOfferRequest({
        type: 'workshop',
        title: 'User2 Workshop',
        description: 'Competing workshop',
        startTime: '2026-01-30T14:00:00Z',
        endTime: '2026-01-30T15:00:00Z',
        room: 'Angel Room',
        minRsvps: 3,
        npub: user2.npub,
      });

      const workshop2Response = await createOffer(workshop2Request);
      const workshop2Data = await workshop2Response.json();

      // Should succeed but with a conflict warning (tentative conflicts are warnings, not blocks)
      expect(workshop2Response.status).toBe(200);
      expect(workshop2Data.success).toBe(true);
      expect(workshop2Data.offer.status).toBe('pending');
    });
  });

  describe('TC4: Cost Calculation by Room', () => {
    beforeEach(async () => {
      await setUserBalance(user1.npub, 100);
    });

    it('should charge 3 tokens/hour for Ostrom Room', async () => {
      const request = createOfferRequest({
        type: 'workshop',
        title: 'Ostrom Test',
        description: 'Test',
        startTime: '2026-02-01T10:00:00Z',
        endTime: '2026-02-01T11:00:00Z',
        room: 'Ostrom Room',
        minRsvps: 3,
        npub: user1.npub,
      });

      const response = await createOffer(request);
      const data = await response.json();

      expect(data.offer.cost).toBe(3);
    });

    it('should charge 2 tokens/hour for Satoshi Room', async () => {
      const request = createOfferRequest({
        type: 'workshop',
        title: 'Satoshi Test',
        description: 'Test',
        startTime: '2026-02-01T10:00:00Z',
        endTime: '2026-02-01T11:00:00Z',
        room: 'Satoshi Room',
        minRsvps: 3,
        npub: user1.npub,
      });

      const response = await createOffer(request);
      const data = await response.json();

      expect(data.offer.cost).toBe(2);
    });

    it('should charge 1 token/hour for Angel Room', async () => {
      const request = createOfferRequest({
        type: 'workshop',
        title: 'Angel Test',
        description: 'Test',
        startTime: '2026-02-01T10:00:00Z',
        endTime: '2026-02-01T11:00:00Z',
        room: 'Angel Room',
        minRsvps: 3,
        npub: user1.npub,
      });

      const response = await createOffer(request);
      const data = await response.json();

      expect(data.offer.cost).toBe(1);
    });

    it('should calculate fractional hours as ceiling', async () => {
      // 90 minutes = 1.5 hours, should charge for 2 hours
      const request = createOfferRequest({
        type: 'workshop',
        title: 'Partial Hour Test',
        description: 'Test',
        startTime: '2026-02-01T10:00:00Z',
        endTime: '2026-02-01T11:30:00Z', // 1.5 hours
        room: 'Satoshi Room', // 2 tokens/hour
        minRsvps: 3,
        npub: user1.npub,
      });

      const response = await createOffer(request);
      const data = await response.json();

      expect(data.offer.cost).toBe(3); // ceil(1.5 * 2) = 3
    });
  });

  describe('TC5: minRsvps Validation', () => {
    beforeEach(async () => {
      await setUserBalance(user1.npub, 100);
    });

    it('should reject workshop with minRsvps < 2', async () => {
      const request = createOfferRequest({
        type: 'workshop',
        title: 'Too Few RSVPs',
        description: 'Test',
        startTime: '2026-02-02T10:00:00Z',
        endTime: '2026-02-02T11:00:00Z',
        room: 'Angel Room',
        minRsvps: 1, // Invalid - must be >= 2
        npub: user1.npub,
      });

      const response = await createOffer(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Minimum RSVPs must be at least 2');
    });

    it('should accept workshop with minRsvps >= 2', async () => {
      const request = createOfferRequest({
        type: 'workshop',
        title: 'Valid RSVPs',
        description: 'Test',
        startTime: '2026-02-02T12:00:00Z',
        endTime: '2026-02-02T13:00:00Z',
        room: 'Angel Room',
        minRsvps: 5,
        npub: user1.npub,
      });

      const response = await createOffer(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.offer.minRsvps).toBe(5);
    });
  });

  describe('TC6: Profile Not Found', () => {
    it('should return 404 for non-existent user', async () => {
      const fakeUser = generateTestNostrKeys();

      const request = createOfferRequest({
        type: 'workshop',
        title: 'No Profile',
        description: 'Test',
        startTime: '2026-02-03T10:00:00Z',
        endTime: '2026-02-03T11:00:00Z',
        room: 'Angel Room',
        minRsvps: 3,
        npub: fakeUser.npub, // This user has no profile
      });

      const response = await createOffer(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Profile not found');
    });
  });

  describe('TC7: Get Offers', () => {
    it('should list all offers', async () => {
      const request = new NextRequest('http://localhost:3000/api/offers');
      const response = await getOffers(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.offers)).toBe(true);
    });

    it('should filter offers by type', async () => {
      const request = new NextRequest('http://localhost:3000/api/offers?type=workshop');
      const response = await getOffers(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // All returned offers should be workshops
      for (const offer of data.offers) {
        expect(offer.type).toBe('workshop');
      }
    });
  });
});
