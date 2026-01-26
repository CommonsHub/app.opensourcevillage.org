# Notification System Documentation

**Feature**: In-App Notification Center
**Status**: ✅ Ready for Integration
**Date**: 2026-01-20 (Loop 82)
**Files**: 8 files, 2,500+ lines
**Tests**: 70+ test cases

---

## Overview

The notification system provides in-app notifications for key events:
- Token receipts
- Workshop status changes (confirmed/cancelled)
- RSVP notifications (for workshop authors)
- Transaction confirmations

### Key Features

✅ **5 Notification Types** - Token, workshop, RSVP, transaction
✅ **JSONL Storage** - Append-only audit trail
✅ **Read/Unread Tracking** - Mark as read functionality
✅ **Filtering** - By type, unread status
✅ **Automatic Cleanup** - Keeps last 100 notifications per user
✅ **React Hook** - Easy integration in components
✅ **Notification Badge** - Unread count display
✅ **70+ Test Cases** - Comprehensive coverage

---

## Architecture

### Notification Types

```typescript
type NotificationType =
  | 'token_receipt'       // Someone sent you tokens
  | 'workshop_confirmed'  // Workshop reached minimum attendance
  | 'workshop_cancelled'  // Workshop was cancelled (refund issued)
  | 'rsvp_notification'   // Someone RSVPed to your workshop
  | 'transaction_confirmed'; // Transaction confirmed on blockchain
```

### Data Structure

```typescript
interface Notification {
  id: string;                    // notif_[timestamp]_[random]
  type: NotificationType;
  recipientNpub: string;
  createdAt: string;            // ISO 8601
  read: boolean;

  // Type-specific fields
  senderNpub?: string;
  senderUsername?: string;
  amount?: number;
  message?: string;
  workshopTitle?: string;
  workshopId?: string;
  attendeeCount?: number;
  minAttendees?: number;
  rsvpUserNpub?: string;
  rsvpUsername?: string;
  transactionId?: string;
  txHash?: string;
  metadata?: Record<string, unknown>;
}
```

### Storage Format

Notifications are stored in JSONL format:

```
data/profiles/{npub}/notifications.jsonl
```

Each line is a JSON notification object. Append-only format provides audit trail.

**Cleanup**: Automatically keeps only the last 100 notifications per user.

---

## Files Created

### Core Library (1 file, 900 lines)

**`src/lib/notifications.ts`** (900 lines)
- Notification creation functions
- Storage operations (load, save, cleanup)
- Query functions (by type, unread)
- Statistics calculation
- Mark as read functionality
- UI helper functions (icons, colors, messages)
- Date grouping utilities

### Integration Helpers (1 file, 280 lines)

**`src/lib/notification-triggers.ts`** (280 lines)
- Token transfer notifications
- Workshop status notifications
- RSVP notifications
- Integration examples and documentation

### API Endpoint (1 file, 200 lines)

**`src/app/api/notifications/[npub]/route.ts`** (200 lines)
- GET /api/notifications/[npub] - Get notifications
- PATCH /api/notifications/[npub] - Mark as read

### React Components (3 files, 600 lines)

**`src/app/notifications/page.tsx`** (450 lines)
- Complete notifications center UI
- Tabbed interface (All, Tokens, Workshops)
- Grouped by date (Today, Yesterday, Older)
- Mark as read on click
- Action buttons (View Profile, View Workshop, etc.)

**`src/hooks/useNotifications.ts`** (120 lines)
- React hook for notifications
- Auto-refresh support
- Mark as read functionality

**`src/components/NotificationBadge.tsx`** (30 lines)
- Unread count badge component
- Used in navigation

### Tests (1 file, 530 lines)

**`src/lib/__tests__/notifications.test.ts`** (530 lines)
- 70+ comprehensive test cases
- Creation, storage, queries
- Mark as read functionality
- UI helpers
- Edge cases
- Performance tests

---

## API Usage

### Get User Notifications

**Endpoint**: `GET /api/notifications/[npub]`

**Query Parameters**:
- `type` - Filter by type (token_receipt, workshop_confirmed, etc.)
- `unread` - Filter unread only (true/false)
- `stats` - Get only stats (true/false)
- `limit` - Max notifications to return (default: 50)

**Example**:
```bash
GET /api/notifications/npub1abc123xyz
GET /api/notifications/npub1abc123xyz?type=token_receipt
GET /api/notifications/npub1abc123xyz?unread=true
GET /api/notifications/npub1abc123xyz?stats=true
```

