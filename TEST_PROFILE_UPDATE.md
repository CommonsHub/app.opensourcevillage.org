# Testing Profile Update with NOSTR Events

## What Should Happen

When you update your profile, the following should occur:

1. **Frontend Creates NOSTR Event**
   - Creates a signed kind 0 (profile metadata) event
   - Content includes: `{ "name": "...", "about": "..." }`

2. **Frontend Publishes to Relays**
   - Connects to NOSTR relays (wss://relay.damus.io, wss://nos.lol, etc.)
   - Publishes the event directly to relays
   - Shows success/failure in console

3. **Frontend Sends to Backend API**
   - Sends the same signed event to `/api/profile/:username`
   - Backend logs it to `DATA_DIR/badges/:serial/nostr_log.jsonl`

4. **Backend Subscriber Receives Event**
   - Backend is subscribed to your npub
   - Receives the event from relay
   - Also logs it to the same JSONL file

## Testing Steps

### 1. Check Console Logs

Open browser DevTools (F12) and watch the console when updating profile:

**Expected logs:**
```
[Profile Edit] Creating NOSTR profile event...
[NOSTR] Creating profile event (kind 0)...
[NOSTR] Profile data: { name: "Alice", about: "..." }
[NOSTR] Profile event created and signed:
[NOSTR]   Event ID: abc123...
[NOSTR]   npub: npub1...
[Profile Edit] NOSTR event created: abc123...
[Profile Edit] Publishing event to NOSTR relays...
[NOSTR Relay] Publishing event abc123... to all relays...
[NOSTR Relay] Target relays (3): [...]
[NOSTR Relay] Publishing event to wss://relay.damus.io...
[NOSTR Relay] Not connected to wss://relay.damus.io, connecting now...
[NOSTR Relay] Connecting to relay: wss://relay.damus.io
[NOSTR Relay] ✓ Connected to wss://relay.damus.io
[NOSTR Relay] Sending event to wss://relay.damus.io...
[NOSTR Relay] ✓ Event sent to wss://relay.damus.io
[NOSTR Relay] ✓ Successfully published to wss://relay.damus.io
[NOSTR Relay] Publication summary: { total: 3, successful: 3, failed: 0 }
[Profile Edit] ✓ Published to 3 relays
```

### 2. Check NOSTR Relay Status Indicator

In dev mode, bottom-right corner shows relay connections:
```
┌──────────────────────────────┐
│ NOSTR RELAYS                 │
│ 🟢 relay.damus.io            │
│ 🟢 nos.lol                   │
│ 🟢 nostr.commonshub.brussels │
└──────────────────────────────┘
```

- 🟢 Green = Connected
- 🟡 Yellow = Connecting
- 🔴 Red = Disconnected

### 3. Check Debug Panel

Scroll to bottom of profile page (localhost only):

**Expected:**
```
DEBUG INFO (DEV MODE ONLY)

Serial:   ABC123
NPub:     npub1xyz...
Username: @alice

─────────────────────

NOSTR EVENTS (1)

┌───────────────────────────┐
│ Kind 0    Jan 21, 11:00   │
│ ID: abc123...             │
│ {"name":"Alice","about... │
│ Tags: 0                   │
└───────────────────────────┘
```

### 4. Check JSONL File

```bash
cat data/badges/ABC123/nostr_log.jsonl | jq
```

**Expected output:**
```json
{
  "id": "abc123...",
  "pubkey": "def456...",
  "created_at": 1737454800,
  "kind": 0,
  "tags": [],
  "content": "{\"name\":\"Alice\",\"about\":\"Developer\"}",
  "sig": "789xyz..."
}
```

### 5. Verify on NOSTR Network

Visit a NOSTR client (e.g., https://snort.social) and search for your npub.
You should see your profile update appear there.

## Troubleshooting

### No Console Logs

**Problem:** Nothing appears in console when updating profile

**Fix:**
1. Check that you have an `nsec` in localStorage:
   ```javascript
   localStorage.getItem('osv_nsec')
   ```
2. If missing, you need to claim a badge first

### Connection Failed

**Problem:** `[NOSTR Relay] ✗ Connection error`

**Possible causes:**
1. **Browser WebSocket blocked** - Check browser console for security errors
2. **Relay is down** - Try different relays
3. **CORS issues** - NOSTR relays should allow WebSocket connections

**Fix:**
1. Check relay status at https://nostr.watch
2. Try opening relay URL in browser: `wss://relay.damus.io` (should get WebSocket error, not 404)
3. Check browser network tab for WebSocket connections

### Event Not in JSONL File

**Problem:** Console shows success but file is empty

**Check:**
1. Is backend subscriber running?
   ```bash
   curl -X POST http://localhost:3000/api/nostr-subscriber/init
   ```

2. Check server logs for subscriber messages:
   ```
   [NOSTR Subscriber] Received EVENT from wss://relay.damus.io
   [NOSTR Subscriber] Logging event to ABC123/nostr_log.jsonl
   ```

3. Verify file permissions:
   ```bash
   ls -la data/badges/ABC123/
   ```

### Event Not on Debug Panel

**Problem:** JSONL file has events but debug panel is empty

**Fix:**
1. Refresh the page
2. Check that you're on localhost
3. Check browser console for fetch errors:
   ```
   [Profile] Loaded X NOSTR events
   ```

## Manual Test Command

Create and publish a test event:

```javascript
// In browser console
const { getStoredSecretKey, decodeNsec, createProfileEvent } = await import('/src/lib/nostr-events');
const { publishEvent } = await import('/src/lib/nostr-relay');

const nsec = getStoredSecretKey();
const secretKey = decodeNsec(nsec);
const event = createProfileEvent(secretKey, { name: 'Test', about: 'Testing' });
await publishEvent(event);
```

Expected: Event published to relays and logged to JSONL file.
