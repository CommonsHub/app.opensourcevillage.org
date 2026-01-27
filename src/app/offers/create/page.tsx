"use client";

/**
 * Create Offer/Workshop page
 * Uses the shared OfferForm component in create mode
 *
 * For workshop proposals:
 * - Tokens are burned (not transferred) as skin-in-the-game
 * - Includes conflict checking against existing events
 * - minRsvps determines when proposal becomes confirmed
 */

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredCredentials } from "@/lib/nostr";
import OfferForm, { OfferType, ROOMS } from "@/components/OfferForm";

function CreateOfferContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [credentials, setCredentials] = useState<{
    username: string;
    npub: string;
  } | null>(null);

  // Check auth on mount
  useEffect(() => {
    const creds = getStoredCredentials();
    if (!creds) {
      router.push("/badge");
      return;
    }
    setCredentials(creds);
  }, [router]);

  // Parse URL params for prefill
  const getPrefillFromParams = () => {
    const typeParam = searchParams.get("type");
    const type =
      typeParam === "workshop" || typeParam === "1:1" || typeParam === "other" || typeParam === "private"
        ? (typeParam as OfferType)
        : undefined;

    // Room slug to id conversion
    const roomSlug = searchParams.get("room");
    let room: string | undefined;
    if (roomSlug) {
      const matchedRoom = ROOMS.find((r) => r.slug === roomSlug);
      if (matchedRoom) {
        room = matchedRoom.id;
      }
    }

    // Date validation (YYYY-MM-DD)
    const dateParam = searchParams.get("date");
    const date =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;

    // Time validation (HH:MM)
    const timeParam = searchParams.get("time");
    const time =
      timeParam && /^\d{2}:\d{2}$/.test(timeParam) ? timeParam : undefined;

    // Duration parsing
    const durationParam = searchParams.get("duration");
    const duration = parseDuration(durationParam);

    // Title and description
    const title = searchParams.get("title")?.slice(0, 100);
    const description = searchParams.get("description")?.slice(0, 1000);

    // Tags (comma-separated)
    const tagsParam = searchParams.get("tags");
    const tags = tagsParam
      ? tagsParam
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t.length > 0)
      : undefined;

    return { type, room, date, time, duration, title, description, tags };
  };

  // Helper to parse duration string (e.g., "1h", "30m", "1h30") to minutes
  const parseDuration = (durationStr: string | null): string | undefined => {
    if (!durationStr) return undefined;

    const hourMatch = durationStr.match(/(\d+)h/);
    const minMatch = durationStr.match(/(\d+)m/);

    let totalMinutes = 0;
    if (hourMatch) {
      totalMinutes += parseInt(hourMatch[1]) * 60;
    }
    if (minMatch) {
      totalMinutes += parseInt(minMatch[1]);
    }

    // If no h or m suffix, treat as minutes
    if (!hourMatch && !minMatch) {
      const num = parseInt(durationStr);
      if (!isNaN(num)) {
        totalMinutes = num;
      }
    }

    // Validate against allowed durations
    const validDurations = ["30", "60", "90", "120"];
    if (validDurations.includes(String(totalMinutes))) {
      return String(totalMinutes);
    }
    return undefined;
  };

  if (!credentials) {
    return null; // Will redirect to /badge
  }

  const prefill = getPrefillFromParams();

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <main className="max-w-2xl mx-auto px-4 py-6">
        <OfferForm
          mode="create"
          credentials={credentials}
          prefill={prefill}
        />
      </main>
    </div>
  );
}

export default function CreateOfferPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-gray-500">Loading...</div>
        </div>
      }
    >
      <CreateOfferContent />
    </Suspense>
  );
}
