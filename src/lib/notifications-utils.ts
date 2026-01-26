/**
 * Client-safe Notification Utilities
 *
 * This file contains types and utility functions that can be safely
 * imported in client-side code (no fs or server-side dependencies).
 */

// ============================================================================
// Types
// ============================================================================

export type NotificationType =
  | 'token_receipt'
  | 'workshop_confirmed'
  | 'workshop_cancelled'
  | 'rsvp_notification'
  | 'transaction_confirmed';

export interface Notification {
  id: string;
  type: NotificationType;
  recipientNpub: string;
  createdAt: string;
  read: boolean;

  // Token receipt fields
  senderNpub?: string;
  senderUsername?: string;
  amount?: number;
  message?: string;

  // Workshop fields
  workshopTitle?: string;
  workshopId?: string;
  attendeeCount?: number;
  minAttendees?: number;

  // RSVP notification fields
  rsvpUserNpub?: string;
  rsvpUsername?: string;

  // Transaction fields
  transactionId?: string;
  txHash?: string;

  // Generic fields
  metadata?: Record<string, unknown>;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byType: {
    token_receipt: number;
    workshop_confirmed: number;
    workshop_cancelled: number;
    rsvp_notification: number;
    transaction_confirmed: number;
  };
}

export interface GroupedNotifications {
  today: Notification[];
  yesterday: Notification[];
  older: Notification[];
}

// ============================================================================
// UI Helper Functions (Client-safe)
// ============================================================================

/**
 * Get notification icon
 */
export function getNotificationIcon(type: NotificationType): string {
  const icons: Record<NotificationType, string> = {
    token_receipt: '💰',
    workshop_confirmed: '✓',
    workshop_cancelled: '❌',
    rsvp_notification: '🎟️',
    transaction_confirmed: '✓',
  };
  return icons[type];
}

/**
 * Get notification color
 */
export function getNotificationColor(type: NotificationType): string {
  const colors: Record<NotificationType, string> = {
    token_receipt: 'green',
    workshop_confirmed: 'green',
    workshop_cancelled: 'red',
    rsvp_notification: 'blue',
    transaction_confirmed: 'green',
  };
  return colors[type];
}

/**
 * Format notification message
 */
export function formatNotificationMessage(notification: Notification): string {
  switch (notification.type) {
    case 'token_receipt':
      return `${notification.senderUsername || notification.senderNpub} sent you ${notification.amount} tokens`;

    case 'workshop_confirmed':
      return `Workshop confirmed! "${notification.workshopTitle}" reached minimum attendance (${notification.attendeeCount}/${notification.minAttendees})`;

    case 'workshop_cancelled':
      const author = notification.metadata?.authorUsername || 'unknown';
      const refund = notification.amount ? ` - refunded ${notification.amount} token${notification.amount > 1 ? 's' : ''}` : '';
      return `Workshop cancelled: "${notification.workshopTitle}" by @${author}${refund}`;

    case 'rsvp_notification':
      return `${notification.rsvpUsername || notification.rsvpUserNpub} RSVPed to "${notification.workshopTitle}"`;

    case 'transaction_confirmed':
      if (notification.senderNpub) {
        return `Received ${notification.amount} tokens from ${notification.senderUsername || notification.senderNpub}`;
      } else {
        return `Transaction confirmed: sent ${notification.amount} tokens`;
      }

    default:
      return 'Notification';
  }
}

/**
 * Get relative time string (e.g., "10 minutes ago")
 */
export function getRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return 'just now';
  } else if (minutes < 60) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (hours < 24) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (days === 1) {
    return 'yesterday';
  } else if (days < 7) {
    return `${days} days ago`;
  } else {
    return new Date(timestamp).toLocaleDateString();
  }
}

/**
 * Group notifications by date (Today, Yesterday, older)
 */
export function groupNotificationsByDate(notifications: Notification[]): GroupedNotifications {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const grouped: GroupedNotifications = {
    today: [],
    yesterday: [],
    older: [],
  };

  notifications.forEach(notification => {
    const notifDate = new Date(notification.createdAt);
    const notifDay = new Date(
      notifDate.getFullYear(),
      notifDate.getMonth(),
      notifDate.getDate()
    );

    if (notifDay.getTime() === today.getTime()) {
      grouped.today.push(notification);
    } else if (notifDay.getTime() === yesterday.getTime()) {
      grouped.yesterday.push(notification);
    } else {
      grouped.older.push(notification);
    }
  });

  return grouped;
}
