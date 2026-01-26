'use client';

/**
 * RoomDetailDrawer Component
 *
 * Shows detailed info about a room including image, capacity, location,
 * furniture, and upcoming schedule in a slide-up drawer.
 */

import { useState, useEffect } from 'react';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  room?: string;
  isProposal?: boolean;
  proposalStatus?: string;
}

export interface RoomInfo {
  id: string;
  name: string;
  capacity: number;
  hourlyCost?: number;
  location: string;
  furniture?: string;
  image?: string | null;
  thumbnail?: string | null;
}

interface RoomDetailDrawerProps {
  room: RoomInfo | null;
  isOpen: boolean;
  onClose: () => void;
  selectedDate?: string; // YYYY-MM-DD, defaults to today
}

export default function RoomDetailDrawer({
  room,
  isOpen,
  onClose,
  selectedDate,
}: RoomDetailDrawerProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch events for this room
  useEffect(() => {
    if (!room || !isOpen) return;

    const fetchEvents = async () => {
      setLoading(true);
      try {
        // Get events for the selected date (or today) through end of day
        const date = selectedDate || new Date().toISOString().split('T')[0];
        const from = new Date(`${date}T00:00:00`);
        const to = new Date(`${date}T23:59:59`);

        const response = await fetch(
          `/api/calendar?rooms=${encodeURIComponent(room.name)}&from=${from.toISOString()}&to=${to.toISOString()}`
        );
        const data = await response.json();

        if (data.success) {
          setEvents(data.events || []);
        }
      } catch (error) {
        console.error('Failed to fetch room events:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [room, isOpen, selectedDate]);

  // Format time for display
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  if (!room) return null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="bg-white rounded-t-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-xl">
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Header with close button */}
          <div className="flex items-center justify-between px-4 pb-3 border-b">
            <h2 className="text-lg font-semibold text-gray-900">{room.name}</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1">
            {/* Room Image - use image if available, fallback to thumbnail */}
            {(room.image || room.thumbnail) && (
              <div className="relative h-48 bg-gray-200">
                <img
                  src={room.image || room.thumbnail || ''}
                  alt={room.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Room Info */}
            <div className="p-4 space-y-4">
              {/* Quick stats */}
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>{room.capacity} people</span>
                </div>
                {room.hourlyCost && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{room.hourlyCost} token{room.hourlyCost !== 1 ? 's' : ''}/hour</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{room.location}</span>
                </div>
              </div>

              {/* Furniture */}
              {room.furniture && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-1">Equipment</h3>
                  <p className="text-sm text-gray-600">{room.furniture}</p>
                </div>
              )}

              {/* Schedule */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Schedule for {formatDate(selectedDate || new Date().toISOString())}
                </h3>

                {loading ? (
                  <div className="text-sm text-gray-500 py-4 text-center">
                    Loading schedule...
                  </div>
                ) : events.length === 0 ? (
                  <div className="text-sm text-gray-500 py-4 text-center bg-gray-50 rounded-lg">
                    No events scheduled
                  </div>
                ) : (
                  <div className="space-y-2">
                    {events.map((event) => (
                      <div
                        key={event.id}
                        className={`p-3 rounded-lg border ${
                          event.isProposal
                            ? event.proposalStatus === 'confirmed'
                              ? 'bg-green-50 border-green-200'
                              : 'bg-yellow-50 border-yellow-200'
                            : 'bg-blue-50 border-blue-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium text-sm truncate ${
                              event.isProposal
                                ? event.proposalStatus === 'confirmed'
                                  ? 'text-green-900'
                                  : 'text-yellow-900'
                                : 'text-blue-900'
                            }`}>
                              {event.title}
                            </p>
                            <p className={`text-xs ${
                              event.isProposal
                                ? event.proposalStatus === 'confirmed'
                                  ? 'text-green-700'
                                  : 'text-yellow-700'
                                : 'text-blue-700'
                            }`}>
                              {formatTime(event.startTime)} - {formatTime(event.endTime)}
                            </p>
                          </div>
                          {event.isProposal && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              event.proposalStatus === 'confirmed'
                                ? 'bg-green-200 text-green-800'
                                : 'bg-yellow-200 text-yellow-800'
                            }`}>
                              {event.proposalStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
