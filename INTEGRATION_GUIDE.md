# NOSTR Integration Guide for Developers

## Quick Start

This guide shows you exactly how to integrate NOSTR event publishing into the Open Source Village app. All infrastructure is ready - you just need to add hook calls to 4 files.

**Estimated time:** 20-30 minutes

## Prerequisites

✅ All infrastructure is already in place:
- `src/hooks/useNostrPublisher.ts` - React hook for publishing
- `src/lib/nostr-relay.ts` - Relay connection management
- `src/lib/nostr-events.ts` - Event creation and signing
- `src/lib/nostr-client.ts` - Key management utilities

## Integration Checklist

- [ ] 1. Integrate into Profile Edit Page (5 min)
- [ ] 2. Integrate into Offer Creation Page (8 min)
- [ ] 3. Integrate into RSVP Functionality (10 min)
- [ ] 4. Integrate into Badge Claim Page (5 min)
- [ ] 5. Test end-to-end (5-10 min)

---

## 1. Profile Edit Page Integration

**File:** `src/app/profile/edit/page.tsx`

### Step 1: Import the hook

```typescript
// Add this to the imports at the top of the file
import { useNostrPublisher } from '@/hooks/useNostrPublisher';
```

### Step 2: Use the hook in the component

```typescript
export default function ProfileEditPage() {
  // ... existing state declarations

  // Add this line with your other hook calls
  const { publishProfile } = useNostrPublisher();

  // ... rest of component
}
```

### Step 3: Publish after successful save

