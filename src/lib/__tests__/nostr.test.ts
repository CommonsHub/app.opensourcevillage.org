/**
 * Tests for NOSTR Helper Functions (NIP-29)
 *
 * Note: These tests mock finalizeEvent due to Jest realm issues with nostr-tools'
 * bundled @noble/hashes. The actual production code works correctly in Node.js runtime.
 */

// Must be before any imports that use nostr-tools
jest.mock('nostr-tools', () => {
  const actual = jest.requireActual('nostr-tools');
  return {
    ...actual,
    finalizeEvent: jest.fn((eventTemplate: Record<string, unknown>) => {
      // Generate a mock but structurally valid event
      const mockPubkey = '5d4337fbfb00bcb5ab0d96846dc91caa5fed5a2267f5b19df4b1654283c207f8';
      const mockEventId = 'abc123' + Math.random().toString(36).substring(2, 15);
      const mockSig = 'mocksig' + Math.random().toString(36).substring(2, 50);

      return {
        ...eventTemplate,
        pubkey: mockPubkey,
        id: mockEventId,
        sig: mockSig,
      };
    }),
  };
});

import { describe, it, expect, beforeAll } from '@jest/globals';
import { nip19 } from 'nostr-tools';
import {
  createClosedGroup,
  addGroupMember,
  removeGroupMember,
  getGroupSettings,
  initializeGroup,
  NIP29_KINDS,
} from '../nostr';

// Test environment setup
beforeAll(() => {
  // Set test NOSTR_NSEC if not already set
  if (!process.env.NOSTR_NSEC) {
    process.env.NOSTR_NSEC = 'nsec1tldpn8e90550lmans83c9tx96ptm9hqpys57gpgd29thr2pqq4xsl366nl';
  }
});

