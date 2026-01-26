/**
 * NOSTR event creation and signing utilities
 * Creates signed NOSTR events for offers, RSVPs, and profiles
 */

import {
  finalizeEvent,
  verifyEvent,
  getPublicKey,
  type EventTemplate,
  type Event as NostrEvent,
  nip19
} from 'nostr-tools';

// Re-export NostrEvent type for convenience
export type { NostrEvent };

/**
 * NOSTR event kinds used in the app
 */
export const NOSTR_KINDS = {
  PROFILE: 0,           // NIP-01: User profile metadata
  NOTE: 1,              // NIP-01: Text note (used for offers)
  REACTION: 7,          // NIP-25: Reaction (used for RSVPs)
  PAYMENT_REQUEST: 1734, // Token payment request (regular kind, stored by relays)
  PAYMENT_RECEIPT: 1735, // Token payment receipt (regular kind, stored by relays)
  CALENDAR_EVENT: 31922, // NIP-52: Calendar event (date-based)
} as const;

/**
 * Convert an npub to hex pubkey
 * If already a hex pubkey (64 chars) or special value like 'system', returns as-is
 *
 * @param npubOrPubkey - npub bech32 string or hex pubkey
 * @returns Hex pubkey (64 characters) or special value
 */
export function npubToHex(npubOrPubkey: string): string {
  // Special values like 'system' pass through unchanged
  if (npubOrPubkey === 'system') {
    return npubOrPubkey;
  }

  // Already a hex pubkey (64 hex characters)
  if (/^[0-9a-f]{64}$/i.test(npubOrPubkey)) {
    return npubOrPubkey.toLowerCase();
  }

  // Convert npub to hex
  if (npubOrPubkey.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(npubOrPubkey);
      if (decoded.type === 'npub') {
        return decoded.data as string;
      }
    } catch {
      console.error('[NOSTR] Failed to decode npub:', npubOrPubkey);
    }
  }

  // Return as-is if we can't convert (will likely fail validation elsewhere)
  console.warn('[NOSTR] Could not convert to hex pubkey:', npubOrPubkey);
  return npubOrPubkey;
}

/**
 * Create and sign a NOSTR profile event (kind 0)
 *
 * @param secretKey - User's NOSTR secret key (32 bytes)
 * @param profile - Profile metadata to publish
 * @returns Signed NOSTR event
 *
 * @example
 * ```typescript
 * const event = createProfileEvent(secretKey, {
 *   name: "Alice Smith",
 *   about: "Building open source tools",
 *   picture: "https://example.com/avatar.png"
 * });
 * ```
 */
export function createProfileEvent(
  secretKey: Uint8Array,
  profile: {
    name: string;
    about?: string;
    picture?: string;
    relays?: string[];
  }
): NostrEvent {
  console.log('[NOSTR] Creating profile event (kind 0)...');
  console.log('[NOSTR] Profile data:', profile);

  // Build profile content with relays in NIP-65 compatible format
  // Relays are stored as an object with URL keys and read/write capabilities
  const { relays, ...profileData } = profile;
  const content: Record<string, unknown> = { ...profileData };

  if (relays && relays.length > 0) {
    // Format relays as { "wss://relay.example.com": { read: true, write: true } }
    const relayObj: Record<string, { read: boolean; write: boolean }> = {};
    for (const relay of relays) {
      relayObj[relay] = { read: true, write: true };
    }
    content.relays = relayObj;
  }

  const event: EventTemplate = {
    kind: NOSTR_KINDS.PROFILE,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(content),
  };

  const signedEvent = finalizeEvent(event, secretKey);

  console.log('[NOSTR] Profile event created and signed:');
  console.log('[NOSTR]   Event ID:', signedEvent.id);
  console.log('[NOSTR]   Created at:', new Date(signedEvent.created_at * 1000).toISOString());
  console.log('[NOSTR]   Signature:', signedEvent.sig.substring(0, 16) + '...');

  return signedEvent;
}

/**
 * Options for creating a NIP-52 calendar event
 */
