/**
 * Notifications Page
 *
 * Displays real-time notifications from Nostr relays:
 * - Payment requests and receipts (kind 1734, 1735)
 * - Calendar events (kind 31922)
 *
 * Subscribes to events where user is author or mentioned (p tag)
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredCredentials } from '@/lib/nostr';
import { useNostrEvents, type NostrEvent } from '@/hooks/useNostrEvents';
import { NOSTR_KINDS, parsePaymentRequestEvent, parsePaymentReceiptEvent, pubkeyTagToNpub } from '@/lib/nostr-events';
import { getRelativeTime } from '@/lib/notifications-utils';

type TabType = 'all' | 'workshops' | 'transactions';

interface BookingDetails {
  roomName?: string;
  startTime?: string;
  endTime?: string;
  title?: string;
}

interface ParsedNotification {
  id: string;
  type: 'payment_request' | 'payment_receipt' | 'calendar_event';
  createdAt: string;
  event: NostrEvent;
  // Payment fields
  amount?: number;
  sender?: string;
  recipient?: string;
  context?: string;
  method?: string;
  txHash?: string;
  success?: boolean;
  message?: string; // Description/note from the payment
  booking?: BookingDetails; // Booking details for burn events
  // Calendar fields
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  status?: string;
}

// Cache for usernames
const usernameCache = new Map<string, string | null>();

async function fetchUsername(npub: string): Promise<string | null> {
  if (!npub || npub === 'system') return null;

  // Check cache first
  if (usernameCache.has(npub)) {
    return usernameCache.get(npub) || null;
  }

  try {
    const response = await fetch(`/api/profile/${npub}`);
    if (response.ok) {
      const data = await response.json();
      const username = data.profile?.username || null;
      usernameCache.set(npub, username);
      return username;
    }
  } catch (error) {
    console.error('Failed to fetch username for', npub, error);
  }

  usernameCache.set(npub, null);
  return null;
}

function parseNostrEvent(event: NostrEvent, userNpub: string): ParsedNotification | null {
  const createdAt = new Date(event.created_at * 1000).toISOString();

  if (event.kind === NOSTR_KINDS.PAYMENT_REQUEST) {
    const parsed = parsePaymentRequestEvent(event);
    if (!parsed) return null;

    // Extract message from event content
    const message = event.content || undefined;

    // Try to parse booking details if context is 'booking'
    let booking: BookingDetails | undefined;
    if (parsed.context === 'booking' && message) {
      try {
        const bookingData = JSON.parse(message);
        if (bookingData.type === 'booking') {
          booking = {
            roomName: bookingData.roomName,
            startTime: bookingData.startTime,
            endTime: bookingData.endTime,
            title: bookingData.title,
          };
        }
      } catch {
        // Not JSON, ignore
      }
    }

    return {
      id: event.id,
      type: 'payment_request',
      createdAt,
      event,
      amount: parsed.amount,
      sender: parsed.sender,
      recipient: parsed.recipient,
      context: parsed.context,
      method: parsed.method,
      message: booking ? undefined : message, // Don't show raw JSON as message
      booking,
    };
  }

  if (event.kind === NOSTR_KINDS.PAYMENT_RECEIPT) {
    const parsed = parsePaymentReceiptEvent(event);
    if (!parsed) return null;

    // Get amount from embedded request or tags
    let amount: number | undefined;
    if (parsed.amount) {
      const TOKEN_DECIMALS = 6;
      amount = Number(BigInt(parsed.amount)) / 10 ** TOKEN_DECIMALS;
    }

    // Try to get message from embedded request
    let message: string | undefined;
    if (parsed.embeddedRequest?.content) {
      message = parsed.embeddedRequest.content;
    }

    return {
      id: event.id,
      type: 'payment_receipt',
      createdAt,
      event,
      txHash: parsed.txHash,
      success: parsed.success,
      amount,
      sender: parsed.sender ? pubkeyTagToNpub(parsed.sender) : undefined,
      recipient: parsed.recipient ? pubkeyTagToNpub(parsed.recipient) : undefined,
      context: parsed.context,
      message,
    };
  }

  if (event.kind === NOSTR_KINDS.CALENDAR_EVENT) {
    const tags = new Map(event.tags.map(t => [t[0], t[1]]));

    return {
      id: event.id,
      type: 'calendar_event',
      createdAt,
      event,
      title: tags.get('title') || 'Untitled Event',
      description: event.content,
      startTime: tags.get('start') ? new Date(parseInt(tags.get('start')!) * 1000).toISOString() : undefined,
      endTime: tags.get('end') ? new Date(parseInt(tags.get('end')!) * 1000).toISOString() : undefined,
      location: tags.get('location'),
      status: tags.get('status'),
    };
  }

  return null;
}

function getNotificationIcon(type: ParsedNotification['type'], success?: boolean): string {
  if (type === 'payment_receipt') {
    return success ? '✓' : '✗';
  }
  if (type === 'payment_request') {
    return '⏳';
  }
  if (type === 'calendar_event') {
    return '📅';
  }
  return '🔔';
}

function getNotificationColor(type: ParsedNotification['type'], success?: boolean): string {
  if (type === 'payment_receipt') {
    return success ? 'green' : 'red';
  }
  if (type === 'payment_request') {
    return 'blue';
  }
  if (type === 'calendar_event') {
    return 'purple';
  }
  return 'gray';
}

export default function NotificationsPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<ReturnType<typeof getStoredCredentials>>(null);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [usernames, setUsernames] = useState<Map<string, string | null>>(new Map());
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // Toggle expanded state for nostr event
  const toggleExpanded = (eventId: string) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  // Load credentials
  useEffect(() => {
    const creds = getStoredCredentials();
    if (!creds) {
      router.push('/');
      return;
    }
    setCredentials(creds);
  }, [router]);

  // Memoize kinds array to prevent infinite re-renders
  const eventKinds = useMemo(() => [
    NOSTR_KINDS.PAYMENT_REQUEST,
    NOSTR_KINDS.PAYMENT_RECEIPT,
    NOSTR_KINDS.CALENDAR_EVENT,
  ], []);

  // Subscribe to Nostr events where user is author
  const {
    events: authoredEvents,
    isLoading: loadingAuthored,
    error: authorError,
    isConnected: connectedAuthored,
  } = useNostrEvents({
    authorPubkey: credentials?.npub,
    kinds: eventKinds,
    limit: 100,
    autoConnect: !!credentials?.npub,
  });

  // Subscribe to Nostr events where user is mentioned (p tag)
  const {
    events: mentionedEvents,
    isLoading: loadingMentioned,
    error: mentionError,
    isConnected: connectedMentioned,
  } = useNostrEvents({
    mentionedPubkey: credentials?.npub,
    kinds: eventKinds,
    limit: 100,
    autoConnect: !!credentials?.npub,
  });

  // Combine and deduplicate events
  const allEvents = useMemo(() => {
    const eventMap = new Map<string, NostrEvent>();
    [...authoredEvents, ...mentionedEvents].forEach(e => eventMap.set(e.id, e));
    return Array.from(eventMap.values()).sort((a, b) => b.created_at - a.created_at);
  }, [authoredEvents, mentionedEvents]);

  // Parse events into notifications
  const notifications = useMemo(() => {
    if (!credentials?.npub) return [];
    return allEvents
      .map(e => parseNostrEvent(e, credentials.npub))
      .filter((n): n is ParsedNotification => n !== null);
  }, [allEvents, credentials?.npub]);

  // Fetch usernames for all counterparties
  const fetchUsernames = useCallback(async () => {
    if (!credentials?.npub) return;

    const npubsToFetch = new Set<string>();

    notifications.forEach(n => {
      if (n.type === 'payment_request' || n.type === 'payment_receipt') {
        // Get counterparty (the other person in the transaction)
        if (n.sender && n.sender !== credentials.npub && n.sender !== 'system') {
          npubsToFetch.add(n.sender);
        }
        if (n.recipient && n.recipient !== credentials.npub) {
          npubsToFetch.add(n.recipient);
        }
      }
    });

    // Fetch all usernames in parallel
    const results = await Promise.all(
      Array.from(npubsToFetch).map(async npub => ({
        npub,
        username: await fetchUsername(npub),
      }))
    );

    // Update state with new usernames
    const newUsernames = new Map(usernames);
    results.forEach(({ npub, username }) => {
      if (username) {
        newUsernames.set(npub, username);
      }
    });

    if (newUsernames.size !== usernames.size) {
      setUsernames(newUsernames);
    }
  }, [notifications, credentials?.npub, usernames]);

  // Fetch usernames when notifications change
  useEffect(() => {
    fetchUsernames();
  }, [fetchUsernames]);

  // Filter notifications by tab
  const filteredNotifications = useMemo(() => {
    if (activeTab === 'workshops') {
      return notifications.filter(n => n.type === 'calendar_event');
    }
    if (activeTab === 'transactions') {
      return notifications.filter(n => n.type === 'payment_request' || n.type === 'payment_receipt');
    }
    return notifications;
  }, [notifications, activeTab]);

  // Group notifications by date
  const groupedNotifications = useMemo(() => {
    const today: ParsedNotification[] = [];
    const yesterday: ParsedNotification[] = [];
    const older: ParsedNotification[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    filteredNotifications.forEach(n => {
      const date = new Date(n.createdAt);
      if (date >= todayStart) {
        today.push(n);
      } else if (date >= yesterdayStart) {
        yesterday.push(n);
      } else {
        older.push(n);
      }
    });

    return { today, yesterday, older };
  }, [filteredNotifications]);

  // Calculate tab counts
  const workshopCount = notifications.filter(n => n.type === 'calendar_event').length;
  const transactionCount = notifications.filter(n => n.type === 'payment_request' || n.type === 'payment_receipt').length;

  const isLoading = loadingAuthored || loadingMentioned;
  const isConnected = connectedAuthored || connectedMentioned;
  const error = authorError || mentionError;

  // Render username link
  function renderUsernameLink(username: string | null | undefined) {
    if (!username) return <span>someone</span>;
    return (
      <a
        href={`/profile/${username}`}
        className="text-blue-600 hover:text-blue-700 hover:underline"
        onClick={(e) => { e.stopPropagation(); }}
      >
        @{username}
      </a>
    );
  }

  // Render notification message with links
  function renderNotificationMessage(notification: ParsedNotification) {
    const { type, amount, sender, recipient, method, title, status, success } = notification;
    const userNpub = credentials?.npub || '';

    const tokenText = `${amount || '?'} token${amount !== 1 ? 's' : ''}`;

    if (type === 'payment_receipt') {
      if (success) {
        if (recipient === userNpub) {
          const senderUsername = sender ? usernames.get(sender) : null;
          return <>Received {tokenText} from {renderUsernameLink(senderUsername)}</>;
        } else if (sender === userNpub) {
          const recipientUsername = recipient ? usernames.get(recipient) : null;
          return <>Sent {tokenText} to {renderUsernameLink(recipientUsername)}</>;
        }
        return <>Transaction confirmed: {tokenText}</>;
      } else {
        return <>Transaction failed</>;
      }
    }

    if (type === 'payment_request') {
      if (method === 'mint') {
        return <>Minting {tokenText}...</>;
      } else if (method === 'burn') {
        return <>Burning {tokenText}</>;
      } else {
        if (sender === userNpub) {
          const recipientUsername = recipient ? usernames.get(recipient) : null;
          return <>Sending {tokenText} to {renderUsernameLink(recipientUsername)}...</>;
        } else {
          const senderUsername = sender ? usernames.get(sender) : null;
          return <>Receiving {tokenText} from {renderUsernameLink(senderUsername)}...</>;
        }
      }
    }

    if (type === 'calendar_event') {
      const statusText = status === 'CONFIRMED' ? 'confirmed' : status === 'CANCELLED' ? 'cancelled' : 'proposed';
      return (
        <>
          Workshop{' '}
          <a
            href="/calendar"
            className="text-blue-600 hover:text-blue-700 hover:underline"
            onClick={(e) => { e.stopPropagation(); }}
          >
            &ldquo;{title}&rdquo;
          </a>{' '}
          {statusText}
        </>
      );
    }

    return <>Unknown notification</>;
  }

  // Format booking date and time
  function formatBookingDateTime(startTime?: string, endTime?: string) {
    if (!startTime || !endTime) return null;

    try {
      const start = new Date(startTime);
      const end = new Date(endTime);

      const dateStr = start.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

      const startTimeStr = start.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const endTimeStr = end.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      return { date: dateStr, startTime: startTimeStr, endTime: endTimeStr };
    } catch {
      return null;
    }
  }

  function renderNotification(notification: ParsedNotification) {
    const icon = getNotificationIcon(notification.type, notification.success);
    const color = getNotificationColor(notification.type, notification.success);
    const time = getRelativeTime(notification.createdAt);
    const isExpanded = expandedEvents.has(notification.id);

    const bgColor = color === 'green' ? 'bg-green-100' : color === 'red' ? 'bg-red-100' : color === 'purple' ? 'bg-purple-100' : 'bg-blue-100';
    const textColor = color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : color === 'purple' ? 'text-purple-600' : 'text-blue-600';

    // Block explorer URL for Gnosis Chain
    const txExplorerUrl = notification.txHash
      ? `https://gnosisscan.io/tx/${notification.txHash}`
      : null;

    // Format booking details
    const bookingDateTime = notification.booking
      ? formatBookingDateTime(notification.booking.startTime, notification.booking.endTime)
      : null;

    return (
      <div
        key={notification.id}
        className="bg-white rounded-lg shadow-sm p-3"
      >
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 ${bgColor} rounded-full flex items-center justify-center ${textColor} text-base flex-shrink-0`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900">
              {renderNotificationMessage(notification)}
            </p>

            {/* Show booking details if present */}
            {notification.booking && bookingDateTime && (
              <p className="text-sm text-gray-500 mt-0.5">
                Booking {notification.booking.roomName} on {bookingDateTime.date} from {bookingDateTime.startTime} to {bookingDateTime.endTime}
              </p>
            )}

            {/* Show message/note if present (not for bookings) */}
            {notification.message && !notification.booking && (
              <p className="text-sm text-gray-500 mt-0.5">
                {notification.message}
              </p>
            )}

            {/* Time and links on same line */}
            <p className="text-xs text-gray-400 mt-1">
              {time}
              {txExplorerUrl && (
                <>
                  {' · '}
                  <a
                    href={txExplorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-600 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    tx
                  </a>
                </>
              )}
              {' · '}
              <button
                onClick={() => toggleExpanded(notification.id)}
                className="text-gray-400 hover:text-gray-600 hover:underline"
              >
                {isExpanded ? 'hide nostr event' : 'view nostr event'}
              </button>
            </p>

            {/* Expanded nostr event */}
            {isExpanded && (
              <div className="mt-2 p-2 bg-gray-50 rounded text-xs font-mono overflow-x-auto">
                <pre className="whitespace-pre-wrap break-all text-gray-600">
                  {JSON.stringify(notification.event, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderNotificationGroup(title: string, notifications: ParsedNotification[]) {
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
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between">
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
                {notifications.length > 0 && (
                  <span className="ml-2 text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                    {notifications.length}
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
                {workshopCount > 0 && (
                  <span className="ml-2 text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                    {workshopCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('transactions')}
                className={`py-3 border-b-2 font-medium text-sm ${
                  activeTab === 'transactions'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Transactions
                {transactionCount > 0 && (
                  <span className="ml-2 text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                    {transactionCount}
                  </span>
                )}
              </button>
            </div>

            {/* Connection status */}
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`}></span>
              <span className="text-xs text-gray-500">{isConnected ? 'Live' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-4">
        {isLoading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-sm text-gray-600 mt-2">Connecting to relay...</p>
          </div>
        )}

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-yellow-800">{error}</p>
          </div>
        )}

        {!isLoading && filteredNotifications.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <p className="text-gray-900 font-medium mb-2">
              {activeTab === 'all' && 'No notifications yet'}
              {activeTab === 'workshops' && 'No workshop notifications'}
              {activeTab === 'transactions' && 'No transaction notifications'}
            </p>
            <p className="text-sm text-gray-600 mb-1">You&apos;ll see updates here when:</p>
            <ul className="text-sm text-gray-600 space-y-1">
              {activeTab === 'all' && (
                <>
                  <li>• Someone sends you tokens</li>
                  <li>• Your workshops get confirmed</li>
                  <li>• Your transactions are processed</li>
                </>
              )}
              {activeTab === 'workshops' && (
                <>
                  <li>• Your workshops get confirmed or cancelled</li>
                  <li>• You create new workshops</li>
                </>
              )}
              {activeTab === 'transactions' && (
                <>
                  <li>• Someone sends you tokens</li>
                  <li>• Your transactions are confirmed</li>
                </>
              )}
            </ul>
          </div>
        )}

        {!isLoading && filteredNotifications.length > 0 && (
          <>
            {renderNotificationGroup('Today', groupedNotifications.today)}
            {renderNotificationGroup('Yesterday', groupedNotifications.yesterday)}
            {renderNotificationGroup('Older', groupedNotifications.older)}
          </>
        )}
      </main>
    </div>
  );
}
