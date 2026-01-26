A proposal is an offer for an activity.

## NOSTR Event Structure

Offers are published as NOSTR kind 1 events with structured tags.

### Offer Event (kind 1)
```json
{
  "kind": 1,
  "content": "[Title]\n\n[Description]",
  "tags": [
    ["t", "workshop"],                    // Type tag
    ["t", "web3"],                        // Topic tags (searchable)
    ["p", "npub1...", "", "author"],      // Co-authors (auto-accept when tagged)
    ["price", "1", "CHT"],                // Token price (default 1)
    ["location", "Room A"],               // Physical location
    ["time", "2026-01-27T14:00:00Z"],     // Start time (ISO 8601)
    ["duration", "60"],                   // Duration in minutes
    ["min", "5"],                         // Minimum attendance
    ["max", "20"]                         // Maximum attendance (guideline only)
  ]
}
```

### RSVP Event (kind 7 - Reaction)
```json
{
  "kind": 7,
  "content": "🎟️",
  "tags": [
    ["e", "<offer_event_id>", "", "reply"],
    ["p", "<offer_author_npub>"]
  ]
}
```

### Cancellation (kind 7 - Negative Reaction)
```json
{
  "kind": 7,
  "content": "❌",
  "tags": [
    ["e", "<rsvp_event_id>", "", "cancel"]
  ]
}
```

## Token Economics

- **Creating offer:** 1 token (author pays)
- **RSVP:** 1 token (attendee pays, goes to author(s))
- **Cancel RSVP:** Refund 1 token (anytime before workshop starts)
- **Workshop cancelled by author:** Auto-refund all confirmed attendees
  - NOSTR event published: "refund pending"
  - Reply to original event with txhash when blockchain confirms

## Offer Status States

- **pending** - Below minimum attendance (soft reserve on calendar)
- **confirmed** - Reached minimum attendance
  - Auto-writes to Google Calendar when confirmed
  - Anyone can write to calendar (1 token creation cost prevents spam)
- **cancelled** - Author cancelled, refunds processed

## Multiple Authors

- Tag co-authors in offer event with `["p", "npub...", "", "author"]`
- Co-authors auto-accept (no confirmation needed)
- Tokens split equally among all authors
- Indivisible remainder goes to first author

## Attendance Limits

- **Minimum:** Author decides to run or cancel if not met by start time
- **Maximum:** No enforcement, just guideline (show "X/Y attending")

## TypeScript Types (for reference)

```typescript
type Offer {
  type: "workshop" | "1:1" | "other",
  title: string,
  description: string,
  tags?: string[],
  attendance: {
    min?: number,
    max?: number,
    price: number  // in tokens, default 1
  },
  authors: User[],  // npubs
  attendees: Attendee[],
  createdAt: Date,
  startTime?: DateTime,
  duration?: number,  // minutes
  location?: string,
  status: "pending" | "confirmed" | "cancelled",
  nostrEventId: string
}

type User {
  npub: string,
  username: string,
  avatar: string,
  name: string,
  shortbio: string,
}

type Attendee {
  user: User,
  status: "confirmed" | "cancelled",
  nostrEventId: string  // their RSVP event
}
```

If the activity is cancelled, all confirmed attendees are automatically refunded via blockchain queue.