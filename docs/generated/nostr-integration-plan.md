# NOSTR Integration Implementation Plan

## Overview
This document outlines the implementation plan for adding NOSTR event creation and signing to the Open Source Village webapp. NOSTR provides offline-first event propagation and decentralized identity.

## Current State
- ✅ Basic NOSTR keypair derivation implemented in `src/lib/nostr-client.ts`
- ✅ Uses nostr-tools library for key generation
- ✅ Derives keypair from serialNumber + password using SHA-256
- ✅ Stores npub/nsec in localStorage
- ❌ Event creation and signing NOT implemented
- ❌ Event logging to JSONL files NOT implemented
- ❌ Integration with API endpoints NOT implemented

## Required NOSTR Events

### 1. Profile Event (Kind 0)
**When**: After badge claim and profile updates
**Purpose**: Share user profile metadata across NOSTR network

```typescript
{
  kind: 0,
  content: JSON.stringify({
    name: "Alice Smith",
    about: "Building open source tools",
    picture: "https://app.opensourcevillage.org/avatars/alice.png"
  }),
  tags: []
}
```

### 2. Offer Event (Kind 1)
**When**: Creating workshops or generic offers
**Purpose**: Publish offer details for discovery

```typescript
{
  kind: 1,
  content: "[Title]\n\n[Description]",
  tags: [
    ["t", "workshop"],                    // Type tag
    ["t", "web3"],                        // Topic tags (searchable)
    ["p", "npub1...", "", "author"],      // Co-authors (optional)
    ["price", "1", "CHT"],                // Token price
    ["location", "Room A"],               // Physical location (workshops)
    ["time", "2026-01-27T14:00:00Z"],     // Start time (workshops)
    ["duration", "60"],                   // Duration in minutes
    ["min", "5"],                         // Minimum attendance
    ["max", "20"]                         // Maximum attendance
  ]
}
```

### 3. RSVP Event (Kind 7 - Reaction)
**When**: User RSVPs to a workshop
**Purpose**: Signal attendance intent, trigger token transfer

```typescript
{
  kind: 7,
  content: "🎟️",
  tags: [
    ["e", "<offer_event_id>", "", "reply"],
    ["p", "<offer_author_npub>"]
  ]
}
```

### 4. RSVP Cancellation Event (Kind 7 - Negative Reaction)
**When**: User cancels RSVP before workshop starts
**Purpose**: Cancel attendance, trigger refund

```typescript
{
  kind: 7,
  content: "❌",
  tags: [
    ["e", "<rsvp_event_id>", "", "cancel"]
  ]
}
```

## Implementation Steps

### Step 1: Extend nostr-client.ts

Add event creation and signing utilities:

```typescript
/**
 * NOSTR event kinds used in the app
 */
export const NOSTR_KINDS = {
  PROFILE: 0,        // NIP-01: User profile metadata
  NOTE: 1,           // NIP-01: Text note (used for offers)
  REACTION: 7,       // NIP-25: Reaction (used for RSVPs)
} as const;

/**
 * Create and sign a NOSTR profile event (kind 0)
 */
export function createProfileEvent(
  secretKey: Uint8Array,
  profile: {
    name: string;
    about?: string;
    picture?: string;
  }
): Event {
  const event: UnsignedEvent = {
    kind: NOSTR_KINDS.PROFILE,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(profile),
  };

  return finalizeEvent(event, secretKey);
}

/**
 * Create and sign a NOSTR offer event (kind 1)
 */
export function createOfferEvent(
  secretKey: Uint8Array,
  offer: {
    title: string;
    description: string;
    type: 'workshop' | '1:1' | 'other';
    tags?: string[];
    price?: number;
    location?: string;
    startTime?: string;
    duration?: number;
    minAttendance?: number;
    maxAttendance?: number;
    coAuthors?: string[];
  }
): Event {
  const tags: string[][] = [
    ['t', offer.type],
  ];

  // Add topic tags
  if (offer.tags) {
    offer.tags.forEach(tag => tags.push(['t', tag]));
  }

  // Add co-authors
  if (offer.coAuthors) {
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
  if (offer.minAttendance) {
    tags.push(['min', String(offer.minAttendance)]);
  }
  if (offer.maxAttendance) {
    tags.push(['max', String(offer.maxAttendance)]);
  }

  const event: UnsignedEvent = {
    kind: NOSTR_KINDS.NOTE,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: `${offer.title}\n\n${offer.description}`,
  };

  return finalizeEvent(event, secretKey);
}

/**
 * Create and sign a NOSTR RSVP event (kind 7)
 */
export function createRSVPEvent(
  secretKey: Uint8Array,
  offerEventId: string,
  authorNpub: string
): Event {
  const event: UnsignedEvent = {
    kind: NOSTR_KINDS.REACTION,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', offerEventId, '', 'reply'],
      ['p', authorNpub],
    ],
    content: '🎟️',
  };

  return finalizeEvent(event, secretKey);
}

/**
 * Create and sign a NOSTR RSVP cancellation event (kind 7)
 */
export function createRSVPCancellationEvent(
  secretKey: Uint8Array,
  rsvpEventId: string
): Event {
  const event: UnsignedEvent = {
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
 */
export function verifyNostrEvent(event: Event): boolean {
  return verifyEvent(event);
}

/**
 * Store nsec in localStorage securely
 * WARNING: This is for demo/event use only - not production secure
 */
export function storeSecretKey(nsec: string): void {
  localStorage.setItem('osv_nsec', nsec);
}

/**
 * Retrieve nsec from localStorage
 */
export function getStoredSecretKey(): string | null {
  return localStorage.getItem('osv_nsec');
}

/**
 * Decode nsec to Uint8Array for signing
 */
export function decodeNsec(nsec: string): Uint8Array {
  return nip19.decode(nsec).data as Uint8Array;
}
```

