# Open Source Village - Technical Specification

## Project Overview

A mobile-first web application for Open Source Village event (Jan 26 - Feb 6, 2026) that facilitates networking through NFC badges, token economy, and open space workshop coordination.

**Core Features:**
- NFC badge claiming and profile management
- ERC20 token economy on Gnosis blockchain
- Workshop/offer creation and RSVP system
- Google Calendar integration for schedule
- NOSTR protocol for offline-first event propagation
- Real-time balance tracking (pending vs confirmed)

## Architecture

### Technology Stack
- **Frontend:** Next.js with React, Tailwind CSS, shadcn/ui components
- **Package Manager:** Bun
- **State Management:** React Context + hooks
- **Backend:** Next.js API routes (Node.js)
- **Protocol:** NOSTR for event propagation and offline-first
- **Blockchain:** Gnosis Chain (ERC20 tokens)
- **Token Management:** opencollective/token-factory (SAFE wallets)
- **Calendar:** Google Calendar API (server-side proxy with caching)
- **Storage:** File-based (JSON files)
- **Deployment:** Docker container
- **Testing:** E2E tests for critical user flows

### Deployment Architecture
- Traditional Node.js server (VPS/cloud)
- Docker containerized
- Local development initially, production deployment later
- Domain: app.opensourcevillage.org

## Authentication & Identity

### NFC Badge System
- Each attendee receives NFC tag with unique serial number
- URL format: `app.opensourcevillage.org/badge#{serialNumber}`
- Serial number in URL fragment (stays client-side, not sent to server)
- `/setup` route allows anyone to configure NFC tags

### Claim Flow
1. User scans badge → opens `/badge#{serialNumber}`
2. Client-side JS extracts serial number from URL fragment
3. User prompted to claim badge:
   - Username input (3-20 chars, alphanumeric + hyphens/underscores, case-insensitive, globally unique)
   - Password field (browser auto-suggest) OR simple PIN (4-8 digits via link)
4. Client derives NOSTR keypair: `serialNumber + password → npub/nsec` (any KDF is fine, trust venue security)
5. Call API `/claim` with: username, serialNumber, npub
6. Backend creates:
   - `$DATA_DIR/badges/{serialNumber}/profile.json`
   - Symlink: `$DATA_DIR/usernames/{username} → $DATA_DIR/badges/{serialNumber}`
   - Profile directory: `$DATA_DIR/badges/{serialNumber}`
7. Client stores in localStorage: serialNumber, npub, nsec
8. Mint 50 tokens via token-factory (background queue)
9. Create NOSTR kind 0 (profile) event (serialNumber stays private)

### Session Management
- Multiple concurrent sessions supported
- Sessions persist until event ends
- No server-side authentication (trust client-side signing)
- API routes are permissionless, rely on signed NOSTR events

## Data Storage

### File Structure
```
$DATA_DIR/
├── badges/
│   └── {serialNumber}/
│       ├── profile.json          # User profile data, serial number, npub
│       ├── avatar.png            # Uploaded avatar (optional)
│       ├── nostr_log.jsonl       # nostr events log.
│       └── queue.jsonl           # Blockchain operation queue
├── usernames/
│   └── {username} → ../badges/{serialNumber}/  # Symlink for username lookup
└── logs/
    └── app.log                   # Application logs
```

### File Format
- **JSON files** for user data and profiles
- **JSONL** (JSON Lines) for blockchain operation queues
- Accept eventual consistency for concurrent writes

### Profile Data Structure
```json
{
  "npub": "npub1...",
  "username": "alice",
  "name": "Alice Smith",
  "shortbio": "Building open source tools",
  "talkAbout": "Decentralized protocols, community building",
  "helpWith": "Frontend development, UX design",
  "links": [
    { "type": "github", "url": "https://github.com/alice" },
    { "type": "twitter", "url": "https://twitter.com/alice" }
  ],
  "avatar": "https://cdn.satellite.earth/...",  // Blossom URL
  "balances": {
    "confirmed": 50,
    "pending": 3
  },
  "createdAt": "2026-01-26T10:00:00Z"
}
```

