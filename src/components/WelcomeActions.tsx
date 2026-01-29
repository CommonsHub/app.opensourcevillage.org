"use client";

/**
 * WelcomeActions Component - Reusable action box for homepage and calendar
 * Shows "Welcome to the Village" with action buttons
 * Dismissable with local storage persistence
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface WelcomeActionsProps {
  username?: string;
  date?: string; // ISO date string for workshop pre-fill
}

const STORAGE_KEY = "osv_welcome_dismissed";

export default function WelcomeActions({
  username,
  date,
}: WelcomeActionsProps) {
  const router = useRouter();
  const [isDismissed, setIsDismissed] = useState(true); // Start hidden to prevent flash

  useEffect(() => {
    // Check local storage on mount
    const dismissed = localStorage.getItem(STORAGE_KEY);
    setIsDismissed(dismissed === "true");
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem(STORAGE_KEY, "true");
  };

  const workshopUrl = date
    ? `/offers/create?type=workshop&date=${date}`
    : "/offers/create?type=workshop";

  // Don't render if dismissed
  if (isDismissed) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg shadow-lg p-6 text-white relative">
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-white/70 hover:text-white transition p-1"
        aria-label="Dismiss"
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
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      <h1 className="text-2xl font-bold mb-2 pr-8">
        Welcome to the Village{username ? `, ${username}` : ""}!
      </h1>

      <p className="text-white/90 mb-4 text-sm">
        Make offerings to the community and earn tokens from fellow villagers.
        Use those tokens to book rooms, participate in workshops, or thank
        others for their contributions.
      </p>

      <div className="space-y-3">
        <button
          onClick={() => router.push(workshopUrl)}
          className="w-full bg-white text-blue-600 font-semibold py-3 px-4 rounded-lg hover:bg-gray-100 transition flex items-center gap-3"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
          <span>Offer a workshop</span>
        </button>

        <button
          onClick={() => router.push("/offers/create?type=need")}
          className="w-full bg-white text-blue-600 font-semibold py-3 px-4 rounded-lg hover:bg-gray-100 transition flex items-center gap-3"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>Post a need</span>
        </button>

        <button
          onClick={() => router.push("/book")}
          className="w-full bg-white text-blue-600 font-semibold py-3 px-4 rounded-lg hover:bg-gray-100 transition flex items-center gap-3"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span>Book a room</span>
        </button>

        {username && (
          <button
            onClick={() => router.push(`/profile/edit`)}
            className="w-full bg-white/20 text-white font-semibold py-3 px-4 rounded-lg hover:bg-white/30 transition flex items-center gap-3 border border-white/30"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span>Edit your profile</span>
          </button>
        )}
      </div>
    </div>
  );
}
