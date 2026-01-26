/**
 * Tests for Badge Redirect Flow
 *
 * Tests that scanning a badge:
 * 1. Redirects to /claim when badge is unclaimed
 * 2. Redirects to /profile/:username when badge is already claimed
 *
 * This simulates the flow in /badge page which:
 * 1. Gets raw serial from URL
 * 2. Hashes the serial
 * 3. Looks up profile by hashed serial
 * 4. Redirects based on whether profile exists
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  createProfile,
  getProfileBySerialNumber,
  setupBadge,
  isBadgeClaimed,
} from '../storage';

// Use Node.js crypto for tests (same algorithm as browser version)
async function hashSerialNumber(serialNumber: string): Promise<string> {
  const hash = crypto.createHash('sha256').update(serialNumber).digest('hex');
  return hash.slice(0, 16);
}

// Use a test data directory
const TEST_DATA_DIR = path.join(process.cwd(), 'data-test-badge-redirect');
process.env.DATA_DIR = TEST_DATA_DIR;

describe('Badge Redirect Flow', () => {
  beforeEach(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  describe('hashSerialNumber', () => {
    it('should hash serial number consistently', async () => {
      const rawSerial = 'ABC123XYZ';
      const hash1 = await hashSerialNumber(rawSerial);
      const hash2 = await hashSerialNumber(rawSerial);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16); // First 16 hex chars of SHA-256
    });

    it('should produce different hashes for different serials', async () => {
      const hash1 = await hashSerialNumber('SERIAL001');
      const hash2 = await hashSerialNumber('SERIAL002');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Unclaimed badge flow', () => {
    it('should return null when looking up unclaimed badge', async () => {
      const rawSerial = 'NEWBADGE001';
      const hashedSerial = await hashSerialNumber(rawSerial);

      // Setup badge but don't claim it
      await setupBadge(hashedSerial);

      // Looking up by hashed serial should return null (not claimed)
      const profile = await getProfileBySerialNumber(hashedSerial);
      expect(profile).toBeNull();

      // isBadgeClaimed should return false
      const claimed = await isBadgeClaimed(hashedSerial);
      expect(claimed).toBe(false);
    });

    it('should simulate /badge page flow for unclaimed badge', async () => {
      const rawSerial = 'NEWBADGE002';
      const hashedSerial = await hashSerialNumber(rawSerial);

      // Setup badge
      await setupBadge(hashedSerial);

      // Simulate what /badge page does:
      // 1. Hash the serial
      // 2. Look up profile
      // 3. Check if profile has username

      const profile = await getProfileBySerialNumber(hashedSerial);

      // Should redirect to /claim because profile doesn't exist
      const shouldRedirectToClaim = !profile || !profile.username;
      expect(shouldRedirectToClaim).toBe(true);
    });
  });

  describe('Claimed badge flow', () => {
    it('should return profile when looking up claimed badge', async () => {
      const rawSerial = 'CLAIMEDBADGE001';
      const hashedSerial = await hashSerialNumber(rawSerial);
      const username = 'testuser';
      const npub = 'npub1claimedtest123';

      // Setup and claim badge
      await setupBadge(hashedSerial);
      await createProfile(hashedSerial, username, npub);

      // Looking up by hashed serial should return profile
      const profile = await getProfileBySerialNumber(hashedSerial);
      expect(profile).not.toBeNull();
      expect(profile?.username).toBe(username);
      expect(profile?.npub).toBe(npub);
    });

    it('should simulate /badge page flow for claimed badge', async () => {
      const rawSerial = 'CLAIMEDBADGE002';
      const hashedSerial = await hashSerialNumber(rawSerial);
      const username = 'alice';
      const npub = 'npub1alice123';

      // Setup and claim badge
      await setupBadge(hashedSerial);
      await createProfile(hashedSerial, username, npub);

      // Simulate what /badge page does:
      // 1. Hash the serial
      // 2. Look up profile
      // 3. Check if profile has username
      // 4. Redirect to /profile/:username

      const profile = await getProfileBySerialNumber(hashedSerial);

      // Should redirect to /profile/alice because profile exists with username
      const shouldRedirectToProfile = profile && profile.username;
      expect(shouldRedirectToProfile).toBeTruthy();
      expect(profile?.username).toBe('alice');

      // The redirect URL would be:
      const redirectUrl = `/profile/${profile?.username}`;
      expect(redirectUrl).toBe('/profile/alice');
    });
  });

  describe('Full claim and rescan flow', () => {
    it('should redirect to claim first, then to profile after claiming', async () => {
      const rawSerial = 'FULLFLOWBADGE001';
      const hashedSerial = await hashSerialNumber(rawSerial);

      // Step 1: Setup badge
      await setupBadge(hashedSerial);

      // Step 2: First scan - should redirect to claim
      let profile = await getProfileBySerialNumber(hashedSerial);
      let shouldRedirectToClaim = !profile || !profile.username;
      expect(shouldRedirectToClaim).toBe(true);

      // Step 3: Claim the badge
      const username = 'newvillager';
      const npub = 'npub1newvillager123';
      await createProfile(hashedSerial, username, npub);

      // Step 4: Second scan - should redirect to profile
      profile = await getProfileBySerialNumber(hashedSerial);
      const shouldRedirectToProfile = profile && profile.username;
      expect(shouldRedirectToProfile).toBeTruthy();
      expect(profile?.username).toBe('newvillager');
    });

    it('should work with realistic serial number format', async () => {
      // NFC serial numbers are typically hex strings like "04:A1:B2:C3:D4:E5:F6"
      const rawSerial = '04:A1:B2:C3:D4:E5:F6';
      const hashedSerial = await hashSerialNumber(rawSerial);

      // First scan - unclaimed
      await setupBadge(hashedSerial);
      let profile = await getProfileBySerialNumber(hashedSerial);
      expect(profile).toBeNull();

      // Claim
      await createProfile(hashedSerial, 'nfcuser', 'npub1nfcuser123');

      // Second scan - should find profile
      profile = await getProfileBySerialNumber(hashedSerial);
      expect(profile).not.toBeNull();
      expect(profile?.username).toBe('nfcuser');
    });
  });

  describe('Edge cases', () => {
    it('should handle scanning badge from different "phones" (same result)', async () => {
      const rawSerial = 'MULTIPHONE001';
      const hashedSerial = await hashSerialNumber(rawSerial);

      await setupBadge(hashedSerial);
      await createProfile(hashedSerial, 'multiuser', 'npub1multi123');

      // "Phone 1" scans - hash and lookup
      const hash1 = await hashSerialNumber(rawSerial);
      const profile1 = await getProfileBySerialNumber(hash1);

      // "Phone 2" scans - same hash and lookup
      const hash2 = await hashSerialNumber(rawSerial);
      const profile2 = await getProfileBySerialNumber(hash2);

      // Both should get same result
      expect(hash1).toBe(hash2);
      expect(profile1?.username).toBe(profile2?.username);
      expect(profile1?.username).toBe('multiuser');
    });

    it('should not find profile when using raw serial instead of hashed', async () => {
      const rawSerial = 'RAWTEST001';
      const hashedSerial = await hashSerialNumber(rawSerial);

      await setupBadge(hashedSerial);
      await createProfile(hashedSerial, 'hasheduser', 'npub1hashed123');

      // Looking up with raw serial should NOT find the profile
      const profileByRaw = await getProfileBySerialNumber(rawSerial);
      expect(profileByRaw).toBeNull();

      // Looking up with hashed serial SHOULD find the profile
      const profileByHash = await getProfileBySerialNumber(hashedSerial);
      expect(profileByHash).not.toBeNull();
      expect(profileByHash?.username).toBe('hasheduser');
    });
  });
});
