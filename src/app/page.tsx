'use client';

/**
 * Home page - Main entry point with navigation
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredCredentials } from '@/lib/nostr-client';

export default function Home() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{ username: string; npub: string } | null>(null);

  useEffect(() => {
    const creds = getStoredCredentials();
    setCredentials(creds);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to Open Source Village
          </h1>
          <p className="text-gray-600">
            {credentials
              ? `Hi, ${credentials.username}! 👋`
              : 'Scan your NFC badge to get started'}
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => router.push('/calendar')}
            className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
          >
            <span>📅</span>
            <span>View Schedule</span>
          </button>

          <button
            onClick={() => router.push('/marketplace')}
            className="w-full bg-purple-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-purple-700 transition flex items-center justify-center gap-2"
          >
            <span>🛒</span>
            <span>Browse Marketplace</span>
          </button>

          {credentials ? (
            <>
              <button
                onClick={() => router.push(`/profile/${credentials.username}`)}
                className="w-full bg-gray-100 text-gray-700 font-semibold py-3 px-4 rounded-lg hover:bg-gray-200 transition flex items-center justify-center gap-2"
              >
                <span>👤</span>
                <span>My Profile</span>
              </button>

              <button
                onClick={() => router.push('/offers/create')}
                className="w-full bg-green-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2"
              >
                <span>➕</span>
                <span>Create Offer</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => router.push('/badge')}
              className="w-full bg-green-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2"
            >
              <span>🏷️</span>
              <span>Claim Your Badge</span>
            </button>
          )}
        </div>

        <div className="mt-6 pt-6 border-t text-center">
          <p className="text-xs text-gray-500">
            Jan 26 - Feb 6, 2026
          </p>
        </div>
      </div>
    </main>
  );
}
