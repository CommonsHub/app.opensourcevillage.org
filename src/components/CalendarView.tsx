"use client";

/**
 * CalendarView Component - Shared calendar display for viewing events
 * Used by both /calendar and /calendar/[year]/[month]/[day] routes
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getStoredCredentials } from "@/lib/nostr";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useNostrPublisher } from "@/hooks/useNostrPublisher";
import RoomDetailDrawer, { RoomInfo } from "@/components/RoomDetailDrawer";
import WelcomeActions from "@/components/WelcomeActions";
import FloatingActionMenu from "@/components/FloatingActionMenu";
import settings from "../../settings.json";

// Get the configured timezone (defaults to Europe/Brussels)
const EVENT_TIMEZONE =
  (settings as { timezone?: string }).timezone || "Europe/Brussels";

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  location?: string;
  organizer?: string;
  room?: string;
  tags?: string[];
  status: "confirmed" | "tentative" | "cancelled";
  // Proposal-specific fields
  isProposal?: boolean;
  isOfficial?: boolean;
  proposalStatus?: string;
  offerId?: string;
  minRsvps?: number;
  rsvpCount?: number;
  rsvpList?: Array<{ username: string; npub: string }>;
  author?: string;
  authorUsername?: string;
}

// Build room info map for drawer from settings.json
const settingsRooms = (settings as { rooms?: Array<{ name: string; slug?: string }> }).rooms || [];
const ROOM_INFO: Record<string, RoomInfo> = {};
for (const room of settingsRooms) {
  const r = room as { name: string; slug?: string; capacity?: number; hourlyCost?: number; location?: string; furniture?: string; image?: string; thumbnail?: string };
  ROOM_INFO[r.name] = {
    id: r.slug || r.name,
    name: r.name,
    capacity: r.capacity || 0,
    hourlyCost: r.hourlyCost,
    location: r.location || "",
    furniture: r.furniture,
    image: r.image,
    thumbnail: r.thumbnail,
  };
}

interface Room {
  name: string;
  calendarId: string;
  capacity: number;
  location: string;
}

interface EventDates {
  start: string;
  end: string;
}

interface CalendarViewProps {
  initialDate: Date;
  eventDates: EventDates;
}

// Room colors for visual distinction
const ROOM_COLORS: Record<string, string> = {
  "Ostrom Room": "border-blue-500 bg-blue-50",
  "Satoshi Room": "border-orange-500 bg-orange-50",
  "Angel Room": "border-purple-500 bg-purple-50",
  "Mush Room": "border-green-500 bg-green-50",
  "Phone Booth": "border-gray-500 bg-gray-50",
};

const ROOM_BADGE_COLORS: Record<string, string> = {
  "Ostrom Room": "bg-blue-100 text-blue-800",
  "Satoshi Room": "bg-orange-100 text-orange-800",
  "Angel Room": "bg-purple-100 text-purple-800",
  "Mush Room": "bg-green-100 text-green-800",
  "Phone Booth": "bg-gray-100 text-gray-800",
};

export default function CalendarView({
  initialDate,
  eventDates,
}: CalendarViewProps) {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{
    username: string;
    npub: string;
  } | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<CalendarEvent[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState<string | null>(null);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const [userRsvps, setUserRsvps] = useState<Set<string>>(new Set()); // Set of offerIds user has RSVPed to

  // Room drawer state
  const [drawerRoom, setDrawerRoom] = useState<RoomInfo | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Nostr publisher hook for sending burn events
  const { publishPaymentRequest, isPublishing } = useNostrPublisher();

  // Parse event dates
  const eventStart = new Date(eventDates.start + "T00:00:00");
  const eventEnd = new Date(eventDates.end + "T23:59:59");

  // Token balance hook
  const {
    balance,
    refresh: refreshBalance,
  } = useTokenBalance(credentials?.npub || null);

  // Check if date is within event range
  const isDateInRange = useCallback(
    (date: Date): boolean => {
      const dateOnly = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      );
      const startOnly = new Date(
        eventStart.getFullYear(),
        eventStart.getMonth(),
        eventStart.getDate(),
      );
      const endOnly = new Date(
        eventEnd.getFullYear(),
        eventEnd.getMonth(),
        eventEnd.getDate(),
      );
      return dateOnly >= startOnly && dateOnly <= endOnly;
    },
    [eventStart, eventEnd],
  );

  // Format date for URL
  const formatDateForUrl = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `/calendar/${year}/${month}/${day}`;
  };

  useEffect(() => {
    const creds = getStoredCredentials();
    setCredentials(creds);
    loadRooms();
  }, []);

  // Load user's RSVPs when credentials are available
  useEffect(() => {
    const loadUserRsvps = async () => {
      if (!credentials?.npub) return;

      try {
        const response = await fetch(`/api/profile/${credentials.npub}`);
        const data = await response.json();

        if (data.success && data.profile?.rsvps) {
          // Get active RSVPs and store their offerIds
          const activeRsvpOfferIds = data.profile.rsvps
            .filter(
              (r: { status: string; offerId: string }) => r.status === "active",
            )
            .map((r: { offerId: string }) => r.offerId);
          setUserRsvps(new Set(activeRsvpOfferIds));
        }
      } catch (err) {
        console.error("Failed to load user RSVPs:", err);
      }
    };

    loadUserRsvps();
  }, [credentials?.npub]);

  // Validate initial date
  useEffect(() => {
    if (!isDateInRange(initialDate)) {
      setDateRangeError(
        `This date is outside the event period (${eventDates.start} to ${eventDates.end})`,
      );
    } else {
      setDateRangeError(null);
    }
  }, [initialDate, isDateInRange, eventDates]);


  // Load events when date or rooms change
  useEffect(() => {
    if (rooms.length > 0 && !dateRangeError) {
      loadEvents();
    }
  }, [selectedDate, rooms, dateRangeError]);

  // Extract available tags and filter events when selection changes
  useEffect(() => {
    // Extract unique tags from today's events
    const tags = new Set<string>();
    for (const event of events) {
      if (event.tags) {
        for (const tag of event.tags) {
          tags.add(tag);
        }
      }
    }
    setAvailableTags(Array.from(tags).sort());

    // Reset tag selection if current tag is no longer available
    if (selectedTag !== "all" && !tags.has(selectedTag)) {
      setSelectedTag("all");
    }

    applyFilters();
  }, [events, selectedTag]);

  const loadRooms = async () => {
    try {
      const response = await fetch("/api/calendar?rooms=");
      if (response.ok) {
        const data = await response.json();
        if (data.meta?.rooms) {
          const roomList: Room[] = data.meta.rooms.map((name: string) => ({
            name,
            calendarId: "",
            capacity: 0,
            location: "",
          }));
          setRooms(roomList);
        }
      }
    } catch (err) {
      console.error("Failed to load rooms:", err);
      setRooms([
        {
          name: "Ostrom Room",
          calendarId: "",
          capacity: 80,
          location: "2nd floor",
        },
        {
          name: "Satoshi Room",
          calendarId: "",
          capacity: 15,
          location: "2nd floor",
        },
        {
          name: "Angel Room",
          calendarId: "",
          capacity: 12,
          location: "2nd floor",
        },
        {
          name: "Mush Room",
          calendarId: "",
          capacity: 10,
          location: "1st floor",
        },
        {
          name: "Phone Booth",
          calendarId: "",
          capacity: 1,
          location: "Various",
        },
      ]);
    }
  };

  const loadEvents = useCallback(async () => {
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

      if (data.success) {
        setEvents(data.events || []);
      } else {
        setError(data.error || "Failed to load events");
        setEvents([]);
      }
    } catch (err) {
      console.error("Failed to load events:", err);
      setError("Failed to connect to server");
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  const applyFilters = () => {
    let filtered = [...events];

    if (selectedTag !== "all") {
      filtered = filtered.filter((e) => e.tags?.includes(selectedTag));
    }

    filtered.sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    setFilteredEvents(filtered);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: EVENT_TIMEZONE,
    });
  };

  const formatDuration = (startStr: string, endStr: string) => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.round(diffMs / 60000);

    if (diffMins < 60) {
      return `${diffMins} min`;
    }
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);

    // Check if new date is in range
    if (!isDateInRange(newDate)) {
      setDateRangeError(
        `Cannot navigate outside the event period (${eventDates.start} to ${eventDates.end})`,
      );
      return;
    }

    setDateRangeError(null);
    setSelectedDate(newDate);

    // Update URL without full page refresh
    router.push(formatDateForUrl(newDate), { scroll: false });
  };

  const goToDate = (date: Date) => {
    if (!isDateInRange(date)) {
      setDateRangeError(
        `This date is outside the event period (${eventDates.start} to ${eventDates.end})`,
      );
      return;
    }

    setDateRangeError(null);
    setSelectedDate(date);
    router.push(formatDateForUrl(date), { scroll: false });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const formatDateHeader = (date: Date) => {
    if (isToday(date)) {
      return "Today";
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (
      date.getDate() === tomorrow.getDate() &&
      date.getMonth() === tomorrow.getMonth() &&
      date.getFullYear() === tomorrow.getFullYear()
    ) {
      return "Tomorrow";
    }
    // For other days, just show the weekday name (e.g., "Wednesday")
    return date.toLocaleDateString("en-US", {
      weekday: "long",
    });
  };

  const getRoomColor = (roomName?: string) => {
    return roomName
      ? ROOM_COLORS[roomName] || "border-gray-300 bg-white"
      : "border-gray-300 bg-white";
  };

  const getRoomBadgeColor = (roomName?: string) => {
    return roomName
      ? ROOM_BADGE_COLORS[roomName] || "bg-gray-100 text-gray-800"
      : "bg-gray-100 text-gray-800";
  };

  // Check if we can navigate to previous/next day
  const canGoPrevious = isDateInRange(
    new Date(selectedDate.getTime() - 24 * 60 * 60 * 1000),
  );
  const canGoNext = isDateInRange(
    new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000),
  );

  // Format date for workshop proposal link
  const formatDateForWorkshop = (date: Date) => {
    return date.toISOString().split("T")[0];
  };

  // Toggle event expansion
  const toggleEventExpanded = (eventId: string) => {
    setExpandedEventId(expandedEventId === eventId ? null : eventId);
    setRsvpError(null);
  };

  // Handle RSVP - burn token and update calendar
  const handleRSVP = async (event: CalendarEvent) => {
    if (!credentials || !event.offerId) return;

    setRsvpLoading(event.id);
    setRsvpError(null);

    try {
      // Step 1: Send NOSTR payment request to burn 1 token
      console.log("[CalendarView] Publishing burn event for RSVP...");
      const burnResult = await publishPaymentRequest({
        recipient: credentials.npub, // For burn, recipient is self (not used)
        sender: credentials.npub,
        amount: 1,
        context: "rsvp",
        relatedEventId: event.offerId,
        description: `RSVP to "${event.title}"`,
        method: "burn",
      });

      if (!burnResult.success) {
        throw new Error(burnResult.error || "Failed to burn token");
      }

      console.log("[CalendarView] Burn event published:", burnResult.eventId);

      // Step 2: Call RSVP API to add user to calendar and increment counter
      console.log("[CalendarView] Calling RSVP API...");
      const response = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: event.offerId,
          npub: credentials.npub,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to RSVP");
      }

      console.log("[CalendarView] RSVP successful, new count:", data.rsvpCount);

      // Step 3: Update local event state with new RSVP count
      setEvents((prevEvents) =>
        prevEvents.map((e) =>
          e.id === event.id
            ? {
                ...e,
                rsvpCount: data.rsvpCount,
                proposalStatus: data.offerStatus,
              }
            : e,
        ),
      );

      // Step 4: Add to user's RSVPs so button hides
      if (event.offerId) {
        setUserRsvps((prev) => new Set([...prev, event.offerId!]));
      }

      // Refresh balance
      refreshBalance();
    } catch (err) {
      console.error("[CalendarView] RSVP failed:", err);
      setRsvpError(err instanceof Error ? err.message : "RSVP failed");
    } finally {
      setRsvpLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Date Range Error Banner */}
      {dateRangeError && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-2xl mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              <svg
                className="w-5 h-5 text-amber-600 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-amber-800 font-medium">
                  {dateRangeError}
                </p>
                <button
                  onClick={() => goToDate(eventStart)}
                  className="text-sm text-amber-700 hover:text-amber-900 underline mt-1"
                >
                  Go to event start ({eventDates.start})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Date Navigation */}
      <div className="bg-white border-b border-gray-200 sticky top-14 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => changeDate(-1)}
              disabled={!canGoPrevious}
              className={`p-2 rounded-lg transition ${
                canGoPrevious
                  ? "hover:bg-gray-100 text-gray-600"
                  : "text-gray-300 cursor-not-allowed"
              }`}
              aria-label="Previous day"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>

            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-900">
                {formatDateHeader(selectedDate)}
              </h2>
              <p className="text-sm text-gray-500">
                {selectedDate.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

            <button
              onClick={() => changeDate(1)}
              disabled={!canGoNext}
              className={`p-2 rounded-lg transition ${
                canGoNext
                  ? "hover:bg-gray-100 text-gray-600"
                  : "text-gray-300 cursor-not-allowed"
              }`}
              aria-label="Next day"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>

          {/* Today button */}
          {!isToday(selectedDate) && isDateInRange(new Date()) && (
            <div className="text-center mb-3">
              <button
                onClick={() => goToDate(new Date())}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Go to Today
              </button>
            </div>
          )}

          {/* Tag Filter - only show if there are tags */}
          {availableTags.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              <button
                onClick={() => setSelectedTag("all")}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
                  selectedTag === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                All
              </button>
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
                    selectedTag === tag
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Welcome Actions */}
        <div className="mb-6">
          <WelcomeActions
            username={credentials?.username}
            date={formatDateForWorkshop(selectedDate)}
          />
        </div>

        {/* Loading State */}
        {isLoading && !dateRangeError && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading events...</span>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && !dateRangeError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 font-medium">Error loading events</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
            <button
              onClick={loadEvents}
              className="mt-3 text-sm text-red-700 hover:text-red-800 font-medium underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Events List */}
        {!isLoading && !error && !dateRangeError && (
          <>
            {filteredEvents.length === 0 ? (
              <div className="bg-gray-100 rounded-lg p-8 text-center">
                <svg
                  className="w-12 h-12 text-gray-400 mx-auto mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-gray-600 mb-2">
                  {selectedTag === "all"
                    ? "No events scheduled for this day"
                    : `No events tagged "${selectedTag}" for this day`}
                </p>
                <p className="text-sm text-gray-500">
                  Be the first to propose a workshop!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 mb-4">
                  {filteredEvents.length} event
                  {filteredEvents.length !== 1 ? "s" : ""}{" "}
                  {selectedTag === "all"
                    ? ""
                    : `tagged "${selectedTag}"`}
                </p>

                {filteredEvents.map((event) => {
                  // Check if logged-in user is the author
                  const isAuthor =
                    credentials?.npub &&
                    event.author &&
                    credentials.npub === event.author;
                  const hasRsvped = event.offerId
                    ? userRsvps.has(event.offerId)
                    : false;
                  const isExpanded = expandedEventId === event.id;
                  const isRsvpLoading = rsvpLoading === event.id;
                  const canRsvp =
                    event.isProposal &&
                    event.offerId &&
                    !isAuthor &&
                    !hasRsvped &&
                    (event.rsvpCount || 0) < (event.minRsvps || 0);

                  return (
                    <div
                      key={event.id}
                      onClick={() => toggleEventExpanded(event.id)}
                      className={`bg-white rounded-lg shadow-sm border-l-4 cursor-pointer transition-all ${
                        event.isProposal
                          ? (event.rsvpCount || 0) >= (event.minRsvps || 0)
                            ? "border-green-500 bg-green-50"
                            : "border-orange-400 bg-orange-50"
                          : getRoomColor(event.room)
                      } ${isExpanded ? "ring-2 ring-blue-300" : "hover:shadow-md"}`}
                    >
                      {/* Collapsed View - Always visible */}
                      <div className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Time - duration - title on one line */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900 text-sm">
                                {formatTime(event.startTime)}
                              </span>
                              <span className="text-gray-400 text-sm">·</span>
                              <span className="text-gray-500 text-sm">
                                {formatDuration(event.startTime, event.endTime)}
                              </span>
                              <span className="text-gray-400 text-sm">·</span>
                              <span className="font-medium text-gray-900 truncate">
                                {event.title}
                              </span>
                            </div>
                          </div>
                          {/* Status badge */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {event.isProposal && (
                              <span
                                className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${
                                  (event.rsvpCount || 0) >=
                                  (event.minRsvps || 0)
                                    ? "bg-green-100 text-green-800"
                                    : "bg-orange-100 text-orange-800"
                                }`}
                              >
                                {event.rsvpCount || 0} RSVP
                                {(event.rsvpCount || 0) !== 1 ? "s" : ""}
                              </span>
                            )}
                            {!event.isProposal &&
                              event.status !== "confirmed" && (
                                <span
                                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                                    event.status === "tentative"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-red-100 text-red-800"
                                  }`}
                                >
                                  {event.status}
                                </span>
                              )}
                            {/* Expand/collapse indicator */}
                            <svg
                              className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Expanded View - Only when expanded */}
                      {isExpanded && (
                        <div
                          className="px-4 pb-4 border-t border-gray-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Proposed by / Organized by - Room */}
                          <div className="flex flex-wrap items-center gap-1 text-sm text-gray-600 mt-3 mb-2">
                            {event.isProposal && event.authorUsername ? (
                              <>
                                <span>Proposed by</span>
                                <a
                                  href={`/profile/${event.authorUsername}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(
                                      `/profile/${event.authorUsername}`,
                                    );
                                  }}
                                  className="text-blue-600 hover:underline font-medium"
                                >
                                  {event.authorUsername}
                                </a>
                              </>
                            ) : event.organizer ? (
                              <>
                                <span>Organized by</span>
                                <span className="font-medium">
                                  {event.organizer}
                                </span>
                              </>
                            ) : null}
                            {event.room && (
                              <>
                                <span className="text-gray-400 mx-1">in</span>
                                {ROOM_INFO[event.room] ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDrawerRoom(ROOM_INFO[event.room!]);
                                      setIsDrawerOpen(true);
                                    }}
                                    className="text-blue-600 hover:underline"
                                  >
                                    {event.room}
                                  </button>
                                ) : (
                                  <span>{event.room}</span>
                                )}
                              </>
                            )}
                          </div>

                          {/* Description */}
                          {event.description && (
                            <p className="text-sm text-gray-600 mb-3">
                              {event.description}
                            </p>
                          )}

                          {/* RSVP List */}
                          {event.isProposal &&
                            event.rsvpList &&
                            event.rsvpList.length > 0 && (
                              <div className="mb-3">
                                <p className="text-xs font-medium text-gray-500 mb-1">
                                  RSVPs:
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {event.rsvpList.map((rsvp) => (
                                    <a
                                      key={rsvp.npub}
                                      href={`/profile/${rsvp.username}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(
                                          `/profile/${rsvp.username}`,
                                        );
                                      }}
                                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                                    >
                                      {rsvp.username}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                          {/* Proposal RSVP Progress */}
                          {event.isProposal &&
                            event.minRsvps &&
                            event.minRsvps > 0 && (
                              <div className="mt-3 pt-3 border-t border-gray-100">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs text-gray-600">
                                    {event.rsvpCount || 0} / {event.minRsvps}{" "}
                                    RSVPs needed
                                  </span>
                                  {(event.rsvpCount || 0) >= event.minRsvps ? (
                                    <span className="text-xs text-green-600 font-medium">
                                      Confirmed!
                                    </span>
                                  ) : (
                                    <span className="text-xs text-orange-600 font-medium">
                                      {event.minRsvps - (event.rsvpCount || 0)}{" "}
                                      more needed
                                    </span>
                                  )}
                                </div>
                                {/* Progress bar */}
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                                  <div
                                    className={`h-full transition-all ${
                                      (event.rsvpCount || 0) >= event.minRsvps
                                        ? "bg-green-500"
                                        : "bg-orange-400"
                                    }`}
                                    style={{
                                      width: `${Math.min(100, ((event.rsvpCount || 0) / event.minRsvps) * 100)}%`,
                                    }}
                                  />
                                </div>

                                {/* RSVP Error */}
                                {rsvpError && expandedEventId === event.id && (
                                  <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                                    <p className="text-xs text-red-700">
                                      {rsvpError}
                                    </p>
                                  </div>
                                )}

                                {/* RSVP Button - only show if not the author and needs more RSVPs */}
                                {canRsvp && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRSVP(event);
                                    }}
                                    disabled={isRsvpLoading || isPublishing}
                                    className="w-full bg-orange-500 text-white text-sm font-medium py-3 px-4 rounded-lg hover:bg-orange-600 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                  >
                                    {isRsvpLoading ? (
                                      <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        <span>Burning token...</span>
                                      </>
                                    ) : (
                                      <>
                                        <span>RSVP</span>
                                        <span className="text-orange-200">
                                          (burns 1 token)
                                        </span>
                                      </>
                                    )}
                                  </button>
                                )}

                                {/* Message for already RSVPed */}
                                {hasRsvped && (
                                  <p className="text-xs text-blue-600 text-center py-2 font-medium">
                                    You have RSVPed to this workshop
                                  </p>
                                )}

                                {/* Message for author */}
                                {isAuthor &&
                                  (event.rsvpCount || 0) < event.minRsvps && (
                                    <p className="text-xs text-gray-500 text-center py-2">
                                      You proposed this workshop. Waiting for
                                      RSVPs.
                                    </p>
                                  )}

                                {/* Already confirmed message */}
                                {(event.rsvpCount || 0) >= event.minRsvps &&
                                  !isAuthor && (
                                    <p className="text-xs text-green-600 text-center py-2 font-medium">
                                      This workshop is now confirmed and will
                                      happen!
                                    </p>
                                  )}
                              </div>
                            )}

                          {/* Edit workshop link - only for author */}
                          {event.offerId && isAuthor && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <a
                                href={`/offers/${event.offerId}/edit`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/offers/${event.offerId}/edit`);
                                }}
                                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                Edit workshop details →
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Floating Action Menu */}
      {credentials && (
        <FloatingActionMenu date={formatDateForWorkshop(selectedDate)} />
      )}

      {/* Room Detail Drawer */}
      <RoomDetailDrawer
        room={drawerRoom}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        selectedDate={selectedDate.toISOString().split("T")[0]}
      />
    </div>
  );
}
