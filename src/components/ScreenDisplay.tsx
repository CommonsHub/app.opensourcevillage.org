/**
 * ScreenDisplay Component - Large calendar view for TV displays
 * Shows daily schedule with rooms as columns and live activity feed
 *
 * Used by:
 * - /screen (today's date)
 * - /[year]/[month]/[day]/screen (specific date)
 */

'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNostrEvents } from '@/hooks/useNostrEvents';
import { NOSTR_KINDS, parsePaymentReceiptEvent, pubkeyTagToNpub } from '@/lib/nostr-events';

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  location?: string;
  room?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  isProposal?: boolean;
  offerId?: string;
  authorUsername?: string;
  rsvpCount?: number;
  minRsvps?: number;
}

interface ActivityItem {
  id: string;
  type: 'payment' | 'rsvp' | 'workshop';
  message: string;
  timestamp: Date;
  amount?: number;
  username?: string;
}

interface ScreenDisplayProps {
  date: Date;
}

// Room colors
const ROOM_COLORS: Record<string, { bg: string; border: string; text: string; textLight: string }> = {
  'Ostrom Room': { bg: 'bg-blue-100', border: 'border-blue-500', text: 'text-blue-800', textLight: 'text-blue-400' },
  'Satoshi Room': { bg: 'bg-orange-100', border: 'border-orange-500', text: 'text-orange-800', textLight: 'text-orange-400' },
  'Angel Room': { bg: 'bg-purple-100', border: 'border-purple-500', text: 'text-purple-800', textLight: 'text-purple-400' },
  'Mush Room': { bg: 'bg-green-100', border: 'border-green-500', text: 'text-green-800', textLight: 'text-green-400' },
  'Phone Booth': { bg: 'bg-gray-100', border: 'border-gray-500', text: 'text-gray-800', textLight: 'text-gray-400' },
  'Coworking': { bg: 'bg-yellow-100', border: 'border-yellow-500', text: 'text-yellow-800', textLight: 'text-yellow-400' },
  'Play Room': { bg: 'bg-pink-100', border: 'border-pink-500', text: 'text-pink-800', textLight: 'text-pink-400' },
  'Outside': { bg: 'bg-emerald-100', border: 'border-emerald-500', text: 'text-emerald-800', textLight: 'text-emerald-400' },
};

// Hours to display (8 AM to 10 PM)
const HOURS = Array.from({ length: 15 }, (_, i) => i + 8);
const HOUR_HEIGHT = 80; // pixels per hour

// Room display order (must match header and columns)
const FLOOR_1_ROOMS = ['Mush Room', 'Coworking', 'Phone Booth'];
const FLOOR_2_ROOMS = ['Ostrom Room', 'Satoshi Room', 'Angel Room'];
const ALL_DISPLAY_ROOMS = [...FLOOR_1_ROOMS, ...FLOOR_2_ROOMS];

// Username cache
const usernameCache = new Map<string, string | null>();

async function fetchUsername(npub: string): Promise<string | null> {
  if (!npub || npub === 'system') return null;
  if (usernameCache.has(npub)) return usernameCache.get(npub) || null;

  try {
    const response = await fetch(`/api/profile/${npub}`);
    if (response.ok) {
      const data = await response.json();
      const username = data.profile?.username || null;
      usernameCache.set(npub, username);
      return username;
    }
  } catch {
    // Ignore errors
  }
  usernameCache.set(npub, null);
  return null;
}