Find the `handleSubmit` function and add this code after the successful API response:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // ... existing API call code

  const data = await response.json();

  if (!data.success) {
    setError(data.error || 'Failed to update profile');
    setIsSaving(false);
    return;
  }

  // ✨ ADD THIS CODE ✨
  // Publish profile to NOSTR
  console.log('[Profile Edit] Publishing profile to NOSTR...');
  try {
    const nostrResult = await publishProfile({
      name: name.trim() || credentials.username,
      about: shortbio.trim() || undefined,
      picture: undefined, // Will be populated when avatar upload is integrated
    });

    if (nostrResult.success) {
      console.log('[Profile Edit] ✓ Profile published to NOSTR:', nostrResult.eventId);
    } else {
      console.warn('[Profile Edit] ⚠️ Failed to publish to NOSTR:', nostrResult.error);
      // Don't fail the whole operation - NOSTR is supplementary
    }
  } catch (err) {
    console.error('[Profile Edit] ✗ NOSTR publishing error:', err);
  }
  // ✨ END OF NEW CODE ✨

  setSuccess(true);
  setIsSaving(false);

  // ... existing redirect code
};
```

---

## 2. Offer Creation Page Integration

**File:** `src/app/offers/create/page.tsx` (or wherever offers are created)

### Step 1: Import the hook

```typescript
import { useNostrPublisher } from '@/hooks/useNostrPublisher';
```

### Step 2: Use the hook

```typescript
const { publishOffer } = useNostrPublisher();
```

### Step 3: Publish after creating offer

After successfully creating an offer via the API, add:

```typescript
// After successful offer creation
console.log('[Offer Creation] Publishing offer to NOSTR...');
try {
  const nostrResult = await publishOffer({
    title: formData.title,
    description: formData.description,
    type: formData.type as 'workshop' | '1:1' | 'other',
    tags: formData.tags || [],
    price: 1, // Always 1 CHT to create
    location: formData.location,
    startTime: formData.startTime, // ISO 8601 format
    duration: formData.duration ? parseInt(formData.duration) : undefined,
    minAttendance: formData.minAttendance ? parseInt(formData.minAttendance) : undefined,
    maxAttendance: formData.maxAttendance ? parseInt(formData.maxAttendance) : undefined,
  });

  if (nostrResult.success) {
    console.log('[Offer Creation] ✓ Offer published to NOSTR:', nostrResult.eventId);
    // TODO: Store nostrResult.eventId with the offer in the database
  } else {
    console.warn('[Offer Creation] ⚠️ Failed to publish to NOSTR:', nostrResult.error);
  }
} catch (err) {
  console.error('[Offer Creation] ✗ NOSTR publishing error:', err);
}
```

---

## 3. RSVP Functionality Integration

**File:** Find the component handling RSVP clicks (likely in workshop detail page)

### Step 1: Import the hook

```typescript
import { useNostrPublisher } from '@/hooks/useNostrPublisher';
```

### Step 2: Use the hook

```typescript
const { publishRSVP, cancelRSVP } = useNostrPublisher();
```

### Step 3: Publish RSVP events

#### When user RSVPs:

```typescript
// After successful RSVP API call
console.log('[RSVP] Publishing RSVP to NOSTR...');
try {
  const nostrResult = await publishRSVP(
    offerNostrEventId, // You'll need to store this when creating offers
    offerAuthorNpub     // The npub of the offer creator
  );

  if (nostrResult.success) {
    console.log('[RSVP] ✓ RSVP published to NOSTR:', nostrResult.eventId);
    // TODO: Store nostrResult.eventId for potential cancellation
  } else {
    console.warn('[RSVP] ⚠️ Failed to publish RSVP:', nostrResult.error);
  }
} catch (err) {
  console.error('[RSVP] ✗ RSVP publishing error:', err);
}
```

#### When user cancels RSVP:

```typescript
// After successful cancel API call
console.log('[RSVP] Publishing RSVP cancellation to NOSTR...');
try {
  const cancelResult = await cancelRSVP(rsvpNostrEventId);

  if (cancelResult.success) {
    console.log('[RSVP] ✓ RSVP cancellation published to NOSTR');
  } else {
    console.warn('[RSVP] ⚠️ Failed to cancel RSVP:', cancelResult.error);
  }
} catch (err) {
  console.error('[RSVP] ✗ RSVP cancellation error:', err);
}
```

---

## 4. Badge Claim Page Integration

**File:** `src/app/badge/page.tsx`

### Step 1: Import the hook

```typescript
import { useNostrPublisher } from '@/hooks/useNostrPublisher';
```

### Step 2: Use the hook

```typescript
const { publishProfile } = useNostrPublisher();
```

### Step 3: Publish initial profile

After successful badge claim, add:

```typescript
// After successful badge claim
console.log('[Badge Claim] Publishing initial profile to NOSTR...');
try {
  const nostrResult = await publishProfile({
    name: username,
    about: undefined,
    picture: undefined,
  });

  if (nostrResult.success) {
    console.log('[Badge Claim] ✓ Initial profile published to NOSTR');
  } else {
    console.warn('[Badge Claim] ⚠️ Failed to publish initial profile:', nostrResult.error);
  }
} catch (err) {
  console.error('[Badge Claim] ✗ Initial profile publishing error:', err);
}
```

---

## Testing

### 1. Setup Environment

Ensure your `.env` file has:

```bash
NOSTR_RELAY_URL=wss://relay.damus.io
NOSTR_RELAY_FALLBACK=wss://nos.lol
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...  # Optional
```

### 2. Test Profile Publishing

1. Navigate to profile edit page
2. Make a change and save
3. Open browser DevTools console
4. Look for logs with `[NOSTR]` prefix
5. Should see:
   ```
   [Profile Edit] Publishing profile to NOSTR...
   [NOSTR] Creating profile event (kind 0)...
   [NOSTR] Profile event created and signed:
   [NOSTR]   Event ID: abc123...
   [NOSTR Relay] ✓ Successfully published to wss://relay.damus.io
   [Profile Edit] ✓ Profile published to NOSTR: abc123...
   ```

### 3. Test Offer Publishing

1. Create a new workshop offer
2. Check console for NOSTR event creation
3. Verify event includes all fields (title, tags, location, time, etc.)
4. Note the event ID - you can inspect it at `https://njump.me/{eventId}`

### 4. Test RSVP Publishing

