'use client';

/**
 * RoomAvailabilityGrid Component
 *
 * Shows a mini calendar with columns for each room displaying availability
 * at the selected date/time. Grays out rooms that are unavailable due to
 * capacity constraints or existing bookings.
 */

import { useState, useEffect } from 'react';
import RoomDetailDrawer, { RoomInfo } from './RoomDetailDrawer';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  room?: string;
  isProposal?: boolean;
  proposalStatus?: string;
  offerId?: string;
}

interface Room {
  id: string;
  name: string;
  capacity: number;
  hourlyCost?: number;
  location: string;
  furniture?: string;
  image?: string | null;
  thumbnail: string | null;
}

interface RoomAvailabilityGridProps {
  rooms: Room[];
  selectedDate: string;  // YYYY-MM-DD
  selectedTime: string;  // HH:MM
  duration: number;      // minutes
  requiredCapacity?: number;
  selectedRoom: string;
  onRoomSelect: (roomId: string) => void;
  excludeOfferId?: string;  // Exclude this offer from conflict checks (for edit mode)
}

interface RoomEvents {
  [roomName: string]: CalendarEvent[];
}

export default function RoomAvailabilityGrid({
  rooms,
  selectedDate,
  selectedTime,
  duration,
  requiredCapacity = 1,
  selectedRoom,
  onRoomSelect,
  excludeOfferId,
}: RoomAvailabilityGridProps) {
  const [events, setEvents] = useState<RoomEvents>({});
  const [loading, setLoading] = useState(false);
  const [drawerRoom, setDrawerRoom] = useState<RoomInfo | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Calculate time window for fetching events (selected time +/- 3 hours)
  const getTimeWindow = () => {
    if (!selectedDate || !selectedTime) return null;

    const startDateTime = new Date(`${selectedDate}T${selectedTime}:00`);
    if (isNaN(startDateTime.getTime())) return null;

    const windowStart = new Date(startDateTime.getTime() - 3 * 60 * 60 * 1000);
    const windowEnd = new Date(startDateTime.getTime() + 3 * 60 * 60 * 1000);

    return { windowStart, windowEnd, selectedStart: startDateTime };
  };

  // Fetch events for all rooms
  useEffect(() => {
    const fetchEvents = async () => {
      const timeWindow = getTimeWindow();
      if (!timeWindow) return;

      setLoading(true);
      try {
        const { windowStart, windowEnd } = timeWindow;
        const response = await fetch(
          `/api/calendar?from=${windowStart.toISOString()}&to=${windowEnd.toISOString()}`
        );
        const data = await response.json();

        if (data.success) {
          // Group events by room, excluding the current offer being edited
          const grouped: RoomEvents = {};
          rooms.forEach(room => {
            grouped[room.name] = [];
          });

          data.events.forEach((event: CalendarEvent) => {
            // Skip the event if it's the one being edited
            if (excludeOfferId && (
              event.offerId === excludeOfferId ||
              event.id === excludeOfferId ||
              event.id === `proposal-${excludeOfferId}`
            )) {
              return;
            }
            if (event.room && grouped[event.room]) {
              grouped[event.room].push(event);
            }
          });

          setEvents(grouped);
        }
      } catch (error) {
        console.error('Failed to fetch room events:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [selectedDate, selectedTime, rooms, excludeOfferId]);

  // Check if selected time slot conflicts with an event
  const hasConflict = (roomName: string): { hasConflict: boolean; conflictingEvent?: CalendarEvent } => {
    const timeWindow = getTimeWindow();
    if (!timeWindow) return { hasConflict: false };

    const { selectedStart } = timeWindow;
    const selectedEnd = new Date(selectedStart.getTime() + duration * 60 * 1000);
    const roomEvents = events[roomName] || [];

    for (const event of roomEvents) {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);

      // Skip zero-duration events
      if (eventStart.getTime() === eventEnd.getTime()) continue;

      // Check overlap
      if (selectedStart < eventEnd && selectedEnd > eventStart) {
        return { hasConflict: true, conflictingEvent: event };
      }
    }

    return { hasConflict: false };
  };

  // Format time for display
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Get events to display for a room (before, during, after selected time)
  const getDisplayEvents = (roomName: string): { before: CalendarEvent[]; during: CalendarEvent[]; after: CalendarEvent[] } => {
    const timeWindow = getTimeWindow();
    if (!timeWindow) return { before: [], during: [], after: [] };

    const { selectedStart } = timeWindow;
    const selectedEnd = new Date(selectedStart.getTime() + duration * 60 * 1000);
    const roomEvents = events[roomName] || [];

    const before: CalendarEvent[] = [];
    const during: CalendarEvent[] = [];
    const after: CalendarEvent[] = [];

    roomEvents.forEach(event => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);

      // Event ends before selected start
      if (eventEnd <= selectedStart) {
        before.push(event);
      }
      // Event starts after selected end
      else if (eventStart >= selectedEnd) {
        after.push(event);
      }
      // Event overlaps with selected time
      else {
        during.push(event);
      }
    });

    // Sort and limit
    before.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    after.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    return {
      before: before.slice(0, 1), // Show only closest event before
      during,
      after: after.slice(0, 1),   // Show only closest event after
    };
  };

  // Open room detail drawer
  const openRoomDetail = (room: Room, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent room selection
    setDrawerRoom(room);
    setIsDrawerOpen(true);
  };

  const timeWindow = getTimeWindow();
  if (!timeWindow || !selectedDate || !selectedTime) {
    return null; // Don't show until date/time is selected
  }

  return (
    <div className="mt-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Room Availability
      </label>

      {loading ? (
        <div className="text-sm text-gray-500 py-4 text-center">
          Loading availability...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rooms.map((room) => {
            const capacityOk = room.capacity >= requiredCapacity;
            const { hasConflict: isBusy, conflictingEvent } = hasConflict(room.name);
            const isAvailable = capacityOk && !isBusy;
            const displayEvents = getDisplayEvents(room.name);
            const isSelected = selectedRoom === room.id;

            return (
              <div
                key={room.id}
                className={`relative rounded-lg border-2 overflow-hidden transition ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : isAvailable
                    ? 'border-gray-200 hover:border-gray-300 bg-white'
                    : 'border-gray-200 bg-gray-100 opacity-60'
                }`}
              >
                {/* Room Image with Info Button */}
                {room.thumbnail ? (
                  <div className="relative h-24 bg-gray-200">
                    <img
                      src={room.thumbnail}
                      alt={room.name}
                      className="w-full h-full object-cover"
                    />
                    {/* Info button overlay */}
                    <button
                      type="button"
                      onClick={(e) => openRoomDetail(room, e)}
                      className="absolute top-2 right-2 w-6 h-6 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-sm transition"
                      title={`More info about ${room.name}`}
                    >
                      <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  /* Info button row for rooms without thumbnail */
                  <div className="flex justify-end p-2 pb-0">
                    <button
                      type="button"
                      onClick={(e) => openRoomDetail(room, e)}
                      className="w-5 h-5 text-gray-400 hover:text-gray-600 transition"
                      title={`More info about ${room.name}`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Clickable room selection area */}
                <button
                  type="button"
                  onClick={() => isAvailable && onRoomSelect(room.id)}
                  disabled={!isAvailable}
                  className={`w-full p-3 ${!room.thumbnail ? 'pt-1' : ''} text-left ${!isAvailable ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {/* Room Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className={`font-medium text-sm ${isAvailable ? 'text-gray-900' : 'text-gray-500'}`}>
                          {room.name}
                        </p>
                        <p className={`text-xs ${capacityOk ? 'text-gray-500' : 'text-red-500'}`}>
                          {room.capacity} people{room.hourlyCost ? ` · ${room.hourlyCost} token${room.hourlyCost !== 1 ? 's' : ''}/h` : ''}
                          {!capacityOk && ' (too small)'}
                        </p>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Mini Timeline */}
                  <div className="space-y-1">
                    {/* Events Before */}
                    {displayEvents.before.map((event, i) => (
                      <div key={`before-${i}`} className="text-xs bg-gray-100 rounded px-2 py-1 text-gray-600 truncate">
                        <span className="text-gray-400">{formatTime(event.startTime)}</span>{' '}
                        {event.title}
                      </div>
                    ))}

                    {/* Selected Time Slot */}
                    <div className={`text-xs rounded px-2 py-1.5 border-2 border-dashed ${
                      isBusy
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : 'bg-green-50 border-green-300 text-green-700'
                    }`}>
                      <span className="font-medium">{selectedTime}</span>
                      <span className="mx-1">-</span>
                      <span className="font-medium">
                        {new Date(new Date(`${selectedDate}T${selectedTime}:00`).getTime() + duration * 60000)
                          .toTimeString().slice(0, 5)}
                      </span>
                      {isBusy ? (
                        <span className="ml-1">(busy)</span>
                      ) : (
                        <span className="ml-1">(available)</span>
                      )}
                    </div>

                    {/* Conflicting Event */}
                    {isBusy && conflictingEvent && (
                      <div className="text-xs bg-red-100 rounded px-2 py-1 text-red-700 truncate">
                        <span className="text-red-500">{formatTime(conflictingEvent.startTime)}</span>{' '}
                        {conflictingEvent.title}
                        {conflictingEvent.isProposal && (
                          <span className="ml-1 text-red-400">
                            ({conflictingEvent.proposalStatus})
                          </span>
                        )}
                      </div>
                    )}

                    {/* Events After */}
                    {displayEvents.after.map((event, i) => (
                      <div key={`after-${i}`} className="text-xs bg-gray-100 rounded px-2 py-1 text-gray-600 truncate">
                        <span className="text-gray-400">{formatTime(event.startTime)}</span>{' '}
                        {event.title}
                      </div>
                    ))}
                  </div>
                </button>

                {/* Unavailable Overlay */}
                {!isAvailable && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-90">
                      {!capacityOk ? 'Capacity too small' : 'Time slot busy'}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Room Detail Drawer */}
      <RoomDetailDrawer
        room={drawerRoom}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        selectedDate={selectedDate}
      />
    </div>
  );
}
