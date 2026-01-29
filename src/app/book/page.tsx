'use client';

/**
 * Book a Room page
 * Quick room booking interface - tap a time slot to book
 * Creates private calendar events with payment confirmation
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredCredentials, getServerNpub, publishToAllRelays } from '@/lib/nostr';
import { getStoredSecretKey, decodeNsec, createCalendarEventClient, NOSTR_KINDS, formatTime, formatRelativeDate } from '@/lib/nostr-events';
import { useNostrPublisher } from '@/hooks/useNostrPublisher';
import BookingGrid, { BookedSlot, RoomConfig, PendingSlot } from '@/components/BookingGrid';
import settings from '../../../settings.json';

const EVENT_TIMEZONE = settings.timezone || 'Europe/Brussels';

// Load rooms from settings.json, filter for "private" type, sorted by capacity (small to large)
const BOOKING_ROOMS: RoomConfig[] = (settings.rooms as Array<{
  name: string;
  slug: string;
  hourlyCost?: number;
  capacity?: number;
  location?: string;
  furniture?: string;
  image?: string;
  thumbnail?: string;
  types?: string[];
  floor?: string;
}>)
  .filter(room => !room.types || room.types.includes('private'))
  .map(room => ({
    id: room.name,
    name: room.name,
    slug: room.slug,
    hourlyCost: room.hourlyCost || 1,
    capacity: room.capacity,
    location: room.location,
    furniture: room.furniture,
    image: room.image || null,
    thumbnail: room.thumbnail || null,
    types: room.types,
    floor: room.floor,
  }));

// Calculate booking cost based on room hourly rate and duration
function calculateBookingCost(roomId: string, durationMinutes: number): number {
  const room = BOOKING_ROOMS.find(r => r.id === roomId);
  if (!room) return 1;
  // Calculate cost: hourly rate * (duration / 60)
  // Round up to nearest 0.5 token
  const hours = durationMinutes / 60;
  const cost = room.hourlyCost * hours;
  return Math.ceil(cost * 2) / 2; // Round up to nearest 0.5
}

const DURATION_OPTIONS = [
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
  { value: 90, label: '1h30' },
  { value: 120, label: '2h' },
];

interface PendingBooking {
  id: string;
  room: string;
  roomName: string;
  time: string;
  startTime: string;
  endTime: string;
  paymentRequestId?: string;
  status: 'pending' | 'confirmed' | 'failed';
}

interface ConfirmedBooking {
  roomName: string;
  date: string;
  time: string;
  endTime: string;
}

export default function BookRoomPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{ username: string; npub: string } | null>(null);
  const [duration, setDuration] = useState(60); // Default 1 hour
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([]);
  const [pendingBookings, setPendingBookings] = useState<PendingBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<{ room: string; time: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingBooking, setPendingBooking] = useState<{ room: string; time: string } | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  // Payment publisher hook
  const { publishPaymentRequest, publishNote, isPublishing } = useNostrPublisher();

  // WebSocket ref for subscribing to server calendar updates
  const wsRef = useRef<WebSocket | null>(null);

  // Check auth on mount
  useEffect(() => {
    const creds = getStoredCredentials();
    if (!creds) {
      router.push('/badge');
      return;
    }
    setCredentials(creds);
  }, [router]);

  // Load booked slots for the selected date
  const loadBookedSlots = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const params = new URLSearchParams({
        from: startOfDay.toISOString(),
        to: endOfDay.toISOString(),
      });

      const response = await fetch(`/api/calendar?${params}`);
      const data = await response.json();

      if (data.success && data.events) {
        // Calendar API returns proposalStatus (tentative/confirmed/cancelled) and offerId for proposals
        const slots: BookedSlot[] = data.events.map((event: {
          room?: string;
          startTime: string;
          endTime: string;
          title?: string;
          proposalStatus?: string;
          offerId?: string;
          id?: string;
          author?: string;
          authorUsername?: string;
          isProposal?: boolean;
        }) => ({
          room: event.room || '',
          startTime: event.startTime,
          endTime: event.endTime,
          title: event.title,
          status: event.proposalStatus === 'tentative' ? 'tentative' : 'confirmed',
          eventId: event.offerId || event.id,
          author: event.author,
          authorUsername: event.authorUsername,
          isProposal: event.isProposal,
        }));
        console.log('[Book] Loaded', slots.length, 'booked slots:', slots.map(s => ({ room: s.room, start: s.startTime, status: s.status, title: s.title })));
        setBookedSlots(slots);
      }
    } catch (err) {
      console.error('Failed to load booked slots:', err);
      setError('Failed to load availability');
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (credentials) {
      loadBookedSlots();
    }
  }, [credentials, loadBookedSlots]);

  // Subscribe to server's calendar events for booking confirmations
  useEffect(() => {
    if (!credentials || pendingBookings.length === 0) return;

    const hasPendingBookings = pendingBookings.some(b => b.status === 'pending');
    if (!hasPendingBookings) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const serverNpub = getServerNpub();
    const relayUrls = typeof window !== 'undefined' && window.__OSV_RELAY_URLS__;
    if (!serverNpub || !relayUrls || relayUrls.length === 0) {
      console.warn('[Book] No server npub or relay URLs available');
      return;
    }

    // Get the pending booking event IDs to watch for
    const pendingEventIds = pendingBookings
      .filter(b => b.status === 'pending')
      .map(b => b.id);

    console.log('[Book] Subscribing to server calendar events for pending bookings:', pendingEventIds);

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const relayUrl = relayUrls[0];
    const ws = new WebSocket(relayUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[Book] Connected to relay for server calendar events');
      const subId = `book_calendar_${Date.now()}`;

      // Decode server npub to pubkey hex
      let serverPubkey: string;
      try {
        const { nip19 } = require('nostr-tools');
        const decoded = nip19.decode(serverNpub);
        serverPubkey = decoded.data as string;
      } catch (e) {
        console.error('[Book] Failed to decode server npub:', e);
        return;
      }

      // Subscribe to calendar events (kind 31922) from the server
      // The receipt-listener publishes these when bookings/workshops are confirmed
      ws.send(JSON.stringify([
        'REQ',
        subId,
        {
          kinds: [NOSTR_KINDS.CALENDAR_EVENT],
          authors: [serverPubkey],
          since: Math.floor(Date.now() / 1000) - 300, // Last 5 minutes
        }
      ]));
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (!Array.isArray(data)) return;

        const [type, , event] = data;

        if (type === 'EVENT' && event?.kind === NOSTR_KINDS.CALENDAR_EVENT) {
          console.log('[Book] Received calendar event from server:', event.id?.slice(0, 8));

          // Check if this is a confirmation of one of our pending bookings
          // The d-tag contains the booking ID, status tag contains the status
          const dTag = event.tags?.find((t: string[]) => t[0] === 'd')?.[1];
          const statusTag = event.tags?.find((t: string[]) => t[0] === 'status')?.[1]?.toUpperCase();

          if (dTag && pendingEventIds.includes(dTag)) {
            // Status from NOSTR is uppercase: CONFIRMED, TENTATIVE, CANCELLED
            const newStatus = (statusTag === 'CONFIRMED' || statusTag === 'TENTATIVE') ? 'confirmed' : null;
            if (newStatus) {
              console.log('[Book] Booking status updated by server:', dTag, statusTag);

              // Find the booking to show in success modal
              const confirmedPendingBooking = pendingBookings.find(b => b.id === dTag);
              if (confirmedPendingBooking) {
                const startDate = new Date(confirmedPendingBooking.startTime);
                const endDate = new Date(confirmedPendingBooking.endTime);
                setConfirmedBooking({
                  roomName: confirmedPendingBooking.roomName,
                  date: startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                  time: startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                  endTime: endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                });
              }

              setPendingBookings(prev =>
                prev.map(b =>
                  b.id === dTag ? { ...b, status: newStatus } : b
                )
              );
              // Refresh the slots display
              loadBookedSlots();
            }
          }
        }
      } catch (e) {
        console.error('[Book] Error processing message:', e);
      }
    };

    ws.onerror = (err) => {
      console.error('[Book] WebSocket error:', err);
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [credentials, pendingBookings, loadBookedSlots]);

  // Convert local time to UTC
  const localTimeToUTC = (dateStr: string, timeStr: string): string => {
    const localDateStr = `${dateStr}T${timeStr}:00`;
    const asUTC = new Date(localDateStr + 'Z');

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: EVENT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(asUTC);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';

    const tzYear = parseInt(getPart('year'));
    const tzMonth = parseInt(getPart('month'));
    const tzDay = parseInt(getPart('day'));
    const tzHour = parseInt(getPart('hour'));
    const tzMinute = parseInt(getPart('minute'));

    const utcMs = asUTC.getTime();
    const tzDate = new Date(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, 0);
    const offsetMs = tzDate.getTime() - utcMs;

    const userIntendedLocal = new Date(localDateStr);
    const actualUTC = new Date(userIntendedLocal.getTime() - offsetMs);

    return actualUTC.toISOString();
  };

  // Handle slot click from BookingGrid - show confirmation dialog
  const handleSlotSelect = (roomId: string, timeStr: string) => {
    if (!credentials || isBooking) return;
    setPendingBooking({ room: roomId, time: timeStr });
  };

  // Cancel pending booking dialog
  const cancelBooking = () => {
    setPendingBooking(null);
  };

  // Confirm and execute booking
  const confirmBooking = async () => {
    if (!pendingBooking || !credentials || isBooking) return;

    const { room: roomId, time: timeStr } = pendingBooking;
    setPendingBooking(null);
    setIsBooking(true);
    setBookingSlot({ room: roomId, time: timeStr });
    setError(null);

    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const startTimeUTC = localTimeToUTC(dateStr, timeStr);
      const startDate = new Date(startTimeUTC);
      const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
      const endTimeUTC = endDate.toISOString();

      const roomName = BOOKING_ROOMS.find(r => r.id === roomId)?.name || roomId;
      const title = `${credentials.username}'s booking`;

      // Get secret key for signing events
      const nsec = getStoredSecretKey();
      console.log('[Book] Got nsec:', nsec ? `${nsec.slice(0, 10)}...` : 'null');
      if (!nsec) {
        throw new Error('No secret key found. Please log in again.');
      }

      const secretKey = decodeNsec(nsec);
      console.log('[Book] Decoded secretKey, length:', secretKey?.length);

      // Create NOSTR calendar event (kind 31922)
      // Use a temporary d-tag, the event ID will become the booking ID
      const tempDTag = `booking-${Date.now()}`;
      const nostrEvent = createCalendarEventClient(secretKey, {
        dTag: tempDTag,
        title,
        description: `Private room booking for ${roomName}`,
        startTime: startTimeUTC,
        endTime: endTimeUTC,
        location: roomId,
        tags: ['booking', 'private'],
      });

      // The NOSTR event ID is the booking ID
      const bookingId = nostrEvent.id;

      console.log('[Book] Created calendar event:', {
        id: bookingId,
        kind: nostrEvent.kind,
        pubkey: nostrEvent.pubkey?.slice(0, 16),
        tags: nostrEvent.tags?.length,
        sig: nostrEvent.sig ? 'present' : 'missing',
      });

      // Get relay URLs
      const relayUrls = typeof window !== 'undefined' && window.__OSV_RELAY_URLS__;
      console.log('[Book] Relay URLs:', relayUrls);

      // Publish calendar event directly to relays (pass secretKey for AUTH handling)
      console.log('[Book] Calling publishToAllRelays...');
      const calendarResult = await publishToAllRelays(nostrEvent, secretKey);
      console.log('[Book] publishToAllRelays result:', {
        successful: calendarResult.successful,
        failed: calendarResult.failed,
      });

      if (calendarResult.successful.length === 0) {
        const errors = calendarResult.failed.map(f => `${f.url}: ${f.error}`).join(', ');
        throw new Error(`Failed to publish booking to any relay. Errors: ${errors}`);
      }

      console.log('[Book] Calendar event published to', calendarResult.successful.length, 'relays');

      // Add to pending bookings immediately (yellow slot)
      const newPendingBooking: PendingBooking = {
        id: bookingId,
        room: roomId,
        roomName,
        time: timeStr,
        startTime: startTimeUTC,
        endTime: endTimeUTC,
        status: 'pending',
      };
      setPendingBookings(prev => [...prev, newPendingBooking]);

      // Publish payment request referencing the calendar event by its NOSTR event ID
      // Include structured booking data in description for receipt listener
      // NOTE: npub must be prefixed with 'nostr:' to pass relay's RejectUnprefixedNostrReferences policy
      console.log('[Book] Publishing payment request for booking, eventId:', bookingId);
      const bookingData = {
        type: 'booking',
        id: bookingId,  // This is now the NOSTR event ID
        title,
        room: roomId,
        roomName,
        startTime: startTimeUTC,
        endTime: endTimeUTC,
        author: `nostr:${credentials.npub}`,  // Prefix required by relay policy
        authorUsername: credentials.username,
      };
      const paymentResult = await publishPaymentRequest({
        sender: credentials.npub,
        recipient: credentials.npub, // For burn, same as sender
        amount: calculateBookingCost(roomId, duration),
        context: 'booking',
        relatedEventId: bookingId, // Now a valid NOSTR event ID (64-char hex)
        description: JSON.stringify(bookingData),
        method: 'burn',
      });

      if (paymentResult.success && paymentResult.eventId) {
        console.log('[Book] Payment request published:', paymentResult.eventId);

        // Update pending booking with payment request ID
        setPendingBookings(prev =>
          prev.map(b =>
            b.id === bookingId
              ? { ...b, paymentRequestId: paymentResult.eventId }
              : b
          )
        );

        // Publish human-readable kind 1 note for the booking
        const startTimeFormatted = formatTime(startDate);
        const endTimeFormatted = formatTime(endDate);
        const dateStr = formatRelativeDate(startDate);
        const noteContent = `Booking ${roomName} ${dateStr} from ${startTimeFormatted} to ${endTimeFormatted}`;
        publishNote({
          content: noteContent,
          referencedEventId: bookingId,
        });
      } else {
        throw new Error(paymentResult.error || 'Failed to publish payment request');
      }

    } catch (err) {
      console.error('Booking failed:', err);
      setError(err instanceof Error ? err.message : 'Booking failed');
      // Remove from pending on error
      setPendingBookings(prev => prev.filter(b => b.room !== pendingBooking.room || b.time !== pendingBooking.time));
    } finally {
      setIsBooking(false);
      setBookingSlot(null);
    }
  };

  // Get booking summary for confirmation dialog
  const getBookingSummary = () => {
    if (!pendingBooking) return null;
    const room = BOOKING_ROOMS.find(r => r.id === pendingBooking.room);
    const durationLabel = DURATION_OPTIONS.find(d => d.value === duration)?.label || `${duration}m`;
    const cost = calculateBookingCost(pendingBooking.room, duration);
    return {
      roomName: room?.name || pendingBooking.room,
      date: selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      time: pendingBooking.time,
      duration: durationLabel,
      cost,
      hourlyCost: room?.hourlyCost || 1,
    };
  };

  // Handle date change from BookingGrid
  const handleDateChange = (newDate: Date) => {
    setSelectedDate(newDate);
    // Clear pending bookings when changing date
    setPendingBookings([]);
  };

  // Handle duration change from BookingGrid
  const handleDurationChange = (newDuration: number) => {
    setDuration(newDuration);
  };

  // Convert pending bookings to PendingSlot format for BookingGrid
  const pendingSlots: PendingSlot[] = pendingBookings.map(pb => ({
    room: pb.room,
    startTime: pb.startTime,
    endTime: pb.endTime,
    status: pb.status,
  }));

  if (!credentials) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-4">
        <BookingGrid
          rooms={BOOKING_ROOMS}
          selectedDate={selectedDate}
          onDateChange={handleDateChange}
          duration={duration}
          onDurationChange={handleDurationChange}
          bookedSlots={bookedSlots}
          pendingSlots={pendingSlots}
          onSlotSelect={handleSlotSelect}
          processingSlot={bookingSlot}
          isLoading={isLoading}
          error={error}
          showDurationSelector={true}
          showDateNavigation={true}
        />

        {/* Instructions */}
        <p className="mt-4 text-center text-sm text-gray-500">
          Tap an available slot to book
        </p>
      </main>

      {/* Confirmation Dialog */}
      {pendingBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Booking</h3>

            {(() => {
              const summary = getBookingSummary();
              if (!summary) return null;
              return (
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Room</span>
                    <span className="font-medium text-gray-900">{summary.roomName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Date</span>
                    <span className="font-medium text-gray-900">{summary.date}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Time</span>
                    <span className="font-medium text-gray-900">{summary.time}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Duration</span>
                    <span className="font-medium text-gray-900">{summary.duration}</span>
                  </div>
                  <div className="border-t pt-3 flex justify-between text-sm">
                    <span className="text-gray-500">Cost</span>
                    <span className="font-semibold text-blue-600">{summary.cost} token{summary.cost !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              );
            })()}

            <div className="flex gap-3">
              <button
                onClick={cancelBooking}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmBooking}
                disabled={isBooking || isPublishing}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
              >
                {isBooking || isPublishing ? 'Booking...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {confirmedBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Booking Confirmed</h3>
            <div className="text-gray-600 mb-6">
              <p className="font-medium text-gray-900">{confirmedBooking.roomName}</p>
              <p>{confirmedBooking.date}</p>
              <p>{confirmedBooking.time} - {confirmedBooking.endTime}</p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => router.push('/')}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Go to Home
              </button>
              <button
                onClick={() => setConfirmedBooking(null)}
                className="w-full px-4 py-2 text-gray-600 hover:text-gray-800 transition font-medium"
              >
                Book another room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