export default function ScreenDisplay({ date }: ScreenDisplayProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const calendarRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);

  // Check if viewing today
  const isToday = useMemo(() => {
    const now = new Date();
    return date.getFullYear() === now.getFullYear() &&
           date.getMonth() === now.getMonth() &&
           date.getDate() === now.getDate();
  }, [date]);

  // Format date for display
  const dateLabel = useMemo(() => {
    if (isToday) return 'Today';
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }, [date, isToday]);

  // Memoize event kinds for Nostr subscription
  const eventKinds = useMemo(() => [
    NOSTR_KINDS.PAYMENT_REQUEST,
    NOSTR_KINDS.PAYMENT_RECEIPT,
    NOSTR_KINDS.CALENDAR_EVENT,
  ], []);

  // Subscribe to all Nostr events (no filter by user)
  const { events: nostrEvents } = useNostrEvents({
    kinds: eventKinds,
    limit: 50,
    autoConnect: true,
    subscribeAll: true,
  });

  // Load calendar events
  useEffect(() => {
    async function loadEvents() {
      try {
        // Build date range for the specified date
        const fromDate = new Date(date);
        fromDate.setHours(0, 0, 0, 0);
        const toDate = new Date(date);
        toDate.setHours(23, 59, 59, 999);

        const response = await fetch(
          `/api/calendar?from=${fromDate.toISOString()}&to=${toDate.toISOString()}`
        );
        const data = await response.json();

        if (data.success) {
          setEvents(data.events || []);
        }
      } catch (error) {
        console.error('Failed to load events:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadEvents();

    // Refresh events every 5 minutes
    const interval = setInterval(loadEvents, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [date]);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to current time on load (only for today)
  useEffect(() => {
    if (!isLoading && calendarRef.current && !hasScrolled.current && isToday) {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // Calculate scroll position (center current time in view)
      const currentTimeOffset = (hours - 8 + minutes / 60) * HOUR_HEIGHT;
      const containerHeight = calendarRef.current.clientHeight;
      const scrollTarget = Math.max(0, currentTimeOffset - containerHeight / 3);

      calendarRef.current.scrollTo({ top: scrollTarget, behavior: 'smooth' });
      hasScrolled.current = true;
    }
  }, [isLoading, isToday]);

  // Process Nostr events into activities
  useEffect(() => {
    async function processEvents() {
      const newActivities: ActivityItem[] = [];

      for (const event of nostrEvents.slice(0, 20)) {
        if (event.kind === NOSTR_KINDS.PAYMENT_RECEIPT) {
          const parsed = parsePaymentReceiptEvent(event);
          if (parsed?.success) {
            let amount: number | undefined;
            if (parsed.amount) {
              amount = Number(BigInt(parsed.amount)) / 10 ** 6;
            }

            const senderNpub = parsed.sender ? pubkeyTagToNpub(parsed.sender) : undefined;
            const recipientNpub = parsed.recipient ? pubkeyTagToNpub(parsed.recipient) : undefined;

            const senderUsername = senderNpub ? await fetchUsername(senderNpub) : null;
            const recipientUsername = recipientNpub ? await fetchUsername(recipientNpub) : null;

            let message = '';
            if (parsed.context === 'rsvp') {
              message = `${senderUsername || 'Someone'} RSVPed to a workshop`;
            } else if (parsed.context === 'transfer') {
              message = `${senderUsername || 'Someone'} sent ${amount || '?'} token${amount !== 1 ? 's' : ''} to ${recipientUsername || 'someone'}`;
            } else if (parsed.context === 'mint') {
              message = `${recipientUsername || 'Someone'} received ${amount || '?'} token${amount !== 1 ? 's' : ''}`;
            } else {
              message = `Transaction: ${amount || '?'} token${amount !== 1 ? 's' : ''}`;
            }

            newActivities.push({
              id: event.id,
              type: parsed.context === 'rsvp' ? 'rsvp' : 'payment',
              message,
              timestamp: new Date(event.created_at * 1000),
              amount,
              username: senderUsername || undefined,
            });
          }
        } else if (event.kind === NOSTR_KINDS.CALENDAR_EVENT) {
          const tags = new Map(event.tags.map(t => [t[0], t[1]]));
          const title = tags.get('title') || 'Untitled';
          const status = tags.get('status');

          newActivities.push({
            id: event.id,
            type: 'workshop',
            message: `Workshop "${title}" ${status === 'CONFIRMED' ? 'confirmed' : 'proposed'}`,
            timestamp: new Date(event.created_at * 1000),
          });
        }
      }

      // Sort by timestamp descending
      newActivities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setActivities(newActivities.slice(0, 15));
    }

    if (nostrEvents.length > 0) {
      processEvents();
    }
  }, [nostrEvents]);

  // Calculate event position and height
  function getEventStyle(event: CalendarEvent) {
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);

    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;

    const top = (startHour - 8) * HOUR_HEIGHT;
    const height = Math.max((endHour - startHour) * HOUR_HEIGHT, 30);

    return { top: `${top}px`, height: `${height}px` };
  }

  // Get current time indicator position
  function getCurrentTimePosition() {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    return (hours - 8 + minutes / 60) * HOUR_HEIGHT;
  }

  // Format time
  function formatTime(date: Date) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  // Format relative time for activities
  function formatRelativeTime(date: Date) {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  }

  // Get room color
  function getRoomColor(roomName: string) {
    return ROOM_COLORS[roomName] || { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-800', textLight: 'text-gray-400' };
  }

  // Group events by room using the display room order
  const eventsByDisplayRoom = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {};
    ALL_DISPLAY_ROOMS.forEach(roomName => { grouped[roomName] = []; });

    events.forEach(event => {
      if (event.room && grouped[event.room] !== undefined) {
        grouped[event.room].push(event);
      }
    });

    return grouped;
  }, [events]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-2xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex overflow-hidden">
      {/* Left side: Time column + Calendar */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Date header (only show if not today) */}
        {!isToday && (
          <div className="bg-gray-700 text-center py-2 text-lg font-semibold border-b border-gray-600">
            {dateLabel}
          </div>
        )}

        {/* Header row with floors and rooms */}
        <div className="flex bg-gray-800 border-b border-gray-600 shrink-0">
          {/* Empty cell for time column */}
          <div className="w-16 shrink-0"></div>
          {/* Floor 1 */}
          <div className="flex-1 border-l border-gray-600">
            <div className="text-center py-1 text-gray-400 font-medium text-xs uppercase tracking-wide border-b border-gray-700">
              Floor 1
            </div>
            <div className="flex">
              {FLOOR_1_ROOMS.map((roomName, index) => {
                const colors = getRoomColor(roomName);
                return (
                  <div
                    key={roomName}
                    className={`flex-1 py-2 text-center ${index > 0 ? 'border-l border-gray-700' : ''}`}
                  >
                    <div className={`font-bold text-lg ${colors.textLight}`}>
                      {roomName.replace(' Room', '')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Floor 2 */}
          <div className="flex-1 border-l border-gray-600">
            <div className="text-center py-1 text-gray-400 font-medium text-xs uppercase tracking-wide border-b border-gray-700">
              Floor 2
            </div>
            <div className="flex">
              {FLOOR_2_ROOMS.map((roomName, index) => {
                const colors = getRoomColor(roomName);
                return (
                  <div
                    key={roomName}
                    className={`flex-1 py-2 text-center ${index > 0 ? 'border-l border-gray-700' : ''}`}
                  >
                    <div className={`font-bold text-lg ${colors.textLight}`}>
                      {roomName.replace(' Room', '')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Calendar grid */}
        <div ref={calendarRef} className="flex-1 overflow-y-auto relative">
          <div className="flex" style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}>
            {/* Time column */}
            <div className="w-16 shrink-0 relative bg-gray-800">
              {HOURS.map(hour => (
                <div
                  key={hour}
                  className="absolute w-full text-center text-gray-400 text-sm font-medium"
                  style={{ top: `${(hour - 8) * HOUR_HEIGHT}px` }}
                >
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Room columns - must match header order */}
            {ALL_DISPLAY_ROOMS.map(roomName => (
              <div key={roomName} className="flex-1 relative border-l border-gray-700">
                {/* Hour lines */}
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    className="absolute w-full border-t border-gray-700"
                    style={{ top: `${(hour - 8) * HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* Events */}
                {eventsByDisplayRoom[roomName]?.map(event => {
                  const style = getEventStyle(event);
                  const colors = getRoomColor(roomName);
                  const isProposal = event.isProposal && event.status !== 'confirmed';

                  return (
                    <div
                      key={event.id}
                      className={`absolute left-1 right-1 rounded-lg p-2 overflow-hidden border-l-4 ${colors.border} ${colors.bg} ${isProposal ? 'opacity-70 border-dashed' : ''}`}
                      style={style}
                    >
                      <div className={`font-bold text-sm ${colors.text} truncate`}>
                        {event.title}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {formatTime(new Date(event.startTime))} - {formatTime(new Date(event.endTime))}
                      </div>
                      {event.authorUsername && (
                        <div className="text-xs text-gray-500 truncate">
                          by @{event.authorUsername}
                        </div>
                      )}
                      {isProposal && event.rsvpCount !== undefined && event.minRsvps !== undefined && (
                        <div className="text-xs text-gray-500 mt-1">
                          {event.rsvpCount}/{event.minRsvps} RSVPs
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Current time indicator (only show for today) */}
            {isToday && currentTime.getHours() >= 8 && currentTime.getHours() < 23 && (
              <div
                className="absolute left-0 right-0 flex items-center pointer-events-none z-10"
                style={{ top: `${getCurrentTimePosition()}px` }}
              >
                <div className="w-16 shrink-0 flex justify-end pr-1">
                  <div className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded font-bold">
                    NOW
                  </div>
                </div>
                <div className="flex-1 h-0.5 bg-red-500"></div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Activity Column */}
      <div className="w-72 bg-gray-800 border-l border-gray-600 flex flex-col shrink-0">
        {/* Header matching the floor headers */}
        <div className="border-b border-gray-600 shrink-0">
          <div className="text-center py-1 text-gray-400 font-medium text-xs uppercase tracking-wide border-b border-gray-700">
            Live Activity
          </div>
          <div className="py-2 text-center">
            <div className="font-bold text-lg text-gray-300">Real-time</div>
          </div>
        </div>

        {/* Activity feed */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {activities.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p className="text-sm">No recent activity</p>
            </div>
          ) : (
            activities.map(activity => (
              <div
                key={activity.id}
                className="bg-gray-700 rounded-lg p-2 animate-fade-in"
              >
                <div className="flex items-start gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm shrink-0 ${
                    activity.type === 'rsvp' ? 'bg-purple-500' :
                    activity.type === 'workshop' ? 'bg-blue-500' :
                    'bg-green-500'
                  }`}>
                    {activity.type === 'rsvp' ? '✋' :
                     activity.type === 'workshop' ? '📅' : '💰'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-200">{activity.message}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatRelativeTime(activity.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
