/**
 * useNotifications Hook
 *
 * React hook for managing notifications in components.
 * Provides easy access to notifications, stats, and mark as read functionality.
 *
 * @example
 * ```tsx
 * const { notifications, stats, markAsRead, markAllAsRead, loading, error } = useNotifications('npub...');
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Notification,
  NotificationStats,
  NotificationType,
} from '@/lib/notifications';

interface UseNotificationsOptions {
  type?: NotificationType;
  unreadOnly?: boolean;
  autoRefresh?: number; // Auto-refresh interval in milliseconds
}

interface UseNotificationsReturn {
  notifications: Notification[];
  stats: NotificationStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export function useNotifications(
  npub: string | null,
  options: UseNotificationsOptions = {}
): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { type, unreadOnly, autoRefresh } = options;

  // Load notifications
  const loadNotifications = useCallback(async () => {
    if (!npub) {
      setNotifications([]);
      setStats(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let url = `/api/notifications/${npub}`;
      const params = new URLSearchParams();

      if (type) {
        params.append('type', type);
      }

      if (unreadOnly) {
        params.append('unread', 'true');
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to load notifications');
      }

      setNotifications(data.notifications);
      setStats(data.stats);
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [npub, type, unreadOnly]);

  // Initial load
  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !npub) return;

    const interval = setInterval(() => {
      loadNotifications();
    }, autoRefresh);

    return () => clearInterval(interval);
  }, [autoRefresh, npub, loadNotifications]);

  // Mark as read
  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!npub) return;

      try {
        const response = await fetch(`/api/notifications/${npub}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'mark_read',
            notificationId,
          }),
        });

        const data = await response.json();

        if (data.success) {
          // Update local state
          setNotifications(prev =>
            prev.map(n => (n.id === notificationId ? { ...n, read: true } : n))
          );

          // Refresh stats
          loadNotifications();
        }
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    },
    [npub, loadNotifications]
  );

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!npub) return;

    try {
      const response = await fetch(`/api/notifications/${npub}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_all_read',
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update local state
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));

        // Refresh to get updated stats
        loadNotifications();
      }
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }, [npub, loadNotifications]);

  return {
    notifications,
    stats,
    loading,
    error,
    refresh: loadNotifications,
    markAsRead,
    markAllAsRead,
  };
}

/**
 * Hook for getting just the unread count
 */
export function useUnreadCount(npub: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!npub) {
      setCount(0);
      return;
    }

    async function fetchCount() {
      try {
        const response = await fetch(`/api/notifications/${npub}?stats=true`);
        const data = await response.json();

        if (data.success && data.stats) {
          setCount(data.stats.unread);
        }
      } catch (err) {
        console.error('Failed to fetch unread count:', err);
      }
    }

    fetchCount();

    // Refresh every minute
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [npub]);

  return count;
}
