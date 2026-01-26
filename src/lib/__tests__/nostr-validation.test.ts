/**
 * Tests for NOSTR validation utilities
 *
 * Note: These tests mock finalizeEvent due to Jest realm issues with nostr-tools'
 * bundled @noble/hashes. The actual production code works correctly in Node.js runtime.
 */

// Must be before any imports that use nostr-tools
jest.mock('nostr-tools', () => {
  const actual = jest.requireActual('nostr-tools');
  return {
    ...actual,
    finalizeEvent: jest.fn((eventTemplate: Record<string, unknown>, secretKey: Uint8Array) => {
      const pubkey = actual.getPublicKey(secretKey);
      const mockEventId = 'event' + Math.random().toString(36).substring(2, 15);
      const mockSig = 'sig' + Math.random().toString(36).substring(2, 70);

      return {
        ...eventTemplate,
        pubkey,
        id: mockEventId,
        sig: mockSig,
      };
    }),
    verifyEvent: jest.fn((event: Record<string, unknown>) => {
      if (!event || !event.id || !event.sig || !event.pubkey) {
        return false;
      }
      const sig = event.sig as string;
      return sig && sig.startsWith('sig');
    }),
  };
});

import {
  isNostrEvent,
  validateEventKind,
  validateEventAuthor,
  validateEventTimestamp,
  validateProfileEvent,
  validateOfferEvent,
  validateRSVPEvent,
  validateNostrEvent,
  sanitizeNostrEvent,
} from '../nostr-validation';
import {
  createProfileEvent,
  createOfferEvent,
  createRSVPEvent,
  createRSVPCancellationEvent,
  NOSTR_KINDS,
  type NostrEvent,
} from '../nostr-events';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

