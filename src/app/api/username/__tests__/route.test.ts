/**
 * Tests for username availability check API
 * Tests the /api/username endpoint
 * Now uses symlink-based checking in DATA_DIR/usernames/:username
 *
 * @jest-environment node
 */

import { GET } from '../route';
import { NextRequest } from 'next/server';
import { existsSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'fs';
import { join } from 'path';

const TEST_DATA_DIR = join(process.cwd(), 'data-test-username');

// Mock environment
process.env.DATA_DIR = TEST_DATA_DIR;

describe('GET /api/username - Username availability check', () => {
  beforeEach(() => {
    // Clean up and create fresh test directory
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up test data
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe('Input validation', () => {
    it('should return 400 if username parameter is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/username');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Username parameter is required');
    });

    it('should return 400 for username that is too short', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=ab');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.available).toBe(false);
      expect(data.error).toContain('Invalid username format');
    });

    it('should return 400 for username that is too long', async () => {
      const username = 'a'.repeat(21);
      const request = new NextRequest(`http://localhost:3000/api/username?username=${username}`);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.available).toBe(false);
      expect(data.error).toContain('Invalid username format');
    });

    it('should accept username with uppercase letters', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=TestUser');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(true);
    });

    it('should accept username with hyphens', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=test-user');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(true);
    });

    it('should return 400 for username with invalid special characters', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=test@user');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.available).toBe(false);
      expect(data.error).toContain('Invalid username format');
    });

    it('should return 400 for username with spaces', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=test user');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.available).toBe(false);
      expect(data.error).toContain('Invalid username format');
    });
  });

  describe('Username availability checks (symlink-based)', () => {
    it('should return available=true when no usernames directory exists', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=newuser');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(true);
      expect(data.username).toBe('newuser');
    });

    it('should return available=true when usernames directory is empty', async () => {
      mkdirSync(join(TEST_DATA_DIR, 'usernames'), { recursive: true });

      const request = new NextRequest('http://localhost:3000/api/username?username=newuser');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(true);
      expect(data.username).toBe('newuser');
    });

    it('should return available=false when username symlink exists', async () => {
      // Create username symlink
      const usernamesDir = join(TEST_DATA_DIR, 'usernames');
      const badgeDir = join(TEST_DATA_DIR, 'badges', 'TEST001');

      mkdirSync(usernamesDir, { recursive: true });
      mkdirSync(badgeDir, { recursive: true });

      const symlinkPath = join(usernamesDir, 'existinguser');
      // Use absolute path for symlink target
      symlinkSync(badgeDir, symlinkPath);

      const request = new NextRequest('http://localhost:3000/api/username?username=existinguser');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(false);
      expect(data.username).toBe('existinguser');
      expect(data.message).toContain('already taken');
    });

    it('should be case-insensitive when checking existing usernames', async () => {
      // Create username symlink with lowercase
      const usernamesDir = join(TEST_DATA_DIR, 'usernames');
      const badgeDir = join(TEST_DATA_DIR, 'badges', 'TEST002');

      mkdirSync(usernamesDir, { recursive: true });
      mkdirSync(badgeDir, { recursive: true });

      const symlinkPath = join(usernamesDir, 'testuser'); // lowercase
      symlinkSync(badgeDir, symlinkPath);

      // Try to check uppercase version
      const request = new NextRequest('http://localhost:3000/api/username?username=TestUser');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(false);
    });

    it('should return available=true for username that does not exist', async () => {
      // Create a different username symlink
      const usernamesDir = join(TEST_DATA_DIR, 'usernames');
      const badgeDir = join(TEST_DATA_DIR, 'badges', 'TEST003');

      mkdirSync(usernamesDir, { recursive: true });
      mkdirSync(badgeDir, { recursive: true });

      const symlinkPath = join(usernamesDir, 'otheruser');
      symlinkSync(badgeDir, symlinkPath);

      const request = new NextRequest('http://localhost:3000/api/username?username=newuser');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(true);
      expect(data.username).toBe('newuser');
    });

    it('should handle multiple existing users correctly', async () => {
      // Create multiple username symlinks
      const users = ['alice', 'bob', 'charlie'];
      const usernamesDir = join(TEST_DATA_DIR, 'usernames');

      mkdirSync(usernamesDir, { recursive: true });

      users.forEach((username, index) => {
        const badgeDir = join(TEST_DATA_DIR, 'badges', `TEST00${index + 4}`);
        mkdirSync(badgeDir, { recursive: true });

        const symlinkPath = join(usernamesDir, username);
        symlinkSync(badgeDir, symlinkPath);
      });

      // Check that existing usernames are not available
      for (const username of users) {
        const request = new NextRequest(`http://localhost:3000/api/username?username=${username}`);
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.available).toBe(false);
        expect(data.username).toBe(username);
      }

      // Check that a new username is available
      const newRequest = new NextRequest('http://localhost:3000/api/username?username=david');
      const newResponse = await GET(newRequest);
      const newData = await newResponse.json();

      expect(newResponse.status).toBe(200);
      expect(newData.available).toBe(true);
      expect(newData.username).toBe('david');
    });
  });

  describe('Error handling', () => {
    it('should handle broken symlinks gracefully', async () => {
      const usernamesDir = join(TEST_DATA_DIR, 'usernames');
      mkdirSync(usernamesDir, { recursive: true });

      // Create a symlink pointing to non-existent badge
      const symlinkPath = join(usernamesDir, 'brokenuser');
      const nonExistentPath = join(TEST_DATA_DIR, 'badges', 'NONEXISTENT');
      symlinkSync(nonExistentPath, symlinkPath);

      // Should still detect that username is taken (symlink exists even if broken)
      const request = new NextRequest('http://localhost:3000/api/username?username=brokenuser');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(false);
    });
  });

  describe('Reserved usernames', () => {
    it('should reject reserved username "admin"', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=admin');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(false);
      expect(data.message).toContain('reserved');
    });

    it('should reject reserved username "setup" (app route)', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=setup');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(false);
      expect(data.message).toContain('reserved');
    });

    it('should reject reserved username "api"', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=api');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(false);
      expect(data.message).toContain('reserved');
    });

    it('should reject reserved username case-insensitively', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=ADMIN');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(false);
      expect(data.message).toContain('reserved');
    });

    it('should reject reserved username "dashboard"', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=dashboard');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(false);
      expect(data.message).toContain('reserved');
    });

    it('should reject reserved username "settings"', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=settings');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(false);
      expect(data.message).toContain('reserved');
    });

    it('should reject reserved username "profile"', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=profile');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(false);
      expect(data.message).toContain('reserved');
    });
  });

  describe('Valid username formats', () => {
    it('should accept username with lowercase letters only', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=validuser');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(true);
    });

    it('should accept username with uppercase letters', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=Alice');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(true);
    });

    it('should accept username with numbers', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=user123');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(true);
    });

    it('should accept username with underscores', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=test_user');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(true);
    });

    it('should accept username with hyphens', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=test-user');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(true);
    });

    it('should accept 3-character username', async () => {
      const request = new NextRequest('http://localhost:3000/api/username?username=abc');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(true);
    });

    it('should accept 20-character username', async () => {
      const username = 'a'.repeat(20);
      const request = new NextRequest(`http://localhost:3000/api/username?username=${username}`);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.available).toBe(true);
    });
  });
});
