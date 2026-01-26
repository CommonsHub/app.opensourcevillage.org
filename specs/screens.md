# Screen Specifications

This document lists all screens in the Open Source Village app with their inputs, outputs, and interactions.

## Navigation Structure

```
Top App Bar: ☰ Open Source Village    🔔3

Hamburger Menu:
├── Profile (my profile edit)
├── Schedule
├── Marketplace
├── Notifications
│   └── Pending Transactions (sub-page)
└── Settings
```

---

## 1. Badge Claiming Screen

**Route:** `/badge#{serialNumber}` (first visit, unclaimed)

**Description:** Initial screen when scanning an unclaimed NFC badge. Invites user to claim the badge by setting username and password/PIN.

### Layout
```
┌─────────────────────────────────┐
│ Welcome to Open Source Village  │
│                                  │
│ This badge hasn't been claimed   │
│ yet.                             │
│                                  │
│ To claim it:                     │
│ 1. Set a username                │
│ 2. Set a password or PIN code    │
│                                  │
│ [Username input]                 │
│ • 3-20 characters                │
│ • Letters, numbers, - and _      │
│                                  │
│ [Password input]                 │
│ (browser will suggest strong)    │
│                                  │
│ [or set a simple PIN code]       │
│                                  │
│ [Claim Badge] (primary button)   │
└─────────────────────────────────┘
```

### Inputs
- **Username** (text input)
  - Validation: 3-20 chars, alphanumeric + hyphens/underscores
  - Check uniqueness on key up
  - OK: "✓ Username valid"
  - Error: "❌ Username already taken"

- **Password** (password input)
  - Browser native password suggestion enabled
  - No specific requirements shown

- **"or set a simple PIN code"** (link)
  - Switches to PIN input mode

- **PIN** (numeric input, if simple PIN chosen)
  - 4-8 digits
  - Numeric keyboard on mobile

### Actions
- **Claim Badge** button
  - Validates inputs
  - Client-side: derives npub/nsec from serialNumber + password
  - Calls `/api/claim` with: `{ serialNumber, username, npub }`
  - Shows loading state: "Claiming your badge..."
  - On success: redirect to profile edit mode
  - On error: show error toast

### Success Flow
```
┌─────────────────────────────────┐
│ ✓ Badge Claimed!                 │
│                                  │
│ Minting your 50 tokens...        │
│ (pending)                        │
│                                  │
│ Complete your profile to help    │
│ others find you!                 │
│                                  │
│ [Continue to Profile]            │
└─────────────────────────────────┘
```

---

## 2. Badge Landing (Claimed, No Username)

-> This cannot happen as you cannot claim a badge without setting a username

**Route:** `/badge#{serialNumber}` (claimed but no username set yet)

**Description:** When accessing a claimed badge that doesn't have a username yet.

### Layout
Shows loading spinner while fetching badge info, then redirects to profile edit if it's the user's badge, or shows:

```
┌─────────────────────────────────┐
│ This badge has been claimed but  │
│ the user hasn't set up their     │
│ profile yet.                     │
│                                  │
│ Check back soon!                 │
└─────────────────────────────────┘
```

---

## 3. Public Profile View