## NOSTR Integration

### Relay Setup
- Managed NOSTR relay service
- Configuration in environment variables: `NOSTR_RELAY_URL(s)`
- Client connects directly to relay
- Queue events locally when offline, sync when online

### Event Schema

#### Profile (NIP-01, kind 0)
```json
{
  "kind": 0,
  "content": "{\"name\":\"Alice\",\"about\":\"...\",\"picture\":\"https://...\"}",
  "tags": []
}
```
- Use NIP-05 metadata format
- Store social links in profile metadata
- Uploaded avatars: save to `$DATA_DIR/profiles/{npub}/avatar.png` AND upload to Primal Blossom server
- Reference: `opencollective/opendocs/src/lib/nostr.ts` (L158-256)

#### Offer/Workshop (kind 1)
```json
{
  "kind": 1,
  "content": "Workshop title and description...",
  "tags": [
    ["t", "web3"],                    // Topic tags for filtering
    ["t", "workshop"],                // Type tag
    ["p", "npub1...", "", "author"],  // Co-authors
    ["p", "npub2...", "", "author"],
    ["price", "1", "CHT"],            // Custom: token price
    ["location", "Room A"],           // Custom: physical location
    ["time", "2026-01-27T14:00:00Z"], // Custom: start time
    ["duration", "60"],               // Custom: duration in minutes
    ["min", "5"],                     // Custom: min attendance
    ["max", "20"]                     // Custom: max attendance
  ]
}
```
- Tags for metadata, human-readable content
- Regular events (not replaceable) - filter client-side for latest
- Hybrid tag system: suggested tags + custom user tags
- Creating offer costs 1 token

#### RSVP (kind 7 - Reaction)
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
- RSVP costs 1 token (refunded if cancelled before start)
- Cancellation creates another kind 7 event (negative reaction)

#### Token Transfer Intent (kind 1 + NIP-73)
```json
{
  "kind": 1,
  "content": "Sent 5 tokens for the great workshop!",
  "tags": [
    ["p", "<recipient_npub>"],
    ["amount", "5"],
    ["token", "CHT"],
    ["context", "workshop_tip"],  // or "rsvp", "gift", "offer_payment"
    ["i", "gnosis:0x...", "txhash"]  // NIP-73: external content ID (added after blockchain confirms)
  ]
}
```
- Use NIP-73 for transaction metadata
- Recipient identified by npub (derive 0x address from npub for blockchain)
- Create NOSTR event immediately (optimistic)
- Reply to event with updated status when blockchain confirms

### Client-Side Implementation
- **Signing:** Client-side only using nostr-tools library
- **Keys:** Generated and stored in browser (localStorage)
- **Key Derivation:** serialNumber + password → nsec/npub (deterministic)
- **Event Queue:** Store events locally, publish to relay when online
- **Offline Indicator:** Small status icon in nav bar

## Token Economics

### Token Contract
- Deploy new event-specific ERC20 token on Gnosis Chain
- Managed via opencollective/token-factory
- Each user gets SAFE wallet (multi-sig: user npub + backend signer)
- Backend can sign transactions on behalf of users (gasless UX)

### Token Distribution
- Mint 50 tokens when badge claimed
- Fresh mint (increases supply)
- Background operation (non-blocking)

### Token Operations
| Action | Cost | Recipient |
|--------|------|-----------|
| Create offer | 1 token | Burned/treasury |
| RSVP to workshop | 1 token | Workshop author(s) |
| Cancel RSVP (before start) | Refund 1 token | Original sender |
| Attend workshop | Token kept by author(s) | - |
| Claim generic offer | 1 token | Offer author(s) |
| Send tokens (tip) | Variable | Recipient |

### Multiple Authors
- Tag co-authors in offer event (auto-accept)
- Tokens split equally among authors
- Indivisible remainder goes to first author (round down)