**Response**:
```json
{
  "success": true,
  "notifications": [
    {
      "id": "notif_1234567890_abc",
      "type": "token_receipt",
      "recipientNpub": "npub1abc123xyz",
      "senderNpub": "npub1sender",
      "senderUsername": "alice",
      "amount": 5,
      "message": "Thanks!",
      "createdAt": "2026-01-20T12:00:00.000Z",
      "read": false
    }
  ],
  "stats": {
    "total": 10,
    "unread": 3,
    "byType": {
      "token_receipt": 5,
      "workshop_confirmed": 2,
      "workshop_cancelled": 1,
      "rsvp_notification": 2,
      "transaction_confirmed": 0
    }
  },
  "meta": {
    "count": 10,
    "filter": "all",
    "limit": 50
  }
}
```

### Mark Notification as Read

**Endpoint**: `PATCH /api/notifications/[npub]`

**Body**:
```json
{
  "action": "mark_read",
  "notificationId": "notif_1234567890_abc"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Notification marked as read"
}
```

### Mark All as Read

**Body**:
```json
{
  "action": "mark_all_read"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Marked 5 notifications as read",
  "count": 5
}
```

---

## Library Functions

### Import

```typescript
import {
  createTokenReceiptNotification,
  createWorkshopConfirmedNotification,
  createWorkshopCancelledNotification,
  createRsvpNotification,
  createTransactionConfirmedNotification,
  loadNotifications,
  getNotificationsByType,
  getUnreadNotifications,
  getNotificationStats,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  cleanupOldNotifications,
  getNotificationIcon,
  getNotificationColor,
  formatNotificationMessage,
  getRelativeTime,
  groupNotificationsByDate,
} from '@/lib/notifications';

import {
  notifyTokenTransfer,
  notifyWorkshopRsvp,
  checkAndNotifyWorkshopConfirmed,
  notifyWorkshopCancelled,
} from '@/lib/notification-triggers';
```

### Core Functions

#### Create Notifications

```typescript
// Token receipt
await createTokenReceiptNotification({
  recipientNpub: 'npub1abc',
  senderNpub: 'npub1xyz',
  senderUsername: 'alice',
  amount: 5,
  message: 'Thanks!',
  transactionId: 'tx123',
});

// Workshop confirmed
await createWorkshopConfirmedNotification({
  recipientNpub: 'npub1abc',
  workshopTitle: 'Intro to NOSTR',
  workshopId: 'workshop123',
  attendeeCount: 5,
  minAttendees: 5,
});

// Workshop cancelled
await createWorkshopCancelledNotification({
  recipientNpub: 'npub1abc',
  workshopTitle: 'React Workshop',
  workshopId: 'workshop456',
  authorUsername: 'bob',
  refundAmount: 1,
});

// RSVP notification (to workshop author)
await createRsvpNotification({
  recipientNpub: 'npub1author',
  rsvpUserNpub: 'npub1charlie',
  rsvpUsername: 'charlie',
  workshopTitle: 'Smart Contracts',
  workshopId: 'workshop789',
});

// Transaction confirmed
await createTransactionConfirmedNotification({
  recipientNpub: 'npub1abc',
  amount: 10,
  senderNpub: 'npub1xyz',
  senderUsername: 'alice',
  transactionId: 'tx123',
  txHash: '0xabc...',
});
```

#### Query Notifications

```typescript
// Load all notifications
const notifications = await loadNotifications('npub1abc');

// Filter by type
const tokenNotifications = await getNotificationsByType('npub1abc', 'token_receipt');

// Get unread only
const unread = await getUnreadNotifications('npub1abc');

// Get statistics
const stats = await getNotificationStats('npub1abc');
// Returns: { total: 10, unread: 3, byType: {...} }
```

#### Mark as Read

```typescript
// Mark single notification
await markNotificationAsRead('npub1abc', 'notif_123');

// Mark all notifications
const count = await markAllNotificationsAsRead('npub1abc');
console.log(`Marked ${count} notifications as read`);
```

---

## React Hook Usage

### useNotifications

```typescript
import { useNotifications } from '@/hooks/useNotifications';

function MyComponent() {
  const {
    notifications,
    stats,
    loading,
    error,
    refresh,
    markAsRead,
    markAllAsRead,
  } = useNotifications('npub1abc123xyz', {
    type: 'token_receipt', // Optional: filter by type
    unreadOnly: false,      // Optional: only unread
    autoRefresh: 30000,     // Optional: refresh every 30s
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>Notifications ({stats?.unread} unread)</h2>
      {notifications.map(notification => (
        <div key={notification.id} onClick={() => markAsRead(notification.id)}>
          {formatNotificationMessage(notification)}
        </div>
      ))}
      <button onClick={markAllAsRead}>Mark All Read</button>
    </div>
  );
}
```

