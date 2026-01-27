/**
 * Notifications Page
 *
 * Displays in-app notifications for:
 * - Token receipts
 * - Workshop status changes
 * - RSVP notifications (for workshop authors)
 * - Transaction confirmations
 *
 * @see specs/screens.md#10-notifications-center
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredCredentials } from '@/lib/nostr';
import {
  Notification,
  NotificationStats,
  getNotificationIcon,
  getNotificationColor,
  formatNotificationMessage,
  getRelativeTime,
  groupNotificationsByDate,
  GroupedNotifications,
} from '@/lib/notifications-utils';

type TabType = 'all' | 'tokens' | 'workshops';

export default function NotificationsPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<ReturnType<typeof getStoredCredentials>>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [groupedNotifications, setGroupedNotifications] = useState<GroupedNotifications>({
    today: [],
    yesterday: [],
    older: [],
  });
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load credentials
  useEffect(() => {
    const creds = getStoredCredentials();
    if (!creds) {
      router.push('/');
      return;
    }
    setCredentials(creds);
  }, [router]);

  // Load notifications
  useEffect(() => {
    if (!credentials?.npub) return;

    loadNotifications();
  }, [credentials, activeTab]);

  async function loadNotifications() {
    if (!credentials?.npub) return;

    setLoading(true);
    setError(null);

    try {
      let url = `/api/notifications/${credentials.npub}`;

      // Add type filter
      if (activeTab === 'tokens') {
        url += '?type=token_receipt';
      } else if (activeTab === 'workshops') {
        url += '?type=workshop_confirmed'; // Could filter multiple types
      }

      const response = await fetch(url);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to load notifications');
      }

      setNotifications(data.notifications);
      setStats(data.stats);
      setGroupedNotifications(groupNotificationsByDate(data.notifications));
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(notificationId: string) {
    if (!credentials?.npub) return;

    try {
      const response = await fetch(`/api/notifications/${credentials.npub}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_read',
          notificationId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Refresh notifications
        loadNotifications();
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }

  async function markAllAsRead() {
    if (!credentials?.npub) return;

    try {
      const response = await fetch(`/api/notifications/${credentials.npub}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_all_read',
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Refresh notifications
        loadNotifications();
      }
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }

  function renderNotification(notification: Notification) {
    const icon = getNotificationIcon(notification.type);
    const color = getNotificationColor(notification.type);
    const message = formatNotificationMessage(notification);
    const time = getRelativeTime(notification.createdAt);

    const bgColor = color === 'green' ? 'bg-green-100' : color === 'red' ? 'bg-red-100' : 'bg-blue-100';
    const textColor = color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : 'text-blue-600';

    return (
      <div
        key={notification.id}
        className={`bg-white rounded-lg shadow-sm p-4 ${!notification.read ? 'border-l-4 border-blue-500' : ''}`}
        onClick={() => !notification.read && markAsRead(notification.id)}
      >
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 ${bgColor} rounded-full flex items-center justify-center ${textColor} text-xl flex-shrink-0`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900">
              {message}
            </p>

            {notification.message && (
              <p className="text-sm text-gray-600 mt-1 italic">
                &ldquo;{notification.message}&rdquo;
              </p>
            )}

            <p className="text-xs text-gray-500 mt-2">{time}</p>

            {/* Action buttons */}
            <div className="flex items-center gap-3 mt-2">
              {notification.type === 'token_receipt' && notification.sender && (
                <button
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/profile/${notification.sender}`);
                  }}
                >
                  View Profile
                </button>
              )}

              {(notification.type === 'workshop_confirmed' || notification.type === 'workshop_cancelled' || notification.type === 'rsvp_notification') && notification.workshopId && (
                <button
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/offers/${notification.workshopId}`);
                  }}
                >
                  View Workshop
                </button>
              )}

              {(notification.type === 'transaction_confirmed' || notification.type === 'workshop_cancelled') && (
                <button
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push('/transactions');
                  }}
                >
                  View Transaction
                </button>
              )}

              {notification.type === 'workshop_cancelled' && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                  Confirmed
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderNotificationGroup(title: string, notifications: Notification[]) {
    if (notifications.length === 0) return null;

    return (
      <>
        <h2 className="text-sm font-semibold text-gray-500 mb-3 mt-6 first:mt-0 flex items-center">
          <span className="flex-1 border-t border-gray-300"></span>
          <span className="px-3">{title}</span>
          <span className="flex-1 border-t border-gray-300"></span>
        </h2>
        <div className="space-y-3">
          {notifications.map(renderNotification)}
        </div>
      </>
    );
  }

  if (!credentials) {
    return null; // Redirecting
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="text-gray-600 hover:text-gray-900"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </button>
            <h1 className="font-semibold text-gray-900">Notifications</h1>
          </div>

          <div className="flex items-center gap-2">
            {stats && stats.unread > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Mark all read
              </button>
            )}

            {/* Balance & Avatar */}
            <button
              onClick={() => router.push('/profile/edit')}
              className="flex items-center gap-2 hover:bg-gray-50 rounded-lg px-2 py-1 transition"
            >
              <div className="text-right hidden sm:block">
                <p className="text-xs font-semibold text-gray-900">-</p>
                <p className="text-xs text-gray-500 -mt-0.5">tokens</p>
              </div>
              <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white text-sm font-bold">
                {credentials.username?.[0]?.toUpperCase() || 'U'}
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-14 z-10">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('all')}
              className={`py-3 border-b-2 font-medium text-sm ${
                activeTab === 'all'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              All
              {stats && stats.total > 0 && (
                <span className="ml-2 text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                  {stats.total}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('tokens')}
              className={`py-3 border-b-2 font-medium text-sm ${
                activeTab === 'tokens'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Tokens
              {stats && stats.byType.token_receipt > 0 && (
                <span className="ml-2 text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                  {stats.byType.token_receipt}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('workshops')}
              className={`py-3 border-b-2 font-medium text-sm ${
                activeTab === 'workshops'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Workshops
              {stats && (stats.byType.workshop_confirmed + stats.byType.workshop_cancelled + stats.byType.rsvp_notification) > 0 && (
                <span className="ml-2 text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                  {stats.byType.workshop_confirmed + stats.byType.workshop_cancelled + stats.byType.rsvp_notification}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-4">
        {loading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-sm text-gray-600 mt-2">Loading notifications...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {!loading && !error && notifications.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <p className="text-gray-900 font-medium mb-2">No notifications yet</p>
            <p className="text-sm text-gray-600 mb-1">You&apos;ll see updates here when:</p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Someone sends you tokens</li>
              <li>• Your workshops get confirmed</li>
              <li>• People RSVP to your events</li>
            </ul>
          </div>
        )}

        {!loading && !error && notifications.length > 0 && (
          <>
            {renderNotificationGroup('Today', groupedNotifications.today)}
            {renderNotificationGroup('Yesterday', groupedNotifications.yesterday)}
            {renderNotificationGroup('Older', groupedNotifications.older)}

            {/* Pending Transactions Link */}
            <button
              onClick={() => router.push('/transactions')}
              className="block w-full bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6 hover:bg-blue-100 transition"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-blue-900">Pending Transactions</span>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          </>
        )}
      </main>
    </div>
  );
}
