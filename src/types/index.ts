/**
 * Core type definitions for Open Source Village app
 * Based on specs/TECHNICAL_SPEC.md
 */

// User Profile Types
export interface UserProfile {
  npub: string;
  username: string;
  name?: string;
  shortbio?: string;
  talkAbout?: string;
  helpWith?: string;
  links?: SocialLink[];
  invitedBy?: string; // npub of the villager who invited this user
  invitees?: string[]; // npubs of villagers this user has invited
  createdAt: string;
  updatedAt: string;
}

export interface SocialLink {
  type: 'github' | 'twitter' | 'bluesky' | 'website' | 'other';
  url: string;
}

// Badge and Authentication Types
export interface BadgeClaim {
  username: string;
  serialNumber: string;
  npub: string;
}

export interface BadgeProfile {
  serialNumber: string;
  npub: string;
  profile: UserProfile;
}

// Workshop/Offer Types
export type OfferType = 'workshop' | '1:1' | 'other' | 'private' | 'need';
export type OfferStatus = 'pending' | 'tentative' | 'confirmed' | 'cancelled';

export interface Offer {
  id: string;
  type: OfferType;
  title: string;
  description: string;
  authors: string[]; // npubs
  tags: string[];
  createdAt: string;
  updatedAt: string;
  status: OfferStatus;

  // Workshop-specific fields
  startTime?: string; // ISO 8601
  endTime?: string; // ISO 8601
  room?: string;
  minAttendees?: number;
  maxAttendees?: number;

  // Token economics
  publicationCost: number; // tokens to publish/create the offer (based on room hourly rate × duration)
  rewardPerAttendee: number; // tokens per RSVP (usually 1)

  // Workshop proposal fields
  minRsvps?: number; // Minimum RSVPs required to confirm (>= 2 for proposals)
  rsvpCount?: number; // Current number of active RSVPs
  burnTxHash?: string; // Transaction hash of the token burn for proposals

  // NOSTR fields (NIP-52 calendar event)
  nostrEventId?: string; // ID of the kind 31922 calendar event
  nostrDTag?: string; // d-tag for replaceable event (same across updates)
  nostrAuthorPubkey?: string; // pubkey of the original author
}

export interface RSVP {
  offerId: string;
  npub: string;
  createdAt: string;
  status: 'active' | 'cancelled';
  tokensPaid: number;
}

// Token and Blockchain Types
export interface TokenBalance {
  confirmed: number;
  pending: number;
  total: number;
}

export interface BlockchainOperation {
  id: string;
  type: 'mint' | 'transfer' | 'rsvp' | 'claim';
  from?: string;
  to: string;
  amount: number;
  status: 'queued' | 'processing' | 'confirmed' | 'failed';
  createdAt: string;
  processedAt?: string;
  txHash?: string;
  error?: string;
}

// NOSTR Types
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface NostrProfile extends NostrEvent {
  kind: 0;
  content: string; // JSON stringified profile metadata
}

// Calendar Types
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  room: string;
  tags: string[];
  isOfficial: boolean; // true for organizer events, false for user workshops
  offerId?: string; // if linked to a workshop offer
}

// API Request/Response Types
export interface ClaimBadgeRequest {
  username: string;
  displayName?: string;
  serialNumber: string;
  npub: string;
  inviteCode: string; // 192 hex chars (64 pubkey + 128 signature)
}

export interface ClaimBadgeResponse {
  success: boolean;
  error?: string;
  profile?: UserProfile;
}

export interface CreateOfferRequest {
  type: OfferType;
  title: string;
  description: string;
  tags: string[];
  startTime?: string;
  endTime?: string;
  room?: string;
  maxAttendees?: number;
  nostrEvent: NostrEvent; // signed NOSTR event
}

export interface CreateOfferResponse {
  success: boolean;
  error?: string;
  offer?: Offer;
}

export interface CreateRSVPRequest {
  offerId: string;
  nostrEvent: NostrEvent; // signed NOSTR event
}

export interface CreateRSVPResponse {
  success: boolean;
  error?: string;
  rsvp?: RSVP;
}

// Storage Types
export interface StorageProfile {
  npub: string;
  username: string;
  serialNumber: string;
  profile: UserProfile;
  offers: Offer[];
  rsvps: RSVP[];
  balance: TokenBalance;
}

// Configuration Types
export interface AppConfig {
  eventStartDate: string; // ISO 8601
  eventEndDate: string; // ISO 8601
  googleCalendarIds: {
    [room: string]: string; // room name -> calendar ID
  };
  tokenFactoryAddress: string;
  gnosisChainRpcUrl: string;
  dataDir: string;
}

// Utility Types
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };
