'use client';

/**
 * BookingGrid Component
 *
 * Reusable time slot grid for room booking and workshop scheduling.
 * Shows a grid with time slots as rows and rooms as columns.
 * Room headers are clickable to show room details in a drawer.
 *
 * Used by:
 * - /book page for quick room booking
 * - OfferForm for workshop scheduling
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Info } from 'lucide-react';
import RoomDetailDrawer, { RoomInfo } from './RoomDetailDrawer';

export interface RoomConfig {
  id: string;
  name: string;
  slug: string;
  hourlyCost: number;
  capacity?: number;
  location?: string;
  furniture?: string;
  image?: string | null;
  thumbnail?: string | null;
  types?: string[];
  floor?: string;
}

export interface BookedSlot {
  room: string;
  startTime: string;
  endTime: string;
  title?: string;
  status?: 'confirmed' | 'pending' | 'tentative';
  eventId?: string;
  author?: string;
  authorUsername?: string;
  isProposal?: boolean;
}

export interface PendingSlot {
  room: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export const DURATION_OPTIONS = [
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
  { value: 90, label: '1h30' },
  { value: 120, label: '2h' },
];

// Generate time slots from 8:00 to 22:00 (half-hour increments)
export function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let hour = 8; hour < 22; hour++) {
    slots.push(`${hour.toString().padStart(2, '0')}:00`);
    slots.push(`${hour.toString().padStart(2, '0')}:30`);
  }
  return slots;
}

interface BookingGridProps {
  /** Array of rooms to display as columns */
  rooms: RoomConfig[];
  /** Currently selected date */
  selectedDate: Date;
  /** Callback when date changes */
  onDateChange: (date: Date) => void;
  /** Currently selected duration in minutes */
  duration: number;
  /** Callback when duration changes */
  onDurationChange: (duration: number) => void;
  /** Array of already booked slots */
  bookedSlots: BookedSlot[];
  /** Array of pending (not yet confirmed) bookings */
  pendingSlots?: PendingSlot[];
  /** Callback when a slot is selected */
  onSlotSelect: (room: string, time: string, date: Date) => void;
  /** Currently selected slot (for visual feedback) */
  selectedSlot?: { room: string; time: string } | null;
  /** Slot currently being processed (shows loading state) */
  processingSlot?: { room: string; time: string } | null;
  /** Whether the grid is in loading state */
  isLoading?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Exclude this offer ID from conflict checks (for edit mode) */
  excludeOfferId?: string;
  /** Show duration selector */
  showDurationSelector?: boolean;
  /** Show date navigation */
  showDateNavigation?: boolean;
  /** Custom grid height class */
  gridHeightClass?: string;
  /** Max attendees - rooms with capacity >= this will be pre-selected */
  maxAttendees?: number;
}