export interface CalendarEventOptions {
  /** Unique identifier for this event (for replaceability via d-tag) */
  dTag: string;
  /** Event title */
  title: string;
  /** Event description */
  description: string;
  /** Start time as ISO string or Unix timestamp */
  startTime: string | number;
  /** End time as ISO string or Unix timestamp */
  endTime: string | number;
  /** Location/room (optional) */
  location?: string;
  /** Topic tags (optional) */
  tags?: string[];
  /** Group ID for NIP-29 (optional) */
  groupId?: string;
}

/**
 * Create and sign a NIP-52 calendar event (kind 31922)
 *
 * @param secretKey - User's NOSTR secret key (32 bytes)
 * @param options - Calendar event options
 * @returns Signed NOSTR event
 *
 * @example
 * ```typescript
 * const event = createCalendarEventClient(secretKey, {
 *   dTag: "offer-abc123",
 *   title: "Intro to NOSTR",
 *   description: "Learn about the NOSTR protocol",
 *   startTime: "2026-01-27T14:00:00Z",
 *   endTime: "2026-01-27T15:00:00Z",
 *   location: "Ostrom Room",
 *   tags: ["nostr", "workshop"]
 * });
 * ```
 */
export function createCalendarEventClient(
  secretKey: Uint8Array,
  options: CalendarEventOptions
): NostrEvent {
  console.log('[NOSTR] Creating calendar event (kind 31922)...');
  console.log('[NOSTR] Calendar event:', {
    dTag: options.dTag,
    title: options.title,
    location: options.location,
  });

  // Convert times to Unix timestamps if they're ISO strings
  const startTimestamp = typeof options.startTime === 'string'
    ? Math.floor(new Date(options.startTime).getTime() / 1000)
    : options.startTime;
  const endTimestamp = typeof options.endTime === 'string'
    ? Math.floor(new Date(options.endTime).getTime() / 1000)
    : options.endTime;

  const eventTags: string[][] = [
    ['d', options.dTag],                        // d-tag for replaceability
    ['title', options.title],                   // Event title
    ['start', startTimestamp.toString()],       // Start timestamp
    ['end', endTimestamp.toString()],           // End timestamp
  ];

  // Add location if provided
  if (options.location) {
    eventTags.push(['location', options.location]);
  }

  // Add group ID for NIP-29 if provided
  if (options.groupId) {
    eventTags.push(['h', options.groupId]);
  }

  // Add topic tags
  if (options.tags && options.tags.length > 0) {
    options.tags.forEach(tag => {
      eventTags.push(['t', tag]);
    });
  }

  const event: EventTemplate = {
    kind: NOSTR_KINDS.CALENDAR_EVENT,
    created_at: Math.floor(Date.now() / 1000),
    tags: eventTags,
    content: options.description,
  };

  const signedEvent = finalizeEvent(event, secretKey);

  console.log('[NOSTR] Calendar event created and signed:');
  console.log('[NOSTR]   Event ID:', signedEvent.id);
  console.log('[NOSTR]   d-tag:', options.dTag);
  console.log('[NOSTR]   Title:', options.title);

  return signedEvent;
}

/**
 * Options for creating an offer/workshop event
 */
export interface OfferEventOptions {
  title: string;
  description: string;
  type: 'workshop' | '1:1' | 'other';
  tags?: string[];
  price?: number;
  location?: string;
  startTime?: string;  // ISO 8601 format
  duration?: number;   // Duration in minutes
  minAttendance?: number;
  maxAttendance?: number;
  coAuthors?: string[]; // npub strings of co-authors
}

/**
 * Create and sign a NOSTR offer event (kind 1)
 *
 * @param secretKey - User's NOSTR secret key (32 bytes)
 * @param offer - Offer/workshop details
 * @returns Signed NOSTR event
 *
 * @example
 * ```typescript
 * const event = createOfferEvent(secretKey, {
 *   title: "Intro to NOSTR",
 *   description: "Learn about the NOSTR protocol",
 *   type: "workshop",
 *   tags: ["nostr", "web3"],
 *   location: "Room A",
 *   startTime: "2026-01-27T14:00:00Z",
 *   duration: 60,
 *   minAttendance: 5,
 *   maxAttendance: 20
 * });
 * ```
 */
