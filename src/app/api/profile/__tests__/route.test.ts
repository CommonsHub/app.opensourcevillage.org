/**
 * Tests for profile API endpoints
 *
 * These tests validate:
 * - Profile retrieval by username and npub
 * - Profile updates with authorization
 * - Error handling for missing profiles
 * - Authorization checks
 * - NOSTR event logging
 */

import { NextRequest } from 'next/server';
import { GET, PUT } from '../[identifier]/route';
import { createProfile } from '@/lib/storage';
import { readNostrEvents } from '@/lib/nostr-logger';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { createProfileEvent } from '@/lib/nostr-events';
import fs from 'fs/promises';
import path from 'path';

// Use a unique test data directory
const TEST_DATA_DIR = path.join(process.cwd(), `data-test-api-profile-${Date.now()}`);
process.env.DATA_DIR = TEST_DATA_DIR;

describe('Profile API Endpoints', () => {
  beforeEach(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  describe('GET /api/profile/[identifier]', () => {
    it('should retrieve profile by username', async () => {
      const serialNumber = 'SN001';
      const username = 'alice';
      const npub = 'npub1test123';

      await createProfile(serialNumber, username, npub);

      const request = new NextRequest(`http://localhost:3000/api/profile/${username}`);
      const response = await GET(request, { params: { identifier: username } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.profile.username).toBe(username);
      expect(data.profile.npub).toBe(npub);
      expect(data.profile.balance).toBeDefined();
    });

    it('should retrieve profile by npub', async () => {
      const serialNumber = 'SN002';
      const username = 'bob';
      const npub = 'npub1test456';

      await createProfile(serialNumber, username, npub);

      const request = new NextRequest(`http://localhost:3000/api/profile/${npub}`);
      const response = await GET(request, { params: { identifier: npub } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.profile.username).toBe(username);
      expect(data.profile.npub).toBe(npub);
    });

    it('should return 404 for non-existent profile', async () => {
      const request = new NextRequest('http://localhost:3000/api/profile/nonexistent');
      const response = await GET(request, { params: { identifier: 'nonexistent' } });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Profile not found');
    });

    it('should not expose sensitive information', async () => {
      const serialNumber = 'SN003';
      const username = 'charlie';
      const npub = 'npub1test789';

      await createProfile(serialNumber, username, npub);

      const request = new NextRequest(`http://localhost:3000/api/profile/${username}`);
      const response = await GET(request, { params: { identifier: username } });
      const data = await response.json();

      // Should not expose serialNumber
      expect(data.profile.serialNumber).toBeUndefined();
    });
  });

  describe('PUT /api/profile/[identifier]', () => {
    it('should update profile when authorized', async () => {
      const serialNumber = 'SN004';
      const username = 'dave';
      const npub = 'npub1test111';

      await createProfile(serialNumber, username, npub);

      const updates = {
        name: 'Dave Smith',
        shortbio: 'Web3 developer',
      };

      const request = new NextRequest(`http://localhost:3000/api/profile/${username}`, {
        method: 'PUT',
        body: JSON.stringify({
          updates,
          npub,
        }),
      });

      const response = await PUT(request, { params: { identifier: username } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.profile.name).toBe('Dave Smith');
      expect(data.profile.shortbio).toBe('Web3 developer');
    });

    it('should reject update with wrong npub', async () => {
      const serialNumber = 'SN005';
      const username = 'eve';
      const npub = 'npub1test222';

      await createProfile(serialNumber, username, npub);

      const updates = {
        name: 'Hacker',
      };

      const request = new NextRequest(`http://localhost:3000/api/profile/${username}`, {
        method: 'PUT',
        body: JSON.stringify({
          updates,
          npub: 'npub1wrongkey',
        }),
      });

      const response = await PUT(request, { params: { identifier: username } });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });

    it('should return 404 for non-existent profile', async () => {
      const request = new NextRequest('http://localhost:3000/api/profile/nonexistent', {
        method: 'PUT',
        body: JSON.stringify({
          updates: { name: 'Test' },
          npub: 'npub1test',
        }),
      });

      const response = await PUT(request, { params: { identifier: 'nonexistent' } });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });

    it('should not allow updating protected fields', async () => {
      const serialNumber = 'SN006';
      const username = 'frank';
      const npub = 'npub1test333';

      await createProfile(serialNumber, username, npub);

      const updates = {
        username: 'hacker', // Should be ignored
        npub: 'npub1hacker', // Should be ignored
        name: 'Frank Miller', // Should be allowed
      };

      const request = new NextRequest(`http://localhost:3000/api/profile/${username}`, {
        method: 'PUT',
        body: JSON.stringify({
          updates,
          npub,
        }),
      });

      const response = await PUT(request, { params: { identifier: username } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.profile.name).toBe('Frank Miller');
      // Protected fields should remain unchanged
      expect(data.profile.username).toBe(username); // Not 'hacker'
      expect(data.profile.npub).toBe(npub); // Not 'npub1hacker'
    });

    it('should return 400 if updates or npub missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/profile/alice', {
        method: 'PUT',
        body: JSON.stringify({}),
      });

      const response = await PUT(request, { params: { identifier: 'alice' } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Missing');
    });

    it('should log NOSTR event when provided', async () => {
      const serialNumber = 'SN007';
      const username = 'grace';

      // Generate a real keypair for testing
      const secretKey = generateSecretKey();
      const publicKey = getPublicKey(secretKey);
      const npub = nip19.npubEncode(publicKey);

      await createProfile(serialNumber, username, npub);

      // Create a signed NOSTR profile event
      const profileData = {
        name: 'Grace Hopper',
        about: 'Computer scientist',
      };
      const nostrEvent = createProfileEvent(secretKey, profileData);

      const updates = {
        name: 'Grace Hopper',
        shortbio: 'Computer scientist',
      };

      const request = new NextRequest(`http://localhost:3000/api/profile/${username}`, {
        method: 'PUT',
        body: JSON.stringify({
          updates,
          npub,
          nostrEvent, // Include the signed NOSTR event
        }),
      });

      const response = await PUT(request, { params: { identifier: username } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify the NOSTR event was logged
      const events = readNostrEvents(serialNumber);
      expect(events.length).toBe(1);
      expect(events[0].id).toBe(nostrEvent.id);
      expect(events[0].kind).toBe(0); // Profile event
      expect(events[0].pubkey).toBe(publicKey);

      // Verify event content contains profile data
      const content = JSON.parse(events[0].content);
      expect(content.name).toBe('Grace Hopper');
      expect(content.about).toBe('Computer scientist');
    });

    it('should work without NOSTR event (backwards compatibility)', async () => {
      const serialNumber = 'SN008';
      const username = 'henry';
      const npub = 'npub1test444';

      await createProfile(serialNumber, username, npub);

      const updates = {
        name: 'Henry Ford',
      };

      const request = new NextRequest(`http://localhost:3000/api/profile/${username}`, {
        method: 'PUT',
        body: JSON.stringify({
          updates,
          npub,
          // No nostrEvent provided
        }),
      });

      const response = await PUT(request, { params: { identifier: username } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify no events were logged
      const events = readNostrEvents(serialNumber);
      expect(events.length).toBe(0);
    });

    it('should log multiple profile updates as separate events', async () => {
      const serialNumber = 'SN009';
      const username = 'iris';

      const secretKey = generateSecretKey();
      const publicKey = getPublicKey(secretKey);
      const npub = nip19.npubEncode(publicKey);

      await createProfile(serialNumber, username, npub);

      // First update
      const event1 = createProfileEvent(secretKey, {
        name: 'Iris Chang',
        about: 'Writer',
      });

      await PUT(
        new NextRequest(`http://localhost:3000/api/profile/${username}`, {
          method: 'PUT',
          body: JSON.stringify({
            updates: { name: 'Iris Chang' },
            npub,
            nostrEvent: event1,
          }),
        }),
        { params: { identifier: username } }
      );

      // Second update
      const event2 = createProfileEvent(secretKey, {
        name: 'Iris Chang',
        about: 'Historian and Writer',
        picture: 'https://example.com/avatar.png',
      });

      await PUT(
        new NextRequest(`http://localhost:3000/api/profile/${username}`, {
          method: 'PUT',
          body: JSON.stringify({
            updates: { shortbio: 'Historian and Writer' },
            npub,
            nostrEvent: event2,
          }),
        }),
        { params: { identifier: username } }
      );

      // Verify both events were logged
      const events = readNostrEvents(serialNumber);
      expect(events.length).toBe(2);
      expect(events[0].id).toBe(event1.id);
      expect(events[1].id).toBe(event2.id);
    });
  });
});
