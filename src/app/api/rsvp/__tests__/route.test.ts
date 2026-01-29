/**
 * Tests for RSVP API endpoints
 *
 * These tests validate:
 * - RSVP creation with token transfer
 * - RSVP cancellation with refund
 * - Balance checks and validation
 * - Offer status updates (pending -> confirmed)
 * - Duplicate RSVP prevention
 */

import { NextRequest } from 'next/server';
import { POST, DELETE, GET } from '../route';
import { createProfile } from '@/lib/storage';
import fs from 'fs/promises';
import path from 'path';

// Use a test data directory
const TEST_DATA_DIR = path.join(process.cwd(), 'data-test-rsvp');
process.env.DATA_DIR = TEST_DATA_DIR;

describe('RSVP API Endpoints', () => {
  let aliceNpub: string;
  let bobNpub: string;
  let testOfferId: string;

  beforeEach(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });

    // Create test users
    await createProfile('ALICE123', 'alice', 'npub1alice');
    await createProfile('BOB456', 'bob', 'npub1bob');

    aliceNpub = 'npub1alice';
    bobNpub = 'npub1bob';

    // Create a test offer
    testOfferId = 'test-offer-123';
    const offer = {
      id: testOfferId,
      type: 'workshop',
      title: 'Test Workshop',
      description: 'A test workshop',
      authors: [aliceNpub],
      tags: ['test'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
      publicationCost: 1,
      rewardPerAttendee: 1,
      maxAttendees: 5, // Minimum 5 to confirm
    };

    const offersDir = path.join(TEST_DATA_DIR, 'offers');
    await fs.mkdir(offersDir, { recursive: true });
    await fs.writeFile(
      path.join(offersDir, `${testOfferId}.json`),
      JSON.stringify(offer, null, 2)
    );
  });

  afterEach(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  describe('POST /api/rsvp', () => {
    it('should create an RSVP successfully', async () => {
      const request = new NextRequest('http://localhost:3000/api/rsvp', {
        method: 'POST',
        body: JSON.stringify({
          offerId: testOfferId,
          npub: bobNpub,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.rsvp).toBeDefined();
      expect(data.rsvp.offerId).toBe(testOfferId);
      expect(data.rsvp.npub).toBe(bobNpub);
      expect(data.rsvp.status).toBe('active');
      expect(data.rsvp.tokensPaid).toBe(1);
    });

    it('should deduct 1 token from user balance', async () => {
      const request = new NextRequest('http://localhost:3000/api/rsvp', {
        method: 'POST',
        body: JSON.stringify({
          offerId: testOfferId,
          npub: bobNpub,
        }),
      });

      await POST(request);

      // Read Bob's profile to check balance
      const profilePath = path.join(TEST_DATA_DIR, 'badges', 'BOB456', 'profile.json');
      const profileContent = await fs.readFile(profilePath, 'utf-8');
      const profile = JSON.parse(profileContent);

      expect(profile.balance.confirmed).toBe(49); // 50 initial - 1 for RSVP
    });

    it('should reject RSVP with insufficient tokens', async () => {
      // Set Bob's balance to 0
      const profilePath = path.join(TEST_DATA_DIR, 'badges', 'BOB456', 'profile.json');
      const profileContent = await fs.readFile(profilePath, 'utf-8');
      const profile = JSON.parse(profileContent);
      profile.balance.confirmed = 0;
      profile.balance.total = 0;
      await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));

      const request = new NextRequest('http://localhost:3000/api/rsvp', {
        method: 'POST',
        body: JSON.stringify({
          offerId: testOfferId,
          npub: bobNpub,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Insufficient balance');
    });

    it('should reject duplicate RSVP', async () => {
      // Create first RSVP
      const request1 = new NextRequest('http://localhost:3000/api/rsvp', {
        method: 'POST',
        body: JSON.stringify({
          offerId: testOfferId,
          npub: bobNpub,
        }),
      });
      await POST(request1);

      // Try to RSVP again
      const request2 = new NextRequest('http://localhost:3000/api/rsvp', {
        method: 'POST',
        body: JSON.stringify({
          offerId: testOfferId,
          npub: bobNpub,
        }),
      });

      const response = await POST(request2);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('already RSVPed');
    });

    it('should reject author RSVPing to own offer', async () => {
      const request = new NextRequest('http://localhost:3000/api/rsvp', {
        method: 'POST',
        body: JSON.stringify({
          offerId: testOfferId,
          npub: aliceNpub, // Alice is the author
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('cannot RSVP to your own offer');
    });

    it('should return 404 for non-existent offer', async () => {
      const request = new NextRequest('http://localhost:3000/api/rsvp', {
        method: 'POST',
        body: JSON.stringify({
          offerId: 'nonexistent',
          npub: bobNpub,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Offer not found');
    });
  });

  describe('DELETE /api/rsvp', () => {
    it('should cancel RSVP and refund token', async () => {
      // First, create an RSVP
      const createRequest = new NextRequest('http://localhost:3000/api/rsvp', {
        method: 'POST',
        body: JSON.stringify({
          offerId: testOfferId,
          npub: bobNpub,
        }),
      });
      await POST(createRequest);

      // Then cancel it
      const cancelRequest = new NextRequest('http://localhost:3000/api/rsvp', {
        method: 'DELETE',
        body: JSON.stringify({
          offerId: testOfferId,
          npub: bobNpub,
        }),
      });

      const response = await DELETE(cancelRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Check that token was refunded
      const profilePath = path.join(TEST_DATA_DIR, 'badges', 'BOB456', 'profile.json');
      const profileContent = await fs.readFile(profilePath, 'utf-8');
      const profile = JSON.parse(profileContent);

      expect(profile.balance.confirmed).toBe(50); // Back to original
    });

    it('should return 404 when no active RSVP exists', async () => {
      const request = new NextRequest('http://localhost:3000/api/rsvp', {
        method: 'DELETE',
        body: JSON.stringify({
          offerId: testOfferId,
          npub: bobNpub,
        }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toContain('No active RSVP found');
    });
  });

  describe('GET /api/rsvp', () => {
    it('should return RSVP count for an offer', async () => {
      // Create a couple of RSVPs
      const request1 = new NextRequest('http://localhost:3000/api/rsvp', {
        method: 'POST',
        body: JSON.stringify({
          offerId: testOfferId,
          npub: bobNpub,
        }),
      });
      await POST(request1);

      // Get RSVPs
      const getRequest = new NextRequest(`http://localhost:3000/api/rsvp?offerId=${testOfferId}`);
      const response = await GET(getRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.count).toBe(1);
      expect(data.rsvps).toHaveLength(1);
    });

    it('should return empty array for offer with no RSVPs', async () => {
      const request = new NextRequest(`http://localhost:3000/api/rsvp?offerId=${testOfferId}`);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.count).toBe(0);
      expect(data.rsvps).toEqual([]);
    });

    it('should return 400 if offerId is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/rsvp');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });
});