### Balance Display
- Show **two balances**: confirmed (blockchain) + pending (NOSTR)
- Example: "32 tokens (3 pending)"
- Fully public on profile page
- Optimistic updates on NOSTR event, reconcile with blockchain

### Blockchain Queue Management
- File: `$DATA_DIR/profiles/{npub}/queue.jsonl`
- Operations queued: mint, transfer, refund
- Backend polls blockchain periodically for confirmed balances
- Dedicated "Pending Transactions" page in app
- Failed transactions: manual retry by user

### Gas Fees
- opencollective/token-factory handles gas
- Backend private key is SAFE wallet co-signer
- Can execute transfers on behalf of users
- No user-facing gas fees

## Features

### Profile Management

#### Public Profile View
```
┌─────────────────────────┐
│  [Avatar]               │
│  Hi, I'm Alice          │
│                         │
│  Building open source…  │
│                         │
│  Balance: 47 tokens     │
│  (2 pending)            │
│                         │
│  I'd love to talk about:│
│  Decentralized proto... │
│  [Read more]            │
│                         │
│  I could use help with: │
│  Frontend developme...  │
│  [Read more]            │
│                         │
│  [Send Tokens]          │
│                         │
│  More about me:         │
│  🐙 GitHub              │
│  🐦 Twitter             │
│  🌐 Website             │
└─────────────────────────┘
```

- Accessed via: `app.opensourcevillage.org/{username}`
- Expandable text: truncate with "Read more" link
- Send tokens: modal/bottom sheet with amount + description
- Avatar: generated by default (boring-avatars from npub), option to upload custom

#### Personal Profile (Edit Mode)
- Same as public view but with "Edit Profile" button
- In-place editing for all fields
- Linktree: text inputs with + button to add URLs
- Auto-detect link types: LinkedIn, Twitter/X, Mastodon, Bluesky, GitHub, website
- Self-scan behavior: scanning own badge goes to edit mode

#### Unclaimed Badge View
```
Welcome to Open Source Village

This badge hasn't been claimed yet.

To claim it:
1. Set a username
2. Set a password or PIN code

[Username: _______]
[Password: _______]
[or set a simple PIN code]

[Claim Badge]
```

### Workshop & Offer System

#### Offer Types
1. **Workshop** - Linked to specific time/place
2. **1:1 Meeting** - Scheduled meeting
3. **Generic Offer** - Not linked to time/place (marketplace)

#### Creation Flow
- Smart form: fields change based on type
- Workshop shows: title, description, tags, time, location, min/max attendance, price
- Generic offer shows: title, description, tags, price
- Single-page form with conditional fields
- Costs 1 token to create
- Can tag co-authors (auto-accept)

#### Offer Status States
- **Pending** - Below minimum attendance
- **Confirmed** - Reached minimum attendance
  - Auto-writes to Google Calendar (any user can write, 1 token prevents spam)
  - Soft reserve room until confirmed
- **Cancelled** - Author cancelled
  - Auto-refund all confirmed attendees
  - NOSTR event shows "refund pending"
  - Reply to NOSTR event with txhash when confirmed

#### RSVP Flow
1. View workshop on schedule
2. Click RSVP (costs 1 token)
3. Create kind 7 reaction event + token transfer intent
4. Show as "pending" until blockchain confirms
5. Workshop updates attendance count
6. Cancel anytime before start (full refund)

#### Attendance Limits
- Minimum: author decides to run or cancel if not met
- Maximum: no enforcement, just guideline (show "X/Y attending")

### Schedule View

#### Data Sources
1. **Google Calendar** - Official events (read-only, server-cached)
2. **NOSTR events** - User-created workshops

#### Display
- Combined schedule view
- Filter by:
  - Room (from settings.json room config)
  - Tags (user-generated + suggested)
- Status badges distinguish event types:
  - "Confirmed" for official + confirmed workshops
  - "Pending X/Y" for workshops below minimum
- Single timezone (event local time)
- Progressive loading (stale-while-revalidate)

