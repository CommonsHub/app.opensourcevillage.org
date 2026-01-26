# Discord Logging Implementation

**Feature**: Discord Webhook Logging for NOSTR Events
**Status**: ✅ Complete - Ready for Integration
**Date**: 2026-01-20 (Loop 85, corrected status)
**Spec**: specs/logging.md
**Files**: 3 files, 500+ lines

---

## Overview

Implemented Discord webhook logging as specified in specs/logging.md. All NOSTR events can now be logged to a Discord channel for monitoring, debugging, and transparency.

### Key Features

✅ **Discord Webhooks** - Send events to Discord channel
✅ **Rich Embeds** - Formatted messages with event details
✅ **njump.me Links** - View raw events in browser
✅ **Rate Limiting** - Respects Discord rate limits (25/min)
✅ **Batch Logging** - Efficient multi-event logging
✅ **Graceful Degradation** - Works without webhook configured
✅ **Unified Interface** - Combined file + Discord logging
✅ **Event Kind Formatting** - Human-readable kind names
✅ **Color Coding** - Different colors per event type
✅ **Comprehensive Tests** - 20+ test cases

---

## Architecture

### Logging Flow

```
NOSTR Event
    ↓
event-logger.ts (unified interface)
    ↓
    ├─→ nostr-logger.ts (file logging)
    │   └─→ DATA_DIR/badges/:serialNumber/log.jsonl
    │
    └─→ discord-logger.ts (webhook logging)
        └─→ Discord Channel 1429134429066100816
```

### Configuration

**Discord Guild**: 1418496180643696782
**Discord Channel**: 1429134429066100816

**Environment Variable**:
```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

If not set, Discord logging is skipped gracefully.

---

## Files Created

### Core Libraries (3 files, 500 lines)

**`src/lib/discord-logger.ts`** (250 lines)
- `logToDiscord()` - Send event to webhook
- `logToDiscordRateLimited()` - With rate limiting
- `logBatchToDiscord()` - Batch multiple events
- `getDiscordConfig()` - Get configuration
- Rich embed formatting
- Event kind name mapping
- Color coding per kind

**`src/lib/event-logger.ts`** (150 lines)
- `logEvent()` - Unified logging function
- `logEventBatch()` - Batch logging
- `createLogger()` - Logger instance for user
- `getLoggerFromRequest()` - Middleware helper
- Combines file + Discord logging

**`src/lib/__tests__/discord-logger.test.ts`** (200 lines)
- 20+ comprehensive test cases
- Webhook sending tests
- Rate limiting tests
- Batch logging tests
- Error handling tests
- Event kind formatting tests

---

## API Usage

### Basic Logging

```typescript
import { logEvent } from '@/lib/event-logger';

// Log a NOSTR event
await logEvent(serialNumber, event);

// Result: logged to file AND Discord (if configured)
```

### File Only

```typescript
import { logEvent } from '@/lib/event-logger';

await logEvent(serialNumber, event, {
  file: true,
  discord: false,
});
```

### Discord Only

```typescript
import { logEvent } from '@/lib/event-logger';

await logEvent(serialNumber, event, {
  file: false,
  discord: true,
});
```

### Batch Logging

```typescript
import { logEventBatch } from '@/lib/event-logger';

const events = [event1, event2, event3];
await logEventBatch(serialNumber, events);

// More efficient than logging individually
```

### Create Logger Instance

```typescript
import { createLogger } from '@/lib/event-logger';

const logger = createLogger(serialNumber);

// Log events
await logger.log(event1);
await logger.log(event2);

// Batch log
await logger.logBatch([event3, event4]);

// Read events
const allEvents = logger.readEvents();
```

### In API Routes

```typescript
import { getLoggerFromRequest } from '@/lib/event-logger';