export function createOfferEvent(
  secretKey: Uint8Array,
  offer: OfferEventOptions
): NostrEvent {
  console.log('[NOSTR] Creating offer event (kind 1)...');
  console.log('[NOSTR] Offer data:', {
    title: offer.title,
    type: offer.type,
    tags: offer.tags,
    price: offer.price,
    location: offer.location,
    startTime: offer.startTime,
  });

  const tags: string[][] = [
    ['t', offer.type],
  ];

  // Add topic tags
  if (offer.tags && offer.tags.length > 0) {
    offer.tags.forEach(tag => tags.push(['t', tag]));
  }

  // Add co-authors
  if (offer.coAuthors && offer.coAuthors.length > 0) {
    offer.coAuthors.forEach(npub => {
      tags.push(['p', npub, '', 'author']);
    });
  }

  // Add price
  tags.push(['price', String(offer.price || 1), 'CHT']);

  // Add workshop-specific fields
  if (offer.location) {
    tags.push(['location', offer.location]);
  }
  if (offer.startTime) {
    tags.push(['time', offer.startTime]);
  }
  if (offer.duration) {
    tags.push(['duration', String(offer.duration)]);
  }
  if (offer.minAttendance !== undefined) {
    tags.push(['min', String(offer.minAttendance)]);
  }
  if (offer.maxAttendance !== undefined) {
    tags.push(['max', String(offer.maxAttendance)]);
  }

  const event: EventTemplate = {
    kind: NOSTR_KINDS.NOTE,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: `${offer.title}\n\n${offer.description}`,
  };

  const signedEvent = finalizeEvent(event, secretKey);

  console.log('[NOSTR] Offer event created and signed:');
  console.log('[NOSTR]   Event ID:', signedEvent.id);
  console.log('[NOSTR]   Created at:', new Date(signedEvent.created_at * 1000).toISOString());
  console.log('[NOSTR]   Tags:', tags.length);
  console.log('[NOSTR]   Signature:', signedEvent.sig.substring(0, 16) + '...');

  return signedEvent;
}

/**
 * Create and sign a NOSTR RSVP event (kind 7 - Reaction)
 *
 * @param secretKey - User's NOSTR secret key (32 bytes)
 * @param offerEventId - The NOSTR event ID of the offer being RSVP'd to
 * @param authorNpub - The npub of the offer author
 * @returns Signed NOSTR event
 *
 * @example
 * ```typescript
 * const event = createRSVPEvent(
 *   secretKey,
 *   "abc123...",  // offer event ID
 *   "npub1..."    // author's npub
 * );
 * ```
 */
export function createRSVPEvent(
  secretKey: Uint8Array,
  offerEventId: string,
  authorNpub: string
): NostrEvent {
  console.log('[NOSTR] Creating RSVP event (kind 7)...');
  console.log('[NOSTR] RSVP data:', {
    offerEventId,
    authorNpub,
  });

  const event: EventTemplate = {
    kind: NOSTR_KINDS.REACTION,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', offerEventId, '', 'reply'],
      ['p', authorNpub],
    ],
    content: '🎟️',
  };

  const signedEvent = finalizeEvent(event, secretKey);

  console.log('[NOSTR] RSVP event created and signed:');
  console.log('[NOSTR]   Event ID:', signedEvent.id);
  console.log('[NOSTR]   Created at:', new Date(signedEvent.created_at * 1000).toISOString());
  console.log('[NOSTR]   Signature:', signedEvent.sig.substring(0, 16) + '...');

  return signedEvent;
}

/**
 * Create and sign a NOSTR RSVP cancellation event (kind 7 - Negative Reaction)
 *
 * @param secretKey - User's NOSTR secret key (32 bytes)
 * @param rsvpEventId - The NOSTR event ID of the RSVP being cancelled
 * @returns Signed NOSTR event
 *
 * @example
 * ```typescript
 * const event = createRSVPCancellationEvent(
 *   secretKey,
 *   "def456..."  // RSVP event ID to cancel
 * );
 * ```
 */
export function createRSVPCancellationEvent(
  secretKey: Uint8Array,
  rsvpEventId: string
): NostrEvent {
  const event: EventTemplate = {
    kind: NOSTR_KINDS.REACTION,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', rsvpEventId, '', 'cancel'],
    ],
    content: '❌',
  };

  return finalizeEvent(event, secretKey);
}

