/**
 * Validation utilities for NOSTR events and integration
 * Provides type guards and validation functions for safe NOSTR event handling
 */

import { verifyNostrEvent, NOSTR_KINDS, type NostrEvent } from './nostr-events';

/**
 * Type guard to check if an object is a valid NOSTR event
 */
export function isNostrEvent(obj: any): obj is NostrEvent {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.pubkey === 'string' &&
    typeof obj.created_at === 'number' &&
    typeof obj.kind === 'number' &&
    Array.isArray(obj.tags) &&
    typeof obj.content === 'string' &&
    typeof obj.sig === 'string'
  );
}

/**
 * Validate that a NOSTR event matches expected kind
 */
export function validateEventKind(
  event: NostrEvent,
  expectedKind: number
): { valid: boolean; error?: string } {
  if (event.kind !== expectedKind) {
    return {
      valid: false,
      error: `Expected event kind ${expectedKind}, got ${event.kind}`,
    };
  }
  return { valid: true };
}

/**
 * Validate that a NOSTR event was created by the expected author
 */
export function validateEventAuthor(
  event: NostrEvent,
  expectedPubkey: string
): { valid: boolean; error?: string } {
  if (event.pubkey !== expectedPubkey) {
    return {
      valid: false,
      error: 'Event pubkey does not match expected author',
    };
  }
  return { valid: true };
}

/**
 * Validate that a NOSTR event is recent (within last 24 hours by default)
 */
export function validateEventTimestamp(
  event: NostrEvent,
  maxAgeSeconds: number = 86400
): { valid: boolean; error?: string } {
  const now = Math.floor(Date.now() / 1000);
  const age = now - event.created_at;

  if (age > maxAgeSeconds) {
    return {
      valid: false,
      error: `Event is too old (${age}s > ${maxAgeSeconds}s)`,
    };
  }

  if (age < -300) {
    // 5 minutes in future
    return {
      valid: false,
      error: 'Event timestamp is in the future',
    };
  }

  return { valid: true };
}

/**
 * Validate a profile event (kind 0)
 */
export function validateProfileEvent(
  event: NostrEvent
): { valid: boolean; error?: string } {
  // Check kind
  const kindCheck = validateEventKind(event, NOSTR_KINDS.PROFILE);
  if (!kindCheck.valid) return kindCheck;

  // Verify signature
  if (!verifyNostrEvent(event)) {
    return { valid: false, error: 'Invalid event signature' };
  }

  // Check content is valid JSON
  try {
    const profile = JSON.parse(event.content);
    if (!profile.name || typeof profile.name !== 'string') {
      return { valid: false, error: 'Profile must have a name' };
    }
  } catch {
    return { valid: false, error: 'Profile content must be valid JSON' };
  }

  return { valid: true };
}

/**
 * Validate an offer event (kind 1)
 */
export function validateOfferEvent(
  event: NostrEvent
): { valid: boolean; error?: string } {
  // Check kind
  const kindCheck = validateEventKind(event, NOSTR_KINDS.NOTE);
  if (!kindCheck.valid) return kindCheck;

  // Verify signature
  if (!verifyNostrEvent(event)) {
    return { valid: false, error: 'Invalid event signature' };
  }

  // Check for required tags
  const typeTags = event.tags.filter(([key]) => key === 't');
  if (typeTags.length === 0) {
    return { valid: false, error: 'Offer must have at least one type tag' };
  }

  const offerType = typeTags[0][1];
  if (!['workshop', '1:1', 'other'].includes(offerType)) {
    return { valid: false, error: 'Invalid offer type' };
  }

  // Check for price tag
  const priceTag = event.tags.find(([key]) => key === 'price');
  if (!priceTag) {
    return { valid: false, error: 'Offer must have a price tag' };
  }

  // Check content format (should be "Title\n\nDescription")
  if (!event.content.includes('\n\n')) {
    return { valid: false, error: 'Offer content must have title and description separated by double newline' };
  }

  return { valid: true };
}

/**
 * Validate an RSVP event (kind 7)
 */