export async function POST(request: NextRequest) {
  // Get logger from request context
  const logger = getLoggerFromRequest(request, serialNumber);

  // Create NOSTR event
  const event = createNostrEvent(...);

  // Log it
  await logger.log(event);

  return NextResponse.json({ success: true });
}
```

---

## Discord Message Format

### Rich Embed

Each NOSTR event logged to Discord includes:

**Title**: "New NOSTR Event: {Kind Name}"
**Description**: Event content (first 200 chars)
**Color**: Based on event kind
**Fields**:
- Event ID (with code formatting)
- Kind (number + name)
- Author (pubkey, truncated)
- Timestamp (ISO 8601)
- View Raw Event (njump.me link)
- Tags (if present)

**Footer**: "Open Source Village • NOSTR Event Logger"

### Example

```
New NOSTR Event: Metadata (Profile)
-----------------------------------
Event ID: abc123def456
Kind: 0 (Metadata (Profile))
Author: 1234567890abcdef...
Timestamp: 2026-01-20T12:34:56.789Z
View Raw Event: njump.me/abc123def456
Tags: e, p
```

### Color Coding

- **Blue** (0x5865f2) - Profile (kind 0)
- **Green** (0x57f287) - Text Note (kind 1)
- **Yellow** (0xfee75c) - Reaction (kind 7)
- **Pink** (0xeb459e) - Replaceable events (30000+)
- **Gray** (0x99aab5) - Other kinds

---

## Event Kind Names

The logger includes human-readable names for common event kinds:

| Kind | Name |
|------|------|
| 0 | Metadata (Profile) |
| 1 | Text Note |
| 2 | Recommend Relay |
| 3 | Contacts |
| 4 | Encrypted DM |
| 5 | Event Deletion |
| 7 | Reaction |
| 40 | Channel Creation |
| 41 | Channel Metadata |
| 42 | Channel Message |
| 9734 | Zap Request |
| 9735 | Zap |
| 30023 | Long-form Content |
| ... | ... |

Unknown kinds show as "Unknown (N)"

---

## Rate Limiting

### Discord Limits

Discord allows **30 requests per minute** per webhook.

### Our Implementation

- Uses **25 requests per minute** (buffer for safety)
- In-memory tracker of timestamps
- Sliding window algorithm
- Automatic rejection when limit reached

### Rate-Limited Logging

```typescript
import { logToDiscordRateLimited } from '@/lib/discord-logger';

// Automatically respects rate limits
const success = await logToDiscordRateLimited(event);

if (!success) {
  console.log('Rate limited or failed');
}
```

### Batch Logging

For high-volume scenarios, use batch logging:

```typescript
import { logBatchToDiscord } from '@/lib/discord-logger';

// Send 10 events in one webhook call
await logBatchToDiscord(events);
```

---

## Integration Steps

### 1. Set Webhook URL (5 min)

**Get webhook URL from Discord**:
1. Open Discord server
2. Go to Server Settings → Integrations → Webhooks
3. Create webhook for channel #1429134429066100816
4. Copy webhook URL

**Set environment variable**:
```bash
# .env or .env.local
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz
```

### 2. Add to Badge Claim (5 min)

In `src/app/api/claim/route.ts`:

```typescript
import { logEvent } from '@/lib/event-logger';

export async function POST(request: NextRequest) {
  // ... existing badge claim logic ...

  // Log kind 0 event
  await logEvent(serialNumber, profileEvent);

  return NextResponse.json({ success: true, ... });
}
```

### 3. Add to Profile Updates (5 min)

In `src/app/api/profile/[npub]/route.ts`:

```typescript
import { createLogger } from '@/lib/event-logger';

export async function PUT(request: NextRequest) {
  // Get logger for user
  const logger = createLogger(serialNumber);

  // ... update profile ...

  // Log kind 0 event
  await logger.log(updatedProfileEvent);

  return NextResponse.json({ success: true });
}
```

### 4. Add to Offers (5 min)

In `src/app/api/offers/route.ts`:

```typescript
import { logEvent } from '@/lib/event-logger';

export async function POST(request: NextRequest) {
  // ... create offer ...

  // Log kind 1 event
  await logEvent(serialNumber, offerEvent);

  return NextResponse.json({ success: true, ... });
}
```

### 5. Add to RSVPs (5 min)

In `src/app/api/rsvp/route.ts`:

```typescript
import { logEvent } from '@/lib/event-logger';

