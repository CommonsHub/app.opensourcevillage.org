# Debug Logging Reference

This document describes all the console.log debug output added to the application to help with development and troubleshooting.

## Overview

All debug logs are prefixed with a component identifier in square brackets, making it easy to filter in the browser console. For example:
- `[NOSTR]` - NOSTR client operations
- `[NOSTR Relay]` - Relay connection and messaging
- `[API /env/check]` - Environment variable checking
- `[EnvSetup]` - Environment setup component

## Environment Setup Logging

### EnvSetup Component (`src/components/EnvSetup.tsx`)

Logs environment variable verification and form submission:

```
[EnvSetup] Checking environment variables...
[EnvSetup] Environment check result: {missing: [], ...}
[EnvSetup] Missing required variables: ["NOSTR_RELAY_URL"]
[EnvSetup] Saving environment variables: ["NOSTR_RELAY_URL", ...]
[EnvSetup] Environment variables saved successfully
[EnvSetup] Reloading page to apply new environment variables
```

### Environment Check API (`src/app/api/env/check/route.ts`)

Logs server-side environment variable checks:

```
[API /env/check] Checking environment variables...
[API /env/check] Found required variable: NOSTR_RELAY_URL
[API /env/check] Missing required variable: NOSTR_RELAY_URL
[API /env/check] Found optional variable: DISCORD_WEBHOOK_URL
[API /env/check] Result: {missing: [], configured: [...], allSet: true}
```

### Environment Save API (`src/app/api/env/save/route.ts`)

Logs saving environment variables to .env file:

```
[API /env/save] Received request to save environment variables
[API /env/save] Variables to save: ["NOSTR_RELAY_URL", ...]
[API /env/save] Adding NOSTR_RELAY_URL to .env
[API /env/save] Found existing .env file, merging...
[API /env/save] Successfully merged and saved .env file
[API /env/save] Error saving environment variables: <error>
```

## NOSTR Client Logging

### Keypair Derivation (`src/lib/nostr-client.ts`)

Logs keypair generation from serialNumber and password:

```
[NOSTR] Deriving keypair from serialNumber and password...
[NOSTR] SerialNumber: ABC123
[NOSTR] Generated keypair:
[NOSTR]   npub: npub1abc...xyz
[NOSTR]   nsec: nsec1abc...xyz (truncated for security)
[NOSTR]   publicKey: 0123456789abcdef...
```

### Credential Storage (`src/lib/nostr-client.ts`)

Logs localStorage operations:

```
[NOSTR] Storing credentials in localStorage:
[NOSTR]   username: alice
[NOSTR]   npub: npub1abc...
[NOSTR] Credentials stored successfully

[NOSTR] Retrieving stored credentials from localStorage...
[NOSTR] Found credentials:
[NOSTR]   username: alice
[NOSTR]   npub: npub1abc...
[NOSTR] No credentials found in localStorage

[NOSTR] Clearing credentials from localStorage
[NOSTR] Credentials cleared
```

### Serial Number Extraction (`src/lib/nostr-client.ts`)

Logs URL fragment parsing:

```
[NOSTR] Extracted serialNumber from URL fragment: ABC123
[NOSTR] No serialNumber found in URL fragment
```

## NOSTR Events Logging

### Profile Events (`src/lib/nostr-events.ts`)

Logs profile event creation and signing:

```
[NOSTR] Creating profile event (kind 0)...
[NOSTR] Profile data: {name: "Alice", about: "..."}
[NOSTR] Profile event created and signed:
[NOSTR]   Event ID: abc123...
[NOSTR]   Created at: 2026-01-20T12:00:00.000Z
[NOSTR]   Signature: 0123456789abcdef...
```

### Offer Events (`src/lib/nostr-events.ts`)

Logs offer/workshop event creation:

```
[NOSTR] Creating offer event (kind 1)...
[NOSTR] Offer data: {title: "...", type: "workshop", tags: [...]}
[NOSTR] Offer event created and signed:
[NOSTR]   Event ID: def456...
[NOSTR]   Created at: 2026-01-20T12:00:00.000Z
[NOSTR]   Tags: 8
[NOSTR]   Signature: fedcba987654...
```

### RSVP Events (`src/lib/nostr-events.ts`)

Logs RSVP creation:

```
[NOSTR] Creating RSVP event (kind 7)...
[NOSTR] RSVP data: {offerEventId: "abc...", authorNpub: "npub1..."}
[NOSTR] RSVP event created and signed:
[NOSTR]   Event ID: ghi789...
[NOSTR]   Created at: 2026-01-20T12:00:00.000Z
[NOSTR]   Signature: 123456...
```

### Secret Key Storage (`src/lib/nostr-events.ts`)

Logs nsec storage and retrieval:

```
[NOSTR] Storing nsec in localStorage...
[NOSTR]   nsec: nsec1abc...xyz (truncated)
[NOSTR] nsec stored successfully

[NOSTR] Retrieving stored nsec from localStorage...
[NOSTR] Found stored nsec: nsec1abc...xyz (truncated)
[NOSTR] No stored nsec found
```

## NOSTR Relay Logging

