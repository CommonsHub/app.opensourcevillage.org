'use client';

/**
 * Badge page - Entry point when scanning NFC badge
 * Accessed via URL fragment: /badge#{serialNumber}
 *
 * Behavior:
 * 1. Check if badge is already claimed
 * 2. If claimed: redirect to owner's profile
 * 3. If not claimed: redirect to /claim#{serialNumber}
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSerialNumberFromURL, hashSerialNumber } from '@/lib/nostr';

export default function BadgePage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Checking badge...');

  useEffect(() => {
    const serialNumber = getSerialNumberFromURL();

    if (!serialNumber) {
      setError('No badge serial number found. Please scan your NFC badge.');
      return;
    }

    checkBadgeAndRedirect(serialNumber);
  }, [router]);

  const checkBadgeAndRedirect = async (serialNumber: string) => {
    try {
      setStatus('Looking up badge...');
      const hashedSerial = await hashSerialNumber(serialNumber);

      // Check localStorage first for cached username
      const cacheKey = `badge_${hashedSerial}`;
      const cachedUsername = localStorage.getItem(cacheKey);
      if (cachedUsername) {
        setStatus(`Redirecting to ${cachedUsername}'s profile...`);
        router.replace(`/profile/${cachedUsername}`);
        return;
      }

      // Fetch with no-cache to always get fresh data
      const response = await fetch(`/api/profile/${hashedSerial}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await response.json();

      if (data.success && data.profile?.username) {
        // Save username to localStorage for future lookups
        localStorage.setItem(cacheKey, data.profile.username);
        setStatus(`Redirecting to ${data.profile.username}'s profile...`);
        router.replace(`/profile/${data.profile.username}`);
        return;
      }

      setStatus('Badge available! Redirecting to claim...');
      router.replace(`/claim#${serialNumber}`);
    } catch (err) {
      console.error('[Badge] Error checking badge:', err);
      router.replace(`/claim#${serialNumber}`);
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
      <div className="text-center">
        <div className="animate-pulse text-4xl mb-4">🏷️</div>
        <p className="text-gray-500">{status}</p>
      </div>
    </div>
  );
}
