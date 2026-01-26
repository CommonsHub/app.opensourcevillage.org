/**
 * Badge Claim API Integration Tests
 *
 * Tests for POST /api/claim endpoint.
 *
 * Tests verify:
 * 1. First user can claim without invite code
 * 2. Subsequent users require invite code
 * 3. Error when badge doesn't exist ("Unknown badge")
 * 4. Successful claim creates npub directory and symlinks
 * 5. Badge becomes claimed (symlink instead of directory)
 * 6. Username validation
 * 7. Npub validation
 *
 * @jest-environment node
 */

import { POST as setupBadge } from '@/app/api/badge/setup/route';
import { POST as claimBadge } from '@/app/api/claim/route';
import { NextRequest } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

// Use tests/data directory (set by jest.setup.js)
const TEST_DATA_DIR = path.join(process.cwd(), 'tests', 'data');

// Test constants
const TEST_SERIAL_NUMBER = 'CLAIM-TEST-001';
const TEST_USERNAME = 'testuser';

// Generate test Nostr keys
function generateTestNostrKeys() {
  const secretKey = generateSecretKey();
  const publicKey = getPublicKey(secretKey);
  const nsec = nip19.nsecEncode(secretKey);
  const npub = nip19.npubEncode(publicKey);
  return { secretKey, publicKey, nsec, npub };
}

// Store original env
const originalEnv = process.env;

// Helper to create mock requests
function createSetupRequest(serialNumber: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/badge/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serialNumber }),
  });
}

