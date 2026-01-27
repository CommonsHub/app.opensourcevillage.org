/**
 * Extended type definitions for NOSTR integration
 * These types extend the base types in index.ts with NOSTR-specific fields
 */

import type { Offer, RSVP, UserProfile } from './index';

/**
 * Extended Offer type with NOSTR event ID
 * Use this type in components/APIs that work with NOSTR events
 */
export interface OfferWithNostr extends Offer {
  nostrEventId?: string;
}

/**
 * Extended RSVP type with NOSTR event ID
 * Use this type in components/APIs that work with NOSTR events
 */
export interface RSVPWithNostr extends RSVP {
  nostrEventId?: string;
}

/**
 * Extended UserProfile type with NOSTR event ID
 * Use this type in components/APIs that work with NOSTR events
 */
export interface UserProfileWithNostr extends UserProfile {
  nostrEventId?: string;
}

/**
 * Request type for creating an offer with NOSTR event
 */
export interface CreateOfferWithNostrRequest {
  offer: {
    type: 'workshop' | '1:1' | 'other' | 'private';
    title: string;
    description: string;
    tags?: string[];
    startTime?: string;
    endTime?: string;
    room?: string;
    maxAttendees?: number;
    minAttendees?: number;
    npub: string;
  };
  nostrEvent: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
  };
}

/**
 * Request type for creating an RSVP with NOSTR event
 */
export interface CreateRSVPWithNostrRequest {
  offerId: string;
  npub: string;
  nostrEvent: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: 7;
    tags: string[][];
    content: string;
    sig: string;
  };
}

/**
 * Request type for cancelling an RSVP with NOSTR event
 */
export interface CancelRSVPWithNostrRequest {
  offerId: string;
  npub: string;
  nostrEvent: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: 7;
    tags: string[][];
    content: string;
    sig: string;
  };
}

/**
 * Request type for updating profile with NOSTR event
 */
export interface UpdateProfileWithNostrRequest {
  profile: Partial<UserProfile>;
  nostrEvent?: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: 0;
    tags: string[][];
    content: string;
    sig: string;
  };
}

/**
 * NOSTR event log entry
 * Represents a single line in the nostr_log.jsonl file
 */
export interface NostrLogEntry {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/**
 * Statistics about a user's NOSTR events
 */
export interface NostrEventStats {
  totalEvents: number;
  profileEvents: number;
  offerEvents: number;
  rsvpEvents: number;
  otherEvents: number;
  oldestEvent?: NostrLogEntry;
  newestEvent?: NostrLogEntry;
}
