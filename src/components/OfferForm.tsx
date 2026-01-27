"use client";

/**
 * OfferForm Component
 * Reusable form for creating and editing offers/workshops
 *
 * For workshop proposals:
 * - Tokens are burned (not transferred) as skin-in-the-game
 * - Includes conflict checking against existing events
 * - minRsvps determines when proposal becomes confirmed
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useNostrPublisher } from "@/hooks/useNostrPublisher";
import RoomAvailabilityGrid from "@/components/RoomAvailabilityGrid";
import ProposalCostInfo from "@/components/ProposalCostInfo";
import { Offer } from "@/types";
import { getStoredSecretKey, decodeNsec, createCalendarEventClient } from "@/lib/nostr-events";
import settings from "../../settings.json";

// Get the configured timezone (defaults to Europe/Brussels)
const EVENT_TIMEZONE = settings.timezone || "Europe/Brussels";

/**
 * Convert a local date/time string to UTC ISO string
 * The input time is interpreted as being in the event timezone (e.g., Europe/Brussels)
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param timeStr - Time string in HH:MM format
 * @returns ISO string in UTC
 */
function localTimeToUTC(dateStr: string, timeStr: string): string {
  // Create a date string without timezone suffix
  const localDateStr = `${dateStr}T${timeStr}:00`;

  // Parse as if in the event timezone by using the formatter trick
  // First, create a date treating the input as UTC
  const asUTC = new Date(localDateStr + "Z");

  // Get what time it would be in the event timezone at that UTC time
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Parse the formatted string to get timezone offset
  const parts = formatter.formatToParts(asUTC);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || "0";

  const tzYear = parseInt(getPart("year"));
  const tzMonth = parseInt(getPart("month"));
  const tzDay = parseInt(getPart("day"));
  const tzHour = parseInt(getPart("hour"));
  const tzMinute = parseInt(getPart("minute"));

  // Calculate the offset: how much the timezone differs from UTC
  const utcMs = asUTC.getTime();
  const tzDate = new Date(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, 0);
  const offsetMs = tzDate.getTime() - utcMs;

  // Now create the actual date: the user entered localDateStr in EVENT_TIMEZONE
  // So we need to subtract the offset to get UTC
  const userIntendedLocal = new Date(localDateStr);
  const actualUTC = new Date(userIntendedLocal.getTime() - offsetMs);

  return actualUTC.toISOString();
}

export type OfferType = "workshop" | "1:1" | "other" | "private";

interface ConflictInfo {
  type: "confirmed" | "tentative";
  title: string;
  startTime: string;
  endTime: string;
}

interface ConflictsResponse {
  success: boolean;
  hasConfirmedConflict: boolean;
  hasTentativeConflict: boolean;
  conflicts: ConflictInfo[];
}

export const SUGGESTED_TAGS = [
  "web3",
  "ai",
  "workshop",
  "talk",
  "security",
  "1:1",
  "mentorship",
  "design",
  "networking",
  "open-source",
];

export const DURATION_OPTIONS = [
  { value: "30", label: "30mn" },
  { value: "60", label: "1h" },
  { value: "90", label: "1h30" },
  { value: "120", label: "2h" },
];

