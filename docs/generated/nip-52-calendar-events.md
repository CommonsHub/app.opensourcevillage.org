# NIP-52 Calendar Events for Workshops

This document explains how workshops are posted as NIP-52 calendar events to the NIP-29 closed group.

## Overview

When a user creates a workshop, the system:
1. Creates a kind 31922 calendar event (NIP-52)
2. Posts it to the NIP-29 closed group (using h-tag)
3. Uses a d-tag for replaceability (updates use the same d-tag)
4. Enforces authorization (only the original author can edit)

## Event Structure

### Kind 31922 Calendar Event

```javascript
{
  kind: 31922,  // NIP-52 calendar event
  created_at: <unix timestamp>,
  tags: [
    ['d', '<offer-id>'],              // d-tag: unique identifier (for replaceability)
    ['h', '<group-id>'],              // h-tag: NIP-29 group identifier
    ['title', '<workshop-title>'],    // Event title
    ['start', '<start-unix-ts>'],     // Start timestamp (Unix seconds)
    ['end', '<end-unix-ts>'],         // End timestamp (Unix seconds)
    ['location', '<room-name>'],      // Optional: room/location
    ['t', '<tag1>'],                  // Optional: tags
    ['t', '<tag2>'],
  ],
  content: '<workshop-description>',
  pubkey: '<author-pubkey>',
  sig: '<signature>'
}
```

## Client-Side Usage

### Creating a Workshop with NOSTR Event

```typescript
import { createCalendarEvent, getGroupSettings, getUserSecretKey } from '@/lib/nostr';
import { getStoredSecretKey } from '@/lib/nostr-client';

// 1. Get user's secret key from localStorage
const nsec = getStoredSecretKey();
if (!nsec) {
  // Prompt user to re-enter password to derive nsec
  // See: src/app/profile/edit/page.tsx for reference
}

// 2. Get group settings
const groupSettings = getGroupSettings();

// 3. Create calendar event
const userSecretKey = getUserSecretKey(nsec);
const dTag = offerId; // Use offer ID as d-tag

const calendarEvent = createCalendarEvent(
  groupSettings.id,           // Group ID
  dTag,                       // d-tag (offer ID)
  'My Workshop Title',        // Title
  'Workshop description',     // Description
  startUnixTimestamp,         // Start time (Unix seconds)
  endUnixTimestamp,           // End time (Unix seconds)
  'Room A',                   // Optional: location/room
  ['web3', 'workshop'],       // Optional: tags
  userSecretKey              // User's secret key
);

// 4. Send to server with offer creation
const response = await fetch('/api/offers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'workshop',
    title: 'My Workshop Title',
    description: 'Workshop description',
    tags: ['web3', 'workshop'],
    startTime: startISOString,
    endTime: endISOString,
    room: 'Room A',
    maxAttendees: 20,
    npub: userNpub,
    nostrEvent: calendarEvent, // Include signed event
  }),
});
```

### Updating a Workshop