describe('NOSTR Validation', () => {
  let secretKey: Uint8Array;
  let publicKey: string;
  let npub: string;

  beforeEach(() => {
    secretKey = generateSecretKey();
    publicKey = getPublicKey(secretKey);
    npub = nip19.npubEncode(publicKey);
  });

  describe('isNostrEvent', () => {
    it('should return true for valid NOSTR events', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      expect(isNostrEvent(event)).toBe(true);
    });

    it('should return false for missing required fields', () => {
      const invalid = { id: 'test', pubkey: 'test' };
      expect(isNostrEvent(invalid)).toBe(false);
    });

    it('should return false for wrong field types', () => {
      const invalid = {
        id: 'test',
        pubkey: 'test',
        created_at: 'not-a-number',
        kind: 0,
        tags: [],
        content: 'test',
        sig: 'test',
      };
      expect(isNostrEvent(invalid)).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(isNostrEvent(null)).toBeFalsy();
      expect(isNostrEvent(undefined)).toBeFalsy();
    });

    it('should return false for non-object values', () => {
      expect(isNostrEvent('string')).toBe(false);
      expect(isNostrEvent(123)).toBe(false);
      expect(isNostrEvent([])).toBe(false);
    });
  });

  describe('validateEventKind', () => {
    it('should validate correct event kind', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      const result = validateEventKind(event, NOSTR_KINDS.PROFILE);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject incorrect event kind', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      const result = validateEventKind(event, NOSTR_KINDS.NOTE);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Expected event kind');
    });
  });

  describe('validateEventAuthor', () => {
    it('should validate correct author', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      const result = validateEventAuthor(event, publicKey);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject incorrect author', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      const wrongPubkey = getPublicKey(generateSecretKey());
      const result = validateEventAuthor(event, wrongPubkey);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not match');
    });
  });

  describe('validateEventTimestamp', () => {
    it('should validate recent events', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      const result = validateEventTimestamp(event);
      expect(result.valid).toBe(true);
    });

    it('should reject old events', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      event.created_at = Math.floor(Date.now() / 1000) - 100000; // ~27 hours ago
      const result = validateEventTimestamp(event, 86400); // 24 hour max
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too old');
    });

    it('should reject future events', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      event.created_at = Math.floor(Date.now() / 1000) + 1000; // 16 minutes in future
      const result = validateEventTimestamp(event);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('future');
    });

    it('should allow events within small clock skew', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      event.created_at = Math.floor(Date.now() / 1000) + 60; // 1 minute in future
      const result = validateEventTimestamp(event);
      expect(result.valid).toBe(true);
    });

    it('should respect custom maxAgeSeconds', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      event.created_at = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago

      const strictResult = validateEventTimestamp(event, 3600); // 1 hour max
      expect(strictResult.valid).toBe(false);

      const lenientResult = validateEventTimestamp(event, 10800); // 3 hour max
      expect(lenientResult.valid).toBe(true);
    });
  });

  describe('validateProfileEvent', () => {
    it('should validate correct profile event', () => {
      const event = createProfileEvent(secretKey, {
        name: 'Alice Smith',
        about: 'Developer',
      });
      const result = validateProfileEvent(event);
      expect(result.valid).toBe(true);
    });

    it('should reject non-profile event kinds', () => {
      const event = createOfferEvent(secretKey, {
        title: 'Test',
        description: 'Test',
        type: 'other',
      });
      const result = validateProfileEvent(event);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('kind');
    });

    it('should reject profile without name', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      // Tamper with content
      event.content = JSON.stringify({ about: 'No name field' });
      const result = validateProfileEvent(event);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('name');
    });

    it('should reject profile with invalid JSON', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      event.content = 'not json';
      const result = validateProfileEvent(event);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('JSON');
    });
  });

  describe('validateOfferEvent', () => {
    it('should validate correct offer event', () => {
      const event = createOfferEvent(secretKey, {
        title: 'Workshop',
        description: 'Learn NOSTR',
        type: 'workshop',
        tags: ['nostr', 'web3'],
      });
      const result = validateOfferEvent(event);
      expect(result.valid).toBe(true);
    });

    it('should reject non-offer event kinds', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      const result = validateOfferEvent(event);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('kind');
    });

    it('should reject offer without type tag', () => {
      const event = createOfferEvent(secretKey, {
        title: 'Test',
        description: 'Test',
        type: 'workshop',
      });
      // Remove all 't' tags
      event.tags = event.tags.filter(([key]) => key !== 't');
      const result = validateOfferEvent(event);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('type tag');
    });

    it('should reject offer with invalid type', () => {
      const event = createOfferEvent(secretKey, {
        title: 'Test',
        description: 'Test',
        type: 'workshop',
      });
      // Change first tag to invalid type
      const typeTagIndex = event.tags.findIndex(([key]) => key === 't');
      event.tags[typeTagIndex] = ['t', 'invalid-type'];
      const result = validateOfferEvent(event);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid offer type');
    });

    it('should reject offer without price tag', () => {
      const event = createOfferEvent(secretKey, {
        title: 'Test',
        description: 'Test',
        type: 'other',
      });
      // Remove price tag
      event.tags = event.tags.filter(([key]) => key !== 'price');
      const result = validateOfferEvent(event);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('price tag');
    });

    it('should reject offer with malformed content', () => {
      const event = createOfferEvent(secretKey, {
        title: 'Test',
        description: 'Test',
        type: 'other',
      });
      event.content = 'No double newline separator';
      const result = validateOfferEvent(event);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('title and description');
    });
  });

  describe('validateRSVPEvent', () => {
    it('should validate correct RSVP event', () => {
      const offerEventId = 'test-offer-123';
      const authorNpub = nip19.npubEncode(getPublicKey(generateSecretKey()));
      const event = createRSVPEvent(secretKey, offerEventId, authorNpub);
      const result = validateRSVPEvent(event);
      expect(result.valid).toBe(true);
    });

    it('should validate RSVP cancellation event', () => {
      const rsvpEventId = 'test-rsvp-123';
      const event = createRSVPCancellationEvent(secretKey, rsvpEventId);
      const result = validateRSVPEvent(event);
      expect(result.valid).toBe(true);
    });

    it('should reject non-reaction event kinds', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      const result = validateRSVPEvent(event);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('kind');
    });

    it('should reject RSVP with invalid content', () => {
      const event = createRSVPEvent(secretKey, 'test', npub);
      event.content = 'invalid emoji';
      const result = validateRSVPEvent(event);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('🎟️ or ❌');
    });

    it('should reject RSVP without event reference', () => {
      const event = createRSVPEvent(secretKey, 'test', npub);
      // Remove 'e' tags
      event.tags = event.tags.filter(([key]) => key !== 'e');
      const result = validateRSVPEvent(event);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('reference an offer');
    });

    it('should validate RSVP references correct offer', () => {
      const offerEventId = 'specific-offer-123';
      const event = createRSVPEvent(secretKey, offerEventId, npub);
      const result = validateRSVPEvent(event, offerEventId);
      expect(result.valid).toBe(true);
    });

    it('should reject RSVP referencing wrong offer', () => {
      const actualOfferId = 'offer-123';
      const expectedOfferId = 'different-offer-456';
      const event = createRSVPEvent(secretKey, actualOfferId, npub);
      const result = validateRSVPEvent(event, expectedOfferId);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('wrong offer');
    });

    it('should reject RSVP without author reference', () => {
      const event = createRSVPEvent(secretKey, 'test', npub);
      // Remove 'p' tags
      event.tags = event.tags.filter(([key]) => key !== 'p');
      const result = validateRSVPEvent(event);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('author with "p" tag');
    });

    it('should allow cancellation without author reference', () => {
      const event = createRSVPCancellationEvent(secretKey, 'test-rsvp');
      // Cancellations don't need 'p' tags
      const result = validateRSVPEvent(event);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateNostrEvent', () => {
    it('should validate event with all checks passing', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      const result = validateNostrEvent(event, {
        expectedKind: NOSTR_KINDS.PROFILE,
        expectedAuthor: publicKey,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect multiple errors', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      event.created_at = Math.floor(Date.now() / 1000) - 100000; // Old
      const wrongAuthor = getPublicKey(generateSecretKey());

      const result = validateNostrEvent(event, {
        expectedKind: NOSTR_KINDS.NOTE, // Wrong kind
        expectedAuthor: wrongAuthor, // Wrong author
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors.some(e => e.includes('kind'))).toBe(true);
      expect(result.errors.some(e => e.includes('author'))).toBe(true);
      expect(result.errors.some(e => e.includes('old'))).toBe(true);
    });

    it('should validate event with no options', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      const result = validateNostrEvent(event);
      expect(result.valid).toBe(true);
    });

    it('should detect invalid event structure', () => {
      const invalid = { id: 'test' } as any;
      const result = validateNostrEvent(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid NOSTR event structure');
    });
  });

  describe('sanitizeNostrEvent', () => {
    it('should limit content length', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      const longContent = 'x'.repeat(20000);
      event.content = longContent;

      const sanitized = sanitizeNostrEvent(event);
      expect(sanitized.content.length).toBe(10000);
    });

    it('should limit number of tags', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      const manyTags = Array(100)
        .fill(null)
        .map((_, i) => ['t', `tag${i}`]);
      event.tags = manyTags;

      const sanitized = sanitizeNostrEvent(event);
      expect(sanitized.tags.length).toBe(50);
    });

    it('should not modify events within limits', () => {
      const event = createOfferEvent(secretKey, {
        title: 'Normal Event',
        description: 'Regular description',
        type: 'other',
      });

      const originalContent = event.content;
      const originalTagsLength = event.tags.length;

      const sanitized = sanitizeNostrEvent(event);

      expect(sanitized.content).toBe(originalContent);
      expect(sanitized.tags.length).toBe(originalTagsLength);
    });

    it('should preserve all other event properties', () => {
      const event = createProfileEvent(secretKey, { name: 'Test' });
      const sanitized = sanitizeNostrEvent(event);

      expect(sanitized.id).toBe(event.id);
      expect(sanitized.pubkey).toBe(event.pubkey);
      expect(sanitized.created_at).toBe(event.created_at);
      expect(sanitized.kind).toBe(event.kind);
      expect(sanitized.sig).toBe(event.sig);
    });
  });
});