export const ROOMS = [
  {
    id: "Ostrom Room",
    name: "Ostrom Room",
    slug: "ostrom",
    capacity: 80,
    hourlyCost: 3,
    location: "2nd floor, main room",
    furniture: "Chairs, podium, large TV, sound system, microphones, boxes",
    image:
      "https://staging.commonshub.brussels/api/image-proxy?url=%2Fdata%2F2025%2F11%2Fdiscord%2Fimages%2F1443609673751068763.jpeg&size=lg&w=3840",
    thumbnail:
      "https://staging.commonshub.brussels/api/image-proxy?url=%2Fdata%2F2025%2F11%2Fdiscord%2Fimages%2F1443609673751068763.jpeg&size=sm",
  },
  {
    id: "Satoshi Room",
    name: "Satoshi Room",
    slug: "satoshi",
    capacity: 15,
    hourlyCost: 2,
    location: "2nd floor, across the bridge",
    furniture: "3 tables, 15 chairs, flipchart",
    image:
      "https://staging.commonshub.brussels/api/image-proxy?url=%2Fdata%2F2025%2F11%2Fdiscord%2Fimages%2F1443338805716451409.jpeg&size=lg&w=3840",
    thumbnail:
      "https://staging.commonshub.brussels/api/image-proxy?url=%2Fdata%2F2025%2F11%2Fdiscord%2Fimages%2F1443338805716451409.jpeg&size=sm",
  },
  {
    id: "Angel Room",
    name: "Angel Room",
    slug: "angel",
    capacity: 12,
    hourlyCost: 1,
    location: "2nd floor, in the back",
    image:
      "https://staging.commonshub.brussels/api/image-proxy?url=%2Fdata%2F2025%2F11%2Fdiscord%2Fimages%2F1443323689541173468.jpeg&size=lg&w=3840",
    thumbnail:
      "https://staging.commonshub.brussels/api/image-proxy?url=%2Fdata%2F2025%2F11%2Fdiscord%2Fimages%2F1443323689541173468.jpeg&size=sm",
  },
  {
    id: "Mush Room",
    name: "Mush Room",
    slug: "mush",
    capacity: 10,
    hourlyCost: 1,
    location: "1st floor in the back (mezzanine)",
    furniture: "8 chairs",
    image:
      "https://staging.commonshub.brussels/api/image-proxy?url=%2Fdata%2F2025%2F11%2Fdiscord%2Fimages%2F1443324550929584312.jpg&size=lg&w=3840",
    thumbnail:
      "https://staging.commonshub.brussels/api/image-proxy?url=%2Fdata%2F2025%2F11%2Fdiscord%2Fimages%2F1443324550929584312.jpg&size=sm",
  },
  {
    id: "Phone Booth",
    name: "Phone Booth",
    slug: "phone-booth",
    capacity: 1,
    hourlyCost: 1,
    location: "Various locations",
    thumbnail: null,
  },
];

interface OfferFormProps {
  mode: "create" | "edit";
  initialData?: Offer;
  credentials: { username: string; npub: string };
  /** Pre-filled values from URL params (create mode only) */
  prefill?: {
    type?: OfferType;
    room?: string;
    date?: string;
    time?: string;
    duration?: string;
    title?: string;
    description?: string;
    tags?: string[];
  };
  /** Called when submission completes successfully */
  onSuccess?: (offer: Offer) => void;
}

