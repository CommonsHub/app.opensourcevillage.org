# NOSTR Relay Status Fix

## Problem
The relay status indicator was showing an empty array because relay connections are only created when you publish an event. Until then, the `relayConnections` Map is empty.

## Solution

### 1. Updated `getRelayStatus()` 
Now returns default relays with "disconnected" status when no connections exist yet.

```typescript
export function getRelayStatus(): Array<{ url: string; status: string }> {
  // If no connections exist yet, return default relays with disconnected status
  if (relayConnections.size === 0) {
    const relayUrls = getRelayUrls();
    return relayUrls.map(url => ({
      url,
      status: 'disconnected',
    }));
  }
  
  // Return actual connection status
  return Array.from(relayConnections.entries()).map(([url, connection]) => ({
    url,
    status: connection.status,
  }));
}
```

### 2. Added `initializeRelayConnections()`
Pre-connects to all relays when the app loads.

```typescript
export async function initializeRelayConnections(): Promise<void> {
  const relayUrls = getRelayUrls();
  await Promise.allSettled(relayUrls.map(url => connectToRelay(url)));
}
```

### 3. Enhanced NostrStatus Component
- Automatically pre-connects to relays on mount
- Shows loading spinner while connecting
- Shows status for all default relays (even if disconnected)
- Updates every 5 seconds

## Expected Behavior

### On Page Load (localhost only):

**Bottom-right corner shows:**
```
┌──────────────────────────────┐
│ NOSTR RELAYS    ⟳            │  ← Spinner while connecting
│ 🟡 relay.damus.io            │  ← Yellow (connecting)
│ 🟡 nos.lol                   │
│ 🟡 nostr.commonshub.brussels │
└──────────────────────────────┘
```

### After Connection:
```
┌──────────────────────────────┐
│ NOSTR RELAYS                 │
│ 🟢 relay.damus.io            │  ← Green (connected)
│ 🟢 nos.lol                   │
│ 🟢 nostr.commonshub.brussels │
└──────────────────────────────┘
```

### If Connection Fails:
```
┌──────────────────────────────┐
│ NOSTR RELAYS                 │
│ 🟢 relay.damus.io            │  ← Green (connected)
│ 🔴 nos.lol                   │  ← Red (error)
│ 🟢 nostr.commonshub.brussels │
└──────────────────────────────┘
```

## Status Colors

- 🟢 **Green** - Connected
- 🟡 **Yellow** - Connecting (animated pulse)
- 🔴 **Red** - Error/Failed
- ⚫ **Gray** - Disconnected

## Console Logs

You should now see:
```
[NostrStatus] Pre-connecting to NOSTR relays...
[NOSTR Relay] Using default relay URLs: [...]
[NOSTR Relay] Connecting to relay: wss://relay.damus.io
[NOSTR Relay] ✓ Connected to wss://relay.damus.io
[NOSTR Relay] Connecting to relay: wss://nos.lol
[NOSTR Relay] ✓ Connected to wss://nos.lol
[NOSTR Relay] Connecting to relay: wss://nostr.commonshub.brussels
[NOSTR Relay] ✓ Connected to wss://nostr.commonshub.brussels
[NostrStatus] ✓ Relays initialized
```

## Testing

1. Refresh the page on localhost
2. Check bottom-right corner - should show relay status
3. Should auto-connect to all relays
4. Status should update from yellow (connecting) to green (connected)
5. Every 5 seconds, status updates

## Troubleshooting

### Still Shows Empty/No Status

**Check browser console:**
1. Any errors about WebSocket?
2. Any CORS errors?
3. Check Network tab for WebSocket connections

**Verify:**
```javascript
// In browser console
import { getRelayStatus } from '@/lib/nostr-relay';
console.log(getRelayStatus());
```

Should return array with relay URLs even if disconnected.

### Connections Failing

Check relay health at https://nostr.watch

Try different relays by setting in localStorage:
```javascript
localStorage.setItem('osv_relay_urls', JSON.stringify([
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net'
]));
```

Then refresh the page.