export function validateRSVPEvent(
  event: NostrEvent,
  expectedOfferEventId?: string
): { valid: boolean; error?: string } {
  // Check kind
  const kindCheck = validateEventKind(event, NOSTR_KINDS.REACTION);
  if (!kindCheck.valid) return kindCheck;

  // Verify signature
  if (!verifyNostrEvent(event)) {
    return { valid: false, error: 'Invalid event signature' };
  }

  // Check content (should be 🎟️ for RSVP or ❌ for cancellation)
  if (event.content !== '🎟️' && event.content !== '❌') {
    return { valid: false, error: 'RSVP event must have 🎟️ or ❌ content' };
  }

  // Check for 'e' tag (event reference)
  const eTags = event.tags.filter(([key]) => key === 'e');
  if (eTags.length === 0) {
    return { valid: false, error: 'RSVP must reference an offer event with "e" tag' };
  }

  // Validate the referenced event ID if provided
  if (expectedOfferEventId) {
    const referencedId = eTags[0][1];
    if (referencedId !== expectedOfferEventId) {
      return {
        valid: false,
        error: 'RSVP event references wrong offer',
      };
    }
  }

  // Check for 'p' tag (author reference) for RSVP (not cancellation)
  if (event.content === '🎟️') {
    const pTags = event.tags.filter(([key]) => key === 'p');
    if (pTags.length === 0) {
      return { valid: false, error: 'RSVP must reference offer author with "p" tag' };
    }
  }

  return { valid: true };
}

/**
 * Comprehensive validation for any NOSTR event
 * Validates basic structure, signature, and timestamp
 */
export function validateNostrEvent(
  event: NostrEvent,
  options: {
    expectedKind?: number;
    expectedAuthor?: string;
    maxAgeSeconds?: number;
  } = {}
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check basic structure
  if (!isNostrEvent(event)) {
    errors.push('Invalid NOSTR event structure');
    return { valid: false, errors };
  }

  // Verify signature
  if (!verifyNostrEvent(event)) {
    errors.push('Invalid event signature');
  }

  // Check expected kind
  if (options.expectedKind !== undefined) {
    const kindCheck = validateEventKind(event, options.expectedKind);
    if (!kindCheck.valid && kindCheck.error) {
      errors.push(kindCheck.error);
    }
  }

  // Check expected author
  if (options.expectedAuthor) {
    const authorCheck = validateEventAuthor(event, options.expectedAuthor);
    if (!authorCheck.valid && authorCheck.error) {
      errors.push(authorCheck.error);
    }
  }

  // Check timestamp
  const timestampCheck = validateEventTimestamp(
    event,
    options.maxAgeSeconds
  );
  if (!timestampCheck.valid && timestampCheck.error) {
    errors.push(timestampCheck.error);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Sanitize NOSTR event for safe storage/display
 * Removes potentially dangerous content
 */
export function sanitizeNostrEvent(event: NostrEvent): NostrEvent {
  return {
    ...event,
    // Limit content length to prevent DoS
    content: event.content.slice(0, 10000),
    // Limit number of tags
    tags: event.tags.slice(0, 50),
  };
}

/**
 * Extract npub from NOSTR event pubkey
 * Helper to convert hex pubkey to bech32 npub format
 */
export function pubkeyToNpub(pubkey: string): string {
  const { nip19 } = require('nostr-tools');
  return nip19.npubEncode(pubkey);
}

/**
 * Extract hex pubkey from npub
 * Helper to convert bech32 npub to hex pubkey
 */
export function npubToPubkey(npub: string): string {
  const { nip19 } = require('nostr-tools');
  const decoded = nip19.decode(npub);
  if (decoded.type !== 'npub') {
    throw new Error('Invalid npub format');
  }
  return decoded.data as string;
}

/**
 * Validate npub format
 * Returns true if the string is a valid bech32 npub, false otherwise
 */
export function validateNpub(npub: string): boolean {
  if (!npub || typeof npub !== 'string') {
    return false;
  }

  // Check basic format (starts with npub1)
  if (!npub.startsWith('npub1')) {
    return false;
  }

  // Check length (npub1 + 58 chars = 63 total)
  if (npub.length !== 63) {
    return false;
  }

  // Try to decode it
  try {
    const { nip19 } = require('nostr-tools');
    const decoded = nip19.decode(npub);
    return decoded.type === 'npub';
  } catch {
    return false;
  }
}