/**
 * Verify a NOSTR event signature
 *
 * @param event - The NOSTR event to verify
 * @returns true if signature is valid, false otherwise
 */
export function verifyNostrEvent(event: NostrEvent): boolean {
  try {
    return verifyEvent(event);
  } catch {
    return false;
  }
}

/**
 * Store nsec in localStorage securely
 * WARNING: This is for demo/event use only - not production secure
 *
 * @param nsec - NOSTR secret key in bech32 format
 */
export function storeSecretKey(nsec: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('osv_nsec', nsec);
}

/**
 * Retrieve nsec from localStorage
 *
 * @returns The stored nsec or null if not found
 */
export function getStoredSecretKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('osv_nsec');
}

/**
 * Decode nsec (bech32 format) to Uint8Array for signing
 *
 * @param nsec - NOSTR secret key in bech32 format
 * @returns The secret key as Uint8Array
 */
export function decodeNsec(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') {
    throw new Error('Invalid nsec format');
  }
  return decoded.data as Uint8Array;
}

/**
 * Get the secret key from localStorage as Uint8Array
 *
 * @returns The secret key as Uint8Array, or null if not stored
 */
export function getSecretKey(): Uint8Array | null {
  const nsec = getStoredSecretKey();
  if (!nsec) return null;
  try {
    return decodeNsec(nsec);
  } catch {
    return null;
  }
}

/**
 * Get the public key (npub) from an nsec
 *
 * @param nsec - NOSTR secret key in bech32 format
 * @returns The public key in npub format
 */
export function getPublicKeyFromNsec(nsec: string): string {
  const secretKey = decodeNsec(nsec);
  const pubkey = getPublicKey(secretKey);
  return nip19.npubEncode(pubkey);
}

/**
 * Parse an offer event to extract structured data
 *
 * @param event - The NOSTR event to parse
 * @returns Parsed offer data or null if invalid
 */
export function parseOfferEvent(event: NostrEvent): OfferEventOptions | null {
  if (event.kind !== NOSTR_KINDS.NOTE) {
    return null;
  }

  // Split content into title and description
  const parts = event.content.split('\n\n');
  if (parts.length < 2) {
    return null;
  }

  const [title, ...descParts] = parts;
  const description = descParts.join('\n\n');

  // Parse tags
  const tagMap = new Map(event.tags.map(([key, value]) => [key, value]));
  const topicTags = event.tags.filter(([key]) => key === 't').map(([, value]) => value);
  const type = topicTags[0] as 'workshop' | '1:1' | 'other' | undefined;

  if (!type || !['workshop', '1:1', 'other'].includes(type)) {
    return null;
  }

  return {
    title,
    description,
    type,
    tags: topicTags.slice(1), // First tag is the type
    price: tagMap.has('price') ? parseInt(tagMap.get('price')!) : undefined,
    location: tagMap.get('location'),
    startTime: tagMap.get('time'),
    duration: tagMap.has('duration') ? parseInt(tagMap.get('duration')!) : undefined,
    minAttendance: tagMap.has('min') ? parseInt(tagMap.get('min')!) : undefined,
    maxAttendance: tagMap.has('max') ? parseInt(tagMap.get('max')!) : undefined,
    coAuthors: event.tags
      .filter(([key, , , marker]) => key === 'p' && marker === 'author')
      .map(([, npub]) => npub),
  };
}

// ============================================================================
// Payment Events (Custom kinds 1734/1735 for token payments)
// ============================================================================

/**
 * Chain IDs for supported networks
 */
export const CHAIN_IDS: Record<string, number> = {
  localhost: 31337,
  local: 31337, // Alias for localhost
  gnosis: 100,
  gnosis_chiado: 10200,
  base: 8453,
  base_sepolia: 84532,
} as const;

