/**
 * Notification Triggers
 *
 * Helper functions to generate notifications when certain events occur.
 * These should be called from API routes and other business logic.
 *
 * Integration points:
 * - Token transfers → token_receipt notification
 * - Workshop RSVP reaches minimum → workshop_confirmed notification
 * - Workshop cancelled → workshop_cancelled notification
 * - RSVP created → rsvp_notification to workshop author
 * - Blockchain operation confirmed → transaction_confirmed notification
 */

import {
  createTokenReceiptNotification,
  createWorkshopConfirmedNotification,
  createWorkshopCancelledNotification,
  createRsvpNotification,
  createTransactionConfirmedNotification,
} from './notifications';
import { StorageProfile, Offer } from '@/types';
import { getProfileByNpub } from './storage';

// ============================================================================
// Token Transfer Notifications
// ============================================================================

/**
 * Send notification when tokens are transferred
 * Call this when a token transfer operation is queued or confirmed
 */
export async function notifyTokenTransfer(params: {
  fromNpub: string;
  toNpub: string;
  amount: number;
  message?: string;
  transactionId?: string;
  confirmed?: boolean; // If true, send as transaction_confirmed
}): Promise<void> {
  try {
    // Load sender profile to get username
    let senderUsername: string | undefined;
    try {
      const senderProfile = await getProfileByNpub(params.fromNpub);
      senderUsername = senderProfile?.username;
    } catch {
      // Profile doesn't exist, use npub
    }

    if (params.confirmed) {
      // Transaction confirmed notification
      await createTransactionConfirmedNotification({
        recipient: params.toNpub,
        amount: params.amount,
        sender: params.fromNpub,
        senderUsername,
        transactionId: params.transactionId || '',
      });
    } else {
      // Token receipt notification (for pending transfers)
      await createTokenReceiptNotification({
        recipient: params.toNpub,
        sender: params.fromNpub,
        senderUsername,
        amount: params.amount,
        message: params.message,
        transactionId: params.transactionId,
      });
    }
  } catch (error) {
    console.error('Failed to send token transfer notification:', error);
    // Don't throw - notification failure shouldn't break the transfer
  }
}

// ============================================================================
// Workshop Status Notifications
// ============================================================================

/**
 * Check if workshop reached minimum attendance and notify
 * Call this after an RSVP is created
 */
export async function checkAndNotifyWorkshopConfirmed(
  offer: Offer,
  rsvpCount: number
): Promise<void> {
  if (offer.type !== 'workshop') return;
  if (!offer.minAttendees) return;

  // Check if just reached minimum
  if (rsvpCount === offer.minAttendees) {
    try {
      // Notify workshop author (use first author from authors array)
      const author = offer.authors[0];
      if (!author) return;

      await createWorkshopConfirmedNotification({
        recipient: author,
        workshopTitle: offer.title,
        workshopId: offer.id,
        attendeeCount: rsvpCount,
        minAttendees: offer.minAttendees,
      });

      // TODO: Also notify all RSVPed users that workshop is confirmed
      // This would require loading all RSVPs for the workshop
    } catch (error) {
      console.error('Failed to send workshop confirmed notification:', error);
    }
  }
}

/**
 * Notify when workshop is cancelled
 * Call this when a workshop author cancels their workshop
 */
export async function notifyWorkshopCancelled(params: {
  workshopId: string;
  workshopTitle: string;
  author: string;
  rsvpedUserNpubs: string[]; // List of users who RSVPed
  refundAmount?: number;
}): Promise<void> {
  try {
    // Load author profile
    let authorUsername: string | undefined;
    try {
      const authorProfile = await getProfileByNpub(params.author);
      authorUsername = authorProfile?.username;
    } catch {
      // Use npub
    }

    // Notify all RSVPed users
    const notificationPromises = params.rsvpedUserNpubs.map(userNpub =>
      createWorkshopCancelledNotification({
        recipient: userNpub,
        workshopTitle: params.workshopTitle,
        workshopId: params.workshopId,
        authorUsername,
        refundAmount: params.refundAmount,
      })
    );

    await Promise.all(notificationPromises);
  } catch (error) {
    console.error('Failed to send workshop cancelled notifications:', error);
  }
}

// ============================================================================
// RSVP Notifications
// ============================================================================

/**
 * Notify workshop author when someone RSVPs
 * Call this when an RSVP is created
 */
export async function notifyWorkshopRsvp(params: {
  workshopId: string;
  workshopTitle: string;
  workshopAuthorNpub: string;
  rsvpUserNpub: string;
}): Promise<void> {
  try {
    // Don't notify if author RSVPs to their own workshop
    if (params.workshopAuthorNpub === params.rsvpUserNpub) {
      return;
    }

    // Load RSVP user profile
    let rsvpUsername: string | undefined;
    try {
      const rsvpUserProfile = await getProfileByNpub(params.rsvpUserNpub);
      rsvpUsername = rsvpUserProfile?.username;
    } catch {
      // Use npub
    }

    await createRsvpNotification({
      recipient: params.workshopAuthorNpub,
      rsvpUserNpub: params.rsvpUserNpub,
      rsvpUsername,
      workshopTitle: params.workshopTitle,
      workshopId: params.workshopId,
    });
  } catch (error) {
    console.error('Failed to send RSVP notification:', error);
  }
}

// ============================================================================
// Integration Examples
// ============================================================================

/*
INTEGRATION EXAMPLE 1: In RSVP API endpoint
```typescript
// src/app/api/rsvp/route.ts

import { notifyWorkshopRsvp, checkAndNotifyWorkshopConfirmed } from '@/lib/notification-triggers';

export async function POST(request: NextRequest) {
  // ... create RSVP logic ...

  // Get RSVP count
  const rsvps = await loadRSVPs(offerId);

  // Send notifications
  await notifyWorkshopRsvp({
    workshopId: offerId,
    workshopTitle: offer.title,
    workshopAuthorNpub: offer.createdBy,
    rsvpUserNpub: userNpub,
  });

  await checkAndNotifyWorkshopConfirmed(offer, rsvps.length);

  // ... return response ...
}
```

INTEGRATION EXAMPLE 2: In blockchain queue processor
```typescript
// When processing a token transfer operation

import { notifyTokenTransfer } from '@/lib/notification-triggers';

async function processTransferOperation(op: QueuedOperation) {
  // ... send blockchain transaction ...

  if (op.status === 'confirmed') {
    // Notify recipient
    await notifyTokenTransfer({
      fromNpub: op.from!,
      toNpub: op.to,
      amount: op.amount,
      transactionId: op.id,
      confirmed: true,
    });
  }
}
```

INTEGRATION EXAMPLE 3: In offer creation
```typescript
// When a workshop is created, the cost is deducted via token transfer
// This automatically sends a notification to the platform (if applicable)

import { notifyTokenTransfer } from '@/lib/notification-triggers';

export async function POST(request: NextRequest) {
  // ... create offer logic ...

  // If offer creation costs tokens, notify
  if (offer.type === 'workshop') {
    // Token deducted for creating workshop
    // The transfer to platform wallet triggers notification
  }

  // ... return response ...
}
```
*/

// ============================================================================
// Batch Notification Functions
// ============================================================================

/**
 * Notify multiple users at once (useful for workshop updates)
 */
export async function notifyMultipleUsers(
  recipients: string[],
  notificationFn: (npub: string) => Promise<void>
): Promise<void> {
  try {
    const promises = recipients.map(npub => notificationFn(npub));
    await Promise.all(promises);
  } catch (error) {
    console.error('Failed to send batch notifications:', error);
  }
}
