'use client';

/**
 * Badge page - Entry point when scanning NFC badge
 * Accessed via URL fragment: /badge#{serialNumber}
 *
 * Behavior:
 * - No localStorage: redirect to /claim#{serialNumber}
 * - Has localStorage: fetch username for this serial and redirect to profile
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredCredentials, getSerialNumberFromURL } from '@/lib/nostr-client';

export default function BadgePage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const serialNumber = getSerialNumberFromURL();

    if (!serialNumber) {
      setError('No badge serial number found. Please scan your NFC badge.');
      return;
    }

    const credentials = getStoredCredentials();

    if (!credentials) {
      // New user - redirect to claim page
      router.replace(`/claim#${serialNumber}`);
      return;
    }

    // Existing user - fetch profile for this serial and redirect
    fetchProfileAndRedirect(serialNumber, credentials.username);
  }, [router]);

  const fetchProfileAndRedirect = async (serialNumber: string, fallbackUsername: string) => {
    try {
      // Try to get the profile associated with this serial number
      const response = await fetch(`/api/profile/${serialNumber}`);
      const data = await response.json();

      if (data.success && data.profile?.username) {
        router.replace(`/profile/${data.profile.username}`);
      } else {
        // Fallback to stored username
        router.replace(`/profile/${fallbackUsername}`);
      }
    } catch {
      // On error, redirect to stored username
      router.replace(`/profile/${fallbackUsername}`);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-5xl mb-4">🏷️</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">No Badge Detected</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="text-blue-600 font-medium hover:text-blue-700"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-500">Loading...</div>
    </div>
  );
}