### Step 2: Add NOSTR Event Logging to Storage Layer

Create `src/lib/nostr-logger.ts`:

```typescript
/**
 * Server-side NOSTR event logging
 * Appends events to nostr_log.jsonl files
 */

import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Event } from 'nostr-tools';

const DATA_DIR = process.env.DATA_DIR || 'data';

/**
 * Log a NOSTR event to user's nostr_log.jsonl file
 */
export function logNostrEvent(serialNumber: string, event: Event): void {
  const profileDir = join(DATA_DIR, 'badges', serialNumber);
  const logFile = join(profileDir, 'nostr_log.jsonl');

  // Ensure directory exists
  mkdirSync(profileDir, { recursive: true });

  // Append event as JSON line
  const line = JSON.stringify(event) + '\n';
  appendFileSync(logFile, line, 'utf-8');
}

/**
 * Read all NOSTR events for a user
 */
export function readNostrEvents(serialNumber: string): Event[] {
  const logFile = join(DATA_DIR, 'badges', serialNumber, 'nostr_log.jsonl');

  try {
    const content = readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n');
    return lines.map(line => JSON.parse(line));
  } catch (error) {
    // File doesn't exist yet
    return [];
  }
}
```

### Step 3: Update Offer API to Publish NOSTR Events

Modify `src/app/api/offers/route.ts`:

```typescript
// At the top, import NOSTR utilities
import { logNostrEvent } from '@/lib/nostr-logger';

export async function POST(request: NextRequest) {
  // ... existing validation and token deduction code ...

  // After creating the offer, expect the client to send the signed NOSTR event
  const { offer, nostrEvent } = await request.json();

  // Verify the NOSTR event signature
  if (!verifyEvent(nostrEvent)) {
    return NextResponse.json(
      { error: 'Invalid NOSTR event signature' },
      { status: 400 }
    );
  }

  // Store the NOSTR event ID in the offer
  newOffer.nostrEventId = nostrEvent.id;

  // Save offer to file
  const offerFile = join(OFFERS_DIR, `${offerId}.json`);
  writeFileSync(offerFile, JSON.stringify(newOffer, null, 2));

  // Log the NOSTR event
  const profile = await getProfileByNpub(npub);
  if (profile?.serialNumber) {
    logNostrEvent(profile.serialNumber, nostrEvent);
  }

  // ... rest of the code ...
}
```

### Step 4: Update RSVP API to Publish NOSTR Events

Modify `src/app/api/rsvp/route.ts`:

```typescript
// Similar pattern - accept NOSTR event from client and log it
export async function POST(request: NextRequest) {
  // ... existing RSVP logic ...

  const { offerId, npub, nostrEvent } = await request.json();

  // Verify event
  if (!verifyEvent(nostrEvent)) {
    return NextResponse.json(
      { error: 'Invalid NOSTR event signature' },
      { status: 400 }
    );
  }

  // Store NOSTR event ID
  newRSVP.nostrEventId = nostrEvent.id;

  // Log the event
  const profile = await getProfileByNpub(npub);
  if (profile?.serialNumber) {
    logNostrEvent(profile.serialNumber, nostrEvent);
  }

  // ... rest of the code ...
}
```