describe('NIP-29 Group Management', () => {
  describe('createClosedGroup', () => {
    it('should create a valid group metadata event', () => {
      const event = createClosedGroup(
        'test-group',
        'Test Group',
        'A test group for unit testing',
        true,
        true
      );

      expect(event).toBeDefined();
      expect(event.kind).toBe(NIP29_KINDS.GROUP_METADATA);
      expect(event.content).toBe('A test group for unit testing');
      expect(event.sig).toBeDefined();
      expect(event.id).toBeDefined();
      expect(event.pubkey).toBeDefined();
    });

    it('should include correct tags for group metadata', () => {
      const event = createClosedGroup(
        'test-group',
        'Test Group',
        'A test group',
        true,
        true
      );

      const tags = event.tags;

      // Should have d-tag for group ID
      const dTag = tags.find(t => t[0] === 'd');
      expect(dTag).toBeDefined();
      expect(dTag![1]).toBe('test-group');

      // Should have name tag
      const nameTag = tags.find(t => t[0] === 'name');
      expect(nameTag).toBeDefined();
      expect(nameTag![1]).toBe('Test Group');

      // Should have about tag
      const aboutTag = tags.find(t => t[0] === 'about');
      expect(aboutTag).toBeDefined();
      expect(aboutTag![1]).toBe('A test group');

      // Should have private flag
      const privateTag = tags.find(t => t[0] === 'private');
      expect(privateTag).toBeDefined();
      expect(privateTag![1]).toBe('true');

      // Should have closed flag
      const closedTag = tags.find(t => t[0] === 'closed');
      expect(closedTag).toBeDefined();
      expect(closedTag![1]).toBe('true');

      // Should have admin pubkey
      const adminTag = tags.find(t => t[0] === 'p' && t[3] === 'admin');
      expect(adminTag).toBeDefined();
    });

    it('should create a public open group when flags are false', () => {
      const event = createClosedGroup(
        'public-group',
        'Public Group',
        'A public group',
        false,
        false
      );

      const privateTag = event.tags.find(t => t[0] === 'private');
      expect(privateTag![1]).toBe('false');

      const closedTag = event.tags.find(t => t[0] === 'closed');
      expect(closedTag![1]).toBe('false');
    });
  });

  describe('addGroupMember', () => {
    const testNpub = 'npub1wd5xlml0kqpdcd4sfky36jm32066tdzf7rd58fmkkg59fscz8leqva3gmh';

    it('should create a valid add user event', () => {
      const event = addGroupMember('test-group', testNpub, 'member');

      expect(event).toBeDefined();
      expect(event.kind).toBe(NIP29_KINDS.ADD_USER);
      expect(event.sig).toBeDefined();
      expect(event.id).toBeDefined();
      expect(event.pubkey).toBeDefined();
    });

    it('should include h-tag for group ID', () => {
      const event = addGroupMember('test-group', testNpub, 'member');

      const hTag = event.tags.find(t => t[0] === 'h');
      expect(hTag).toBeDefined();
      expect(hTag![1]).toBe('test-group');
    });

    it('should include p-tag with member pubkey and role', () => {
      const event = addGroupMember('test-group', testNpub, 'moderator');

      const pTag = event.tags.find(t => t[0] === 'p');
      expect(pTag).toBeDefined();
      expect(pTag![3]).toBe('moderator');

      // Verify the pubkey matches the npub
      const { data: expectedPubkey } = nip19.decode(testNpub);
      expect(pTag![1]).toBe(expectedPubkey);
    });

    it('should default role to "member" if not specified', () => {
      const event = addGroupMember('test-group', testNpub);

      const pTag = event.tags.find(t => t[0] === 'p');
      expect(pTag![3]).toBe('member');
    });

    it('should throw error for invalid npub format', () => {
      expect(() => {
        addGroupMember('test-group', 'invalid-npub');
      }).toThrow('Invalid npub format');
    });
  });

  describe('removeGroupMember', () => {
    const testNpub = 'npub1wd5xlml0kqpdcd4sfky36jm32066tdzf7rd58fmkkg59fscz8leqva3gmh';

    it('should create a valid remove user event', () => {
      const event = removeGroupMember('test-group', testNpub);

      expect(event).toBeDefined();
      expect(event.kind).toBe(NIP29_KINDS.REMOVE_USER);
      expect(event.sig).toBeDefined();
      expect(event.id).toBeDefined();
      expect(event.pubkey).toBeDefined();
    });

    it('should include h-tag for group ID', () => {
      const event = removeGroupMember('test-group', testNpub);

      const hTag = event.tags.find(t => t[0] === 'h');
      expect(hTag).toBeDefined();
      expect(hTag![1]).toBe('test-group');
    });

    it('should include p-tag with member pubkey', () => {
      const event = removeGroupMember('test-group', testNpub);

      const pTag = event.tags.find(t => t[0] === 'p');
      expect(pTag).toBeDefined();

      // Verify the pubkey matches the npub
      const { data: expectedPubkey } = nip19.decode(testNpub);
      expect(pTag![1]).toBe(expectedPubkey);
    });

    it('should throw error for invalid npub format', () => {
      expect(() => {
        removeGroupMember('test-group', 'invalid-npub');
      }).toThrow('Invalid npub format');
    });
  });

  describe('getGroupSettings', () => {
    it('should return group settings from settings.json', () => {
      const settings = getGroupSettings();

      expect(settings).toBeDefined();
      expect(settings.id).toBeDefined();
      expect(settings.name).toBeDefined();
      expect(settings.description).toBeDefined();
      expect(typeof settings.isPrivate).toBe('boolean');
      expect(typeof settings.isClosed).toBe('boolean');
    });
  });

  describe('initializeGroup', () => {
    it('should create a group using settings from config', () => {
      const event = initializeGroup();
      const settings = getGroupSettings();

      expect(event).toBeDefined();
      expect(event.kind).toBe(NIP29_KINDS.GROUP_METADATA);

      // Should use settings from config
      const dTag = event.tags.find(t => t[0] === 'd');
      expect(dTag![1]).toBe(settings.id);

      const nameTag = event.tags.find(t => t[0] === 'name');
      expect(nameTag![1]).toBe(settings.name);

      const aboutTag = event.tags.find(t => t[0] === 'about');
      expect(aboutTag![1]).toBe(settings.description);

      // Verify event has pubkey (signature verification mocked due to Jest realm issues)
      expect(event.pubkey).toBeDefined();
      expect(event.sig).toBeDefined();
    });
  });

  describe('Event verification', () => {
    it('should create events with pubkey from finalizeEvent', () => {
      // Note: In tests, finalizeEvent is mocked due to Jest realm issues.
      // In production, real signing happens and pubkey comes from the admin key.
      const event = createClosedGroup('test', 'Test', 'Description');
      expect(event.pubkey).toBeDefined();
      expect(typeof event.pubkey).toBe('string');
      expect(event.pubkey.length).toBeGreaterThan(0);

      const addEvent = addGroupMember('test', 'npub1wd5xlml0kqpdcd4sfky36jm32066tdzf7rd58fmkkg59fscz8leqva3gmh');
      expect(addEvent.pubkey).toBeDefined();
      expect(typeof addEvent.pubkey).toBe('string');
    });
  });
});
