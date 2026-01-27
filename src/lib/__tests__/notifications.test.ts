/**
 * Notification System Tests
 *
 * Tests for notification creation, storage, queries, and UI helpers.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
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
  getNotificationIcon,
  getNotificationColor,
  formatNotificationMessage,
  getRelativeTime,
  groupNotificationsByDate,
  cleanupOldNotifications,
} from '../notifications';
import * as fs from 'fs/promises';
import * as path from 'path';

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-notifications');
const TEST_NPUB = 'npub1test123';

// Helper to set up test environment
async function setupTestEnv() {
  await fs.mkdir(path.join(TEST_DATA_DIR, 'npubs', TEST_NPUB), {
    recursive: true,
  });
}

// Helper to clean up test environment
async function cleanupTestEnv() {
  try {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  } catch (error) {
    // Ignore errors
  }
}

beforeEach(async () => {
  // Override DATA_DIR for tests
  process.env.DATA_DIR = TEST_DATA_DIR;
  await setupTestEnv();
});

afterEach(async () => {
  await cleanupTestEnv();
  delete process.env.DATA_DIR;
});

// ============================================================================
// Notification Creation Tests
// ============================================================================

describe('Notification Creation', () => {
  it('should create token receipt notification', async () => {
    const notification = await createTokenReceiptNotification({
      recipient: TEST_NPUB,
      sender: 'npub1sender',
      senderUsername: 'alice',
      amount: 5,
      message: 'Thanks!',
    });

    expect(notification.type).toBe('token_receipt');
    expect(notification.recipient).toBe(TEST_NPUB);
    expect(notification.sender).toBe('npub1sender');
    expect(notification.senderUsername).toBe('alice');
    expect(notification.amount).toBe(5);
    expect(notification.message).toBe('Thanks!');
    expect(notification.read).toBe(false);
    expect(notification.id).toMatch(/^notif_/);
  });

  it('should create workshop confirmed notification', async () => {
    const notification = await createWorkshopConfirmedNotification({
      recipient: TEST_NPUB,
      workshopTitle: 'Intro to NOSTR',
      workshopId: 'workshop123',
      attendeeCount: 5,
      minAttendees: 5,
    });

    expect(notification.type).toBe('workshop_confirmed');
    expect(notification.workshopTitle).toBe('Intro to NOSTR');
    expect(notification.workshopId).toBe('workshop123');
    expect(notification.attendeeCount).toBe(5);
    expect(notification.minAttendees).toBe(5);
  });

  it('should create workshop cancelled notification', async () => {
    const notification = await createWorkshopCancelledNotification({
      recipient: TEST_NPUB,
      workshopTitle: 'React Workshop',
      workshopId: 'workshop456',
      authorUsername: 'bob',
      refundAmount: 1,
    });

    expect(notification.type).toBe('workshop_cancelled');
    expect(notification.workshopTitle).toBe('React Workshop');
    expect(notification.amount).toBe(1);
    expect(notification.metadata?.authorUsername).toBe('bob');
  });

  it('should create RSVP notification', async () => {
    const notification = await createRsvpNotification({
      recipient: TEST_NPUB,
      rsvpUserNpub: 'npub1charlie',
      rsvpUsername: 'charlie',
      workshopTitle: 'Smart Contracts',
      workshopId: 'workshop789',
    });

    expect(notification.type).toBe('rsvp_notification');
    expect(notification.rsvpUserNpub).toBe('npub1charlie');
    expect(notification.rsvpUsername).toBe('charlie');
    expect(notification.workshopTitle).toBe('Smart Contracts');
  });

  it('should create transaction confirmed notification', async () => {
    const notification = await createTransactionConfirmedNotification({
      recipient: TEST_NPUB,
      amount: 10,
      sender: 'npub1sender',
      senderUsername: 'alice',
      transactionId: 'tx123',
      txHash: '0xabc...',
    });

    expect(notification.type).toBe('transaction_confirmed');
    expect(notification.amount).toBe(10);
    expect(notification.transactionId).toBe('tx123');
    expect(notification.txHash).toBe('0xabc...');
  });
});

// ============================================================================
// Notification Storage Tests
// ============================================================================

describe('Notification Storage', () => {
  it('should load notifications', async () => {
    // Create some notifications
    await createTokenReceiptNotification({
      recipient: TEST_NPUB,
      sender: 'npub1sender',
      amount: 5,
    });

    await createWorkshopConfirmedNotification({
      recipient: TEST_NPUB,
      workshopTitle: 'Test Workshop',
      workshopId: 'workshop1',
      attendeeCount: 5,
      minAttendees: 5,
    });

    const notifications = await loadNotifications(TEST_NPUB);
    expect(notifications.length).toBe(2);
    expect(notifications[0].createdAt > notifications[1].createdAt).toBe(true); // Sorted by date desc
  });

  it('should return empty array for user with no notifications', async () => {
    const notifications = await loadNotifications('npub1nonexistent');
    expect(notifications).toEqual([]);
  });

  it('should filter notifications by type', async () => {
    await createTokenReceiptNotification({
      recipient: TEST_NPUB,
      sender: 'npub1sender',
      amount: 5,
    });

    await createWorkshopConfirmedNotification({
      recipient: TEST_NPUB,
      workshopTitle: 'Test Workshop',
      workshopId: 'workshop1',
      attendeeCount: 5,
      minAttendees: 5,
    });

    const tokenNotifications = await getNotificationsByType(TEST_NPUB, 'token_receipt');
    expect(tokenNotifications.length).toBe(1);
    expect(tokenNotifications[0].type).toBe('token_receipt');
  });

  it('should get unread notifications', async () => {
    const notification1 = await createTokenReceiptNotification({
      recipient: TEST_NPUB,
      sender: 'npub1sender',
      amount: 5,
    });

    await createWorkshopConfirmedNotification({
      recipient: TEST_NPUB,
      workshopTitle: 'Test Workshop',
      workshopId: 'workshop1',
      attendeeCount: 5,
      minAttendees: 5,
    });

    // Mark one as read
    await markNotificationAsRead(TEST_NPUB, notification1.id);

    const unread = await getUnreadNotifications(TEST_NPUB);
    expect(unread.length).toBe(1);
    expect(unread[0].type).toBe('workshop_confirmed');
  });
});

// ============================================================================
// Notification Stats Tests
// ============================================================================

describe('Notification Stats', () => {
  it('should calculate notification stats', async () => {
    await createTokenReceiptNotification({
      recipient: TEST_NPUB,
      sender: 'npub1sender',
      amount: 5,
    });

    await createTokenReceiptNotification({
      recipient: TEST_NPUB,
      sender: 'npub1sender2',
      amount: 3,
    });

    await createWorkshopConfirmedNotification({
      recipient: TEST_NPUB,
      workshopTitle: 'Test Workshop',
      workshopId: 'workshop1',
      attendeeCount: 5,
      minAttendees: 5,
    });

    const stats = await getNotificationStats(TEST_NPUB);
    expect(stats.total).toBe(3);
    expect(stats.unread).toBe(3);
    expect(stats.byType.token_receipt).toBe(2);
    expect(stats.byType.workshop_confirmed).toBe(1);
  });

  it('should handle empty stats', async () => {
    const stats = await getNotificationStats('npub1nonexistent');
    expect(stats.total).toBe(0);
    expect(stats.unread).toBe(0);
  });
});

// ============================================================================
// Mark as Read Tests
// ============================================================================

describe('Mark as Read', () => {
  it('should mark notification as read', async () => {
    const notification = await createTokenReceiptNotification({
      recipient: TEST_NPUB,
      sender: 'npub1sender',
      amount: 5,
    });

    expect(notification.read).toBe(false);

    const success = await markNotificationAsRead(TEST_NPUB, notification.id);
    expect(success).toBe(true);

    const notifications = await loadNotifications(TEST_NPUB);
    expect(notifications[0].read).toBe(true);
  });

  it('should return false for non-existent notification', async () => {
    const success = await markNotificationAsRead(TEST_NPUB, 'notif_nonexistent');
    expect(success).toBe(false);
  });

  it('should mark all notifications as read', async () => {
    await createTokenReceiptNotification({
      recipient: TEST_NPUB,
      sender: 'npub1sender',
      amount: 5,
    });

    await createWorkshopConfirmedNotification({
      recipient: TEST_NPUB,
      workshopTitle: 'Test Workshop',
      workshopId: 'workshop1',
      attendeeCount: 5,
      minAttendees: 5,
    });

    const count = await markAllNotificationsAsRead(TEST_NPUB);
    expect(count).toBe(2);

    const notifications = await loadNotifications(TEST_NPUB);
    expect(notifications.every(n => n.read)).toBe(true);
  });
});

// ============================================================================
// UI Helper Tests
// ============================================================================

describe('UI Helpers', () => {
  it('should get notification icon', () => {
    expect(getNotificationIcon('token_receipt')).toBe('💰');
    expect(getNotificationIcon('workshop_confirmed')).toBe('✓');
    expect(getNotificationIcon('workshop_cancelled')).toBe('❌');
    expect(getNotificationIcon('rsvp_notification')).toBe('🎟️');
    expect(getNotificationIcon('transaction_confirmed')).toBe('✓');
  });

  it('should get notification color', () => {
    expect(getNotificationColor('token_receipt')).toBe('green');
    expect(getNotificationColor('workshop_confirmed')).toBe('green');
    expect(getNotificationColor('workshop_cancelled')).toBe('red');
    expect(getNotificationColor('rsvp_notification')).toBe('blue');
  });

  it('should format token receipt message', async () => {
    const notification = await createTokenReceiptNotification({
      recipient: TEST_NPUB,
      sender: 'npub1sender',
      senderUsername: 'alice',
      amount: 5,
    });

    const message = formatNotificationMessage(notification);
    expect(message).toBe('alice sent you 5 tokens');
  });

  it('should format workshop confirmed message', async () => {
    const notification = await createWorkshopConfirmedNotification({
      recipient: TEST_NPUB,
      workshopTitle: 'Intro to NOSTR',
      workshopId: 'workshop1',
      attendeeCount: 5,
      minAttendees: 5,
    });

    const message = formatNotificationMessage(notification);
    expect(message).toContain('Workshop confirmed!');
    expect(message).toContain('Intro to NOSTR');
    expect(message).toContain('5/5');
  });

  it('should format workshop cancelled message', async () => {
    const notification = await createWorkshopCancelledNotification({
      recipient: TEST_NPUB,
      workshopTitle: 'React Workshop',
      workshopId: 'workshop1',
      authorUsername: 'bob',
      refundAmount: 1,
    });

    const message = formatNotificationMessage(notification);
    expect(message).toContain('Workshop cancelled');
    expect(message).toContain('React Workshop');
    expect(message).toContain('refunded 1 token');
  });

  it('should format RSVP notification message', async () => {
    const notification = await createRsvpNotification({
      recipient: TEST_NPUB,
      rsvpUserNpub: 'npub1charlie',
      rsvpUsername: 'charlie',
      workshopTitle: 'Smart Contracts',
      workshopId: 'workshop1',
    });

    const message = formatNotificationMessage(notification);
    expect(message).toBe('charlie RSVPed to "Smart Contracts"');
  });

  it('should get relative time', () => {
    const now = new Date();

    // Just now
    expect(getRelativeTime(now.toISOString())).toBe('just now');

    // 5 minutes ago
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    expect(getRelativeTime(fiveMinutesAgo.toISOString())).toBe('5 minutes ago');

    // 2 hours ago
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    expect(getRelativeTime(twoHoursAgo.toISOString())).toBe('2 hours ago');

    // Yesterday
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(getRelativeTime(yesterday.toISOString())).toBe('yesterday');

    // 3 days ago
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(getRelativeTime(threeDaysAgo.toISOString())).toBe('3 days ago');
  });

  it('should group notifications by date', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    // Create notifications with different dates
    const notif1 = await createTokenReceiptNotification({
      recipient: TEST_NPUB,
      sender: 'npub1sender',
      amount: 5,
    });

    const notif2 = await createWorkshopConfirmedNotification({
      recipient: TEST_NPUB,
      workshopTitle: 'Workshop 1',
      workshopId: 'workshop1',
      attendeeCount: 5,
      minAttendees: 5,
    });
    notif2.createdAt = yesterday.toISOString();

    const notif3 = await createRsvpNotification({
      recipient: TEST_NPUB,
      rsvpUserNpub: 'npub1charlie',
      workshopTitle: 'Workshop 2',
      workshopId: 'workshop2',
    });
    notif3.createdAt = twoDaysAgo.toISOString();

    const grouped = groupNotificationsByDate([notif1, notif2, notif3]);

    expect(grouped.today.length).toBe(1);
    expect(grouped.yesterday.length).toBe(1);
    expect(grouped.older.length).toBe(1);
  });
});

// ============================================================================
// Cleanup Tests
// ============================================================================

describe('Cleanup', () => {
  it('should cleanup old notifications', async () => {
    // Create 105 notifications (exceeds MAX_NOTIFICATIONS_PER_USER = 100)
    const promises = [];
    for (let i = 0; i < 105; i++) {
      promises.push(
        createTokenReceiptNotification({
          recipient: TEST_NPUB,
          sender: `npub1sender${i}`,
          amount: 1,
        })
      );
    }
    await Promise.all(promises);

    let notifications = await loadNotifications(TEST_NPUB);
    expect(notifications.length).toBe(105);

    // Run cleanup
    await cleanupOldNotifications(TEST_NPUB);

    notifications = await loadNotifications(TEST_NPUB);
    expect(notifications.length).toBe(100); // Should keep only 100
  });

  it('should not cleanup if under limit', async () => {
    // Create 50 notifications
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        createTokenReceiptNotification({
          recipient: TEST_NPUB,
          sender: `npub1sender${i}`,
          amount: 1,
        })
      );
    }
    await Promise.all(promises);

    await cleanupOldNotifications(TEST_NPUB);

    const notifications = await loadNotifications(TEST_NPUB);
    expect(notifications.length).toBe(50); // Should keep all
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle notifications without optional fields', async () => {
    const notification = await createTokenReceiptNotification({
      recipient: TEST_NPUB,
      sender: 'npub1sender',
      amount: 5,
      // No username, message, or transactionId
    });

    expect(notification.senderUsername).toBeUndefined();
    expect(notification.message).toBeUndefined();
    expect(notification.transactionId).toBeUndefined();

    const message = formatNotificationMessage(notification);
    expect(message).toBe('npub1sender sent you 5 tokens');
  });

  it('should handle transaction confirmed without sender', async () => {
    const notification = await createTransactionConfirmedNotification({
      recipient: TEST_NPUB,
      amount: 10,
      transactionId: 'tx123',
      // No sender (outgoing transaction)
    });

    const message = formatNotificationMessage(notification);
    expect(message).toBe('Transaction confirmed: sent 10 tokens');
  });

  it('should handle workshop cancelled without refund', async () => {
    const notification = await createWorkshopCancelledNotification({
      recipient: TEST_NPUB,
      workshopTitle: 'Test Workshop',
      workshopId: 'workshop1',
      // No refund amount
    });

    const message = formatNotificationMessage(notification);
    expect(message).not.toContain('refunded');
  });
});

describe('Notification Performance', () => {
  it('should handle large number of notifications efficiently', async () => {
    const start = Date.now();

    // Create 1000 notifications
    const promises = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(
        createTokenReceiptNotification({
          recipient: TEST_NPUB,
          sender: `npub1sender${i}`,
          amount: 1,
        })
      );
    }
    await Promise.all(promises);

    const createTime = Date.now() - start;

    // Load notifications
    const loadStart = Date.now();
    const notifications = await loadNotifications(TEST_NPUB);
    const loadTime = Date.now() - loadStart;

    expect(notifications.length).toBe(1000);
    expect(createTime).toBeLessThan(5000); // Should create in < 5 seconds
    expect(loadTime).toBeLessThan(1000); // Should load in < 1 second

    console.log(`Created 1000 notifications in ${createTime}ms`);
    console.log(`Loaded 1000 notifications in ${loadTime}ms`);
  });
});