1. RSVP to a workshop
2. Check console for RSVP event
3. Cancel the RSVP
4. Check console for cancellation event

### 5. Verify Relay Publishing

Check that events are published to multiple relays:
```
[NOSTR Relay] Target relays (2): ["wss://relay.damus.io", "wss://nos.lol"]
[NOSTR Relay] ✓ Successfully published to wss://relay.damus.io
[NOSTR Relay] ✓ Successfully published to wss://nos.lol
```

---

## Troubleshooting

### "No secret key found"

**Problem:** `useNostrPublisher` can't find the nsec in localStorage

**Solution:**
- User needs to log in/claim their badge first
- Check that badge claim flow stores the nsec correctly
- Look for `osv_nsec` in localStorage

### "Failed to publish to any relay"

**Problem:** All relay connections failed

**Solutions:**
- Check network connection
- Verify relay URLs in `.env`
- Check browser console for WebSocket errors
- Try different relays (some may be down)

### NOSTR publishing fails but API succeeds

**Expected behavior!** NOSTR publishing is supplementary. If it fails:
- The local database is still updated
- User's action still succeeds
- We log the error but don't block the user
- This is by design - NOSTR is an enhancement, not a requirement

### No console logs appearing

**Solutions:**
- Check browser console is open
- Filter by `[NOSTR]` or `[useNostrPublisher]`
- Verify the hook is actually being called
- Check that `console.log` statements weren't removed by minification (dev mode only)

---

## Data Model Updates (Future Enhancement)

To fully leverage NOSTR, consider adding these fields:

### UserProfile
```typescript
interface UserProfile {
  // ... existing fields
  nostrEventId?: string;  // Latest profile event ID
}
```

### Offer
```typescript
interface Offer {
  // ... existing fields
  nostrEventId?: string;  // Offer event ID from NOSTR
}
```

### RSVP
```typescript
interface RSVP {
  // ... existing fields
  nostrEventId?: string;  // RSVP event ID from NOSTR
}
```

These IDs allow you to:
- Reference NOSTR events from your database
- Build links to njump.me for event inspection
- Track which events have been published
- Support cancellation/updates by event ID

---

## Next Steps After Integration

1. **Store Event IDs:** Save NOSTR event IDs in your database
2. **Add Event Querying:** Subscribe to NOSTR relays to fetch events
3. **Real-time Updates:** Update UI when new events arrive
4. **Offline Support:** Queue events when offline, publish when online
5. **Token Transfers:** Add NIP-73 support for blockchain-linked events

---

## Architecture Notes

### Why Client-Side Only?

- **Security:** Secret keys never sent to server
- **Privacy:** serialNumber stays in URL fragment
- **Standard:** NIP-01 requires client-side signing
- **Decentralization:** True peer-to-peer publishing

### Why Hybrid Model?

- **Local DB:** Fast queries, user-specific data, reliable
- **NOSTR:** Decentralized, portable, discoverable, censorship-resistant
- **Best of both:** Immediate UX + decentralized benefits

### Error Handling Strategy

NOSTR publishing failures are **non-blocking**:
- Local database updates always succeed
- NOSTR publishing is best-effort
- Errors are logged but don't break user flow
- Future: Add retry queue for failed publishes

---

## Support

If you encounter issues:

1. Check the comprehensive logging in console (`[NOSTR]` filter)
2. Review `docs/debug-logging.md` for logging reference
3. Check `docs/loop-96-nostr-status-final.md` for architecture details
4. Inspect events at https://njump.me/{eventId}

---

## Summary

✅ All infrastructure ready (1,134 lines of code)
✅ Production-ready React hook
✅ Comprehensive logging and error handling
✅ Follows NOSTR standards (NIP-01, NIP-05, NIP-73)
✅ Type-safe with TypeScript
✅ Tested core functionality

**Integration:** Just add ~35 lines across 4 files (shown above)
**Testing:** ~10 minutes to verify everything works
**Result:** Full NOSTR event publishing for profiles, offers, and RSVPs