#### Google Calendar Integration
- Server-side proxy with caching (refresh every N minutes)
- OAuth credentials in environment
- Two-way sync:
  - Read official schedule from configured room calendars
  - Write confirmed workshops back to calendar
- Auto-write when workshop reaches minimum attendance

#### Room Configuration (settings.json)
```json
{
  "rooms": [
    {
      "id": "main-hall",
      "name": "Main Hall",
      "calendarId": "c_abc123@group.calendar.google.com",
      "capacity": 100
    },
    {
      "id": "workshop-a",
      "name": "Workshop Room A",
      "calendarId": "c_def456@group.calendar.google.com",
      "capacity": 30
    }
  ]
}
```

### Marketplace (Generic Offers)

- Dedicated tab in hamburger menu
- List/feed of all non-timed offers
- Search by tags only
- Card layout showing: author, title, description (truncated), price, claim button
- Claiming costs 1 token → transferred to author(s)

### Notification System

#### In-App Notification Center
Accessible from hamburger menu, shows:
1. **Blockchain transaction status** - pending/failed/confirmed
2. **Token receipts** - "Alice sent you 5 tokens"
3. **Workshop updates** - "Your workshop was confirmed" / "Workshop cancelled, refund processed"
4. **RSVP notifications** - "Bob RSVPed to your workshop"

#### Implementation
- Badge count on notification icon
- Notification list with status indicators
- Real-time updates via NOSTR event subscription
- Pending transactions page for manual retry

### Navigation Structure

#### Top App Bar + Hamburger Menu
```
☰  Open Source Village       🔔3
```

**Menu Items:**
- Profile (my profile edit view)
- Schedule (calendar view)
- Marketplace (generic offers)
- Notifications (updates & pending transactions)
- Settings (logout, preferences)

#### Mobile Optimizations
- Portrait-only orientation (locked)
- Touch-optimized tap targets
- Bottom sheet modals for actions
- Swipe gestures where appropriate

## API Endpoints

### Authentication
No authentication required - trust client-side signed NOSTR events.

### Core Routes

#### POST /api/claim
Claim an NFC badge.
```typescript
Request: {
  serialNumber: string,
  username: string,
  npub: string
}

Response: {
  success: boolean,
  profile: Profile
}
```

Logic:
1. Validate username (unique, format)
2. Create `$DATA_DIR/badges/{serialNumber}/profile.json` with npub mapping
3. Create `$DATA_DIR/profiles/{npub}/profile.json`
4. Create symlink `$DATA_DIR/usernames/{username} → $DATA_DIR/profiles/{npub}/`
5. Queue token mint (50 tokens)
6. Return profile

#### GET /api/badge/:serialNumber
Get profile for a badge.
```typescript
Response: {
  claimed: boolean,
  username?: string,
  profile?: Profile
}
```

Logic:
1. Read `$DATA_DIR/badges/{serialNumber}/profile.json`
2. If claimed, read profile from `$DATA_DIR/profiles/{npub}/`
3. If username set, include for frontend redirect

#### GET /api/profile/:username
Get profile by username.
```typescript
Response: Profile
```

Logic:
1. Resolve symlink `$DATA_DIR/usernames/{username}`
2. Read profile from target directory

#### GET /api/schedule
Get combined schedule.
```typescript
Query: {
  room?: string,
  tag?: string,
  startDate?: string,
  endDate?: string
}

Response: {
  events: Event[]  // Combined Google Calendar + NOSTR workshops
}
```

Logic:
1. Fetch from Google Calendar (cached)
2. Query NOSTR relay for offer events (kind 1 with time tags)
3. Merge and sort by time
4. Filter by room/tag if specified
5. Calculate status (pending/confirmed) based on RSVP count

#### GET /api/offers
Get marketplace offers.
```typescript
Query: {
  tag?: string
}

Response: {
  offers: Offer[]
}
```

Logic:
1. Query NOSTR relay for offer events (kind 1 without time tags)
2. Filter by tag if specified
3. Enrich with author profiles

