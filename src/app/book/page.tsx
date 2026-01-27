'use client';

/**
 * Book a Room page
 * Quick room booking interface - tap a time slot to book
 * Creates private calendar events with payment confirmation
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredCredentials, getServerNpub, publishToAllRelays } from '@/lib/nostr';
import { getStoredSecretKey, decodeNsec, createCalendarEventClient, NOSTR_KINDS } from '@/lib/nostr-events';
import { useNostrPublisher } from '@/hooks/useNostrPublisher';
import settings from '../../../settings.json';

const EVENT_TIMEZONE = settings.timezone || 'Europe/Brussels';

// Build room config from settings.json with hourly costs
interface RoomConfig {
  id: string;
  name: string;
  slug: string;
  shortName: string;
  hourlyCost: number;
}

// Get hourly cost from settings.json for a room
function getRoomHourlyCost(roomName: string): number {
  const room = (settings.rooms as Array<{ name: string; hourlyCost?: number }>)?.find(
    r => r.name === roomName
  );
  return room?.hourlyCost || 1;
}

// Rooms to show (in order): phonebooth, mushroom, satoshi, angel
const BOOKING_ROOMS: RoomConfig[] = [
  { id: 'Phone Booth', name: 'Phone Booth', slug: 'phonebooth', shortName: 'Phone', hourlyCost: getRoomHourlyCost('Phone Booth') },
  { id: 'Mush Room', name: 'Mush Room', slug: 'mushroom', shortName: 'Mush', hourlyCost: getRoomHourlyCost('Mush Room') },
  { id: 'Satoshi Room', name: 'Satoshi Room', slug: 'satoshi', shortName: 'Satoshi', hourlyCost: getRoomHourlyCost('Satoshi Room') },
  { id: 'Angel Room', name: 'Angel Room', slug: 'angel', shortName: 'Angel', hourlyCost: getRoomHourlyCost('Angel Room') },
];

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

// Generate time slots from 8:00 to 22:00 (half-hour increments)
function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let hour = 8; hour < 22; hour++) {
    slots.push(`${hour.toString().padStart(2, '0')}:00`);
    slots.push(`${hour.toString().padStart(2, '0')}:30`);
  }
  return slots;
}

interface BookedSlot {
  room: string;
  startTime: string;
  endTime: string;
  title?: string;
  status?: 'confirmed' | 'pending';
  eventId?: string;
  author?: string;
  authorUsername?: string;
  isProposal?: boolean;
}

interface PendingBooking {
  id: string;
  room: string;
  time: string;
  startTime: string;
  endTime: string;
  paymentRequestId?: string;
  status: 'pending' | 'confirmed' | 'failed';
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

  // Payment publisher hook
  const { publishPaymentRequest, isPublishing } = useNostrPublisher();

  // WebSocket ref for subscribing to server calendar updates
  const wsRef = useRef<WebSocket | null>(null);

  const timeSlots = generateTimeSlots();

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
          status: event.proposalStatus === 'tentative' ? 'pending' : 'confirmed',
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

  // Check if a slot is available for a given room and time
  const isSlotAvailable = (roomId: string, timeStr: string): boolean => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(hours, minutes, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

    // Check against booked slots
    for (const booked of bookedSlots) {
      if (booked.room !== roomId) continue;

      const bookedStart = new Date(booked.startTime);
      const bookedEnd = new Date(booked.endTime);

      // Check for overlap
      if (slotStart < bookedEnd && slotEnd > bookedStart) {
        return false;
      }
    }

    // Check against pending bookings
    for (const pending of pendingBookings) {
      if (pending.room !== roomId || pending.status === 'failed') continue;

      const pendingStart = new Date(pending.startTime);
      const pendingEnd = new Date(pending.endTime);

      if (slotStart < pendingEnd && slotEnd > pendingStart) {
        return false;
      }
    }

    // Check if slot is in the past
    const now = new Date();
    if (slotStart < now) {
      return false;
    }

    return true;
  };

  // Check if a slot is pending
  const isSlotPending = (roomId: string, timeStr: string): boolean => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(hours, minutes, 0, 0);

    for (const pending of pendingBookings) {
      if (pending.room !== roomId || pending.status !== 'pending') continue;

      const pendingStart = new Date(pending.startTime);
      if (slotStart.getTime() === pendingStart.getTime()) {
        return true;
      }
    }

    return false;
  };

  // Get booking info for a slot (returns the booking that covers this time slot)
  const getSlotBooking = (roomId: string, timeStr: string): BookedSlot | null => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(hours, minutes, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000); // 30 min slot

    for (const booked of bookedSlots) {
      if (booked.room !== roomId) continue;

      const bookedStart = new Date(booked.startTime);
      const bookedEnd = new Date(booked.endTime);

      // Check if this slot falls within the booking
      if (slotStart >= bookedStart && slotStart < bookedEnd) {
        return booked;
      }
    }

    return null;
  };

  // Get display label for a booking
  const getBookingLabel = (booking: BookedSlot): string => {
    if (booking.authorUsername) {
      return booking.authorUsername;
    }
    if (booking.title) {
      // Truncate long titles
      return booking.title.length > 10 ? booking.title.slice(0, 8) + '...' : booking.title;
    }
    return 'Booked';
  };

  // Determine if this slot is the start, middle, or end of a multi-slot booking
  // Returns: 'start' | 'middle' | 'end' | 'single' | null (not booked)
  const getSlotPosition = (roomId: string, timeStr: string): { position: 'start' | 'middle' | 'end' | 'single' | null; booking: BookedSlot | null } => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(hours, minutes, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000); // 30 min slot

    for (const booked of bookedSlots) {
      if (booked.room !== roomId) continue;

      const bookedStart = new Date(booked.startTime);
      const bookedEnd = new Date(booked.endTime);

      // Check if this slot falls within the booking
      if (slotStart >= bookedStart && slotStart < bookedEnd) {
        const isFirstSlot = slotStart.getTime() === bookedStart.getTime();
        const isLastSlot = slotEnd.getTime() >= bookedEnd.getTime();

        // Calculate booking duration in slots
        const durationMs = bookedEnd.getTime() - bookedStart.getTime();
        const slotCount = Math.ceil(durationMs / (30 * 60 * 1000));

        if (slotCount === 1) {
          return { position: 'single', booking: booked };
        } else if (isFirstSlot) {
          return { position: 'start', booking: booked };
        } else if (isLastSlot) {
          return { position: 'end', booking: booked };
        } else {
          return { position: 'middle', booking: booked };
        }
      }
    }

    return { position: null, booking: null };
  };

  // Check if slot would extend past operating hours (22:00)
  const isSlotWithinHours = (timeStr: string): boolean => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(hours, minutes, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

    const closingTime = new Date(selectedDate);
    closingTime.setHours(22, 0, 0, 0);

    return slotEnd <= closingTime;
  };

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

  // Handle slot click - show confirmation dialog
  const handleSlotClick = (roomId: string, timeStr: string) => {
    if (!credentials || isBooking) return;
    if (!isSlotAvailable(roomId, timeStr) || !isSlotWithinHours(timeStr)) return;

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

  // Navigate dates
  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);

    // Don't allow going to past dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (newDate < today) return;

    setSelectedDate(newDate);
    // Clear pending bookings when changing date
    setPendingBookings([]);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  if (!credentials) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-14 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          {/* Duration Selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
            <div className="flex gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDuration(opt.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    duration === opt.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => changeDate(-1)}
              disabled={isToday(selectedDate)}
              className={`p-2 rounded-lg transition ${
                isToday(selectedDate)
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-900">
                {isToday(selectedDate) ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}
              </h2>
              <p className="text-sm text-gray-500">
                {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>

            <button
              onClick={() => changeDate(1)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Time Slot Grid */}
      <main className="max-w-4xl mx-auto px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading availability...</span>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {/* Room Headers */}
            <div className="grid grid-cols-5 border-b border-gray-200">
              <div className="p-2 text-xs font-medium text-gray-500 text-center">Time</div>
              {BOOKING_ROOMS.map((room) => (
                <div key={room.id} className="p-2 text-xs font-medium text-gray-700 text-center border-l border-gray-200">
                  <Link href={`/rooms/${room.slug}`} className="hover:text-blue-600 hover:underline">
                    {room.shortName}
                  </Link>
                </div>
              ))}
            </div>

            {/* Time Slots */}
            <div className="max-h-[60vh] overflow-y-auto">
              {timeSlots.map((time) => (
                <div key={time} className="grid grid-cols-5 border-b border-gray-100">
                  {/* Time Label */}
                  <div className="p-2 text-xs text-gray-500 text-center flex items-center justify-center">
                    {time}
                  </div>

                  {/* Room Slots */}
                  {BOOKING_ROOMS.map((room) => {
                    const available = isSlotAvailable(room.id, time) && isSlotWithinHours(time);
                    const isPending = isSlotPending(room.id, time);
                    const isCurrentlyBooking = bookingSlot?.room === room.id && bookingSlot?.time === time;
                    const { position, booking } = getSlotPosition(room.id, time);
                    const isBooked = position !== null;

                    // Build class names for booked slots
                    const getBookedClasses = () => {
                      const base = 'bg-red-100 cursor-not-allowed border-l-4 border-l-red-400';
                      switch (position) {
                        case 'start': return `${base} rounded-t border-t-2 border-t-red-400`;
                        case 'end': return `${base} rounded-b border-b-2 border-b-red-400`;
                        case 'single': return `${base} rounded border-2 border-red-400 border-l-4`;
                        case 'middle': return base;
                        default: return '';
                      }
                    };

                    return (
                      <div
                        key={`${room.id}-${time}`}
                        onClick={() => available && !isBooking && !isPending && handleSlotClick(room.id, time)}
                        className={`p-1 border-l border-gray-200 min-h-[44px] transition flex items-center justify-center ${
                          isCurrentlyBooking
                            ? 'bg-blue-100 animate-pulse cursor-wait'
                            : isPending
                            ? 'bg-yellow-100 cursor-wait'
                            : available
                            ? 'bg-green-50 hover:bg-green-100 cursor-pointer'
                            : isBooked
                            ? getBookedClasses()
                            : 'bg-gray-100 cursor-not-allowed'
                        }`}
                        title={booking ? `${booking.title || 'Booked'} (${booking.authorUsername || 'Unknown'})` : undefined}
                      >
                        {isCurrentlyBooking && (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        )}
                        {isPending && !isCurrentlyBooking && (
                          <div className="animate-pulse text-yellow-600 text-xs">...</div>
                        )}
                        {isBooked && !isCurrentlyBooking && !isPending && (
                          <>
                            {/* Only show label on first slot or single slot */}
                            {(position === 'start' || position === 'single') && (
                              <span className="text-[10px] text-red-700 font-medium truncate px-0.5">
                                {getBookingLabel(booking!)}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-600 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-50 border border-green-200 rounded"></div>
            <span>Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-100 border border-yellow-200 rounded"></div>
            <span>Pending</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-50 border border-red-200 rounded"></div>
            <span>Booked</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-100 border border-gray-200 rounded"></div>
            <span>Unavailable</span>
          </div>
        </div>

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
    </div>
  );
}
