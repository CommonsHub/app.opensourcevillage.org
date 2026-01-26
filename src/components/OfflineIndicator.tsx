'use client';

/**
 * Offline Indicator Component
 * Shows a banner when the app is offline
 */

import { useState, useEffect } from 'react';
import { isOnline, setupNetworkListeners } from '@/lib/pwa';

export default function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [showOfflineMessage, setShowOfflineMessage] = useState(false);
  const [showOnlineMessage, setShowOnlineMessage] = useState(false);

  useEffect(() => {
    // Set initial state
    setOnline(isOnline());

    // Setup network listeners
    const cleanup = setupNetworkListeners(
      () => {
        setOnline(true);
        setShowOfflineMessage(false);
        setShowOnlineMessage(true);

        // Hide online message after 3 seconds
        setTimeout(() => {
          setShowOnlineMessage(false);
        }, 3000);
      },
      () => {
        setOnline(false);
        setShowOfflineMessage(true);
        setShowOnlineMessage(false);
      }
    );

    return cleanup;
  }, []);

  if (online && !showOnlineMessage) {
    return null;
  }

  return (
    <>
      {/* Offline Banner */}
      {showOfflineMessage && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-white px-4 py-2 text-center text-sm font-medium shadow-lg">
          <div className="flex items-center justify-center gap-2">
            <svg
              className="w-5 h-5 animate-pulse"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
              />
            </svg>
            <span>You're offline. Some features may be limited.</span>
          </div>
        </div>
      )}

      {/* Back Online Banner */}
      {showOnlineMessage && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-green-500 text-white px-4 py-2 text-center text-sm font-medium shadow-lg animate-slide-down">
          <div className="flex items-center justify-center gap-2">
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
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>You're back online!</span>
          </div>
        </div>
      )}
    </>
  );
}
