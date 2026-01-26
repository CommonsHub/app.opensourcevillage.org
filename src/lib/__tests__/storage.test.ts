/**
 * Tests for file-based storage utilities
 *
 * These tests validate the core storage layer functionality including:
 * - Profile creation and retrieval
 * - Username uniqueness validation
 * - Symlink creation for username and badge lookups
 * - Badge setup and claim workflow
 */

import fs from 'fs/promises';
import path from 'path';
import {
  createProfile,
  getProfileBySerialNumber,
  getProfileByUsername,
  getProfileByNpub,
  updateProfile,
  setupBadge,
  isBadgeSetup,
  isBadgeClaimed,
  getNpubDir,
} from '../storage';

// Use a test data directory
const TEST_DATA_DIR = path.join(process.cwd(), 'data-test');
process.env.DATA_DIR = TEST_DATA_DIR;

describe('Storage Layer', () => {
  // Clean up test data before and after each test
  beforeEach(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  describe('setupBadge', () => {
    it('should add serial number to whitelist.txt', async () => {
      const serialNumber = 'BADGE-001';
      const result = await setupBadge(serialNumber);

      expect(result.alreadyExists).toBe(false);

      // Verify serial number was added to whitelist
      const whitelistPath = path.join(TEST_DATA_DIR, 'badges', 'whitelist.txt');
      const content = await fs.readFile(whitelistPath, 'utf-8');
      expect(content).toContain(serialNumber);
    });

    it('should return alreadyExists=true for existing badge', async () => {
      const serialNumber = 'BADGE-001';

      await setupBadge(serialNumber);
      const result = await setupBadge(serialNumber);

      expect(result.alreadyExists).toBe(true);
    });

    it('should handle multiple serial numbers in whitelist', async () => {
      await setupBadge('BADGE-001');
      await setupBadge('BADGE-002');
      await setupBadge('BADGE-003');

      // Verify all are in whitelist
      const whitelistPath = path.join(TEST_DATA_DIR, 'badges', 'whitelist.txt');
      const content = await fs.readFile(whitelistPath, 'utf-8');
      expect(content).toContain('BADGE-001');
      expect(content).toContain('BADGE-002');
      expect(content).toContain('BADGE-003');
    });
  });

  describe('isBadgeSetup', () => {
    it('should return true for badge in whitelist', async () => {
      const serialNumber = 'BADGE-001';
      await setupBadge(serialNumber);

      const isSetup = await isBadgeSetup(serialNumber);
      expect(isSetup).toBe(true);
    });

    it('should return false for badge not in whitelist', async () => {
      const isSetup = await isBadgeSetup('NONEXISTENT');
      expect(isSetup).toBe(false);
    });

    it('should work with manually created whitelist', async () => {
      // Create whitelist manually
      const badgesDir = path.join(TEST_DATA_DIR, 'badges');
      await fs.mkdir(badgesDir, { recursive: true });
      const whitelistPath = path.join(badgesDir, 'whitelist.txt');
      await fs.writeFile(whitelistPath, 'MANUAL-001\nMANUAL-002\n', 'utf-8');

      expect(await isBadgeSetup('MANUAL-001')).toBe(true);
      expect(await isBadgeSetup('MANUAL-002')).toBe(true);
      expect(await isBadgeSetup('MANUAL-003')).toBe(false);
    });
  });

  describe('isBadgeClaimed', () => {
    it('should return false for whitelisted but unclaimed badge', async () => {
      const serialNumber = 'BADGE-001';
      await setupBadge(serialNumber);

      const isClaimed = await isBadgeClaimed(serialNumber);
      expect(isClaimed).toBe(false);
    });

    it('should return false for non-existent badge', async () => {
      const isClaimed = await isBadgeClaimed('NONEXISTENT');
      expect(isClaimed).toBe(false);
    });

    it('should return true after badge is claimed', async () => {
      const serialNumber = 'BADGE-001';
      const username = 'alice';
      const npub = 'npub1test123';

      await setupBadge(serialNumber);
      await createProfile(serialNumber, username, npub);

      const isClaimed = await isBadgeClaimed(serialNumber);
      expect(isClaimed).toBe(true);
    });
  });

  describe('createProfile', () => {
    it('should create a new profile in npubs directory', async () => {
      const serialNumber = 'ABC123';
      const username = 'alice';
      const npub = 'npub1test123';

      // Setup badge first
      await setupBadge(serialNumber);

      const profile = await createProfile(serialNumber, username, npub);

      expect(profile).toBeDefined();
      expect(profile.username).toBe(username);
      expect(profile.npub).toBe(npub);
      expect(profile.serialNumber).toBe(serialNumber);
      expect(profile.balance.pending).toBe(50); // Initial mint
      expect(profile.offers).toEqual([]);
      expect(profile.rsvps).toEqual([]);

      // Verify npub directory was created
      const npubDir = getNpubDir(npub);
      const stats = await fs.lstat(npubDir);
      expect(stats.isDirectory()).toBe(true);

      // Verify profile.json was created
      const profilePath = path.join(npubDir, 'profile.json');
      const exists = await fs.access(profilePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should throw error if username already exists', async () => {
      const serialNumber1 = 'ABC123';
      const serialNumber2 = 'DEF456';
      const username = 'alice';
      const npub1 = 'npub1test123';
      const npub2 = 'npub1test456';

      await setupBadge(serialNumber1);
      await setupBadge(serialNumber2);
      await createProfile(serialNumber1, username, npub1);

      await expect(
        createProfile(serialNumber2, username, npub2)
      ).rejects.toThrow('Username already taken');
    });

    it('should create username symlink pointing to npub directory', async () => {
      const serialNumber = 'ABC123';
      const username = 'alice';
      const npub = 'npub1test123';

      await setupBadge(serialNumber);
      await createProfile(serialNumber, username, npub);

      const symlinkPath = path.join(TEST_DATA_DIR, 'usernames', username.toLowerCase());
      const stats = await fs.lstat(symlinkPath);
      expect(stats.isSymbolicLink()).toBe(true);
    });

    it('should create badge symlink pointing to npub directory', async () => {
      const serialNumber = 'ABC123';
      const username = 'alice';
      const npub = 'npub1test123';

      await setupBadge(serialNumber);
      await createProfile(serialNumber, username, npub);

      const badgePath = path.join(TEST_DATA_DIR, 'badges', serialNumber);
      const stats = await fs.lstat(badgePath);
      expect(stats.isSymbolicLink()).toBe(true);
    });
  });

  describe('getProfileBySerialNumber', () => {
    it('should retrieve profile by serial number (via symlink)', async () => {
      const serialNumber = 'ABC123';
      const username = 'alice';
      const npub = 'npub1test123';

      await setupBadge(serialNumber);
      await createProfile(serialNumber, username, npub);

      const profile = await getProfileBySerialNumber(serialNumber);

      expect(profile).toBeDefined();
      expect(profile?.username).toBe(username);
      expect(profile?.npub).toBe(npub);
    });

    it('should return null for non-existent serial number', async () => {
      const profile = await getProfileBySerialNumber('NONEXISTENT');
      expect(profile).toBeNull();
    });

    it('should return null for whitelisted but unclaimed badge', async () => {
      const serialNumber = 'UNCLAIMED';
      await setupBadge(serialNumber);

      // Badge is in whitelist but not claimed (no symlink exists)
      const profile = await getProfileBySerialNumber(serialNumber);
      expect(profile).toBeNull();
    });
  });

  describe('getProfileByUsername', () => {
    it('should retrieve profile by username', async () => {
      const serialNumber = 'ABC123';
      const username = 'alice';
      const npub = 'npub1test123';

      await setupBadge(serialNumber);
      await createProfile(serialNumber, username, npub);

      const profile = await getProfileByUsername(username);

      expect(profile).toBeDefined();
      expect(profile?.username).toBe(username);
      expect(profile?.serialNumber).toBe(serialNumber);
    });

    it('should be case-insensitive', async () => {
      const serialNumber = 'ABC123';
      const username = 'alice';
      const npub = 'npub1test123';

      await setupBadge(serialNumber);
      await createProfile(serialNumber, username, npub);

      const profile = await getProfileByUsername('ALICE');

      expect(profile).toBeDefined();
      expect(profile?.username).toBe(username);
    });

    it('should return null for non-existent username', async () => {
      const profile = await getProfileByUsername('nonexistent');
      expect(profile).toBeNull();
    });
  });

  describe('getProfileByNpub', () => {
    it('should retrieve profile by npub', async () => {
      const serialNumber = 'ABC123';
      const username = 'alice';
      const npub = 'npub1test123';

      await setupBadge(serialNumber);
      await createProfile(serialNumber, username, npub);

      const profile = await getProfileByNpub(npub);

      expect(profile).toBeDefined();
      expect(profile?.username).toBe(username);
      expect(profile?.npub).toBe(npub);
    });

    it('should return null for non-existent npub', async () => {
      const profile = await getProfileByNpub('npub1nonexistent');
      expect(profile).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('should update profile fields', async () => {
      const serialNumber = 'ABC123';
      const username = 'alice';
      const npub = 'npub1test123';

      await setupBadge(serialNumber);
      await createProfile(serialNumber, username, npub);

      const updated = await updateProfile(npub, {
        name: 'Alice Smith',
        shortbio: 'Web3 developer',
      });

      expect(updated.profile.name).toBe('Alice Smith');
      expect(updated.profile.shortbio).toBe('Web3 developer');
      expect(updated.profile.username).toBe(username); // Unchanged
    });

    it('should throw error for non-existent profile', async () => {
      await expect(
        updateProfile('npub1nonexistent', { name: 'Test' })
      ).rejects.toThrow('Profile not found');
    });
  });
});