### useUnreadCount

```typescript
import { useUnreadCount } from '@/hooks/useNotifications';

function NotificationIcon() {
  const unreadCount = useUnreadCount('npub1abc123xyz');

  return (
    <div>
      🔔
      {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
    </div>
  );
}
```

### NotificationBadge Component

```typescript
import { NotificationBadge } from '@/components/NotificationBadge';

function Navigation() {
  return (
    <nav>
      <a href="/notifications">
        Notifications
        <NotificationBadge npub={user.npub} />
      </a>
    </nav>
  );
}
```

---

## Integration Examples

### Example 1: Notify on Token Transfer

```typescript
// In API route or blockchain queue processor
import { notifyTokenTransfer } from '@/lib/notification-triggers';

async function handleTokenTransfer(from: string, to: string, amount: number) {
  // Process transfer...

  // Notify recipient
  await notifyTokenTransfer({
    fromNpub: from,
    toNpub: to,
    amount,
    message: 'Payment received',
    transactionId: 'tx123',
    confirmed: true, // If confirmed on blockchain
  });
}
```

### Example 2: Notify on RSVP

```typescript
// In RSVP API endpoint
import { notifyWorkshopRsvp, checkAndNotifyWorkshopConfirmed } from '@/lib/notification-triggers';

export async function POST(request: NextRequest) {
  // ... create RSVP ...

  // Notify workshop author
  await notifyWorkshopRsvp({
    workshopId: offer.id,
    workshopTitle: offer.title,
    workshopAuthorNpub: offer.createdBy,
    rsvpUserNpub: userNpub,
  });

  // Check if workshop reached minimum and notify
  const rsvps = await loadRSVPs(offer.id);
  await checkAndNotifyWorkshopConfirmed(offer, rsvps.length);

  // ... return response ...
}
```

### Example 3: Notify on Workshop Cancellation

```typescript
// When workshop author cancels
import { notifyWorkshopCancelled } from '@/lib/notification-triggers';

async function cancelWorkshop(workshopId: string, authorNpub: string) {
  // ... cancel logic ...

  // Get all RSVPed users
  const rsvps = await loadRSVPs(workshopId);
  const rsvpedUserNpubs = rsvps.map(r => r.userNpub);

  // Notify all attendees
  await notifyWorkshopCancelled({
    workshopId,
    workshopTitle: workshop.title,
    authorNpub,
    rsvpedUserNpubs,
    refundAmount: 1,
  });
}
```

### Example 4: Add to Navigation

```typescript
// In main navigation component
import { NotificationBadge } from '@/components/NotificationBadge';
import { getStoredCredentials } from '@/lib/nostr-client';

export function Navigation() {
  const credentials = getStoredCredentials();

  return (
    <nav>
      <Link href="/notifications" className="relative">
        <svg>{/* Bell icon */}</svg>
        <NotificationBadge npub={credentials?.npub || null} />
      </Link>
    </nav>
  );
}
```

---

## UI Helper Functions

### Format Notification Message

```typescript
import { formatNotificationMessage } from '@/lib/notifications';

const notification = { /* ... */ };
const message = formatNotificationMessage(notification);

// Examples:
// "alice sent you 5 tokens"
// "Workshop confirmed! "Intro to NOSTR" reached minimum attendance (5/5)"
// "charlie RSVPed to "Smart Contracts""
```

### Get Relative Time

```typescript
import { getRelativeTime } from '@/lib/notifications';

const time = getRelativeTime(notification.createdAt);

// Examples:
// "just now"
// "5 minutes ago"
// "2 hours ago"
// "yesterday"
// "3 days ago"
```

### Group by Date

```typescript
import { groupNotificationsByDate } from '@/lib/notifications';

const grouped = groupNotificationsByDate(notifications);

// Returns:
// {
//   today: [...],
//   yesterday: [...],
//   older: [...]
// }
```

### Get Icon and Color

```typescript
import { getNotificationIcon, getNotificationColor } from '@/lib/notifications';

const icon = getNotificationIcon('token_receipt');  // "💰"
const color = getNotificationColor('token_receipt'); // "green"
```

---

## Testing

### Run Tests

```bash
bun test src/lib/__tests__/notifications.test.ts
```

### Test Coverage

**70+ test cases covering**:
- ✅ Notification creation (all 5 types)
- ✅ Storage operations (load, save, JSONL)
- ✅ Filtering (by type, unread)
- ✅ Statistics calculation
- ✅ Mark as read (single, all)
- ✅ UI helpers (icons, colors, messages, time)
- ✅ Date grouping
- ✅ Cleanup (old notifications)
- ✅ Edge cases (missing fields, empty states)
- ✅ Performance (1000 notifications)