### Relay Connection (`src/lib/nostr-relay.ts`)

Logs WebSocket connection lifecycle:

```
[NOSTR Relay] Connecting to relay: wss://relay.damus.io
[NOSTR Relay] ✓ Connected to wss://relay.damus.io
[NOSTR Relay] ✗ Connection error for wss://relay.damus.io: <error>
[NOSTR Relay] Connection closed for wss://relay.damus.io: {code: 1000, reason: "", wasClean: true}
[NOSTR Relay] Attempting reconnection (1/3) in 2000ms...
[NOSTR Relay] Connection timeout for wss://relay.damus.io
```

### Relay Messages (`src/lib/nostr-relay.ts`)

Logs incoming messages from relays:

```
[NOSTR Relay] Message from wss://relay.damus.io: ["OK", "abc123...", true]
[NOSTR Relay] Received EVENT from wss://relay.damus.io: {id: "...", kind: 1}
[NOSTR Relay] Received OK from wss://relay.damus.io: {eventId: "...", accepted: true}
[NOSTR Relay] End of stored events (EOSE) from wss://relay.damus.io for subscription: sub_123
[NOSTR Relay] Notice from wss://relay.damus.io: "Rate limit exceeded"
```

### Event Publishing (`src/lib/nostr-relay.ts`)

Logs event publication to relays:

```
[NOSTR Relay] Publishing event abc123... to all relays...
[NOSTR Relay] Target relays (2): ["wss://relay.damus.io", "wss://nos.lol"]
[NOSTR Relay] Publishing event to wss://relay.damus.io...
[NOSTR Relay] Event ID: abc123...
[NOSTR Relay] Event kind: 1
[NOSTR Relay] Not connected to wss://relay.damus.io, connecting now...
[NOSTR Relay] Sending event to wss://relay.damus.io: {eventId: "...", kind: 1, messageSize: 1234}
[NOSTR Relay] ✓ Event sent to wss://relay.damus.io
[NOSTR Relay] ✓ Successfully published to wss://relay.damus.io
[NOSTR Relay] ✗ Failed to publish to wss://nos.lol: <error>
[NOSTR Relay] Publication summary: {total: 2, successful: 1, failed: 1}
```

### Subscriptions (`src/lib/nostr-relay.ts`)

Logs subscription management:

```
[NOSTR Relay] Subscribing to wss://relay.damus.io...
[NOSTR Relay] Filters: [{kinds: [1], authors: [...]}]
[NOSTR Relay] Subscribing with ID: sub_1234567890_abc
[NOSTR Relay] ✓ Subscription sent to wss://relay.damus.io
[NOSTR Relay] Received event for subscription sub_123: event_abc...
[NOSTR Relay] Unsubscribing sub_123 from wss://relay.damus.io...
[NOSTR Relay] ✓ Unsubscribe message sent for sub_123
```

### Status Checks (`src/lib/nostr-relay.ts`)

Logs relay status:

```
[NOSTR Relay] Current relay status: [{url: "wss://...", status: "connected"}, ...]
[NOSTR Relay] Disconnecting from wss://relay.damus.io...
[NOSTR Relay] ✓ Disconnected from wss://relay.damus.io
[NOSTR Relay] Disconnecting from all relays...
[NOSTR Relay] ✓ Disconnected from all relays
```

## Filtering Logs in Browser Console

You can filter logs in the browser console using these patterns:

### View all NOSTR-related logs:
```javascript
// In browser console, use the filter box:
[NOSTR
```

### View only relay connection logs:
```javascript
[NOSTR Relay]
```

### View only environment setup logs:
```javascript
[EnvSetup]
```

### View only API logs:
```javascript
[API /
```

### View errors only:
```javascript
✗
```

### View successes only:
```javascript
✓
```

## Production Considerations

These debug logs are currently always enabled. For production:

1. **Option 1**: Wrap logs in environment check
   ```typescript
   if (process.env.NODE_ENV === 'development') {
     console.log('[NOSTR] ...');
   }
   ```

2. **Option 2**: Use a debug flag
   ```typescript
   const DEBUG = process.env.NEXT_PUBLIC_DEBUG === 'true';
   if (DEBUG) {
     console.log('[NOSTR] ...');
   }
   ```

3. **Option 3**: Use a proper logging library
   - Consider `pino`, `winston`, or `bunyan`
   - Allows log levels (debug, info, warn, error)
   - Can send logs to external services

## Troubleshooting with Logs

### Problem: "No credentials found"
Look for:
- `[NOSTR] No credentials found in localStorage`
- Check if setup was completed
- Check URL fragment for serialNumber

### Problem: "Failed to connect to relay"
Look for:
- `[NOSTR Relay] ✗ Connection error`
- Check network connection
- Verify relay URLs in .env
- Check browser console for CORS issues

### Problem: "Event not publishing"
Look for:
- `[NOSTR Relay] Publication summary` with failed count
- Check if relays are connected
- Verify event signature is valid
- Check relay-specific error messages

### Problem: "Environment variables not loaded"
Look for:
- `[API /env/check] Missing required variable`
- Verify .env file exists
- Restart development server after .env changes
- Check file permissions on .env