export async function POST(request: NextRequest) {
  // ... create RSVP ...

  // Log kind 7 reaction
  await logEvent(serialNumber, rsvpEvent);

  return NextResponse.json({ success: true, ... });
}
```

**Total Integration Time**: ~25 minutes

---

## Testing

### Run Tests

```bash
bun test src/lib/__tests__/discord-logger.test.ts
```

### Test Coverage

**20+ test cases covering**:
- ✅ Discord config retrieval
- ✅ Webhook sending
- ✅ Message formatting
- ✅ njump.me link inclusion
- ✅ Graceful degradation (no webhook)
- ✅ Error handling
- ✅ Rate limiting (25/min enforcement)
- ✅ Batch logging
- ✅ Event kind formatting
- ✅ Color coding

### Manual Testing

1. **Set webhook URL**:
   ```bash
   export DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
   ```

2. **Test logging**:
   ```typescript
   import { logToDiscord } from '@/lib/discord-logger';

   await logToDiscord({
     id: 'test123',
     pubkey: 'abc123...',
     created_at: Date.now() / 1000,
     kind: 1,
     tags: [],
     content: 'Test message',
     sig: 'sig123',
   });
   ```

3. **Check Discord channel** - Should see rich embed with event details

---

## Configuration

### Environment Variables

**Required for Discord logging**:
```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

**Optional**:
```bash
DATA_DIR=/path/to/data  # Default: ./data
```

### Discord Webhook Setup

1. Open Discord server (guild: 1418496180643696782)
2. Navigate to channel (1429134429066100816)
3. Go to channel settings → Integrations → Webhooks
4. Click "New Webhook"
5. Name: "NOSTR Event Logger"
6. Copy webhook URL
7. Set as DISCORD_WEBHOOK_URL environment variable

---

## Security Considerations

### Webhook URL

✅ Keep webhook URL secret (use environment variable)
✅ Don't commit to version control
✅ Rotate if exposed
✅ Limit webhook permissions in Discord

### Event Content

⚠️ Be aware: All logged events are visible in Discord channel
⚠️ Don't log sensitive data in event content
⚠️ Encrypted DMs (kind 4) should be logged with care

### Rate Limiting

✅ Built-in rate limiting prevents webhook abuse
✅ Discord won't ban webhook for exceeding limits
✅ Batch logging recommended for high volume

---

## Troubleshooting

### Events Not Appearing in Discord

**Issue**: logToDiscord returns false

**Solutions**:
1. Check DISCORD_WEBHOOK_URL is set:
   ```bash
   echo $DISCORD_WEBHOOK_URL
   ```
2. Verify webhook URL is correct (test with curl)
3. Check Discord webhook is not disabled
4. Review server logs for error messages

### Rate Limiting

**Issue**: Some events not logged to Discord

**Solutions**:
1. Check rate limit warnings in logs
2. Use batch logging for multiple events
3. Reduce logging frequency if needed
4. File logging continues to work regardless

### Webhook Errors

**Issue**: Discord returns 4xx/5xx errors

**Solutions**:
1. Check webhook URL is valid
2. Verify webhook hasn't been deleted
3. Check Discord server status
4. Review payload size (max 2000 chars for description)

---

## Future Enhancements

1. **Persistent Queue** - Queue failed Discord logs for retry
2. **Multiple Webhooks** - Different channels per event kind
3. **Filtering** - Only log certain kinds to Discord
4. **Aggregation** - Combine similar events in timeframe
5. **Threading** - Use Discord threads for batches
6. **Reactions** - Add emoji reactions based on event data

---

## Summary

The Discord logging feature provides:

1. **Webhook Integration** - Send NOSTR events to Discord
2. **Rich Formatting** - Embeds with colors and fields
3. **njump.me Links** - Easy event inspection
4. **Rate Limiting** - Respects Discord limits
5. **Batch Logging** - Efficient multi-event logging
6. **Unified Interface** - File + Discord in one call
7. **Graceful Degradation** - Works without webhook
8. **Comprehensive Tests** - 20+ test cases

**Ready for integration into API routes.**

---

**Implementation**: Loop 85 (corrected from premature completion signal)
**Status**: ✅ Complete and Ready for Integration
**Next Steps**: Set DISCORD_WEBHOOK_URL, add logEvent calls to API routes

---

## Quick Integration (25 Minutes)

### Step 1: Configure Webhook (5 min)
```bash
export DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### Step 2: Add to Badge Claim (5 min)
```typescript
import { logEvent } from '@/lib/event-logger';
await logEvent(serialNumber, profileEvent);
```

### Step 3: Add to Profile (5 min)
```typescript
await logEvent(serialNumber, updatedProfileEvent);
```

### Step 4: Add to Offers (5 min)
```typescript
await logEvent(serialNumber, offerEvent);
```

### Step 5: Add to RSVPs (5 min)
```typescript
await logEvent(serialNumber, rsvpEvent);
```

**Done!** All NOSTR events now logged to file + Discord.
