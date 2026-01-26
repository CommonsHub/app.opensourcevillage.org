/**
 * Notification System for Open Source Village (Server-side)
 *
 * Manages in-app notifications for:
 * - Token receipts
 * - Workshop status changes (confirmed/cancelled)
 * - RSVP notifications (for workshop authors)
 * - Transaction confirmations
 *
 * Storage: JSONL format in profiles/{npub}/notifications.jsonl
 * @see specs/screens.md#10-notifications-center
 *
 * NOTE: For client-side code, import from '@/lib/notifications-utils' instead.
 */

// Re-export types and client-safe utilities for backward compatibility
export type {
  NotificationType,
  Notification,
  NotificationStats,
  GroupedNotifications,
} from './notifications-utils';

export {
  getNotificationIcon,
  getNotificationColor,
  formatNotificationMessage,
  getRelativeTime,
  groupNotificationsByDate,
} from './notifications-utils';

// Import types for use in this file
import type { Notification, NotificationStats, NotificationType } from './notifications-utils';
import { getDataDir } from './storage';
import * as path from 'path';

// ============================================================================
// Constants
// ============================================================================

const NOTIFICATION_FILE = 'notifications.jsonl';
const MAX_NOTIFICATIONS_PER_USER = 100;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate unique notification ID
 */
function generateNotificationId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get notification file path for user (full path)
 */
function getNotificationFilePath(npub: string): string {
  return path.join(getDataDir(), 'npubs', npub, NOTIFICATION_FILE);
}

/**
 * Load all notifications for a user
 * Note: This is a server-side only function
 */
export async function loadNotifications(npub: string): Promise<Notification[]> {
  try {
    // Dynamic import to avoid bundling fs in client code
    const { readJsonLines } = await import('./storage');
    const notifications = await readJsonLines<Notification>(
      getNotificationFilePath(npub)
    );

    // Sort by createdAt descending (newest first)
    return notifications.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    // File doesn't exist yet
    return [];
  }
}

/**
 * Save notification to user's feed
 * Note: This is a server-side only function
 */
async function saveNotification(notification: Notification): Promise<void> {
  // Dynamic import to avoid bundling fs in client code
  const { appendJsonLine } = await import('./storage');
  const filePath = getNotificationFilePath(notification.recipientNpub);
  await appendJsonLine(filePath, notification);
}

/**
 * Cleanup old notifications (keep only last MAX_NOTIFICATIONS_PER_USER)
 */
export async function cleanupOldNotifications(npub: string): Promise<void> {
  const notifications = await loadNotifications(npub);

  if (notifications.length <= MAX_NOTIFICATIONS_PER_USER) {
    return;
  }

  // Keep only the most recent notifications
  const toKeep = notifications.slice(0, MAX_NOTIFICATIONS_PER_USER);

  // Rewrite the file with only the notifications to keep
  const fs = await import('fs/promises');
  const filePath = getNotificationFilePath(npub);

  await fs.writeFile(
    filePath,
    toKeep.map(n => JSON.stringify(n)).join('\n') + '\n',
    'utf-8'
  );
}

// ============================================================================
// Notification Creation Functions
// ============================================================================

/**
 * Create token receipt notification
 */
export async function createTokenReceiptNotification(params: {
  recipientNpub: string;
  senderNpub: string;
  senderUsername?: string;
  amount: number;
  message?: string;
  transactionId?: string;
}): Promise<Notification> {
  const notification: Notification = {
    id: generateNotificationId(),
    type: 'token_receipt',
    recipientNpub: params.recipientNpub,
    createdAt: new Date().toISOString(),
    read: false,
    senderNpub: params.senderNpub,
    senderUsername: params.senderUsername,
    amount: params.amount,
    message: params.message,
    transactionId: params.transactionId,
  };

  await saveNotification(notification);
  return notification;
}

/**
 * Create workshop confirmed notification
 */
export async function createWorkshopConfirmedNotification(params: {
  recipientNpub: string;
  workshopTitle: string;
  workshopId: string;
  attendeeCount: number;
  minAttendees: number;
}): Promise<Notification> {
  const notification: Notification = {
    id: generateNotificationId(),
    type: 'workshop_confirmed',
    recipientNpub: params.recipientNpub,
    createdAt: new Date().toISOString(),
    read: false,
    workshopTitle: params.workshopTitle,
    workshopId: params.workshopId,
    attendeeCount: params.attendeeCount,
    minAttendees: params.minAttendees,
  };

  await saveNotification(notification);
  return notification;
}