/**
 * Create an EIP-681 payment URL for ERC20 token operations
 * Format: ethereum:<tokenAddress>@<chainId>/<method>?address=<recipient>&uint256=<amount>
 *
 * @param tokenAddress - The ERC20 token contract address
 * @param recipientAddress - The 0x address of the recipient
 * @param amount - Amount in token's smallest unit (e.g., 1000000 for 1 token with 6 decimals)
 * @param chainId - The chain ID (default: 31337 for localhost)
 * @param method - The token method: 'transfer' or 'mint' (default: 'transfer')
 * @returns EIP-681 formatted payment URL
 *
 * @example
 * ```typescript
 * // Transfer tokens
 * const transferUrl = createEIP681PaymentUrl(
 *   "0x1234...token",
 *   "0x5678...recipient",
 *   1000000,
 *   100,
 *   'transfer'
 * );
 * // Returns: "ethereum:0x1234...token@100/transfer?address=0x5678...recipient&uint256=1000000"
 *
 * // Mint tokens
 * const mintUrl = createEIP681PaymentUrl(
 *   "0x1234...token",
 *   "0x5678...recipient",
 *   1000000,
 *   100,
 *   'mint'
 * );
 * // Returns: "ethereum:0x1234...token@100/mint?address=0x5678...recipient&uint256=1000000"
 * ```
 */
export function createEIP681PaymentUrl(
  tokenAddress: string,
  recipientAddress: string,
  amount: bigint | number,
  chainId: number = CHAIN_IDS.localhost,
  method: 'mint' | 'transfer' | 'burn' = 'transfer'
): string {
  const amountStr = typeof amount === 'bigint' ? amount.toString() : String(amount);
  return `ethereum:${tokenAddress}@${chainId}/${method}?address=${recipientAddress}&uint256=${amountStr}`;
}

/**
 * Parse an EIP-681 payment URL
 *
 * @param url - The EIP-681 URL to parse
 * @returns Parsed payment details or null if invalid
 */
export function parseEIP681PaymentUrl(url: string): {
  tokenAddress: string;
  recipientAddress: string;
  amount: bigint;
  chainId: number;
  method: 'mint' | 'transfer' | 'burn';
} | null {
  // Format: ethereum:<tokenAddress>@<chainId>/<method>?address=<recipient>&uint256=<amount>
  const match = url.match(
    /^ethereum:(0x[a-fA-F0-9]{40})@(\d+)\/(mint|transfer|burn)\?address=(0x[a-fA-F0-9]{40})&uint256=(\d+)$/
  );

  if (!match) {
    return null;
  }

  return {
    tokenAddress: match[1],
    chainId: parseInt(match[2], 10),
    method: match[3] as 'mint' | 'transfer' | 'burn',
    recipientAddress: match[4],
    amount: BigInt(match[5]),
  };
}

/**
 * Options for creating a payment request event
 */
export interface PaymentRequestOptions {
  /** Recipient's npub */
  recipientNpub: string;
  /** Recipient's 0x wallet address (Safe address) */
  recipientAddress: string;
  /** Sender's npub (for transfers) or 'system' (for mints) */
  senderNpub: string;
  /** Sender's 0x wallet address (Safe address) - optional for mints */
  senderAddress?: string;
  /** Amount in tokens (will be converted to smallest unit) */
  amount: number;
  /** Token contract address */
  tokenAddress: string;
  /** Chain ID */
  chainId: number;
  /** Token symbol (e.g., 'CHT') */
  tokenSymbol?: string;
  /** Related event ID (e.g., offer ID for RSVP) */
  relatedEventId?: string;
  /** Context of the payment */
  context: 'rsvp' | 'tip' | 'transfer' | 'offer_creation' | 'badge_claim' | 'refund' | 'workshop_proposal';
  /** Human-readable description */
  description?: string;
  /** Method: mint (create new tokens), transfer (move existing tokens), or burn (destroy tokens) */
  method: 'mint' | 'transfer' | 'burn';
}

/**
 * Deduplicate tags array - keeps the first occurrence of each tag key
 * For tags with additional markers (like ['e', id, '', 'related']), uses key+marker for uniqueness
 */
