/**
 * Tests for offers/workshops API endpoints
 *
 * These tests validate:
 * - Workshop/offer creation with token deduction
 * - Type validation (workshop, 1:1, other)
 * - Authorization and balance checks
 * - Offer listing with filters
 */

import { NextRequest } from 'next/server';
import { POST, GET } from '../route';
import { createProfile } from '@/lib/storage';
import fs from 'fs/promises';
import path from 'path';

// Use a test data directory
const TEST_DATA_DIR = path.join(process.cwd(), 'data-test-offers');
process.env.DATA_DIR = TEST_DATA_DIR;

/**
 * Helper to create profile with confirmed balance
 * (createProfile sets confirmed: 0, pending: 50 by default)
 */
async function createProfileWithBalance(
  serialNumber: string,
  username: string,
  npub: string,
  confirmedBalance: number = 50
) {
  const profile = await createProfile(serialNumber, username, npub);
  profile.balance.confirmed = confirmedBalance;
  const profilePath = path.join(TEST_DATA_DIR, 'npubs', npub, 'profile.json');
  await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));
  return profile;
}

describe('Offers API Endpoints', () => {
  beforeEach(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  describe('POST /api/offers', () => {
    it('should create a workshop offer', async () => {
      await createProfileWithBalance('ABC123', 'alice', 'npub1test123', 50);

      const body = {
        type: 'workshop',
        title: 'Intro to NOSTR',
        description: 'Learn NOSTR basics',
        tags: ['web3', 'workshop'],
        startTime: '2026-01-27T14:00:00Z',
        endTime: '2026-01-27T15:00:00Z',
        room: 'Room A',
        minAttendees: 5,
        maxAttendees: 20,
        npub: 'npub1test123',
      };

      const request = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.offer).toBeDefined();
      expect(data.offer.title).toBe('Intro to NOSTR');
      expect(data.offer.type).toBe('workshop');
      expect(data.offer.status).toBe('pending');
      expect(data.offer.authors).toContain('npub1test123');
    });

    it('should create a 1:1 offer', async () => {
      await createProfileWithBalance('ABC123', 'alice', 'npub1test123', 50);

      const body = {
        type: '1:1',
        title: 'Code Review Session',
        description: 'I will review your code',
        tags: ['mentorship'],
        npub: 'npub1test123',
      };

      const request = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.offer.type).toBe('1:1');
    });

    it('should create a generic offer', async () => {
      await createProfileWithBalance('ABC123', 'alice', 'npub1test123', 50);

      const body = {
        type: 'other',
        title: 'Coffee Chat',
        description: 'Let\'s grab coffee and chat',
        tags: ['networking'],
        npub: 'npub1test123',
      };

      const request = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.offer.type).toBe('other');
    });

    it('should reject offer creation with insufficient tokens', async () => {
      // Create profile with 0 tokens
      const profile = await createProfile('ABC123', 'alice', 'npub1test123');
      profile.balance.confirmed = 0;
      profile.balance.total = 0;

      const profilePath = path.join(TEST_DATA_DIR, 'badges', 'ABC123', 'profile.json');
      await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));

      const body = {
        type: 'workshop',
        title: 'Test Workshop',
        description: 'Test',
        npub: 'npub1test123',
      };

      const request = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Insufficient balance');
    });

    it('should reject invalid offer type', async () => {
      await createProfileWithBalance('ABC123', 'alice', 'npub1test123', 50);

      const body = {
        type: 'invalid',
        title: 'Test',
        description: 'Test',
        npub: 'npub1test123',
      };

      const request = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid type');
    });

    it('should return 404 for non-existent profile', async () => {
      const body = {
        type: 'workshop',
        title: 'Test',
        description: 'Test',
        npub: 'npub1nonexistent',
      };

      const request = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Profile not found');
    });

    it('should return pendingBurn flag (tokens burned via payment processor)', async () => {
      await createProfileWithBalance('ABC123', 'alice', 'npub1test123', 50);

      const body = {
        type: 'workshop',
        title: 'Test Workshop',
        description: 'Test',
        npub: 'npub1test123',
      };

      const request = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const response = await POST(request);
      const data = await response.json();

      // Tokens are now burned via payment processor, not directly deducted
      expect(data.pendingBurn).toBe(true);

      // Balance should remain unchanged until burn is confirmed
      const profilePath = path.join(TEST_DATA_DIR, 'badges', 'ABC123', 'profile.json');
      const profileContent = await fs.readFile(profilePath, 'utf-8');
      const profile = JSON.parse(profileContent);

      expect(profile.balance.confirmed).toBe(50); // Balance unchanged, pending burn
    });

    it('should calculate room cost based on hourly rate and duration', async () => {
      await createProfileWithBalance('ABC123', 'alice', 'npub1test123', 50);

      // User has 50 tokens, trying to book Ostrom Room (3 tokens/hour) for 1 hour
      const body = {
        type: 'workshop',
        title: 'Test Workshop',
        description: 'Test',
        startTime: '2026-01-28T14:00:00Z',
        endTime: '2026-01-28T15:00:00Z',
        room: 'Ostrom Room', // 3 tokens/hour per settings.json
        npub: 'npub1test123',
      };

      const request = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.offer.cost).toBe(3); // 3 tokens/hour * 1 hour
    });

    it('should reject workshop if balance is less than room cost', async () => {
      // Create profile with only 2 tokens
      const profile = await createProfile('ABC123', 'alice', 'npub1test123');
      profile.balance.confirmed = 2;
      profile.balance.total = 2;

      const profilePath = path.join(TEST_DATA_DIR, 'badges', 'ABC123', 'profile.json');
      await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));

      // Try to book Ostrom Room (3 tokens/hour) for 1 hour
      const body = {
        type: 'workshop',
        title: 'Test Workshop',
        description: 'Test',
        startTime: '2026-01-28T14:00:00Z',
        endTime: '2026-01-28T15:00:00Z',
        room: 'Ostrom Room',
        npub: 'npub1test123',
      };

      const request = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Insufficient balance');
      expect(data.error).toContain('3 tokens'); // Should mention the required cost
    });
  });

  describe('GET /api/offers', () => {
    it('should list all offers', async () => {
      await createProfileWithBalance('ABC123', 'alice', 'npub1test123', 50);

      // Create two offers (check responses to ensure they succeed)
      for (let i = 0; i < 2; i++) {
        const body = {
          type: 'workshop',
          title: `Workshop ${i}`,
          description: 'Test',
          npub: 'npub1test123',
        };

        const request = new NextRequest('http://localhost:3000/api/offers', {
          method: 'POST',
          body: JSON.stringify(body),
        });

        const response = await POST(request);
        const postData = await response.json();
        expect(response.status).toBe(200);
        expect(postData.success).toBe(true);
      }

      // Get all offers
      const request = new NextRequest('http://localhost:3000/api/offers');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.offers).toHaveLength(2);
    });

    it('should filter offers by type', async () => {
      await createProfileWithBalance('ABC123', 'alice', 'npub1test123', 50);

      // Create workshop
      const workshopReq = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        body: JSON.stringify({
          type: 'workshop',
          title: 'Workshop',
          description: 'Test',
          npub: 'npub1test123',
        }),
      });
      await POST(workshopReq);

      // Create other
      const otherReq = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        body: JSON.stringify({
          type: 'other',
          title: 'Other',
          description: 'Test',
          npub: 'npub1test123',
        }),
      });
      await POST(otherReq);

      // Get only workshops
      const request = new NextRequest('http://localhost:3000/api/offers?type=workshop');
      const response = await GET(request);
      const data = await response.json();

      expect(data.offers).toHaveLength(1);
      expect(data.offers[0].type).toBe('workshop');
    });

    it('should return empty array when no offers exist', async () => {
      const request = new NextRequest('http://localhost:3000/api/offers');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.offers).toEqual([]);
    });
  });
});