/**
 * Create workshop cancelled notification
 */
export async function createWorkshopCancelledNotification(params: {
  recipientNpub: string;
  workshopTitle: string;
  workshopId: string;
  authorUsername?: string;
  refundAmount?: number;
}): Promise<Notification> {
  const notification: Notification = {
    id: generateNotificationId(),
    type: 'workshop_cancelled',
    recipientNpub: params.recipientNpub,
    createdAt: new Date().toISOString(),
    read: false,
    workshopTitle: params.workshopTitle,
    workshopId: params.workshopId,
    amount: params.refundAmount,
    metadata: {
      authorUsername: params.authorUsername,
    },
  };

  await saveNotification(notification);
  return notification;
}

/**
 * Create RSVP notification (for workshop authors)
 */
export async function createRsvpNotification(params: {
  recipientNpub: string; // Workshop author
  rsvpUserNpub: string;
  rsvpUsername?: string;
  workshopTitle: string;
  workshopId: string;
}): Promise<Notification> {
  const notification: Notification = {
    id: generateNotificationId(),
    type: 'rsvp_notification',
    recipientNpub: params.recipientNpub,
    createdAt: new Date().toISOString(),
    read: false,
    rsvpUserNpub: params.rsvpUserNpub,
    rsvpUsername: params.rsvpUsername,
    workshopTitle: params.workshopTitle,
    workshopId: params.workshopId,
  };

  await saveNotification(notification);
  return notification;
}

/**
 * Create transaction confirmed notification
 */
export async function createTransactionConfirmedNotification(params: {
  recipientNpub: string;
  amount: number;
  senderNpub?: string;
  senderUsername?: string;
  transactionId: string;
  txHash?: string;
}): Promise<Notification> {
  const notification: Notification = {
    id: generateNotificationId(),
    type: 'transaction_confirmed',
    recipientNpub: params.recipientNpub,
    createdAt: new Date().toISOString(),
    read: false,
    amount: params.amount,
    senderNpub: params.senderNpub,
    senderUsername: params.senderUsername,
    transactionId: params.transactionId,
    txHash: params.txHash,
  };

  await saveNotification(notification);
  return notification;
}

// ============================================================================
// Notification Queries
// ============================================================================

/**
 * Get notifications by type
 */
export async function getNotificationsByType(
  npub: string,
  type: NotificationType
): Promise<Notification[]> {
  const notifications = await loadNotifications(npub);
  return notifications.filter(n => n.type === type);
}

/**
 * Get unread notifications
 */
export async function getUnreadNotifications(npub: string): Promise<Notification[]> {
  const notifications = await loadNotifications(npub);
  return notifications.filter(n => !n.read);
}

/**
 * Get notification statistics
 */
export async function getNotificationStats(npub: string): Promise<NotificationStats> {
  const notifications = await loadNotifications(npub);
  const unread = notifications.filter(n => !n.read);

  const byType = {
    token_receipt: 0,
    workshop_confirmed: 0,
    workshop_cancelled: 0,
    rsvp_notification: 0,
    transaction_confirmed: 0,
  };

  notifications.forEach(n => {
    byType[n.type]++;
  });

  return {
    total: notifications.length,
    unread: unread.length,
    byType,
  };
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(
  npub: string,
  notificationId: string
): Promise<boolean> {
  const notifications = await loadNotifications(npub);
  const notification = notifications.find(n => n.id === notificationId);

  if (!notification) {
    return false;
  }

  if (notification.read) {
    return true; // Already read
  }

  // Update notification
  notification.read = true;

  // Rewrite file with updated notification
  const fs = await import('fs/promises');
  const filePath = getNotificationFilePath(npub);

  await fs.writeFile(
    filePath,
    notifications.map(n => JSON.stringify(n)).join('\n') + '\n',
    'utf-8'
  );

  return true;
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsAsRead(npub: string): Promise<number> {
  const notifications = await loadNotifications(npub);
  const unreadCount = notifications.filter(n => !n.read).length;

  if (unreadCount === 0) {
    return 0;
  }

  // Mark all as read
  notifications.forEach(n => {
    n.read = true;
  });

  // Rewrite file
  const fs = await import('fs/promises');
  const filePath = getNotificationFilePath(npub);

  await fs.writeFile(
    filePath,
    notifications.map(n => JSON.stringify(n)).join('\n') + '\n',
    'utf-8'
  );

  return unreadCount;
}