#### POST /api/avatar
Upload avatar image.
```typescript
Request: FormData with image file

Response: {
  localUrl: string,
  blossomUrl: string
}
```

Logic:
1. Save to `$DATA_DIR/profiles/{npub}/avatar.png`
2. Upload to Primal Blossom server (ref: opencollective/opendocs)
3. Return both URLs
4. User updates NOSTR kind 0 with Blossom URL

#### GET /api/blockchain/balance/:npub
Get confirmed blockchain balance.
```typescript
Response: {
  confirmed: number,
  pending: number
}
```

Logic:
1. Query Gnosis blockchain for SAFE wallet balance
2. Read pending queue from `$DATA_DIR/profiles/{npub}/queue.jsonl`
3. Return both balances

#### POST /api/blockchain/queue
Add operation to blockchain queue.
```typescript
Request: {
  npub: string,
  operation: "mint" | "transfer" | "refund",
  params: {
    to?: string,
    amount?: number,
    nostrEventId: string
  }
}

Response: {
  queued: boolean,
  queueId: string
}
```

Logic:
1. Append to `$DATA_DIR/profiles/{npub}/queue.jsonl`
2. Background worker processes queue
3. Use token-factory API to execute on Gnosis

#### GET /api/blockchain/queue/:npub
Get blockchain operation queue.
```typescript
Response: {
  operations: QueuedOperation[]
}
```

### Setup Route

#### GET /setup
HTML page for configuring NFC tags.
```html
<form>
  <input name="serialNumber" placeholder="Serial Number" />
  <button>Generate URL</button>
</form>

Generated URL: app.opensourcevillage.org/badge#{serialNumber}
```

Public access (no auth). Instructions to write URL to NFC tag using phone's NFC tools.

## Environment Variables

```bash
# Application
NODE_ENV=development|production
PORT=3000
DATA_DIR=/var/data/opensourcevillage

# NOSTR
NOSTR_RELAY_URL=wss://relay.example.com
NOSTR_RELAY_FALLBACK=wss://relay2.example.com

# Blockchain
GNOSIS_RPC_URL=https://rpc.gnosischain.com
TOKEN_FACTORY_PRIVATE_KEY=0x...
TOKEN_CONTRACT_ADDRESS=0x...

# Google Calendar
GOOGLE_CALENDAR_CREDENTIALS={"client_id":"...","client_secret":"..."}
GOOGLE_CALENDAR_TOKEN={"access_token":"...","refresh_token":"..."}

# Event Configuration
EVENT_START_DATE=2026-01-26
EVENT_END_DATE=2026-02-06
```

## Configuration (settings.json)

```json
{
  "eventName": "Open Source Village 2026",
  "eventDates": {
    "start": "2026-01-26",
    "end": "2026-02-06"
  },
  "tokenEconomics": {
    "initialBalance": 50,
    "offerCreationCost": 1,
    "rsvpCost": 1,
    "claimCost": 1
  },
  "tokenContract": {
    "address": "0x...",
    "symbol": "CHT",
    "decimals": 18
  },
  "nostrRelays": [
    "wss://relay.opensourcevillage.org",
    "wss://relay.damus.io"
  ],
  "suggestedTags": [
    "web3",
    "ai",
    "open-source",
    "community",
    "workshop",
    "talk",
    "1:1"
  ],
  "rooms": [
    {
      "id": "main-hall",
      "name": "Main Hall",
      "calendarId": "c_abc123@group.calendar.google.com",
      "capacity": 100,
      "location": "Building A, Floor 1"
    }
  ]
}
```

## UI/UX Specifications

### Design System
- **Framework:** Tailwind CSS with shadcn/ui components
- **Color Palette:** Accessible neutrals (grays + accent)
- **Typography:** Default Tailwind scale
- **Dark Mode:** Follow system preference (no manual toggle)
- **Mobile:** Portrait-only, optimized for phones

### Key User Flows