function deduplicateTags(tags: string[][]): string[][] {
  const seen = new Set<string>();
  return tags.filter(tag => {
    // For 'e' tags, include the marker (4th element) in the key if present
    const key = tag[0] === 'e' && tag[3] ? `${tag[0]}:${tag[1]}:${tag[3]}` : `${tag[0]}:${tag[1] || ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Create and sign a payment request event (kind 1734)
 * This is similar to NIP-57 zap request but uses EIP-681 instead of LNURL
 *
 * @param secretKey - Server's NOSTR secret key (32 bytes)
 * @param options - Payment request options
 * @returns Signed NOSTR event
 *
 * For burn operations:
 * - Only fromAddress is included (no toAddress)
 * - Only sender 'P' tag is included (no recipient 'p' tag)
 *
 * @example
 * ```typescript
 * const event = createPaymentRequestEvent(secretKey, {
 *   recipientNpub: "npub1...",
 *   recipientAddress: "0x1234...",
 *   senderNpub: "npub2...",
 *   senderAddress: "0x5678...",
 *   amount: 1,
 *   tokenAddress: "0xtoken...",
 *   chainId: 100,
 *   context: 'rsvp',
 *   relatedEventId: "abc123...",
 *   description: "RSVP payment for workshop"
 * });
 * ```
 */
export function createPaymentRequestEvent(
  secretKey: Uint8Array,
  options: PaymentRequestOptions
): NostrEvent {
  console.log('[NOSTR] Creating payment request event (kind 1734)...');
  console.log('[NOSTR] Payment request:', {
    method: options.method,
    from: options.senderNpub.substring(0, 15) + '...',
    to: options.method === 'burn' ? '(burn)' : options.recipientNpub.substring(0, 15) + '...',
    amount: options.amount,
    context: options.context,
  });

  // Convert amount to smallest unit (assuming 6 decimals for CHT)
  const TOKEN_DECIMALS = 6;
  const amountInSmallestUnit = BigInt(Math.floor(options.amount * 10 ** TOKEN_DECIMALS));

  const isBurn = options.method === 'burn';

  // Convert npubs to hex pubkeys for p tags (NOSTR standard requires hex pubkeys)
  const senderPubkey = npubToHex(options.senderNpub);
  const recipientPubkey = !isBurn ? npubToHex(options.recipientNpub) : null;

  // For burn, use sender address in the payment URL (tokens are burned from sender)
  const addressForPaymentUrl = isBurn ? options.senderAddress! : options.recipientAddress;

  // Create EIP-681 payment URL with correct method
  const paymentUrl = createEIP681PaymentUrl(
    options.tokenAddress,
    addressForPaymentUrl,
    amountInSmallestUnit,
    options.chainId,
    options.method
  );

  const tags: string[][] = [
    ['P', senderPubkey],                             // Sender pubkey (hex) or 'system' for mints
    ['amount', String(amountInSmallestUnit)],        // Amount in smallest unit
    ['paymentUrl', paymentUrl],                      // EIP-681 payment URL
    ['chain', String(options.chainId)],              // Chain ID
    ['token', options.tokenAddress],                 // Token contract address
    ['context', options.context],                    // Payment context
    ['method', options.method],                      // mint, transfer, or burn
  ];

  // For burn: only fromAddress (no toAddress, no recipient)
  // For transfer/mint: include toAddress and recipient
  if (isBurn) {
    // Burn only needs fromAddress
    if (options.senderAddress) {
      tags.push(['fromAddress', options.senderAddress]);
    }
  } else {
    // Transfer/mint needs recipient info
    if (recipientPubkey) {
      tags.push(['p', recipientPubkey]);             // Recipient pubkey (hex)
    }
    tags.push(['toAddress', options.recipientAddress]); // Recipient's 0x address

    // Only add fromAddress for transfers (not mints)
    if (options.method === 'transfer' && options.senderAddress) {
      tags.push(['fromAddress', options.senderAddress]);
    }
  }

  // Add token symbol if provided
  if (options.tokenSymbol) {
    tags.push(['symbol', options.tokenSymbol]);
  }

  // Add related event reference
  if (options.relatedEventId) {
    tags.push(['e', options.relatedEventId, '', 'related']);
  }

  // Deduplicate tags to avoid duplicates
  const dedupedTags = deduplicateTags(tags);

  const content = options.description || `Payment of ${options.amount} ${options.tokenSymbol || 'tokens'} for ${options.context}`;

  const event: EventTemplate = {
    kind: NOSTR_KINDS.PAYMENT_REQUEST,
    created_at: Math.floor(Date.now() / 1000),
    tags: dedupedTags,
    content,
  };

  const signedEvent = finalizeEvent(event, secretKey);

  console.log('[NOSTR] Payment request event created:');
  console.log('[NOSTR]   Event ID:', signedEvent.id);
  console.log('[NOSTR]   Method:', options.method);
  console.log('[NOSTR]   Payment URL:', paymentUrl);
  console.log('[NOSTR]   Amount:', options.amount, options.tokenSymbol || 'tokens');

  return signedEvent;
}

/**
 * Options for creating a payment receipt event
 */
export interface PaymentReceiptOptions {
  /** The original payment request event (kind 1734) */
  paymentRequestEvent: NostrEvent;
  /** The blockchain transaction hash */
  txHash: string;
  /** Whether the payment was successful */
  success: boolean;
  /** Error message if payment failed */
  error?: string;
}

/**
 * Create and sign a payment receipt event (kind 1735)
 * This is published after a payment is processed (success or failure)
 *
 * @param secretKey - Server's NOSTR secret key (32 bytes)
 * @param options - Payment receipt options
 * @returns Signed NOSTR event
 *
 * @example
 * ```typescript
 * const receipt = createPaymentReceiptEvent(secretKey, {
 *   paymentRequestEvent: requestEvent,
 *   txHash: "0xabc123...",
 *   success: true
 * });
 * ```
 */
export function createPaymentReceiptEvent(
  secretKey: Uint8Array,
  options: PaymentReceiptOptions
): NostrEvent {
  console.log('[NOSTR] Creating payment receipt event (kind 1735)...');
  console.log('[NOSTR] Receipt for request:', options.paymentRequestEvent.id);
  console.log('[NOSTR] Success:', options.success);
  console.log('[NOSTR] TxHash:', options.txHash);

  const requestTags = options.paymentRequestEvent.tags;
  const recipientPubkeyRaw = requestTags.find(t => t[0] === 'p')?.[1];
  const senderPubkeyRaw = requestTags.find(t => t[0] === 'P')?.[1];
  const amount = requestTags.find(t => t[0] === 'amount')?.[1];
  const chainId = requestTags.find(t => t[0] === 'chain')?.[1];
  const method = requestTags.find(t => t[0] === 'method')?.[1];
  const context = requestTags.find(t => t[0] === 'context')?.[1];
  const symbol = requestTags.find(t => t[0] === 'symbol')?.[1];
  const relatedEventId = requestTags.find(t => t[0] === 'e' && t[3] === 'related')?.[1];

  // Ensure pubkeys are in hex format (convert if they're npubs)
  const recipientPubkey = recipientPubkeyRaw ? npubToHex(recipientPubkeyRaw) : undefined;
  const senderPubkey = senderPubkeyRaw ? npubToHex(senderPubkeyRaw) : undefined;

  const tags: string[][] = [
    ['e', options.paymentRequestEvent.id, '', 'request'],  // Reference to the request
    ['txhash', options.txHash],                            // Blockchain transaction hash
    ['status', options.success ? 'success' : 'failed'],    // Status
  ];

  // Copy relevant tags from request (with hex pubkeys)
  if (recipientPubkey) tags.push(['p', recipientPubkey]);
  if (senderPubkey) tags.push(['P', senderPubkey]);
  if (amount) tags.push(['amount', amount]);
  if (chainId) tags.push(['chain', chainId]);
  if (method) tags.push(['method', method]);
  if (context) tags.push(['context', context]);
  if (symbol) tags.push(['symbol', symbol]);
  if (relatedEventId) tags.push(['e', relatedEventId, '', 'related']);

  // Add error tag if failed
  if (!options.success && options.error) {
    tags.push(['error', options.error]);
  }

  // Include the full request event as description (for verification)
  const description = JSON.stringify(options.paymentRequestEvent);

  const content = options.success
    ? `Payment confirmed: ${options.txHash}`
    : `Payment failed: ${options.error || 'Unknown error'}`;

  const event: EventTemplate = {
    kind: NOSTR_KINDS.PAYMENT_RECEIPT,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };

  const signedEvent = finalizeEvent(event, secretKey);

  console.log('[NOSTR] Payment receipt event created:');
  console.log('[NOSTR]   Event ID:', signedEvent.id);
  console.log('[NOSTR]   Request ID:', options.paymentRequestEvent.id);
  console.log('[NOSTR]   TxHash:', options.txHash);

  return signedEvent;
}

/**
 * Parse a payment request event (kind 1734)
 *
 * @param event - The NOSTR event to parse
 * @returns Parsed payment request or null if invalid
 */
export function parsePaymentRequestEvent(event: NostrEvent): PaymentRequestOptions | null {
  if (event.kind !== NOSTR_KINDS.PAYMENT_REQUEST) {
    return null;
  }

  const tags = new Map(event.tags.map(t => [t[0], t[1]]));
  const recipientPubkeyHex = tags.get('p');
  const senderPubkeyHex = tags.get('P');
  const amount = tags.get('amount');
  const tokenAddress = tags.get('token');
  const chainId = tags.get('chain');
  const senderAddress = tags.get('fromAddress');
  const recipientAddress = tags.get('toAddress');
  const context = tags.get('context') as PaymentRequestOptions['context'];
  const method = (tags.get('method') || 'transfer') as 'mint' | 'transfer' | 'burn';

  const isBurn = method === 'burn';

  // Required fields depend on method
  // Burn: requires senderPubkeyHex, amount, tokenAddress, chainId, context (no recipient)
  // Transfer/Mint: requires recipientPubkeyHex, senderPubkeyHex, amount, tokenAddress, chainId, recipientAddress, context
  if (!senderPubkeyHex || !amount || !tokenAddress || !chainId || !context) {
    return null;
  }

  // For non-burn operations, require recipient info
  if (!isBurn && (!recipientPubkeyHex || !recipientAddress)) {
    return null;
  }

  // Convert hex pubkeys to npub format (token-factory expects npub strings)
  // Note: senderPubkeyHex might be "system" for mints
  const senderNpub = senderPubkeyHex === 'system' ? 'system' : nip19.npubEncode(senderPubkeyHex);

  // For burn, recipient is empty/same as sender
  const recipientNpub = isBurn
    ? senderNpub
    : nip19.npubEncode(recipientPubkeyHex!);

  const TOKEN_DECIMALS = 6;
  const amountInTokens = Number(BigInt(amount)) / 10 ** TOKEN_DECIMALS;

  return {
    recipientNpub,
    recipientAddress: recipientAddress || '',
    senderNpub,
    senderAddress,
    amount: amountInTokens,
    tokenAddress,
    chainId: parseInt(chainId, 10),
    tokenSymbol: tags.get('symbol'),
    relatedEventId: event.tags.find(t => t[0] === 'e' && t[3] === 'related')?.[1],
    context,
    description: event.content,
    method,
  };
}

/**
 * Parse a payment receipt event (kind 1735)
 *
 * @param event - The NOSTR event to parse
 * @returns Parsed payment receipt or null if invalid
 */
export function parsePaymentReceiptEvent(event: NostrEvent): {
  requestEventId: string;
  txHash: string;
  success: boolean;
  error?: string;
  recipientNpub?: string;
  senderNpub?: string;
  amount?: string;
} | null {
  if (event.kind !== NOSTR_KINDS.PAYMENT_RECEIPT) {
    return null;
  }

  const requestEventId = event.tags.find(t => t[0] === 'e' && t[3] === 'request')?.[1];
  const txHash = event.tags.find(t => t[0] === 'txhash')?.[1];
  const status = event.tags.find(t => t[0] === 'status')?.[1];

  if (!requestEventId || !txHash || !status) {
    return null;
  }

  return {
    requestEventId,
    txHash,
    success: status === 'success',
    error: event.tags.find(t => t[0] === 'error')?.[1],
    recipientNpub: event.tags.find(t => t[0] === 'p')?.[1],
    senderNpub: event.tags.find(t => t[0] === 'P')?.[1],
    amount: event.tags.find(t => t[0] === 'amount')?.[1],
  };
}