**Route:** `/{username}` (viewing someone else's profile)

**Description:** Public view of another user's profile with option to send tokens.

### Layout
```
┌─────────────────────────────────┐
│  ┌───────┐                       │
│  │Avatar │  Hi, I'm Alice        │
│  └───────┘                       │
│                                  │
│  Building open source tools      │
│                                  │
│  Balance: 47 tokens (2 pending)  │
│                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                  │
│  I'd love to talk about:         │
│  Decentralized protocols,        │
│  community building, and...      │
│  [Read more]                     │
│                                  │
│  I could use help with:          │
│  Frontend development, UX...     │
│  [Read more]                     │
│                                  │
│  [Send Tokens] (primary button)  │
│                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                  │
│  More about me:                  │
│  🐙 GitHub                       │
│  🐦 Twitter                      │
│  🔵 Bluesky                      │
│  🌐 Website                      │
│                                  │
└─────────────────────────────────┘
```

### Interactive Elements
- **Read more** links
  - Expands truncated text inline
  - Changes to "Show less" when expanded

- **Send Tokens** button
  - Opens Send Tokens Modal (see Screen 11)

- **Social links**
  - Open in new tab/window
  - Auto-detected icon based on URL

### Display Logic
- Avatar: Shows uploaded avatar or generated avatar from npub
- Balance: Public, shows confirmed + pending
- Truncated text: Show first 100 chars with "Read more" if longer

---

## 4. Personal Profile (Edit Mode)

**Route:** `/{username}` (viewing your own profile) OR after claiming badge

**Description:** Editable view of your own profile.

### Layout
```
┌─────────────────────────────────┐
│  ┌───────┐  [Edit Avatar]        │
│  │Avatar │                       │
│  └───────┘                       │
│                                  │
│  [Edit Profile] (top right)      │
│                                  │
│  Hi, I'm [Alice___________]      │
│  (editable inline)               │
│                                  │
│  [Short bio_________________     │
│   _____________________________] │
│                                  │
│  Balance: 47 tokens (2 pending)  │
│  → View pending transactions     │
│                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                  │
│  I'd love to talk about:         │
│  [Text area___________________   │
│   _____________________________  │
│   _____________________________] │
│                                  │
│  I could use help with:          │
│  [Text area___________________   │
│   _____________________________  │
│   _____________________________] │
│                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                  │
│  More about me:                  │
│  [URL input] [+]                 │
│  🐙 github.com/alice [×]         │
│  🐦 twitter.com/alice [×]        │
│                                  │
│  [Save Changes]                  │
└─────────────────────────────────┘
```

### Inputs
- **Edit Avatar** button
  - Opens file picker
  - Accepts: jpg, png, gif
  - Max size: 2MB
  - Shows upload progress
  - On success: uploads to backend + Blossom server

- **Name** (inline text input)
  - Max 50 chars
  - Auto-save on blur

- **Short bio** (text input)
  - Max 160 chars
  - Character counter shown
  - Auto-save on blur

- **I'd love to talk about** (textarea)
  - Max 500 chars
  - Auto-expand to fit content
  - Auto-save on blur

- **I could use help with** (textarea)
  - Max 500 chars
  - Auto-expand to fit content
  - Auto-save on blur

- **URL input** (text input + add button)
  - Validates URL format
  - Auto-detects type (GitHub, Twitter, etc)
  - Shows appropriate icon
  - [×] button to remove link

- **Save Changes** button
  - Publishes updated NOSTR kind 0 event
  - Shows toast: "Profile updated"
  - Disabled if no changes

### Auto-Save Behavior
- Individual fields auto-save on blur
- Debounced 500ms
- Show subtle "Saving..." indicator
- Toast on error only

---

## 5. Schedule View

**Route:** `/calendar` (or home page)

**Description:** Combined calendar view of official events and user-created workshops with filtering.

### Layout
```
┌─────────────────────────────────┐
│ ☰  Schedule              [+] ←FAB│
│                                  │
│ Filters: [All Rooms ▼]           │
│          [All Tags ▼]            │
│                                  │
│ ━━━ Monday, Jan 27 ━━━━━━━━━━   │
│                                  │
│ ┌─────────────────────────────┐ │
│ │ 09:00 - 10:00 • Main Hall   │ │
│ │ Opening Keynote             │ │
│ │ [Confirmed]                 │ │
│ └─────────────────────────────┘ │
│                                  │
│ ┌─────────────────────────────┐ │
│ │ 10:30 - 11:30 • Room A      │ │
│ │ Intro to NOSTR              │ │
│ │ by @alice + @bob            │ │
│ │ [Pending 4/5] web3          │ │
│ │ → [RSVP - 1 token]          │ │
│ └─────────────────────────────┘ │
│                                  │
│ ┌─────────────────────────────┐ │
│ │ 14:00 - 15:00 • Room B      │ │
│ │ Smart Contract Security     │ │
│ │ [Confirmed] 12 attending    │ │
│ │ → [Cancel RSVP]             │ │
│ └─────────────────────────────┘ │
│                                  │
│ ━━━ Tuesday, Jan 28 ━━━━━━━━━   │
│ ...                              │
└─────────────────────────────────┘
```

### Inputs
- **Room Filter** (dropdown)
  - Options: All Rooms, Main Hall, Room A, Room B, etc.
  - Stored in localStorage
  - Filters events by location tag

- **Tag Filter** (dropdown)
  - Options: All Tags, web3, ai, workshop, talk, etc.
  - Multi-select with checkboxes
  - Stored in localStorage
  - Shows count of active filters

- **[+] FAB** (Floating Action Button)
  - Opens Create Offer Modal (Screen 6)

- **Event Card** (tap)
  - Opens Workshop Detail View (Screen 7)

- **[RSVP - 1 token]** button
  - Shows confirmation: "RSVP to 'Intro to NOSTR'? Costs 1 token (refundable before start)"
  - Creates NOSTR kind 7 reaction
  - Queues token transfer
  - Changes to [Cancel RSVP] after confirmed

- **[Cancel RSVP]** button
  - Confirms: "Cancel RSVP? You'll be refunded 1 token"
  - Creates negative kind 7 reaction
  - Queues refund

### Display Logic
- **Status badges:**
  - `[Confirmed]` = official event or workshop at/above min attendance
  - `[Pending X/Y]` = workshop below minimum
  - `[Full]` = at max capacity (guideline only)

- **Event card colors:**
  - Default: official Google Calendar events
  - Accent: user-created workshops

- **RSVP button states:**
  - Show [RSVP - 1 token] if not attending
  - Show [Cancel RSVP] if already RSVPed
  - Disabled if insufficient balance

- **Progressive loading:**
  - Show cached schedule immediately
  - Shimmer/spinner while refreshing
  - Update in-place when fresh data arrives

---

## 6. Create Offer Modal

**Route:** Modal overlay (triggered from Schedule FAB or Marketplace)

**Description:** Form to create a new workshop or generic offer. Smart form that changes based on offer type.

### Layout
```
┌─────────────────────────────────┐
│ ✕  Create Offer                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                  │
│ Type:                            │
│ ( ) Workshop  (•) 1:1  ( ) Other │
│                                  │
│ Title *                          │
│ [_____________________________] │
│                                  │
│ Description *                    │
│ [_____________________________  │
│  _____________________________  │
│  _____________________________] │
│                                  │
│ Tags                             │
│ [Start typing...___] web3, ai    │
│ Suggested: workshop, talk, 1:1   │
│                                  │
│ ▼ Schedule (for workshops/1:1)   │
│   Date: [Jan 27 ▼]               │
│   Time: [14:00 ▼]                │
│   Duration: [60] minutes         │
│   Location: [Room A ▼]           │
│                                  │
│ ▼ Attendance                     │
│   Min: [5___] Max: [20___]       │
│   (optional)                     │
│                                  │
│ ▼ Co-authors                     │
│   [Search users...___]           │
│   @bob (tokens split equally)    │
│                                  │
│ Price: [1] tokens per person     │
│                                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ Creating costs: 1 token          │
│ Your balance: 47 tokens          │
│                                  │
│ [Cancel]  [Create Offer]         │
└─────────────────────────────────┘
```

### Inputs
- **Type** (radio buttons)
  - Options: Workshop, 1:1, Other
  - Changes form fields dynamically
  - Workshop/1:1 shows Schedule section
  - Other hides Schedule section

- **Title** (text input, required)
  - Max 100 chars
  - Character counter

- **Description** (textarea, required)
  - Max 1000 chars
  - Character counter
  - Markdown preview option

- **Tags** (autocomplete multi-select)
  - Suggests existing tags as you type
  - Can create new tags
  - Shows tag pills below input
  - Click pill to remove

- **Date** (date picker, conditional)
  - Only for Workshop/1:1
  - Defaults to tomorrow
  - Range: event start to end date

- **Time** (time picker, conditional)
  - Only for Workshop/1:1
  - 15-minute increments

- **Duration** (number input, conditional)
  - Only for Workshop/1:1
  - Default: 60 minutes
  - Min: 15, Max: 480

- **Location** (dropdown, conditional)
  - Only for Workshop/1:1
  - Options from settings.json rooms
  - Or custom text input

- **Min attendance** (number input, optional)
  - Default: empty (no minimum)
  - Range: 1-1000

- **Max attendance** (number input, optional)
  - Default: empty (no limit)
  - Range: 1-1000
  - Must be > min if both set

- **Co-authors** (user search/autocomplete)
  - Search by username
  - Shows user avatar + name
  - Can add multiple
  - Note: "tokens split equally"

- **Price** (number input)
  - Default: 1
  - Range: 0-100
  - Unit: tokens
  - Can be 0 for free events

### Actions
- **✕** (close button)
  - Confirms if there are unsaved changes
  - "Discard this offer?"

- **Cancel** button
  - Same as ✕

- **Create Offer** button
  - Validates all required fields
  - Checks balance (need at least 1 token)
  - Creates NOSTR kind 1 event with tags
  - Queues 1 token payment
  - Shows toast: "Offer created! Status: Pending"
  - Closes modal
  - Refreshes schedule/marketplace

### Validation Messages
- "Title is required"
- "Description is required"
- "Insufficient balance (need 1 token to create offer)"
- "Max attendance must be greater than min"
- "Please select a date and time for workshops"

---

## 7. Workshop Detail View

**Route:** `/workshop/{eventId}` or modal overlay

**Description:** Detailed view of a specific workshop or offer with full description and attendee list.

### Layout
```
┌─────────────────────────────────┐
│ ← Back                           │
│                                  │
│ Intro to NOSTR Protocol          │
│                                  │
│ [Pending 4/5] web3               │
│                                  │
│ ┌───┐ ┌───┐                      │
│ │ A │ │ B │ @alice, @bob         │
│ └───┘ └───┘                      │
│                                  │
│ 📅 Monday, Jan 27                │
│ ⏰ 10:30 - 11:30 (60 min)        │
│ 📍 Room A                        │
│                                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                  │
│ Learn the basics of NOSTR        │
│ protocol, how it works, and      │
│ how to build applications on     │
│ top of it. We'll cover:          │
│                                  │
│ - Event structure and signing    │
│ - Relay communication            │
│ - Building a simple client       │
│ - Best practices                 │
│                                  │
│ Bring your laptop!               │
│                                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                  │
│ Min: 5 people • Max: 20 people   │
│ Price: 1 token per person        │
│                                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                  │
│ Attendees (4):                   │
│ ┌───┐ @charlie                   │
│ │ C │ Confirmed                  │
│ └───┘                            │
│ ┌───┐ @diana                     │
│ │ D │ Confirmed                  │
│ └───┘                            │
│ ... (2 more)                     │
│                                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                  │
│ [RSVP - 1 token]                 │
│                                  │
└─────────────────────────────────┘
```

### Interactive Elements
- **← Back** button
  - Returns to schedule or marketplace

- **Author avatars/names** (tappable)
  - Opens author's public profile

- **Attendee list** (tappable)
  - Tap to view attendee's profile

- **[RSVP - 1 token]** button
  - Same behavior as schedule view
  - Shows confirmation dialog
  - Or [Cancel RSVP] if already attending

- **Share button** (in top right)
  - Copy link to workshop
  - "Link copied to clipboard"

### Display Logic
- Show all offer details
- Full description (no truncation)
- Complete attendee list (collapsed if >10)
- Authors can see "Edit" button (future feature)

---

## 8. Marketplace View

**Route:** `/marketplace`

**Description:** Feed of generic offers (not tied to specific time/place).

### Layout
```
┌─────────────────────────────────┐
│ ☰  Marketplace           [+]     │
│                                  │
│ Search by tags: [_________] 🔍   │
│                                  │
│ Active filters: web3 ✕           │
│                                  │
│ ┌─────────────────────────────┐ │
│ │ ┌───┐                       │ │
│ │ │ A │ @alice                │ │
│ │ └───┘                       │ │
│ │                             │ │
│ │ Code Review Session         │ │
│ │ web3, review                │ │
│ │                             │ │
│ │ I'll review your smart      │ │
│ │ contract code and provide   │ │
│ │ feedback...                 │ │
│ │                             │ │
│ │ 💎 1 token                  │ │
│ │                             │ │
│ │ [Claim Offer]               │ │
│ └─────────────────────────────┘ │
│                                  │
│ ┌─────────────────────────────┐ │
│ │ ┌───┐ ┌───┐                 │ │
│ │ │ B │ │ C │ @bob, @charlie  │ │
│ │ └───┘ └───┘                 │ │
│ │                             │ │
│ │ Office Hours                │ │
│ │ 1:1, mentorship             │ │
│ │                             │ │
│ │ Book a 30-min session to    │ │
│ │ discuss your project...     │ │
│ │                             │ │
│ │ 💎 2 tokens                 │ │
│ │                             │ │
│ │ [Claim Offer]               │ │
│ └─────────────────────────────┘ │
│                                  │
│ (Load more...)                   │
└─────────────────────────────────┘
```

### Inputs
- **Search by tags** (text input + search icon)
  - Autocomplete from existing tags
  - Can search multiple tags (OR logic)
  - Shows matching offers
  - Debounced 300ms

- **Active filters** (tag pills with ✕)
  - Shows currently active tag filters
  - Click ✕ to remove filter

- **[+] FAB** button
  - Opens Create Offer Modal (Screen 6)
  - Pre-selects "Other" type

- **Offer card** (tap)
  - Opens offer detail view (similar to Screen 7)

- **[Claim Offer]** button
  - Confirms: "Claim 'Code Review Session'? Costs 1 token"
  - Creates NOSTR event (claim intent)
  - Queues token transfer to author(s)
  - Shows toast: "Offer claimed! @alice will receive 1 token"
  - Could show contact info or next steps

### Display Logic
- Infinite scroll or pagination
- Shows: author, title, tags, price, truncated description
- Sort by: newest first (or most popular)
- Empty state: "No offers match your search"

---

## 9. Send Tokens Modal

**Route:** Modal overlay (triggered from profile view)

**Description:** Modal to send tokens to another user with amount and optional message.

### Layout
```
┌─────────────────────────────────┐
│ ✕  Send Tokens to @alice         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                  │
│ ┌───────┐                        │
│ │Avatar │  Alice Smith           │
│ └───────┘                        │
│                                  │
│ Amount                           │
│ ┌─────────────────────────────┐ │
│ │  [−]     [_5_]      [+]     │ │
│ └─────────────────────────────┘ │
│                                  │
│ Quick amounts:                   │
│ [1] [2] [5] [10]                 │
│                                  │
│ Message (optional)               │
│ [Great workshop, thanks!_____   │
│  _____________________________] │
│                                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                  │
│ Your balance: 47 tokens          │
│ After: 42 tokens (5 pending)     │
│                                  │
│ [Cancel]     [Send Tokens]       │
└─────────────────────────────────┘
```

### Inputs
- **[-] button**
  - Decrements amount by 1
  - Disabled if amount = 1

- **Amount input** (number)
  - Direct input allowed
  - Min: 1, Max: user's confirmed balance
  - Default: 1

- **[+] button**
  - Increments amount by 1
  - Disabled if amount = balance

- **Quick amounts** (buttons: 1, 2, 5, 10)
  - Sets amount to clicked value
  - Disabled if > balance

- **Message** (textarea, optional)
  - Max 280 chars
  - Character counter
  - Public message (appears in NOSTR event)

- **Cancel** button
  - Closes modal

- **Send Tokens** button
  - Validates balance
  - Creates NOSTR kind 1 event with NIP-73 tags
  - Queues blockchain transfer
  - Updates sender balance (optimistic, pending)
  - Shows toast: "Sent 5 tokens to @alice (pending)"
  - Closes modal

### Validation
- "Insufficient balance"
- "Amount must be at least 1"
- Disabled button if invalid

### Success State
```
┌─────────────────────────────────┐
│ ✓ Tokens Sent!                   │
│                                  │
│ 5 tokens sent to @alice          │
│ (pending blockchain confirmation)│
│                                  │
│ [View Transaction]  [Close]      │
└─────────────────────────────────┘
```

---

## 10. Notifications Center

**Route:** `/notifications`

**Description:** List of all notifications including token receipts, workshop updates, and RSVP notifications.

### Layout
```
┌─────────────────────────────────┐
│ ← Notifications                  │
│                                  │
│ Tabs: [All] [Tokens] [Workshops] │
│                                  │
│ ━━━ Today ━━━━━━━━━━━━━━━━━━━━ │
│                                  │
│ ┌─────────────────────────────┐ │
│ │ 💰 @bob sent you 5 tokens   │ │
│ │    "Thanks for the help!"   │ │
│ │    10 minutes ago           │ │
│ │    [View Profile]           │ │
│ └─────────────────────────────┘ │
│                                  │
│ ┌─────────────────────────────┐ │
│ │ ✓ Workshop confirmed!       │ │
│ │   "Intro to NOSTR" reached  │ │
│ │   minimum attendance (5/5)  │ │
│ │   2 hours ago               │ │
│ │   [View Workshop]           │ │
│ └─────────────────────────────┘ │
│                                  │
│ ┌─────────────────────────────┐ │
│ │ 🎟️ @charlie RSVPed         │ │
│ │    to "Smart Contract       │ │
│ │    Security"                │ │
│ │    3 hours ago              │ │
│ └─────────────────────────────┘ │
│                                  │
│ ━━━ Yesterday ━━━━━━━━━━━━━━━━ │
│                                  │
│ ┌─────────────────────────────┐ │
│ │ ❌ Workshop cancelled       │ │
│ │    "Advanced React" by      │ │
│ │    @dana - refunded 1 token │ │
│ │    [View Refund] [Confirmed]│ │
│ └─────────────────────────────┘ │
│                                  │
│ → [Pending Transactions (2)]     │
│                                  │
└─────────────────────────────────┘
```

### Interactive Elements
- **Tabs** (All, Tokens, Workshops)
  - Filters notification types
  - Badge count on each tab

- **[View Profile]** button
  - Opens sender's profile

- **[View Workshop]** button
  - Opens workshop detail

- **[View Refund]** link
  - Opens transaction in pending transactions page

- **[Pending Transactions]** link
  - Goes to Screen 11
  - Shows count in badge

### Notification Types
1. **Token Receipt** 💰
   - "{sender} sent you {amount} tokens"
   - Optional message
   - Link to sender's profile

2. **Workshop Confirmed** ✓
   - "Workshop confirmed! '{title}' reached minimum"
   - Link to workshop

3. **Workshop Cancelled** ❌
   - "Workshop cancelled: '{title}' - refunded {amount} tokens"
   - Link to refund transaction

4. **RSVP Notification** 🎟️
   - "{user} RSVPed to '{workshop}'"
   - Only shown to workshop authors

5. **Transaction Confirmed** ✓
   - "Transaction confirmed: sent {amount} tokens to {user}"
   - Link to transaction

### Empty State
```
┌─────────────────────────────────┐
│ No notifications yet             │
│                                  │
│ You'll see updates here when:    │
│ • Someone sends you tokens       │
│ • Your workshops get confirmed   │
│ • People RSVP to your events     │
└─────────────────────────────────┘
```

---

## 11. Pending Transactions Page

**Route:** `/transactions` or `/notifications/pending`

**Description:** List of all queued blockchain operations with status and retry options.

### Layout
```
┌─────────────────────────────────┐
│ ← Pending Transactions           │
│                                  │
│ 2 pending • 0 failed             │
│                                  │
│ ━━━ Pending ━━━━━━━━━━━━━━━━━━ │
│                                  │
│ ┌─────────────────────────────┐ │
│ │ 🔄 Send 5 tokens             │ │
│ │    To: @alice               │ │
│ │    "Great workshop!"        │ │
│ │    Queued 5 minutes ago     │ │
│ │    [View on Explorer] 🔗    │ │
│ └─────────────────────────────┘ │
│                                  │
│ ┌─────────────────────────────┐ │
│ │ 🔄 RSVP Payment              │ │
│ │    To: @bob (@charlie)      │ │
│ │    For: "Intro to NOSTR"    │ │
│ │    Queued 10 minutes ago    │ │
│ └─────────────────────────────┘ │
│                                  │
│ ━━━ Failed ━━━━━━━━━━━━━━━━━━━ │
│                                  │
│ (empty)                          │
│                                  │
│ ━━━ Confirmed (Last 24h) ━━━━━ │
│                                  │
│ ┌─────────────────────────────┐ │
│ │ ✓ Received 2 tokens         │ │
│ │   From: @bob                │ │
│ │   Confirmed 2 hours ago     │ │
│ │   [View on Explorer] 🔗     │ │
│ └─────────────────────────────┘ │
│                                  │
└─────────────────────────────────┘
```

### Transaction States
1. **Pending** 🔄
   - Queued, waiting for blockchain
   - Shows: operation, recipient, amount, time queued
   - No action needed

2. **Failed** ❌
   - Transaction failed (insufficient gas, network error)
   - Shows: error message
   - [Retry] button to requeue
   - [Cancel] button to remove from queue

3. **Confirmed** ✓
   - Transaction succeeded
   - Shows: txhash, block explorer link
   - Automatically cleared after 24h

### Interactive Elements
- **[View on Explorer]** link
  - Opens Gnosis Chain block explorer
  - Shows transaction details
  - Only available when txhash exists

- **[Retry]** button (failed only)
  - Requeues the transaction
  - Shows loading state
  - Toast: "Transaction requeued"

- **[Cancel]** button (failed only)
  - Confirms: "Remove this transaction from queue?"
  - Removes from queue
  - Does not refund tokens (they weren't deducted)

### Empty State (All Confirmed)
```
┌─────────────────────────────────┐
│ ✓ All transactions confirmed!    │
│                                  │
│ No pending or failed             │
│ transactions.                    │
└─────────────────────────────────┘
```

---

## 12. Settings Page

**Route:** `/settings`

**Description:** App settings, account info, and logout.

### Layout
```
┌─────────────────────────────────┐
│ ← Settings                       │
│                                  │
│ ━━━ Account ━━━━━━━━━━━━━━━━━━ │
│                                  │
│ Username: @alice                 │
│ NPub: npub1abc...xyz (copy)      │
│                                  │
│ [Change Password/PIN]            │
│                                  │
│ ━━━ Preferences ━━━━━━━━━━━━━━ │
│                                  │
│ Theme                            │
│ ( ) Light  (•) Auto  ( ) Dark    │
│                                  │
│ Notifications                    │
│ [×] Token receipts               │
│ [×] Workshop updates             │
│ [×] RSVP notifications           │
│                                  │
│ ━━━ Data ━━━━━━━━━━━━━━━━━━━━━ │
│                                  │
│ [Export My Data]                 │
│ Download all your NOSTR events   │
│ and transaction history          │
│                                  │
│ ━━━ About ━━━━━━━━━━━━━━━━━━━━ │
│                                  │
│ Open Source Village 2026         │
│ Jan 26 - Feb 6, 2026             │
│                                  │
│ [How to Use] [Privacy Policy]    │
│                                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                  │
│ [Log Out]                        │
│                                  │
└─────────────────────────────────┘
```

### Inputs
- **NPub copy button**
  - Copies npub to clipboard
  - Toast: "NPub copied"

- **[Change Password/PIN]** button
  - Opens password change modal
  - Requires current password
  - Derives new keypair (rotation not supported - shows warning)

- **Theme radio buttons**
  - Light, Auto, Dark
  - Auto follows system preference (default)
  - Saved to localStorage

- **Notification checkboxes**
  - Toggle each notification type
  - Saved to localStorage
  - Affects what shows in notifications center

- **[Export My Data]** button
  - Generates JSON file
  - Downloads: `opensourcevillage-{username}-{date}.json`
  - Contains: profile, events, transactions

- **[How to Use]** button
  - Opens help/onboarding modal

- **[Privacy Policy]** link
  - Opens privacy policy page

- **[Log Out]** button
  - Confirms: "Log out? You'll need your password/PIN to log back in"
  - Clears localStorage
  - Redirects to home
  - Does not affect NOSTR events (they're permanent)

---

## 13. NFC Setup Page

**Route:** `/setup`

**Description:** Tool for organizers to configure NFC tags before the event.

### Layout
```
┌─────────────────────────────────┐
│ NFC Badge Setup                  │
│                                  │
│ Use this tool to generate URLs   │
│ for NFC badges.                  │
│                                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                  │
│ Serial Number                    │
│ [________________________]       │
│                                  │
│ [Generate URL]                   │
│                                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                  │
│ Generated URL:                   │
│ ┌───────────────────────────┐   │
│ │ app.opensourcevillage.org │   │
│ │ /badge#OSV2026-001        │   │
│ │                           │   │
│ │ [Copy URL]  [Show QR]     │   │
│ └───────────────────────────┘   │
│                                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                  │
│ Instructions:                    │
│ 1. Enter serial number           │
│ 2. Generate URL                  │
│ 3. Write URL to NFC tag using    │
│    your phone's NFC tools        │
│ 4. Test by scanning the badge    │
│                                  │
└─────────────────────────────────┘
```

### Inputs
- **Serial Number** (text input)
  - Alphanumeric
  - Suggested format: OSV2026-001, OSV2026-002, etc.
  - No validation (any string accepted)

- **[Generate URL]** button
  - Creates URL with format: `app.opensourcevillage.org/badge#{serialNumber}`
  - Shows in output box
  - Enables Copy and QR buttons

- **[Copy URL]** button
  - Copies full URL to clipboard
  - Toast: "URL copied! Ready to write to NFC tag"

- **[Show QR]** button
  - Displays QR code modal
  - QR code encodes the URL
  - Useful for testing without NFC

### QR Code Modal
```
┌─────────────────────────────────┐
│ ✕  QR Code                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                  │
│     ┌─────────────────┐         │
│     │                 │         │
│     │   [QR CODE]     │         │
│     │                 │         │
│     └─────────────────┘         │
│                                  │
│  app.opensourcevillage.org      │
│  /badge#OSV2026-001             │
│                                  │
│  [Download PNG]                  │
│                                  │
└─────────────────────────────────┘
```

---

## 14. Offline Indicator

**Component:** Status icon in top app bar (not a full screen)

**Description:** Small indicator showing online/offline status.

### States
1. **Online** (default)
   - No indicator shown (or small green dot)

2. **Offline**
   - Small orange dot in nav bar
   - Tooltip: "Offline - actions will sync when reconnected"

3. **Syncing**
   - Spinning indicator
   - Tooltip: "Syncing queued events..."

4. **Sync Complete**
   - Green checkmark (briefly)
   - Toast: "Synced 3 events"

---

## 15. Loading States & Skeletons

**Component:** Used throughout app during data fetching

### Profile Skeleton
```
┌─────────────────────────────────┐
│  ┌────────┐                      │
│  │░░░░░░░░│  ░░░░░░░░░░         │
│  └────────┘                      │
│                                  │
│  ░░░░░░░░░░░░░░░░░░░░           │
│                                  │
│  ░░░░░░░░░░░░░░░░                │
│                                  │
└─────────────────────────────────┘
```

### Schedule Skeleton
```
┌─────────────────────────────────┐
│  ░░░░ ░░░░░ ░░                  │
│                                  │
│  ┌───────────────────────────┐  │
│  │ ░░░░ - ░░░░ • ░░░░░       │  │
│  │ ░░░░░░░░░░░░░             │  │
│  │ ░░░░░░                    │  │
│  └───────────────────────────┘  │
│                                  │
│  ┌───────────────────────────┐  │
│  │ ░░░░ - ░░░░ • ░░░░░       │  │
│  │ ░░░░░░░░░░░░░             │  │
│  │ ░░░░░░                    │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

---

## 16. Error States

### Generic Error
```
┌─────────────────────────────────┐
│                                  │
│         ⚠️                       │
│                                  │
│   Something went wrong           │
│                                  │
│   [Try Again]                    │
│                                  │
└─────────────────────────────────┘
```

### Network Error
```
┌─────────────────────────────────┐
│                                  │
│         📡                       │
│                                  │
│   No connection                  │
│                                  │
│   Don't worry - your actions     │
│   will sync when you're back     │
│   online.                        │
│                                  │
│   [Retry] [Continue Offline]     │
│                                  │
└─────────────────────────────────┘
```

### 404 Not Found
```
┌─────────────────────────────────┐
│                                  │
│         🔍                       │
│                                  │
│   Profile not found              │
│                                  │
│   This user doesn't exist or     │
│   hasn't claimed their badge yet.│
│                                  │
│   [Go to Schedule]               │
│                                  │
└─────────────────────────────────┘
```

---

## Toast Messages

**Component:** Brief notification overlay (3-5 seconds)

### Examples
- ✓ "Badge claimed successfully!"
- ✓ "Profile updated"
- ✓ "Sent 5 tokens to @alice (pending)"
- ✓ "Workshop created! Status: Pending"
- ✓ "RSVP confirmed (pending)"
- ✓ "URL copied to clipboard"
- ⚠️ "Insufficient balance"
- ⚠️ "Username already taken"
- ❌ "Failed to send tokens. Try again."
- 📡 "Offline - action queued for sync"
- ✓ "Synced 3 events"

---

## Summary

**Total Screens:** 16 main screens/views
- 3 authentication/onboarding screens
- 4 profile/user screens
- 4 workshop/schedule screens
- 2 notification/transaction screens
- 2 settings/admin screens
- Plus modals, toasts, and loading states

**Navigation Flow:**
```
/badge#{serial} → claim → /{username} (edit mode)
                                ↓
                      [hamburger menu]
                                ↓
        ┌───────────┬───────────┼───────────┬──────────┐
        ↓           ↓           ↓           ↓          ↓
   /schedule  /marketplace  /notifications  /settings
        ↓                        ↓
  [workshop                [pending txs]
   detail]
```