export default function OfferForm({
  mode,
  initialData,
  credentials,
  prefill,
  onSuccess,
}: OfferFormProps) {
  const router = useRouter();
  const { publishPaymentRequest, isPublishing } = useNostrPublisher();

  // Form state
  const [type, setType] = useState<OfferType>(
    initialData?.type || prefill?.type || "workshop"
  );
  const [title, setTitle] = useState(initialData?.title || prefill?.title || "");
  const [description, setDescription] = useState(
    initialData?.description || prefill?.description || ""
  );
  const [tags, setTags] = useState<string[]>(
    initialData?.tags || prefill?.tags || []
  );
  const [tagInput, setTagInput] = useState("");

  // Workshop-specific fields
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(prefill?.duration || "60");
  const [room, setRoom] = useState(initialData?.room || prefill?.room || "");
  const [minRsvps, setMinRsvps] = useState("");
  const [maxAttendees, setMaxAttendees] = useState("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Conflict checking state
  const [conflicts, setConflicts] = useState<ConflictsResponse | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  // Cancel event state (edit mode only)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Helper to get default date and time
  const getDefaultDateTime = () => {
    const now = new Date();
    const minutes = now.getMinutes();
    if (minutes > 30) {
      now.setHours(now.getHours() + 1);
    }
    now.setMinutes(0, 0, 0);

    if (now <= new Date()) {
      now.setHours(now.getHours() + 1);
    }

    const date = now.toISOString().split("T")[0];
    const time = now.toTimeString().slice(0, 5);
    return { date, time };
  };

  // Check for conflicts
  const checkConflicts = useCallback(async () => {
    if (!room || !startDate || !startTime || !duration) {
      setConflicts(null);
      return;
    }

    setCheckingConflicts(true);
    try {
      // Convert local time (in event timezone) to UTC
      const startUTC = localTimeToUTC(startDate, startTime);
      const durationMinutes = parseInt(duration);
      const start = new Date(startUTC);
      const end = new Date(start.getTime() + durationMinutes * 60000);

      // In edit mode, exclude the current offer from conflict check
      let url = `/api/calendar/conflicts?room=${encodeURIComponent(room)}&start=${start.toISOString()}&end=${end.toISOString()}`;
      if (mode === "edit" && initialData?.id) {
        url += `&excludeOfferId=${initialData.id}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setConflicts(data);
      }
    } catch (err) {
      console.error("Failed to check conflicts:", err);
    } finally {
      setCheckingConflicts(false);
    }
  }, [room, startDate, startTime, duration, mode, initialData?.id]);

  // Load settings from settings.json
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/env/check");
        const data = await response.json();
        if (data.settings?.defaults?.workshops?.attendees) {
          const { min, max } = data.settings.defaults.workshops.attendees;
          setMinRsvps((prev) => prev || String(min || 1));
          setMaxAttendees((prev) => prev || String(max || 10));
        } else {
          setMinRsvps((prev) => prev || "1");
          setMaxAttendees((prev) => prev || "10");
        }
        setSettingsLoaded(true);
      } catch (err) {
        console.error("Failed to load settings:", err);
        setMinRsvps((prev) => prev || "1");
        setMaxAttendees((prev) => prev || "10");
        setSettingsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  // Track if we've initialized the form (to prevent re-initialization on re-renders)
  const [initialized, setInitialized] = useState(false);

  // Initialize form with initial data or prefill values (only once)
  useEffect(() => {
    // Skip if already initialized
    if (initialized) return;

    if (initialData) {
      // Edit mode - extract date/time from startTime
      if (initialData.startTime) {
        const start = new Date(initialData.startTime);

        // Format date and time in the event timezone
        const dateFormatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: EVENT_TIMEZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        const timeFormatter = new Intl.DateTimeFormat("en-GB", {
          timeZone: EVENT_TIMEZONE,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });

        setStartDate(dateFormatter.format(start)); // YYYY-MM-DD format
        setStartTime(timeFormatter.format(start)); // HH:MM format

        // Calculate duration from startTime and endTime
        if (initialData.endTime) {
          const end = new Date(initialData.endTime);
          const durationMinutes = Math.round(
            (end.getTime() - start.getTime()) / 60000
          );
          const validDurations = ["30", "60", "90", "120"];
          if (validDurations.includes(String(durationMinutes))) {
            setDuration(String(durationMinutes));
          }
        }
      }

      if (initialData.minRsvps) {
        setMinRsvps(String(initialData.minRsvps));
      }
      if (initialData.maxAttendees) {
        setMaxAttendees(String(initialData.maxAttendees));
      }
      setInitialized(true);
    } else if (prefill) {
      // Create mode with prefill
      if (prefill.date) {
        setStartDate(prefill.date);
      } else {
        setStartDate(getDefaultDateTime().date);
      }

      if (prefill.time) {
        setStartTime(prefill.time);
      } else {
        setStartTime(getDefaultDateTime().time);
      }

      if (prefill.room) {
        // Room may be passed as slug, convert to id
        const matchedRoom = ROOMS.find((r) => r.slug === prefill.room || r.id === prefill.room);
        if (matchedRoom) {
          setRoom(matchedRoom.id);
        }
      }
      setInitialized(true);
    } else {
      // Create mode without prefill - set defaults
      const { date, time } = getDefaultDateTime();
      setStartDate(date);
      setStartTime(time);
      setInitialized(true);
    }
  }, [initialData, prefill, initialized]);

  // Check conflicts when schedule changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      checkConflicts();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [checkConflicts]);

  const showScheduleFields = type === "workshop" || type === "1:1";
  const isTypeFixed = mode === "edit" || !!prefill?.type;

  // Calculate proposal cost based on room and duration
  const selectedRoom = ROOMS.find((r) => r.id === room);
  const durationHours = parseInt(duration) / 60;
  const proposalCost = selectedRoom
    ? Math.ceil(selectedRoom.hourlyCost * durationHours)
    : 1;

  const addTag = (tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (normalizedTag && !tags.includes(normalizedTag)) {
      setTags([...tags, normalizedTag]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(tagInput);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Block if there's a confirmed conflict
    if (conflicts?.hasConfirmedConflict) {
      setError("Cannot save: time slot has a confirmed booking.");
      return;
    }

    setIsLoading(true);
    setError("");
    setWarning("");

    try {
      // Build request body
      const body: Record<string, unknown> = {
        type,
        title: title.trim(),
        description: description.trim(),
        tags,
        npub: credentials.npub,
      };

      // Add schedule fields for workshops/1:1
      if (showScheduleFields) {
        if (startDate && startTime) {
          // Convert local time (in event timezone) to UTC
          body.startTime = localTimeToUTC(startDate, startTime);
        }

        if (duration) {
          const durationMinutes = parseInt(duration);
          if (startDate && startTime && body.startTime) {
            const start = new Date(body.startTime as string);
            const end = new Date(start.getTime() + durationMinutes * 60000);
            body.endTime = end.toISOString();
          }
        }

        if (room) body.room = room;
        if (minRsvps) body.minRsvps = parseInt(minRsvps);
        if (maxAttendees) body.maxAttendees = parseInt(maxAttendees);

        // Create NOSTR calendar event (kind 31922) for workshops
        if (type === "workshop" && startDate && startTime && body.startTime && body.endTime) {
          try {
            const nsec = getStoredSecretKey();
            if (nsec) {
              const secretKey = decodeNsec(nsec);
              // Use existing d-tag in edit mode, or create new one
              const dTag = mode === "edit" && initialData?.nostrDTag
                ? initialData.nostrDTag
                : `offer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

              const calendarEvent = createCalendarEventClient(secretKey, {
                dTag,
                title: title.trim(),
                description: description.trim(),
                startTime: body.startTime as string,
                endTime: body.endTime as string,
                location: room,
                tags,
              });

              body.nostrEvent = calendarEvent;
              console.log("[OfferForm] Created NOSTR calendar event:", calendarEvent.id);
            } else {
              console.warn("[OfferForm] No secret key found, skipping NOSTR calendar event");
            }
          } catch (nostrError) {
            console.error("[OfferForm] Failed to create NOSTR calendar event:", nostrError);
            // Continue without NOSTR event - offer will still be created
          }
        }
      }

      let response: Response;
      let data: { success: boolean; error?: string; offer?: Offer; conflictWarning?: string; pendingBurn?: boolean };

      if (mode === "edit" && initialData) {
        // Update existing offer
        response = await fetch(`/api/offers/${initialData.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        data = await response.json();
      } else {
        // Create new offer
        response = await fetch("/api/offers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        data = await response.json();
      }

      if (!data.success) {
        setError(data.error || `Failed to ${mode} offer`);
        setIsLoading(false);
        return;
      }

      // Show warning about tentative conflicts if any
      if (data.conflictWarning) {
        setWarning(data.conflictWarning);
      }

      // If pendingBurn is true (create mode only), publish burn payment request
      if (mode === "create" && data.pendingBurn && data.offer) {
        console.log("[OfferForm] Publishing burn payment request...");

        const burnResult = await publishPaymentRequest({
          recipient: credentials.npub,
          sender: credentials.npub,
          amount: 1,
          context: "workshop_proposal",
          relatedEventId: data.offer.id,
          description: `Burn 1 token to propose workshop: ${data.offer.title}`,
          method: "burn",
        });

        if (!burnResult.success) {
          console.error(
            "[OfferForm] Failed to publish burn request:",
            burnResult.error
          );
          setWarning(
            "Offer created but burn payment may be delayed. Check your notifications."
          );
        } else {
          console.log(
            "[OfferForm] Burn payment request published:",
            burnResult.eventId
          );
        }
      }

      // Call success callback or redirect
      if (onSuccess && data.offer) {
        onSuccess(data.offer);
      } else {
        router.push(showScheduleFields ? "/calendar" : "/marketplace");
      }
    } catch (err) {
      console.error(`Failed to ${mode} offer:`, err);
      setError(`Failed to ${mode} offer`);
      setIsLoading(false);
    }
  };

  // Handle cancel event (edit mode only)
  const handleCancelEvent = async () => {
    if (!initialData?.id) return;

    setIsCancelling(true);
    setError("");

    try {
      const response = await fetch(`/api/offers/${initialData.id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          npub: credentials.npub,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Failed to cancel event");
        setIsCancelling(false);
        setShowCancelConfirm(false);
        return;
      }

      // Redirect to calendar
      router.push("/calendar");
    } catch (err) {
      console.error("Failed to cancel event:", err);
      setError("Failed to cancel event");
      setIsCancelling(false);
      setShowCancelConfirm(false);
    }
  };

  const hasConfirmedConflict = conflicts?.hasConfirmedConflict ?? false;
  const hasTentativeConflict = conflicts?.hasTentativeConflict ?? false;

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-lg shadow-sm p-6 space-y-6"
    >
      {/* Type Selection - only show if type not fixed */}
      {!isTypeFixed && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Type:
          </label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="type"
                value="workshop"
                checked={type === "workshop"}
                onChange={(e) => setType(e.target.value as OfferType)}
                className="mr-2"
              />
              <span className="text-sm">Workshop</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="type"
                value="1:1"
                checked={type === "1:1"}
                onChange={(e) => setType(e.target.value as OfferType)}
                className="mr-2"
              />
              <span className="text-sm">1:1</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="type"
                value="other"
                checked={type === "other"}
                onChange={(e) => setType(e.target.value as OfferType)}
                className="mr-2"
              />
              <span className="text-sm">Other</span>
            </label>
          </div>
        </div>
      )}

      {/* Title */}
      <div>
        <label
          htmlFor="title"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="Intro to NOSTR Protocol"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
          required
        />
        <p className="text-xs text-gray-500 mt-1">{title.length}/100 characters</p>
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Learn the basics of NOSTR protocol, how it works, and how to build applications..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 placeholder-gray-400"
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          {description.length}/1000 characters
        </p>
      </div>

      {/* Tags */}
      <div>
        <label
          htmlFor="tags"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Tags
        </label>
        <input
          type="text"
          id="tags"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagInputKeyDown}
          placeholder="Start typing or select below..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
        />

        {/* Selected Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Suggested Tags */}
        <div className="flex flex-wrap gap-2 mt-2">
          {SUGGESTED_TAGS.filter((tag) => !tags.includes(tag)).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs hover:bg-gray-200"
            >
              + {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Schedule Section (Workshop/1:1 only) */}
      {showScheduleFields && (
        <>
          <div className="border-t pt-6">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Schedule</h3>

            {/* Date and Time */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label
                  htmlFor="startDate"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Date
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                />
              </div>
              <div>
                <label
                  htmlFor="startTime"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Time
                </label>
                <input
                  type="time"
                  id="startTime"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                />
              </div>
            </div>

            {/* Duration */}
            <div className="mb-4">
              <label
                htmlFor="duration"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Duration
              </label>
              <select
                id="duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              >
                {DURATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Min/Max RSVPs */}
            {type === "workshop" && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label
                    htmlFor="minRsvps"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Min. RSVPs to confirm
                  </label>
                  <input
                    type="number"
                    id="minRsvps"
                    value={minRsvps}
                    onChange={(e) => setMinRsvps(e.target.value)}
                    min={minRsvps}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Workshop confirms when reached
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="maxAttendees"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Max. attendees
                  </label>
                  <input
                    type="number"
                    id="maxAttendees"
                    value={maxAttendees}
                    onChange={(e) => setMaxAttendees(e.target.value)}
                    min="2"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                  />
                </div>
              </div>
            )}

            {/* Room Selection with Availability Grid */}
            <RoomAvailabilityGrid
              rooms={ROOMS}
              selectedDate={startDate}
              selectedTime={startTime}
              duration={parseInt(duration)}
              requiredCapacity={parseInt(maxAttendees) || 1}
              selectedRoom={room}
              onRoomSelect={setRoom}
              excludeOfferId={mode === "edit" ? initialData?.id : undefined}
            />

            {/* Conflict Warnings */}
            {checkingConflicts && (
              <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-sm text-gray-600">Checking availability...</p>
              </div>
            )}

            {hasConfirmedConflict && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800 font-medium">
                  Time slot unavailable
                </p>
                <p className="text-sm text-red-700 mt-1">
                  This time conflicts with a confirmed event. Please choose a
                  different time or room.
                </p>
                {conflicts?.conflicts
                  .filter((c) => c.type === "confirmed")
                  .map((c, i) => (
                    <p key={i} className="text-xs text-red-600 mt-1">
                      "{c.title}" -{" "}
                      {new Date(c.startTime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  ))}
              </div>
            )}

            {!hasConfirmedConflict && hasTentativeConflict && (
              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800 font-medium">
                  Overlapping proposals
                </p>
                <p className="text-sm text-yellow-700 mt-1">
                  There are other tentative proposals for this time slot. Your
                  proposal may compete for RSVPs.
                </p>
                {conflicts?.conflicts
                  .filter((c) => c.type === "tentative")
                  .map((c, i) => (
                    <p key={i} className="text-xs text-yellow-600 mt-1">
                      "{c.title}" -{" "}
                      {new Date(c.startTime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Warning Message */}
      {warning && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800">{warning}</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={
          isLoading || isPublishing || !title || !description || hasConfirmedConflict
        }
        className="w-full bg-orange-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-orange-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {isLoading || isPublishing
          ? mode === "edit"
            ? "Saving..."
            : "Creating proposal..."
          : mode === "edit"
          ? "Save Changes"
          : "Propose Workshop"}
      </button>

      {/* Proposal Cost Info (create mode only) */}
      {mode === "create" && <ProposalCostInfo cost={proposalCost} className="mt-2" />}

      {/* Cancel Event Link (edit mode only) */}
      {mode === "edit" && initialData && (
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => setShowCancelConfirm(true)}
            className="text-red-600 hover:text-red-800 text-sm font-medium hover:underline"
          >
            Cancel event
          </button>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && initialData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Cancel this event?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to cancel this event? This action cannot be undone.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Refunds will be issued:</strong>
              </p>
              <ul className="text-sm text-blue-700 mt-2 space-y-1">
                <li>• You will be refunded {proposalCost} token{proposalCost !== 1 ? "s" : ""} (booking cost)</li>
                {(initialData.rsvpCount || 0) > 0 && (
                  <li>• {initialData.rsvpCount} attendee{initialData.rsvpCount !== 1 ? "s" : ""} will be refunded 1 token each</li>
                )}
              </ul>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                disabled={isCancelling}
                className="flex-1 bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
              >
                Keep event
              </button>
              <button
                type="button"
                onClick={handleCancelEvent}
                disabled={isCancelling}
                className="flex-1 bg-red-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isCancelling ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Cancelling...
                  </>
                ) : (
                  "Cancel event"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