```typescript
// 1. Get existing offer to retrieve d-tag
const offer = await fetch(`/api/offers/${offerId}`).then(r => r.json());

// 2. Create updated calendar event with SAME d-tag
const nsec = getStoredSecretKey();
const userSecretKey = getUserSecretKey(nsec);
const groupSettings = getGroupSettings();

const updatedEvent = createCalendarEvent(
  groupSettings.id,
  offer.nostrDTag,  // IMPORTANT: Use same d-tag for replaceability
  'Updated Workshop Title',
  'Updated description',
  newStartUnixTimestamp,
  newEndUnixTimestamp,
  'Room B',
  ['web3', 'workshop', 'updated'],
  userSecretKey
);

// 3. Send update to server
const response = await fetch(`/api/offers/${offerId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Updated Workshop Title',
    description: 'Updated description',
    tags: ['web3', 'workshop', 'updated'],
    startTime: newStartISOString,
    endTime: newEndISOString,
    room: 'Room B',
    npub: userNpub,
    nostrEvent: updatedEvent, // Include updated event with same d-tag
  }),
});
```

## Server-Side API

### POST /api/offers

Creates a new workshop and publishes the calendar event.

**Request Body:**
```json
{
  "type": "workshop",
  "title": "Workshop Title",
  "description": "Workshop description",
  "tags": ["web3", "workshop"],
  "startTime": "2026-01-26T10:00:00Z",
  "endTime": "2026-01-26T12:00:00Z",
  "room": "Room A",
  "maxAttendees": 20,
  "npub": "npub1...",
  "nostrEvent": {
    "kind": 31922,
    "tags": [...],
    "content": "...",
    "sig": "..."
  }
}
```

**Validation:**
- Event signature must be valid
- Event kind must be 31922
- Event must be signed by the offer author (npub matches pubkey)
- Event must include a d-tag

### PUT /api/offers/[id]

Updates an existing workshop and publishes the updated calendar event.

**Request Body:**
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "tags": ["web3", "workshop", "updated"],
  "startTime": "2026-01-26T14:00:00Z",
  "endTime": "2026-01-26T16:00:00Z",
  "room": "Room B",
  "npub": "npub1...",
  "nostrEvent": {
    "kind": 31922,
    "tags": [...],  // Must use same d-tag
    "content": "...",
    "sig": "..."
  }
}
```

**Authorization:**
- Only the original author can update (checked via `nostrAuthorPubkey`)
- Event must be signed by the same author
- d-tag must match the original d-tag (for replaceability)

## Database Schema

The `Offer` type includes:

```typescript
interface Offer {
  // ... existing fields ...

  // NOSTR fields (NIP-52 calendar event)
  nostrEventId?: string;        // ID of the kind 31922 calendar event
  nostrDTag?: string;           // d-tag for replaceable event (same across updates)
  nostrAuthorPubkey?: string;   // pubkey of the original author
}
```

## Security

1. **Event Signature Verification**: All events must have valid signatures
2. **Author Verification**: Events must be signed by the offer author
3. **Authorization**: Only the original author (via `nostrAuthorPubkey`) can update events
4. **d-tag Consistency**: Updates must use the same d-tag to ensure replaceability

## NIP References

- [NIP-29: Relay-based Groups](https://github.com/nostr-protocol/nips/blob/master/29.md)
- [NIP-52: Calendar Events](https://github.com/nostr-protocol/nips/blob/master/52.md)
- [NIP-01: Basic Protocol Flow](https://github.com/nostr-protocol/nips/blob/master/01.md)

## Example: Full Workshop Creation Flow

```typescript
// 1. User fills out workshop form
const workshopData = {
  title: 'Building Decentralized Apps',
  description: 'Learn how to build dApps on Ethereum',
  startTime: '2026-01-26T14:00:00Z',
  endTime: '2026-01-26T16:00:00Z',
  room: 'Main Hall',
  tags: ['web3', 'ethereum', 'workshop'],
  maxAttendees: 30,
};

// 2. Get user credentials
const credentials = JSON.parse(localStorage.getItem('credentials') || '{}');
const nsec = getStoredSecretKey();

// 3. Generate offer ID client-side (for d-tag)
const offerId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// 4. Create calendar event
const groupSettings = getGroupSettings();
const userSecretKey = getUserSecretKey(nsec);

const calendarEvent = createCalendarEvent(
  groupSettings.id,
  offerId,
  workshopData.title,
  workshopData.description,
  Math.floor(new Date(workshopData.startTime).getTime() / 1000),
  Math.floor(new Date(workshopData.endTime).getTime() / 1000),
  workshopData.room,
  workshopData.tags,
  userSecretKey
);

// 5. Submit to server
const response = await fetch('/api/offers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ...workshopData,
    type: 'workshop',
    npub: credentials.npub,
    nostrEvent: calendarEvent,
  }),
});

// 6. Event is automatically published to NOSTR relays
```