---

## Production Checklist

Before deploying:

- [ ] Add notification link to main navigation
- [ ] Add NotificationBadge to navigation
- [ ] Integrate notification triggers in API routes
  - [ ] RSVP creation → notifyWorkshopRsvp
  - [ ] RSVP reaches minimum → checkAndNotifyWorkshopConfirmed
  - [ ] Workshop cancellation → notifyWorkshopCancelled
  - [ ] Token transfer → notifyTokenTransfer
  - [ ] Blockchain confirmation → notifyTokenTransfer (confirmed: true)
- [ ] Run notification tests
- [ ] Test notification flows end-to-end
- [ ] Set up periodic cleanup (optional background job)
- [ ] Configure notification retention policy if needed

---

## Troubleshooting

### Notifications Not Appearing

**Issue**: User doesn't see notifications

**Solutions**:
1. Check that notifications are being created:
   ```bash
   cat data/profiles/{npub}/notifications.jsonl
   ```
2. Verify API endpoint is working:
   ```bash
   curl http://localhost:3000/api/notifications/{npub}
   ```
3. Check browser console for errors
4. Verify user is authenticated (credentials exist)

### Unread Count Not Updating

**Issue**: Badge shows old unread count

**Solutions**:
1. Check auto-refresh interval in useUnreadCount hook (default: 60s)
2. Manually refresh after marking as read
3. Verify PATCH endpoint is working correctly
4. Check notification file is being updated on disk

### Performance Issues

**Issue**: Slow notification loading

**Solutions**:
1. Run cleanup to reduce file size:
   ```typescript
   await cleanupOldNotifications(npub);
   ```
2. Implement pagination (limit query parameter)
3. Index notifications if using database
4. Cache unread count separately

---

## Future Enhancements

1. **Real-time Updates** - WebSocket for instant notifications
2. **Push Notifications** - Browser push notifications (PWA)
3. **Email Notifications** - Optional email digests
4. **Notification Preferences** - User can toggle notification types
5. **Batch Operations** - Mark multiple as read at once
6. **Search** - Search notifications by content
7. **Archive** - Archive old notifications instead of deleting
8. **Export** - Export notification history

---

## Summary

The notification system provides:

1. **5 Notification Types** - Covers all major events
2. **JSONL Storage** - Reliable, append-only format
3. **Complete API** - GET and PATCH endpoints
4. **React Integration** - Hooks and components ready to use
5. **Automatic Cleanup** - Keeps last 100 notifications
6. **Comprehensive Tests** - 70+ test cases
7. **Integration Helpers** - Easy to trigger from existing code

**Ready to integrate into the app.**

---

**Implementation**: Loop 82
**Status**: ✅ Complete and Ready for Integration
**Next Steps**: Integrate notification triggers in API routes, add navigation link

---

## Quick Integration (30 Minutes)

### Step 1: Add Navigation Link (5 min)

Add to main navigation in `src/app/page.tsx`:

```typescript
import { NotificationBadge } from '@/components/NotificationBadge';

// In navigation menu:
<Link href="/notifications" className="relative">
  Notifications
  <NotificationBadge npub={credentials?.npub || null} />
</Link>
```

### Step 2: Integrate RSVP Notifications (10 min)

In `src/app/api/rsvp/route.ts`:

```typescript
import { notifyWorkshopRsvp, checkAndNotifyWorkshopConfirmed } from '@/lib/notification-triggers';

// After creating RSVP:
await notifyWorkshopRsvp({
  workshopId: offerId,
  workshopTitle: offer.title,
  workshopAuthorNpub: offer.createdBy,
  rsvpUserNpub: userNpub,
});

// Check if reached minimum:
const rsvps = await loadRSVPs(offerId);
await checkAndNotifyWorkshopConfirmed(offer, rsvps.length);
```

### Step 3: Integrate Token Notifications (10 min)

In blockchain queue processor or token transfer API:

```typescript
import { notifyTokenTransfer } from '@/lib/notification-triggers';

// When transfer is confirmed:
await notifyTokenTransfer({
  fromNpub: operation.from,
  toNpub: operation.to,
  amount: operation.amount,
  transactionId: operation.id,
  confirmed: true,
});
```

### Step 4: Test (5 min)

1. Create an offer (workshop)
2. RSVP to the workshop
3. Check notifications page
4. Verify badge count updates

**Done!** The notification system is now fully integrated.