#### First-Time Badge Claim
1. Scan NFC badge → open `/badge#{serialNumber}`
2. See claim screen with instructions
3. Enter username
4. Set password (browser suggest strong) OR click "simple PIN" link
5. Submit → derive keypair client-side
6. Call `/api/claim`
7. Show success + "Minting your 50 tokens (pending)..."
8. Redirect to profile edit view
9. Encourage: "Complete your profile to help others find you!"

#### Sending Tokens
1. View someone's profile
2. Tap "Send Tokens" button
3. Bottom sheet modal opens:
   - Amount input (with +/- buttons)
   - Description (optional)
   - Current balance displayed
   - [Send] [Cancel]
4. Tap Send
5. Create NOSTR event (kind 1 + NIP-73)
6. Queue blockchain transfer
7. Show toast: "Sent 5 tokens to Alice (pending)"
8. Update sender's balance optimistically (pending)

#### Creating Workshop
1. Navigate to Schedule
2. Tap + FAB (floating action button)
3. Smart form:
   - Type selector (workshop/1:1/other)
   - Title*
   - Description*
   - Tags (autocomplete from existing + custom)
   - If workshop: time, location, min/max attendance
   - Price (default 1 token)
   - Co-authors (search users by username)
4. Preview & cost display: "Creating this offer costs 1 token"
5. [Create Offer]
6. Publish NOSTR event (kind 1)
7. Queue token payment
8. Show toast: "Workshop created! Status: Pending (0/5)"

#### RSVP to Workshop
1. View workshop in schedule
2. See: "Workshop - Pending (3/5)" with author avatars
3. Tap [RSVP - 1 token]
4. Confirm modal: "RSVP to 'Intro to NOSTR'? This costs 1 token (refundable if cancelled before start)"
5. [Confirm] [Cancel]
6. Create NOSTR kind 7 reaction
7. Queue token transfer
8. Update attendance count: "Pending (4/5)"
9. If reaches minimum (5/5) → status changes to "Confirmed"
10. Workshop auto-writes to Google Calendar

### Loading States
- Progressive loading (stale-while-revalidate pattern)
- Show cached data immediately
- Update in background
- Small spinner or shimmer for updates

### Error Handling
- Toast messages for errors
- Retry buttons for failed operations
- Clear error messages: "Failed to send tokens. Check your balance."
- Failed blockchain operations appear in Pending Transactions page

## Post-Event

### Read-Only Mode
After EVENT_END_DATE:
1. Disable all write operations (no new offers, RSVPs, token transfers)
2. Show banner: "This event has ended. Data is now read-only."
3. Keep profiles and schedule viewable
4. Export functionality for users to download their data

### Data Preservation
- Keep NOSTR events on relay
- Maintain file storage
- Archive blockchain transactions
- Optional: static site generation for historical record

## Testing Strategy

### E2E Tests (Playwright)
Critical user flows to test:
1. **Badge claiming flow**
   - First scan → claim → mint tokens → profile creation
2. **Token sending**
   - Send tokens → NOSTR event → blockchain queue → balance update
3. **Workshop creation and RSVP**
   - Create workshop → RSVP → reach minimum → auto-confirm → calendar write
4. **Profile editing**
   - Edit profile → avatar upload → NOSTR kind 0 update → sync across devices
5. **Offline mode**
   - Go offline → perform actions → queue locally → go online → sync

### Test Environment
- Local NOSTR relay for testing
- Gnosis testnet for blockchain operations
- Mock Google Calendar API responses

## Implementation Notes

### Token Factory Integration
- Study repository: github.com/opencollective/token-factory
- Understand SAFE wallet creation and multi-sig operations
- Backend private key as co-signer enables gasless transactions
- Queue pattern: optimistic UI → background settlement → confirmation

### NOSTR Event Filtering
Since using regular events (not replaceable):
- Fetch all events of a type
- Filter client-side for latest by author
- Example: profile updates → get all kind 0 by pubkey → use latest created_at

