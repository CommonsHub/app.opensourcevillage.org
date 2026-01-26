# NIP-86 Relay Management Integration

This document explains how the application uses NIP-86 to manage relay access control when users claim badges.

## Overview

[NIP-86](https://github.com/nostr-protocol/nips/blob/master/86.md) is a relay management API that allows relay operators to manage their relay through HTTP endpoints. We use it to automatically add new users to the relay's allowed list when they claim their badge.

## How It Works

When a user claims a badge, the system:

1. **Creates the user's profile**
2. **Marks the badge as claimed**
3. **Emits a payment request for initial tokens** (kind 9734)
4. **Adds user to NIP-29 group** (kind 9000)
5. **Adds user to relay's allowed list via NIP-86** ⭐
6. **Subscribes to the user's npub**

The NIP-86 step happens asynchronously and doesn't block the badge claim response. If it fails, the user can still use the application - they just might need manual approval on some relays.

## Implementation Details

### Authorization

NIP-86 uses NOSTR events for authorization. The server creates a kind 27235 auth event signed with the admin key:

```javascript
{
  kind: 27235,  // NIP-86 auth event
  created_at: <unix timestamp>,
  tags: [
    ['u', '<full-api-url>'],           // API endpoint URL
    ['method', 'POST'],                // HTTP method
  ],
  content: '<json-body>',              // Request body
  pubkey: '<admin-pubkey>',            // Admin's public key
  sig: '<signature>'                   // Signature
}
```

The event is base64-encoded and sent in the `Authorization` header:

```
Authorization: Nostr <base64-encoded-event>
```

### API Endpoint

```
POST https://nostr.commonshub.brussels/api/v1/nip86/users
Authorization: Nostr <auth-event>
Content-Type: application/json

{
  "pubkey": "<user-pubkey-hex>"
}
```

### Server Code

The integration is in `src/lib/nip86-client.ts`:

```typescript
import { addUserToAllRelays } from '@/lib/nip86-client';

// Add user to relay's allowed list (async, non-blocking)
addUserToAllRelays(npub).then((result) => {
  console.log('NIP-86 results:', {
    successful: result.successful.length,
    failed: result.failed.length,
  });
}).catch((err) => {
  console.error('NIP-86 failed:', err);
});
```

### Badge Claim API Integration

In `src/app/api/claim/route.ts`:

```typescript
// After creating profile and adding to group...

// Add user to relay's allowed list via NIP-86 (async, don't block response)
addUserToAllRelays(npub).then((result) => {
  console.log('[Claim API] NIP-86 add user results:', {
    npub: npub.substring(0, 16) + '...',
    successful: result.successful.length,
    failed: result.failed.length,
  });

  if (result.failed.length > 0) {
    console.warn('[Claim API] Some relays failed NIP-86 add user:', result.failed);
  }
}).catch((err) => {
  console.error('[Claim API] Failed to add user to relays via NIP-86:', err);
});

// Response is sent immediately, NIP-86 happens in background
return NextResponse.json({
  success: true,
  profile: profile.profile,
});
```

## Configuration

### Relay URLs

The system reads relay URLs from `settings.json`:

```json
{
  "nostrRelays": [
    "wss://nostr.commonshub.brussels",
    "wss://relay.damus.io",
    "wss://nos.lol"
  ]
}
```

The `addUserToAllRelays()` function automatically:
- Converts `wss://` to `https://` for API calls
- Attempts to add the user to each relay
- Returns success/failure results for each relay

### Required Environment Variable

```bash
NOSTR_NSEC=nsec1... # Admin's secret key for signing auth events
```

## Error Handling

### Relay Doesn't Support NIP-86

If a relay returns 404 or 501, the system logs a warning and continues:

```
[NIP-86] Relay does not support NIP-86, skipping
```

This is expected for public relays that don't use allowlists.

### Network Errors

Network errors are caught and logged but don't fail the badge claim:

```typescript
try {
  await addUserToRelay(relayUrl, npub);
} catch (error) {
  console.error('[NIP-86] Error:', error);
  return { success: false, error: error.message };
}
```

### Partial Success

The system reports which relays succeeded and which failed:

```javascript
{
  successful: ['wss://nostr.commonshub.brussels'],
  failed: [
    { url: 'wss://relay.damus.io', error: 'HTTP 404: Not found' },
    { url: 'wss://nos.lol', error: 'Network error' }
  ]
}
```

## Testing

Tests are in `src/lib/__tests__/badge.claim.test.ts`:

```bash
npm test -- src/lib/__tests__/badge.claim.test.ts
```

Test coverage includes:
- ✅ npub validation and pubkey extraction
- ✅ URL conversion (wss:// → https://)
- ✅ Error handling for invalid npubs
- ✅ Authorization event structure
- ✅ Base64 encoding
- ✅ Non-blocking behavior
- ✅ Configuration validation

## NIP-86 Endpoints Implemented

### Add User
```
POST /api/v1/nip86/users
Body: { "pubkey": "<hex>" }
```

Adds a user to the relay's allowed list.

### Remove User
```
DELETE /api/v1/nip86/users/<pubkey>
```

Removes a user from the relay's allowed list.

### Get Relay Info
```
GET /api/v1/nip86/info
```

Returns relay configuration and metadata.

## Security Considerations

1. **Admin Authorization**: Only the relay admin (with NOSTR_NSEC) can add/remove users
2. **Event Signing**: All requests are signed with the admin's key
3. **Timestamp Validation**: Auth events include timestamps to prevent replay attacks
4. **URL Verification**: The `u` tag in auth events must match the request URL

## Relay Setup

To enable NIP-86 on your relay, you need to:

1. Implement the NIP-86 API endpoints
2. Verify authorization events from the admin
3. Maintain an allowed users list
4. Reject connections from non-allowed users (if desired)

### Example Relay Configuration

For a relay like `nostr.commonshub.brussels`:

```yaml
# relay.yaml
nip86:
  enabled: true
  admin_pubkey: "73686fefefb002dc36b04d891d4b7153f5a5b449f0db43a776b22854c3023ff2"
  endpoints:
    - /api/v1/nip86/users
    - /api/v1/nip86/info
  allowed_users:
    - "73686fefefb002dc36b04d891d4b7153f5a5b449f0db43a776b22854c3023ff2"
    # ... more users added via API
```

## Monitoring

The system logs all NIP-86 operations:

```bash
# Successful addition
[NIP-86] Adding user to relay: { relayUrl: 'https://...', npub: 'npub1...' }
[NIP-86] User added successfully: { pubkey: '7368...' }

# Failed addition
[NIP-86] Failed to add user: { status: 404, error: 'Not found' }
[NIP-86] Relay does not support NIP-86, skipping

# Summary
[NIP-86] Add user summary: { successful: 1, failed: 2 }
```

## Future Enhancements

Potential improvements:
- Batch user additions for better performance
- Retry logic for transient failures
- User removal when badges are unclaimed
- Dashboard for monitoring relay allowlists
- Support for relay-specific policies

## References

- [NIP-86: Relay Management API](https://github.com/nostr-protocol/nips/blob/master/86.md)
- [NIP-01: Basic Protocol](https://github.com/nostr-protocol/nips/blob/master/01.md)
- [NIP-29: Relay-based Groups](https://github.com/nostr-protocol/nips/blob/master/29.md)

## Troubleshooting

### User can't connect to relay after claiming badge

1. Check if NIP-86 add was successful in logs
2. Verify relay supports NIP-86
3. Check relay's allowed users list
4. Try manual addition via relay admin panel

### NIP-86 requests failing

1. Verify NOSTR_NSEC is set correctly
2. Check relay URL is accessible (https://)
3. Ensure auth event is properly signed
4. Check relay logs for rejection reasons

### All relays failing

1. Check network connectivity
2. Verify relay URLs in settings.json
3. Ensure relays are running and accessible
4. Check if relays require NIP-86 or accept all users
