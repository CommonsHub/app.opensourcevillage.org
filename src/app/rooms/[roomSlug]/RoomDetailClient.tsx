'use client';

/**
 * RoomDetailClient Component
 *
 * Client component for the room detail page showing room info,
 * image, and schedule with date navigation.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ProposalCostInfo from '@/components/ProposalCostInfo';

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

interface RoomInfo {
  id: string;
  name: string;
  capacity: number;
  hourlyCost?: number;
  location: string;
  furniture?: string;
  image?: string | null;
  thumbnail?: string | null;
}

interface RoomDetailClientProps {
  room: RoomInfo;
}

export default function RoomDetailClient({ room }: RoomDetailClientProps) {
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch events for this room on the selected date
  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const from = new Date(`${selectedDate}T00:00:00`);
        const to = new Date(`${selectedDate}T23:59:59`);

        const response = await fetch(
          `/api/calendar?rooms=${encodeURIComponent(room.name)}&from=${from.toISOString()}&to=${to.toISOString()}`
        );
        const data = await response.json();

        if (data.success) {
          // Sort events by start time
          const sortedEvents = (data.events || []).sort(
            (a: CalendarEvent, b: CalendarEvent) =>
              new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
          );
          setEvents(sortedEvents);
        }
      } catch (error) {
        console.error('Failed to fetch room events:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [room.name, selectedDate]);

  // Format time for display
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  };

  // Navigate dates
  const goToPreviousDay = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 1);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const goToNextDay = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + 1);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Room Image */}
      {room.image && (
        <div className="relative h-56 md:h-72 bg-gray-200">
          <img
            src={room.image}
            alt={room.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Room Info */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          {/* Quick stats */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>{room.capacity} people max</span>
            </div>
            {room.hourlyCost && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{room.hourlyCost} token{room.hourlyCost !== 1 ? 's' : ''}/hour</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{room.location}</span>
            </div>
          </div>

          {/* Furniture/Equipment */}
          {room.furniture && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">Equipment</h3>
              <p className="text-sm text-gray-600">{room.furniture}</p>
            </div>
          )}
        </div>

        {/* Date Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={goToPreviousDay}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="text-center">
            <h2 className="font-medium text-gray-900">{formatDate(selectedDate)}</h2>
            {!isToday && (
              <button
                onClick={goToToday}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Go to today
              </button>
            )}
          </div>

          <button
            onClick={goToNextDay}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Schedule */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h3 className="font-medium text-gray-900">Schedule</h3>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">
              Loading schedule...
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-gray-400 mb-2">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-gray-500 mb-3">No events scheduled</p>
              <Link
                href="/offers/create?type=workshop"
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Propose a workshop
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {events.map((event) => (
                <div
                  key={event.id}
                  className={`p-4 ${
                    event.isProposal
                      ? event.proposalStatus === 'confirmed'
                        ? 'bg-green-50'
                        : 'bg-yellow-50'
                      : 'bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className={`font-medium ${
                          event.isProposal
                            ? event.proposalStatus === 'confirmed'
                              ? 'text-green-900'
                              : 'text-yellow-900'
                            : 'text-gray-900'
                        }`}>
                          {event.title}
                        </p>
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
                      <p className={`text-sm ${
                        event.isProposal
                          ? event.proposalStatus === 'confirmed'
                            ? 'text-green-700'
                            : 'text-yellow-700'
                          : 'text-gray-600'
                      }`}>
                        {formatTime(event.startTime)} - {formatTime(event.endTime)}
                      </p>
                    </div>

                    {event.isProposal && event.offerId && (
                      <Link
                        href={`/offers/${event.offerId}`}
                        className="text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap"
                      >
                        View details
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Propose Workshop CTA */}
        <div className="mt-6">
          <Link
            href="/offers/create?type=workshop"
            className="block w-full text-center bg-orange-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-orange-700 transition"
          >
            Propose Workshop
          </Link>
          <ProposalCostInfo className="mt-2" />
        </div>
      </div>
    </div>
  );
}