### Avatar Upload Flow
1. User selects image in profile edit
2. Upload to `/api/avatar` (multipart/form-data)
3. Backend saves to `$DATA_DIR/profiles/{npub}/avatar.png`
4. Backend uploads to Primal Blossom server (see opencollective/opendocs reference)
5. Return Blossom URL
6. Client updates NOSTR kind 0 with `picture` field
7. Publish updated kind 0 event

### Username Change Handling
1. User updates username
2. Validate new username (unique, format)
3. Delete old symlink: `$DATA_DIR/usernames/{oldUsername}`
4. Create new symlink: `$DATA_DIR/usernames/{newUsername} → $DATA_DIR/profiles/{npub}/`
5. Update profile.json
6. Publish new NOSTR kind 0 event

### Concurrent Access
- Accept eventual consistency
- Optimistic updates in UI
- Backend uses simple file writes
- Conflicts resolved by "last write wins" + blockchain as source of truth

### Security Considerations
- serialNumber never leaves device (URL fragment)
- npub is public identifier (backend never sees serialNumber after claim)
- PIN/password security: trust venue security, simple KDF
- No server-side auth: rely on NOSTR signatures
- Token operations: client signs, backend verifies via NOSTR event signature

## Development Phases

### Phase 1: Core Infrastructure (Priority)
- [ ] Next.js project setup with Bun
- [ ] File storage structure
- [ ] Basic API routes (/claim, /badge, /profile)
- [ ] NOSTR client integration (nostr-tools)
- [ ] Token-factory integration study

### Phase 2: Badge & Profile System
- [ ] NFC badge claiming flow
- [ ] Profile creation and editing
- [ ] Avatar generation and upload
- [ ] Public profile view
- [ ] Username system with symlinks

### Phase 3: Token Economy
- [ ] Blockchain queue system
- [ ] Balance tracking (pending + confirmed)
- [ ] Token sending flow
- [ ] Pending transactions page
- [ ] Token-factory SAFE wallet integration

### Phase 4: Workshop & Schedule
- [ ] Google Calendar integration
- [ ] Schedule view with filtering
- [ ] Workshop creation form
- [ ] RSVP system
- [ ] Auto-confirmation on minimum attendance
- [ ] Calendar write-back

### Phase 5: Marketplace & Search
- [ ] Generic offers view
- [ ] Tag-based search
- [ ] Offer claiming

### Phase 6: Offline & Polish
- [ ] NOSTR event queuing
- [ ] Offline indicator
- [ ] Progressive loading
- [ ] Error handling
- [ ] Notification system

### Phase 7: Testing & Deployment
- [ ] E2E tests
- [ ] Docker containerization
- [ ] Production deployment
- [ ] Physical NFC tag testing

## Success Criteria

1. **Functional Requirements**
   - ✅ Users can claim NFC badges and create profiles
   - ✅ Users can send and receive tokens
   - ✅ Users can create workshops and RSVP
   - ✅ Schedule integrates Google Calendar and user workshops
   - ✅ Offline-first: works without internet, syncs later

2. **Performance Requirements**
   - Load time < 2s on 3G
   - Optimistic UI: all actions feel instant
   - Progressive loading: cached data shows immediately

3. **Reliability Requirements**
   - Works offline with event queueing
   - Blockchain failures don't break UX
   - Multiple concurrent sessions supported

4. **User Experience Requirements**
   - Mobile-friendly (portrait, touch-optimized)
   - Clear feedback on all actions
   - Simple claiming flow for non-technical users
   - Transparent about pending vs confirmed state

## References

- **opencollective/token-factory:** https://github.com/opencollective/token-factory
- **opencollective/opendocs (NOSTR/Blossom):** https://github.com/opencollective/opendocs/blob/main/src/lib/nostr.ts#L158-L256
- **NIP-01 (Basic protocol):** https://github.com/nostr-protocol/nips/blob/master/01.md
- **NIP-73 (External content):** https://github.com/nostr-protocol/nips/blob/master/73.md
- **nostr-tools library:** https://github.com/nbd-wtf/nostr-tools
- **shadcn/ui components:** https://ui.shadcn.com/
- **Google Calendar API:** https://developers.google.com/calendar/api
