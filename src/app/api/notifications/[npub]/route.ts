/**
 * Notifications API Endpoint
 *
 * GET /api/notifications/[npub] - Get notifications for user
 * PATCH /api/notifications/[npub] - Mark notifications as read
 *
 * @see src/lib/notifications.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  loadNotifications,
  getNotificationsByType,
  getUnreadNotifications,
  getNotificationStats,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  NotificationType,
} from '@/lib/notifications';
import { validateNpub } from '@/lib/nostr-server';

// ============================================================================
// GET /api/notifications/[npub]
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ npub: string }> }
) {
  try {
    const { npub } = await params;

    // Validate npub
    if (!validateNpub(npub)) {
      return NextResponse.json(
        { success: false, error: 'Invalid npub format' },
        { status: 400 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as NotificationType | null;
    const unreadOnly = searchParams.get('unread') === 'true';
    const statsOnly = searchParams.get('stats') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Get stats only
    if (statsOnly) {
      const stats = await getNotificationStats(npub);
      return NextResponse.json({
        success: true,
        stats,
      });
    }

    // Get notifications
    let notifications;

    if (type) {
      // Filter by type
      notifications = await getNotificationsByType(npub, type);
    } else if (unreadOnly) {
      // Unread only
      notifications = await getUnreadNotifications(npub);
    } else {
      // All notifications
      notifications = await loadNotifications(npub);
    }

    // Apply limit
    if (limit > 0) {
      notifications = notifications.slice(0, limit);
    }

    // Get stats as well
    const stats = await getNotificationStats(npub);

    return NextResponse.json({
      success: true,
      notifications,
      stats,
      meta: {
        count: notifications.length,
        filter: type || (unreadOnly ? 'unread' : 'all'),
        limit,
      },
    });
  } catch (error) {
    console.error('Failed to get notifications:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get notifications',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH /api/notifications/[npub]
// ============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ npub: string }> }
) {
  try {
    const { npub } = await params;

    // Validate npub
    if (!validateNpub(npub)) {
      return NextResponse.json(
        { success: false, error: 'Invalid npub format' },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { action, notificationId } = body;

    // Validate action
    if (!action || !['mark_read', 'mark_all_read'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Use "mark_read" or "mark_all_read"' },
        { status: 400 }
      );
    }

    // Mark single notification as read
    if (action === 'mark_read') {
      if (!notificationId) {
        return NextResponse.json(
          { success: false, error: 'notificationId required for mark_read action' },
          { status: 400 }
        );
      }

      const success = await markNotificationAsRead(npub, notificationId);

      if (!success) {
        return NextResponse.json(
          { success: false, error: 'Notification not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Notification marked as read',
      });
    }

    // Mark all notifications as read
    if (action === 'mark_all_read') {
      const count = await markAllNotificationsAsRead(npub);

      return NextResponse.json({
        success: true,
        message: `Marked ${count} notifications as read`,
        count,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Failed to update notifications:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update notifications',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