export default function BookingGrid({
  rooms,
  selectedDate,
  onDateChange,
  duration,
  onDurationChange,
  bookedSlots,
  pendingSlots = [],
  onSlotSelect,
  selectedSlot,
  processingSlot,
  isLoading = false,
  error,
  excludeOfferId,
  showDurationSelector = true,
  showDateNavigation = true,
  gridHeightClass = 'max-h-[60vh]',
  maxAttendees,
}: BookingGridProps) {
  const timeSlots = generateTimeSlots();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const verticalScrollRef = useRef<HTMLDivElement>(null);
  const hasScrolledToSelection = useRef(false);

  // Drawer state for room details
  const [drawerRoom, setDrawerRoom] = useState<RoomInfo | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Floor filter state - "all" shows all rooms
  const [floorFilter, setFloorFilter] = useState<string>('all');

  // Get unique floors from rooms
  const availableFloors = Array.from(new Set(rooms.map(r => r.floor).filter(Boolean))) as string[];

  // Current time state for "now" indicator line
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Check if selected date is today
  const isToday = useCallback((date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }, []);

  // Auto-scroll to selected slot or current time on mount
  useEffect(() => {
    // Wait for loading to complete and grid to be rendered
    if (isLoading || hasScrolledToSelection.current) return;

    // Use a small timeout to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      if (!verticalScrollRef.current) return;

      const slotHeight = 44; // Height of each time slot
      const containerHeight = verticalScrollRef.current.clientHeight;
      let scrollTop = 0;

      if (selectedSlot) {
        // Scroll to selected slot
        const slotIndex = timeSlots.findIndex(t => t === selectedSlot.time);
        if (slotIndex !== -1) {
          scrollTop = Math.max(0, (slotIndex * slotHeight) - (containerHeight / 2) + (slotHeight / 2));
          hasScrolledToSelection.current = true;
        }
      } else if (isToday(selectedDate)) {
        // Scroll to current time if viewing today
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        // Only scroll if current time is within operating hours (8:00 - 22:00)
        if (hours >= 8 && hours < 22) {
          const minutesSince8am = (hours - 8) * 60 + minutes;
          const slotIndex = Math.floor(minutesSince8am / 30);
          scrollTop = Math.max(0, (slotIndex * slotHeight) - (containerHeight / 2) + (slotHeight / 2));
          hasScrolledToSelection.current = true;
        }
      }

      if (scrollTop > 0 && verticalScrollRef.current) {
        verticalScrollRef.current.scrollTop = scrollTop;
        // Also sync the time column
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollTop;
        }
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [selectedSlot, selectedDate, timeSlots, isToday, isLoading]);

  // Filter rooms by floor
  const visibleRooms = floorFilter === 'all'
    ? rooms
    : rooms.filter(room => room.floor === floorFilter);

  // Calculate the position of the current time line (as percentage within the grid)
  const getCurrentTimePosition = (): { slotIndex: number; percentWithinSlot: number } | null => {
    if (!isToday(selectedDate)) return null;

    const now = currentTime;
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // Check if current time is within operating hours (8:00 - 22:00)
    if (hours < 8 || hours >= 22) return null;

    // Calculate which slot (0-indexed) and position within that slot
    // Each slot is 30 minutes, starting from 8:00
    const minutesSince8am = (hours - 8) * 60 + minutes;
    const slotIndex = Math.floor(minutesSince8am / 30);
    const percentWithinSlot = (minutesSince8am % 30) / 30 * 100;

    return { slotIndex, percentWithinSlot };
  };

  // Check if a slot is available for a given room and time
  const isSlotAvailable = useCallback((roomId: string, timeStr: string): boolean => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(hours, minutes, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

    // Check against booked slots
    for (const booked of bookedSlots) {
      if (booked.room !== roomId) continue;

      // Skip excluded offer (for edit mode)
      if (excludeOfferId && booked.eventId === excludeOfferId) continue;

      const bookedStart = new Date(booked.startTime);
      const bookedEnd = new Date(booked.endTime);

      // Check for overlap
      if (slotStart < bookedEnd && slotEnd > bookedStart) {
        return false;
      }
    }

    // Check against pending slots
    for (const pending of pendingSlots) {
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
  }, [selectedDate, duration, bookedSlots, pendingSlots, excludeOfferId]);

  // Check if a slot is pending
  const isSlotPending = useCallback((roomId: string, timeStr: string): boolean => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(hours, minutes, 0, 0);

    for (const pending of pendingSlots) {
      if (pending.room !== roomId || pending.status !== 'pending') continue;

      const pendingStart = new Date(pending.startTime);
      if (slotStart.getTime() === pendingStart.getTime()) {
        return true;
      }
    }

    return false;
  }, [selectedDate, pendingSlots]);

  // Get booking info for a slot (returns the booking that covers this time slot)
  const getSlotBooking = useCallback((roomId: string, timeStr: string): BookedSlot | null => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(hours, minutes, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000); // 30 min slot

    for (const booked of bookedSlots) {
      if (booked.room !== roomId) continue;

      // Skip excluded offer
      if (excludeOfferId && booked.eventId === excludeOfferId) continue;

      const bookedStart = new Date(booked.startTime);
      const bookedEnd = new Date(booked.endTime);

      // Check if this slot falls within the booking
      if (slotStart >= bookedStart && slotStart < bookedEnd) {
        return booked;
      }
    }

    return null;
  }, [selectedDate, bookedSlots, excludeOfferId]);

  // Get display label for a booking
  const getBookingLabel = (booking: BookedSlot): string => {
    if (booking.authorUsername) {
      return booking.authorUsername;
    }
    if (booking.title) {
      return booking.title.length > 10 ? booking.title.slice(0, 8) + '...' : booking.title;
    }
    return 'Booked';
  };

  // Determine if this slot is the start, middle, or end of a multi-slot booking
  const getSlotPosition = useCallback((roomId: string, timeStr: string): { position: 'start' | 'middle' | 'end' | 'single' | null; booking: BookedSlot | null } => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(hours, minutes, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000); // 30 min slot

    for (const booked of bookedSlots) {
      if (booked.room !== roomId) continue;

      // Skip excluded offer
      if (excludeOfferId && booked.eventId === excludeOfferId) continue;

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
  }, [selectedDate, bookedSlots, excludeOfferId]);

  // Check if slot would extend past operating hours (22:00)
  const isSlotWithinHours = useCallback((timeStr: string): boolean => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(hours, minutes, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

    const closingTime = new Date(selectedDate);
    closingTime.setHours(22, 0, 0, 0);

    return slotEnd <= closingTime;
  }, [selectedDate, duration]);

  // Navigate dates
  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);

    // Don't allow going to past dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (newDate < today) return;

    onDateChange(newDate);
  };

  // Check if a slot is currently selected (including duration range)
  const isSlotSelected = (roomId: string, timeStr: string): boolean => {
    if (!selectedSlot) return false;
    if (selectedSlot.room !== roomId) return false;

    // Parse the selected slot time
    const [selectedHours, selectedMinutes] = selectedSlot.time.split(':').map(Number);
    const selectedStart = new Date(selectedDate);
    selectedStart.setHours(selectedHours, selectedMinutes, 0, 0);
    const selectedEnd = new Date(selectedStart.getTime() + duration * 60 * 1000);

    // Parse this slot's time
    const [slotHours, slotMinutes] = timeStr.split(':').map(Number);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(slotHours, slotMinutes, 0, 0);

    // Check if this slot falls within the selected duration
    return slotStart >= selectedStart && slotStart < selectedEnd;
  };

  // Check if this is the first slot in the selection
  const isFirstSelectedSlot = (roomId: string, timeStr: string): boolean => {
    if (!selectedSlot) return false;
    return selectedSlot.room === roomId && selectedSlot.time === timeStr;
  };

  // Check if a slot is currently being processed
  const isSlotProcessing = (roomId: string, timeStr: string): boolean => {
    if (!processingSlot) return false;
    return processingSlot.room === roomId && processingSlot.time === timeStr;
  };

  // Handle slot click
  const handleSlotClick = (roomId: string, timeStr: string) => {
    if (!isSlotAvailable(roomId, timeStr) || !isSlotWithinHours(timeStr)) return;
    if (processingSlot) return; // Don't allow clicking while processing

    onSlotSelect(roomId, timeStr, selectedDate);
  };

  // Open room detail drawer
  const openRoomDetail = (room: RoomConfig, e: React.MouseEvent) => {
    e.stopPropagation();
    setDrawerRoom({
      id: room.id,
      name: room.name,
      capacity: room.capacity || 0,
      hourlyCost: room.hourlyCost,
      location: room.location || '',
      furniture: room.furniture,
      image: room.image,
      thumbnail: room.thumbnail,
    });
    setIsDrawerOpen(true);
  };

  // Column width for consistency
  const COLUMN_WIDTH = 80;
  const TIME_COLUMN_WIDTH = 50;

  return (
    <div>
      {/* Header with Duration and Date Navigation */}
      <div className="bg-white border-b border-gray-200 mb-4">
        {/* Duration Selector */}
        {showDurationSelector && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
            <div className="flex gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onDurationChange(opt.value)}
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
        )}

        {/* Date Navigation */}
        {showDateNavigation && (
          <div className="flex items-center justify-between">
            <button
              type="button"
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
              type="button"
              onClick={() => changeDate(1)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Floor Filter */}
      {availableFloors.length > 1 && (
        <div className="mb-4 flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Filter:</label>
          <select
            value={floorFilter}
            onChange={(e) => setFloorFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
          >
            <option value="all">All rooms</option>
            {availableFloors.map(floor => (
              <option key={floor} value={floor}>
                {floor.charAt(0).toUpperCase() + floor.slice(1)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Time Slot Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading availability...</span>
        </div>
      ) : visibleRooms.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          Select at least one room to view availability
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {/* Two-column layout: fixed time column + scrollable rooms */}
          <div className="flex">
            {/* Fixed Time Column */}
            <div className="flex-shrink-0 border-r border-gray-200" style={{ width: TIME_COLUMN_WIDTH }}>
              {/* Time header */}
              <div className="p-2 text-xs font-medium text-gray-500 text-center bg-white border-b border-gray-200" style={{ height: 40 }}>
                Time
              </div>
              {/* Time labels - synced scroll with room grid */}
              <div
                className={`${gridHeightClass} overflow-hidden`}
                ref={scrollContainerRef}
              >
                {timeSlots.map((time, slotIndex) => {
                  const currentTimePos = getCurrentTimePosition();
                  const isCurrentTimeSlot = currentTimePos && currentTimePos.slotIndex === slotIndex;

                  return (
                    <div key={time} className="relative">
                      {/* Current time indicator dot */}
                      {isCurrentTimeSlot && (
                        <div
                          className="absolute left-0 right-0 z-10 pointer-events-none flex items-center justify-end"
                          style={{ top: `${currentTimePos.percentWithinSlot}%` }}
                        >
                          <div className="w-2 h-2 bg-red-500 rounded-full mr-0.5"></div>
                        </div>
                      )}
                      <div
                        className="p-2 text-xs text-gray-500 text-center flex items-center justify-center bg-white border-b border-gray-100"
                        style={{ height: 44 }}
                      >
                        {time}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scrollable Room Grid */}
            <div className="flex-1 overflow-x-auto">
              <div style={{ minWidth: visibleRooms.length * COLUMN_WIDTH }}>
                {/* Room headers */}
                <div className="flex border-b border-gray-200" style={{ height: 40 }}>
                  {visibleRooms.map((room) => (
                    <div
                      key={room.id}
                      className="border-l border-gray-200 flex-shrink-0"
                      style={{ width: COLUMN_WIDTH }}
                    >
                      <button
                        type="button"
                        onClick={(e) => openRoomDetail(room, e)}
                        className="w-full h-full p-1 hover:bg-gray-50 transition group flex items-center justify-center"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-xs font-medium text-gray-700 group-hover:text-blue-600 truncate">
                            {room.slug}
                          </span>
                          <Info className="w-3 h-3 text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
                        </div>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Room slots - scrolls vertically and syncs with time column */}
                <div
                  ref={verticalScrollRef}
                  className={`${gridHeightClass} overflow-y-auto`}
                  onScroll={(e) => {
                    // Sync vertical scroll with time column
                    if (scrollContainerRef.current) {
                      scrollContainerRef.current.scrollTop = e.currentTarget.scrollTop;
                    }
                  }}
                >
                  {timeSlots.map((time, slotIndex) => {
                    const currentTimePos = getCurrentTimePosition();
                    const isCurrentTimeSlot = currentTimePos && currentTimePos.slotIndex === slotIndex;

                    return (
                      <div key={time} className="relative flex border-b border-gray-100">
                        {/* Current time indicator line */}
                        {isCurrentTimeSlot && (
                          <div
                            className="absolute left-0 right-0 z-10 pointer-events-none flex items-center"
                            style={{ top: `${currentTimePos.percentWithinSlot}%` }}
                          >
                            <div className="flex-1 h-0.5 bg-red-500"></div>
                          </div>
                        )}

                        {/* Room Slots */}
                        {visibleRooms.map((room) => {
                          const available = isSlotAvailable(room.id, time) && isSlotWithinHours(time);
                          const isPending = isSlotPending(room.id, time);
                          const isProcessing = isSlotProcessing(room.id, time);
                          const isSelected = isSlotSelected(room.id, time);
                          const isFirstSelected = isFirstSelectedSlot(room.id, time);
                          const { position, booking } = getSlotPosition(room.id, time);
                          const isBooked = position !== null;
                          const isTentative = booking?.status === 'tentative' || booking?.status === 'pending';

                          return (
                            <div
                              key={`${room.id}-${time}`}
                              onClick={() => available && !isProcessing && !isPending && handleSlotClick(room.id, time)}
                              className={`p-1 border-l border-gray-200 transition flex items-center justify-center flex-shrink-0 ${
                                isProcessing
                                  ? 'bg-blue-100 animate-pulse cursor-wait'
                                  : isSelected
                                  ? 'bg-blue-200 ring-2 ring-blue-500 ring-inset cursor-pointer'
                                  : isPending
                                  ? 'bg-yellow-100 cursor-wait'
                                  : available
                                  ? 'bg-green-50 hover:bg-green-100 cursor-pointer'
                                  : isBooked
                                  ? isTentative
                                    ? 'bg-yellow-100 cursor-not-allowed border-l-4 border-l-yellow-400'
                                    : 'bg-red-100 cursor-not-allowed border-l-4 border-l-red-400'
                                  : 'bg-gray-100 cursor-not-allowed'
                              }`}
                              style={{ width: COLUMN_WIDTH, height: 44 }}
                              title={booking ? `${booking.title || 'Booked'} (${booking.authorUsername || 'Unknown'})` : undefined}
                            >
                              {isProcessing && (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                              )}
                              {isPending && !isProcessing && (
                                <div className="animate-pulse text-yellow-600 text-xs">...</div>
                              )}
                              {isFirstSelected && !isProcessing && !isPending && (
                                <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}
                              {isBooked && !isProcessing && !isPending && !isSelected && (
                                <>
                                  {/* Only show label on first slot or single slot */}
                                  {(position === 'start' || position === 'single') && (
                                    <span className={`text-[10px] font-medium truncate px-0.5 ${isTentative ? 'text-yellow-700' : 'text-red-700'}`}>
                                      {getBookingLabel(booking!)}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
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
          <div className="w-4 h-4 bg-red-100 border border-red-200 rounded"></div>
          <span>Booked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-100 border border-gray-200 rounded"></div>
          <span>Unavailable</span>
        </div>
        {selectedSlot && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-200 border-2 border-blue-500 rounded"></div>
            <span>Selected</span>
          </div>
        )}
      </div>

      {/* Room Detail Drawer */}
      <RoomDetailDrawer
        room={drawerRoom}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        selectedDate={selectedDate.toISOString().split('T')[0]}
      />
    </div>
  );
}
