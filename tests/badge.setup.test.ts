/**
 * Badge Setup API Tests
 *
 * Tests for POST /api/badge/setup endpoint.
 * Verifies that the API correctly adds badges to the whitelist.
 *
 * @jest-environment node
 */

import { POST, GET } from '@/app/api/badge/setup/route';
import { NextRequest } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Use tests/data directory (set by jest.setup.js)
const TEST_DATA_DIR = path.join(process.cwd(), 'tests', 'data');

// Store original env
const originalEnv = process.env;

beforeAll(async () => {
  // Set up test environment
  process.env = {
    ...originalEnv,
    DATA_DIR: TEST_DATA_DIR,
  };

  // Clean up test directory if it exists
  const badgesDir = path.join(TEST_DATA_DIR, 'badges');
  try {
    await fs.rm(badgesDir, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }

  // Create test directory
  await fs.mkdir(badgesDir, { recursive: true });
});

afterAll(async () => {
  // Restore original env
  process.env = originalEnv;

  // Clean up badges directory
  const badgesDir = path.join(TEST_DATA_DIR, 'badges');
  try {
    await fs.rm(badgesDir, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
});

// Helper to create a mock NextRequest
function createMockRequest(body: object, method: string = 'POST'): NextRequest {
  const url = 'http://localhost:3000/api/badge/setup';
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createMockGetRequest(serialNumber: string): NextRequest {
  const url = `http://localhost:3000/api/badge/setup?serialNumber=${encodeURIComponent(serialNumber)}`;
  return new NextRequest(url, { method: 'GET' });
}

describe('POST /api/badge/setup', () => {
  const testSerialNumber = '04:A3:B2:C1:D0:E9:F8';

  beforeEach(async () => {
    // Clean badges directory before each test
    const badgesDir = path.join(TEST_DATA_DIR, 'badges');
    try {
      await fs.rm(badgesDir, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
    await fs.mkdir(badgesDir, { recursive: true });
  });

  it('should add badge to whitelist for valid serial number', async () => {
    const request = createMockRequest({ serialNumber: testSerialNumber });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.serialNumber).toBe(testSerialNumber);
    expect(data.alreadyExists).toBe(false);

    // Verify whitelist was updated
    const whitelistPath = path.join(TEST_DATA_DIR, 'badges', 'whitelist.txt');
    const whitelistContent = await fs.readFile(whitelistPath, 'utf-8');
    expect(whitelistContent).toContain(testSerialNumber);
  });

  it('should return alreadyExists=true if badge already set up', async () => {
    // First setup
    const request1 = createMockRequest({ serialNumber: testSerialNumber });
    const response1 = await POST(request1);
    const data1 = await response1.json();

    expect(data1.success).toBe(true);
    expect(data1.alreadyExists).toBe(false);

    // Second setup (same serial)
    const request2 = createMockRequest({ serialNumber: testSerialNumber });
    const response2 = await POST(request2);
    const data2 = await response2.json();

    expect(response2.status).toBe(200);
    expect(data2.success).toBe(true);
    expect(data2.alreadyExists).toBe(true);
  });

  it('should reject request without serial number', async () => {
    const request = createMockRequest({});
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('serialNumber');
  });

  it('should reject invalid serial number format', async () => {
    const request = createMockRequest({ serialNumber: '../../../etc/passwd' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Invalid serial number format');
  });

  it('should accept alphanumeric serial numbers with colons and hyphens', async () => {
    const validSerials = [
      '04:A3:B2:C1:D0:E9:F8',
      'BADGE-001',
      'ABC123',
      '12345678',
    ];

    for (const serial of validSerials) {
      const request = createMockRequest({ serialNumber: serial });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.serialNumber).toBe(serial);
    }
  });
});

describe('GET /api/badge/setup', () => {
  const testSerialNumber = 'CHECK-TEST-001';

  beforeEach(async () => {
    // Clean badges directory before each test
    const badgesDir = path.join(TEST_DATA_DIR, 'badges');
    try {
      await fs.rm(badgesDir, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
    await fs.mkdir(badgesDir, { recursive: true });
  });

  it('should return exists=false for non-existent badge', async () => {
    const request = createMockGetRequest('non-existent');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.exists).toBe(false);
  });

  it('should return exists=true for set up badge', async () => {
    // First, set up the badge
    const setupRequest = createMockRequest({ serialNumber: testSerialNumber });
    await POST(setupRequest);

    // Now check it
    const request = createMockGetRequest(testSerialNumber);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.exists).toBe(true);
    expect(data.claimed).toBe(false);
  });

  it('should return error for missing serial number', async () => {
    const request = new NextRequest('http://localhost:3000/api/badge/setup', {
      method: 'GET',
    });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });
});