function createClaimRequest(body: object): NextRequest {
  return new NextRequest('http://localhost:3000/api/claim', {
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

describe('Badge Claim API', () => {
  // Generate fresh keys for each test run
  const testKeys = generateTestNostrKeys();

  beforeAll(async () => {
    // Set up test environment
    process.env = {
      ...originalEnv,
      DATA_DIR: TEST_DATA_DIR,
      // Generate a server nsec for signing events (if needed)
      NOSTR_NSEC: nip19.nsecEncode(generateSecretKey()),
    };

    // Clean up test directories
    await cleanDirectory(path.join(TEST_DATA_DIR, 'npubs'));
    await cleanDirectory(path.join(TEST_DATA_DIR, 'badges'));
    await cleanDirectory(path.join(TEST_DATA_DIR, 'usernames'));

    // Create test directories
    await fs.mkdir(path.join(TEST_DATA_DIR, 'npubs'), { recursive: true });
    await fs.mkdir(path.join(TEST_DATA_DIR, 'badges'), { recursive: true });
    await fs.mkdir(path.join(TEST_DATA_DIR, 'usernames'), { recursive: true });
  }, 30000);

  afterAll(async () => {
    // Restore original env
    process.env = originalEnv;

    // Clean up test directories
    await cleanDirectory(path.join(TEST_DATA_DIR, 'npubs'));
    await cleanDirectory(path.join(TEST_DATA_DIR, 'badges'));
    await cleanDirectory(path.join(TEST_DATA_DIR, 'usernames'));
  });

  describe('Badge validation', () => {
    beforeEach(async () => {
      // Clean directories before each test in this suite
      await cleanDirectory(path.join(TEST_DATA_DIR, 'npubs'));
      await cleanDirectory(path.join(TEST_DATA_DIR, 'badges'));
      await cleanDirectory(path.join(TEST_DATA_DIR, 'usernames'));
      await fs.mkdir(path.join(TEST_DATA_DIR, 'npubs'), { recursive: true });
      await fs.mkdir(path.join(TEST_DATA_DIR, 'badges'), { recursive: true });
      await fs.mkdir(path.join(TEST_DATA_DIR, 'usernames'), { recursive: true });
    });

    it('should return "Unknown badge" error when badge does not exist', async () => {
      const request = createClaimRequest({
        serialNumber: 'NON-EXISTENT-BADGE',
        username: TEST_USERNAME,
        npub: testKeys.npub,
      });

      const response = await claimBadge(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unknown badge');
    });

    it('should reject claim with missing required fields', async () => {
      // Missing serialNumber
      const request1 = createClaimRequest({
        username: TEST_USERNAME,
        npub: testKeys.npub,
      });
      const response1 = await claimBadge(request1);
      const data1 = await response1.json();

      expect(response1.status).toBe(400);
      expect(data1.success).toBe(false);

      // Missing username
      const request2 = createClaimRequest({
        serialNumber: TEST_SERIAL_NUMBER,
        npub: testKeys.npub,
      });
      const response2 = await claimBadge(request2);
      const data2 = await response2.json();

      expect(response2.status).toBe(400);
      expect(data2.success).toBe(false);

      // Missing npub
      const request3 = createClaimRequest({
        serialNumber: TEST_SERIAL_NUMBER,
        username: TEST_USERNAME,
      });
      const response3 = await claimBadge(request3);
      const data3 = await response3.json();

      expect(response3.status).toBe(400);
      expect(data3.success).toBe(false);
    });

    it('should reject invalid npub format', async () => {
      // First set up the badge
      await setupBadge(createSetupRequest(TEST_SERIAL_NUMBER));

      const request = createClaimRequest({
        serialNumber: TEST_SERIAL_NUMBER,
        username: TEST_USERNAME,
        npub: 'invalid-npub',
      });

      const response = await claimBadge(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('npub');
    });

    it('should reject invalid username format', async () => {
      // First set up the badge
      const setupSerial = 'USERNAME-TEST-001';
      await setupBadge(createSetupRequest(setupSerial));

      const request = createClaimRequest({
        serialNumber: setupSerial,
        username: 'ab', // Too short
        npub: testKeys.npub,
      });

      const response = await claimBadge(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('3-20 characters');
    });
  });

  describe('Successful claim flow', () => {
    const claimSerial = 'SUCCESS-CLAIM-001';
    const claimUsername = 'successuser';
    const claimKeys = generateTestNostrKeys();

    beforeAll(async () => {
      // Clean directories before this test suite
      await cleanDirectory(path.join(TEST_DATA_DIR, 'npubs'));
      await cleanDirectory(path.join(TEST_DATA_DIR, 'badges'));
      await cleanDirectory(path.join(TEST_DATA_DIR, 'usernames'));
      await fs.mkdir(path.join(TEST_DATA_DIR, 'npubs'), { recursive: true });
      await fs.mkdir(path.join(TEST_DATA_DIR, 'badges'), { recursive: true });
      await fs.mkdir(path.join(TEST_DATA_DIR, 'usernames'), { recursive: true });
    });

    it('should successfully claim a set up badge (first user, no invite code needed)', async () => {
      // Step 1: Set up the badge (adds to whitelist)
      const setupRequest = createSetupRequest(claimSerial);
      const setupResponse = await setupBadge(setupRequest);
      const setupData = await setupResponse.json();

      expect(setupData.success).toBe(true);

      // Verify badge is in whitelist (before claim, no directory/symlink exists yet)
      const whitelistPath = path.join(TEST_DATA_DIR, 'badges', 'whitelist.txt');
      const whitelistContent = await fs.readFile(whitelistPath, 'utf-8');
      expect(whitelistContent).toContain(claimSerial);

      // Step 2: Claim the badge (first user, no invite code required)
      const claimRequest = createClaimRequest({
        serialNumber: claimSerial,
        username: claimUsername,
        npub: claimKeys.npub,
      });

      const claimResponse = await claimBadge(claimRequest);
      const claimData = await claimResponse.json();

      expect(claimResponse.status).toBe(200);
      expect(claimData.success).toBe(true);
      expect(claimData.profile).toBeDefined();

      // Verify npub directory was created
      const npubDir = path.join(TEST_DATA_DIR, 'npubs', claimKeys.npub);
      const npubExists = await fs.access(npubDir).then(() => true).catch(() => false);
      expect(npubExists).toBe(true);

      // Verify profile.json was created
      const profilePath = path.join(npubDir, 'profile.json');
      const profileContent = await fs.readFile(profilePath, 'utf-8');
      const profile = JSON.parse(profileContent);
      expect(profile.username).toBe(claimUsername);
      expect(profile.npub).toBe(claimKeys.npub);

      // Verify badge path is now a symlink (created during claim)
      const badgePath = path.join(TEST_DATA_DIR, 'badges', claimSerial);
      const badgeStats = await fs.lstat(badgePath);
      expect(badgeStats.isSymbolicLink()).toBe(true);

      // Verify username symlink was created
      const usernameLink = path.join(TEST_DATA_DIR, 'usernames', claimUsername.toLowerCase());
      const usernameStats = await fs.lstat(usernameLink);
      expect(usernameStats.isSymbolicLink()).toBe(true);
    });

    it('should reject claiming an already claimed badge', async () => {
      // Try to claim the same badge again
      // Note: Since a first user already exists, we need to provide an invite code
      // to get past the invite code check and reach the "badge already claimed" check
      const fakeInviteCode = 'a'.repeat(192);

      const request = createClaimRequest({
        serialNumber: claimSerial,
        username: 'anotheruser',
        npub: generateTestNostrKeys().npub,
        inviteCode: fakeInviteCode,
      });

      const response = await claimBadge(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Badge already claimed');
    });

    it('should require invite code for non-first users', async () => {
      // Set up a new badge
      const newSerial = 'SECOND-USER-001';
      await setupBadge(createSetupRequest(newSerial));

      // Try to claim without invite code (should fail since first user already exists)
      const request = createClaimRequest({
        serialNumber: newSerial,
        username: 'seconduser',
        npub: generateTestNostrKeys().npub,
      });

      const response = await claimBadge(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invitation code is required');
    });

    it('should reject duplicate username', async () => {
      // Set up a new badge
      const newSerial = 'DUPLICATE-USER-001';
      await setupBadge(createSetupRequest(newSerial));

      // Generate a fake invite code (pubkey + signature = 192 hex chars)
      // Note: This is a fake invite code that won't validate properly in production,
      // but allows us to test the duplicate username check
      const fakeInviteCode = 'a'.repeat(192);

      // Try to claim with the same username
      const request = createClaimRequest({
        serialNumber: newSerial,
        username: claimUsername, // Same username as above
        npub: generateTestNostrKeys().npub,
        inviteCode: fakeInviteCode,
      });

      const response = await claimBadge(request);
      const data = await response.json();

      // Should fail because username is taken (the error is thrown by createProfile)
      expect(data.success).toBe(false);
      expect(data.error).toContain('Username already taken');
    });
  });
});