### Step 5: Update Client-Side Forms

Modify offer creation form to create NOSTR event:

```typescript
// In src/app/offers/create/page.tsx
import { createOfferEvent, decodeNsec, getStoredSecretKey } from '@/lib/nostr-client';

async function handleSubmit() {
  // ... form validation ...

  // Create NOSTR event
  const nsec = getStoredSecretKey();
  if (!nsec) {
    setError('Not authenticated');
    return;
  }

  const secretKey = decodeNsec(nsec);
  const nostrEvent = createOfferEvent(secretKey, {
    title,
    description,
    type,
    tags,
    price: 1,
    location: type === 'workshop' ? location : undefined,
    startTime: type === 'workshop' ? startTime : undefined,
    duration: type === 'workshop' ? duration : undefined,
    minAttendance: type === 'workshop' ? minAttendance : undefined,
    maxAttendance: type === 'workshop' ? maxAttendance : undefined,
  });

  // Send both offer data and NOSTR event to API
  const response = await fetch('/api/offers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offer: formData, nostrEvent }),
  });

  // ... handle response ...
}
```

## Testing Plan

### Unit Tests
- Test event creation functions in `nostr-client.ts`
- Test event signing and verification
- Test NOSTR logger functions

### Integration Tests
- Test offer creation with NOSTR event
- Test RSVP creation with NOSTR event
- Test RSVP cancellation with NOSTR event
- Verify events are logged to JSONL files
- Verify event IDs are stored in database records

### Test Files to Create
1. `src/lib/__tests__/nostr-client.test.ts`
2. `src/lib/__tests__/nostr-logger.test.ts`
3. Update existing API tests to verify NOSTR integration

## Data Directory Changes

After implementation, the file structure will include:

```
data/badges/{serialNumber}/
├── profile.json           # User profile
├── nostr_log.jsonl       # All NOSTR events (NEW)
├── queue.jsonl           # Blockchain operations
└── avatar.png            # Optional avatar
```

Each line in `nostr_log.jsonl` will be a complete NOSTR event:

```jsonl
{"id":"abc123","pubkey":"...","created_at":1234567890,"kind":0,"tags":[],"content":"...","sig":"..."}
{"id":"def456","pubkey":"...","created_at":1234567891,"kind":1,"tags":[["t","workshop"]],"content":"...","sig":"..."}
```

## Security Considerations

1. **nsec Storage**: Currently stored in localStorage (acceptable for event use, not production)
2. **Event Verification**: All events must be verified before logging
3. **Signature Validation**: Ensure pubkey in event matches npub from profile
4. **XSS Prevention**: Sanitize event content before displaying
5. **Rate Limiting**: Consider rate limiting event creation to prevent spam

## Future Enhancements

1. **NOSTR Relay Integration**: Publish events to public NOSTR relays
2. **Event Subscription**: Subscribe to events from other users
3. **Offline Queue**: Queue events when offline, publish when online
4. **Event Deletion**: Implement NIP-09 event deletion
5. **Encrypted DMs**: Use NIP-04 for private messages

## Acceptance Criteria

- [ ] All event types can be created and signed
- [ ] Events are verified before logging
- [ ] Events are logged to nostr_log.jsonl files
- [ ] Event IDs are stored in offer/RSVP records
- [ ] Client-side forms create and send NOSTR events
- [ ] API endpoints accept and validate NOSTR events
- [ ] Unit tests achieve 85%+ coverage
- [ ] Integration tests verify end-to-end flow
- [ ] Documentation updated in @AGENT.md
- [ ] Changes committed with conventional commit messages

## Estimated Effort

- Step 1 (nostr-client.ts): ~2 hours
- Step 2 (nostr-logger.ts): ~1 hour
- Step 3 (Offer API): ~1 hour
- Step 4 (RSVP API): ~1 hour
- Step 5 (Client forms): ~2 hours
- Testing: ~3 hours
- Documentation: ~1 hour

**Total**: ~11 hours of focused development time

## Dependencies

Required npm packages (already in package.json):
- nostr-tools (for event creation and signing)

No additional dependencies needed.
