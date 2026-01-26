/**
 * Tests for NOSTR event logging utilities
 */

import {
  logNostrEvent,
  readNostrEvents,
  getLatestEventByKind,
  countEventsByKind,
  type NostrEvent,
} from '../nostr-logger';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { unlinkSync, rmdirSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('NOSTR Logger', () => {
  const TEST_DATA_DIR = join(process.cwd(), 'test-data', 'nostr-logger-test');

  // Generate a test npub
  function generateTestNpub(): string {
    const secretKey = generateSecretKey();
    const publicKey = getPublicKey(secretKey);
    return nip19.npubEncode(publicKey);
  }

  const testNpub = generateTestNpub();

  beforeAll(() => {
    // Set test data directory
    process.env.DATA_DIR = TEST_DATA_DIR;
  });

  beforeEach(() => {
    // Clean up test directory before each test
    try {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
    mkdirSync(TEST_DATA_DIR, { recursive: true });
  });

  afterAll(() => {
    // Clean up entire test directory
    try {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  function createMockEvent(kind: number, content: string): NostrEvent {
    const secretKey = generateSecretKey();
    const publicKey = getPublicKey(secretKey);

    return {
      id: Math.random().toString(36).substring(7),
      pubkey: publicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind,
      tags: [],
      content,
      sig: 'mock-signature',
    };
  }

  describe('logNostrEvent', () => {
    it('should create log file and append event', () => {
      const npub = generateTestNpub();
      const event = createMockEvent(0, JSON.stringify({ name: 'Alice' }));

      logNostrEvent(npub, event);

      const events = readNostrEvents(npub);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event);
    });

    it('should append multiple events to same file', () => {
      const npub = generateTestNpub();
      const event1 = createMockEvent(0, JSON.stringify({ name: 'Alice' }));
      const event2 = createMockEvent(1, 'Workshop announcement');
      const event3 = createMockEvent(7, '🎟️');

      logNostrEvent(npub, event1);
      logNostrEvent(npub, event2);
      logNostrEvent(npub, event3);

      const events = readNostrEvents(npub);
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual(event1);
      expect(events[1]).toEqual(event2);
      expect(events[2]).toEqual(event3);
    });

    it('should create directory structure if it does not exist', () => {
      const npub = generateTestNpub();
      const event = createMockEvent(0, 'test');

      logNostrEvent(npub, event);

      const npubDir = join(TEST_DATA_DIR, 'npubs', npub);
      expect(existsSync(npubDir)).toBe(true);
    });
  });

  describe('readNostrEvents', () => {
    it('should return empty array for non-existent log file', () => {
      const npub = generateTestNpub();
      const events = readNostrEvents(npub);
      expect(events).toEqual([]);
    });

    it('should read all events from log file', () => {
      const npub = generateTestNpub();
      const event1 = createMockEvent(0, 'Event 1');
      const event2 = createMockEvent(1, 'Event 2');

      logNostrEvent(npub, event1);
      logNostrEvent(npub, event2);

      const events = readNostrEvents(npub);
      expect(events).toHaveLength(2);
    });

    it('should handle empty log file', () => {
      const npub = generateTestNpub();
      const npubDir = join(TEST_DATA_DIR, 'npubs', npub);
      const logFile = join(npubDir, 'nostr_events.jsonl');

      mkdirSync(npubDir, { recursive: true });
      // Create empty file
      require('fs').writeFileSync(logFile, '');

      const events = readNostrEvents(npub);
      expect(events).toEqual([]);
    });
  });

  describe('getLatestEventByKind', () => {
    it('should return the most recent event of specified kind', () => {
      const npub = generateTestNpub();
      const event1 = createMockEvent(0, 'First profile');
      const event2 = createMockEvent(1, 'Offer');
      const event3 = createMockEvent(0, 'Updated profile');

      event1.created_at = 1000;
      event2.created_at = 2000;
      event3.created_at = 3000;

      logNostrEvent(npub, event1);
      logNostrEvent(npub, event2);
      logNostrEvent(npub, event3);

      const latest = getLatestEventByKind(npub, 0);
      expect(latest).not.toBeNull();
      expect(latest!.content).toBe('Updated profile');
      expect(latest!.created_at).toBe(3000);
    });

    it('should return null if no events of specified kind exist', () => {
      const npub = generateTestNpub();
      const event = createMockEvent(0, 'Profile');
      logNostrEvent(npub, event);

      const latest = getLatestEventByKind(npub, 1);
      expect(latest).toBeNull();
    });

    it('should return null for empty log file', () => {
      const npub = generateTestNpub();
      const latest = getLatestEventByKind(npub, 0);
      expect(latest).toBeNull();
    });

    it('should correctly sort by timestamp', () => {
      const npub = generateTestNpub();
      const event1 = createMockEvent(1, 'First');
      const event2 = createMockEvent(1, 'Second');
      const event3 = createMockEvent(1, 'Third');

      event1.created_at = 5000;
      event2.created_at = 3000;
      event3.created_at = 4000;

      logNostrEvent(npub, event1);
      logNostrEvent(npub, event2);
      logNostrEvent(npub, event3);

      const latest = getLatestEventByKind(npub, 1);
      expect(latest!.content).toBe('First');
      expect(latest!.created_at).toBe(5000);
    });
  });

  describe('countEventsByKind', () => {
    it('should count events by kind correctly', () => {
      const npub = generateTestNpub();
      const events = [
        createMockEvent(0, 'Profile 1'),
        createMockEvent(0, 'Profile 2'),
        createMockEvent(1, 'Offer 1'),
        createMockEvent(1, 'Offer 2'),
        createMockEvent(1, 'Offer 3'),
        createMockEvent(7, 'RSVP'),
      ];

      events.forEach(event => logNostrEvent(npub, event));

      const counts = countEventsByKind(npub);

      expect(counts[0]).toBe(2);
      expect(counts[1]).toBe(3);
      expect(counts[7]).toBe(1);
    });

    it('should return empty object for non-existent log file', () => {
      const npub = generateTestNpub();
      const counts = countEventsByKind(npub);
      expect(counts).toEqual({});
    });

    it('should handle single event type', () => {
      const npub = generateTestNpub();
      const event = createMockEvent(0, 'Profile');
      logNostrEvent(npub, event);

      const counts = countEventsByKind(npub);
      expect(counts[0]).toBe(1);
      expect(Object.keys(counts)).toHaveLength(1);
    });

    it('should increment counts correctly', () => {
      const npub = generateTestNpub();
      logNostrEvent(npub, createMockEvent(1, 'First'));
      let counts = countEventsByKind(npub);
      expect(counts[1]).toBe(1);

      logNostrEvent(npub, createMockEvent(1, 'Second'));
      counts = countEventsByKind(npub);
      expect(counts[1]).toBe(2);

      logNostrEvent(npub, createMockEvent(1, 'Third'));
      counts = countEventsByKind(npub);
      expect(counts[1]).toBe(3);
    });
  });

  describe('JSONL format', () => {
    it('should maintain proper JSONL format (one event per line)', () => {
      const npub = generateTestNpub();
      const event1 = createMockEvent(0, 'Event 1');
      const event2 = createMockEvent(1, 'Event 2');

      logNostrEvent(npub, event1);
      logNostrEvent(npub, event2);

      const logFile = join(
        TEST_DATA_DIR,
        'npubs',
        npub,
        'nostr_events.jsonl'
      );

      const content = require('fs').readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(2);
      expect(() => JSON.parse(lines[0])).not.toThrow();
      expect(() => JSON.parse(lines[1])).not.toThrow();
    });

    it('should handle special characters in content', () => {
      const npub = generateTestNpub();
      const event = createMockEvent(
        1,
        'Content with "quotes" and\nnewlines and emoji 🎟️'
      );

      logNostrEvent(npub, event);

      const events = readNostrEvents(npub);
      expect(events[0].content).toBe(event.content);
    });
  });
});
