# NOSTR Subscriber Setup Guide

The NOSTR subscriber is a backend service that monitors NOSTR relays for events from all registered users and automatically logs them to their respective `nostr_log.jsonl` files.

## Installation

1. Install the required WebSocket dependency:
```bash
bun install ws @types/ws
```

## How It Works

### Architecture

```
NOSTR Relays (wss://relay.damus.io, wss://nos.lol)
          ↓
    WebSocket Connections
          ↓
  Backend Subscriber Service
          ↓
Monitors all user npubs for events
          ↓
Logs to DATA_DIR/badges/:serial/nostr_log.jsonl
```

### Key Components

1. **`src/lib/nostr-subscriber.ts`** - Main subscriber service
   - Connects to NOSTR relays
   - Subscribes to all user npubs
   - Logs received events to JSONL files
   - Handles reconnection and error recovery

2. **`src/app/api/nostr-subscriber/init/route.ts`** - Initialization endpoint
   - POST `/api/nostr-subscriber/init` - Starts the subscriber

3. **`src/app/api/nostr-subscriber/status/route.ts`** - Status endpoint
   - GET `/api/nostr-subscriber/status` - Check subscriber status

4. **`src/app/api/nostr-events/[identifier]/route.ts`** - Events API
   - GET `/api/nostr-events/alice` - Fetch NOSTR events for a user (dev mode only)

## Starting the Subscriber

### Option 1: Manual Initialization (via API call)

After server startup, call the init endpoint:

```bash
curl -X POST http://localhost:3000/api/nostr-subscriber/init
```

### Option 2: Automatic Initialization (Recommended)

Add to your server startup script or create a startup hook:

```typescript
// In a server-side file that runs on startup
import { initializeNostrSubscriptions } from '@/lib/nostr-subscriber';

// Start subscriptions
initializeNostrSubscriptions();
```

### Option 3: Next.js Instrumentation Hook

Create `instrumentation.ts` in your project root:

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeNostrSubscriptions } = await import('./src/lib/nostr-subscriber');
    await initializeNostrSubscriptions();
  }
}
```

Then enable instrumentation in `next.config.js`:

```javascript
module.exports = {
  experimental: {
    instrumentationHook: true,
  },
};
```

## Configuration

Set these environment variables in your `.env`:

```bash
# Primary NOSTR relay
NOSTR_RELAY_URL=wss://relay.damus.io

# Fallback relay
NOSTR_RELAY_FALLBACK=wss://nos.lol

# Data directory
DATA_DIR=./data
```

## Event Logging

Events are logged to:
```
DATA_DIR/badges/:serialNumber/nostr_log.jsonl
```

Each line is a complete NOSTR event in JSON format:
```json
{"id":"abc123...","pubkey":"def456...","created_at":1234567890,"kind":0,"tags":[],"content":"{\"name\":\"Alice\"}","sig":"789xyz..."}
```

## What Gets Logged

The subscriber monitors for these event types:
- **Kind 0** - Profile updates
- **Kind 1** - Text notes/posts
- **Kind 7** - Reactions (RSVPs)

## Automatic Subscription for New Users

When a new user claims a badge via `/api/claim`, the system automatically:
1. Creates their profile
2. Subscribes to their npub on all connected relays
3. Starts logging their events immediately

## Debug Info (Dev Mode)

In development mode, the profile page shows:
- Serial number
- NPub
- Username
- **List of all NOSTR events** with:
  - Event kind
  - Event ID
  - Timestamp
  - Content preview
  - Number of tags

## Monitoring

### Check Logs

The subscriber outputs detailed logs:
```
[NOSTR Subscriber] Connecting to wss://relay.damus.io...
[NOSTR Subscriber] ✓ Connected to wss://relay.damus.io
[NOSTR Subscriber] ✓ Subscribed to 5 npubs on wss://relay.damus.io
[NOSTR Subscriber] Received EVENT from wss://relay.damus.io: { kind: 0, id: 'abc123...' }
[NOSTR Subscriber] Logging event to ABC123/nostr_log.jsonl
```

### Check Status

```bash
curl http://localhost:3000/api/nostr-subscriber/status
```

## Troubleshooting

### Subscriber Not Starting

1. Check that WebSocket dependencies are installed:
   ```bash
   bun install ws @types/ws
   ```

2. Verify relay URLs are set in `.env`

3. Check server logs for connection errors

### Events Not Being Logged

1. Verify the user's npub is subscribed:
   - Check server logs for subscription confirmations
   - Look for "Subscribed to X npubs" messages

2. Check relay connectivity:
   - Relays may be temporarily down
   - Try different relay URLs

3. Verify file permissions:
   - Ensure DATA_DIR is writable
   - Check that badge directories exist

### Reconnection Issues

The subscriber automatically reconnects with exponential backoff:
- Attempt 1: 2 seconds
- Attempt 2: 4 seconds
- Attempt 3: 8 seconds
- Attempt 4: 16 seconds
- Attempt 5: 30 seconds (max)

After 5 failed attempts, manual restart required.

## Graceful Shutdown

The subscriber cleans up connections on shutdown:

```typescript
import { cleanupNostrSubscriptions } from '@/lib/nostr-subscriber';

process.on('SIGTERM', () => {
  cleanupNostrSubscriptions();
  process.exit(0);
});
```

## Testing

1. Start the server
2. Initialize the subscriber
3. Create a test profile
4. Update the profile (sends NOSTR event)
5. Check the debug panel for logged events
6. Verify `DATA_DIR/badges/:serial/nostr_log.jsonl` contains the event

## Security Notes

- The debug panel with NOSTR events is **only shown on localhost**
- The API endpoint `/api/nostr-events/*` **only works in development mode**
- Production deployments will not expose event logs via API
- Serial numbers are never sent to the client in production
