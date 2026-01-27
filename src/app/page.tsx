'use client';

/**
 * Home page - Main entry point with navigation
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredCredentials } from '@/lib/nostr';

export default function Home() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{ username: string; npub: string } | null>(null);

  useEffect(() => {
    const creds = getStoredCredentials();
    setCredentials(creds);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="max-w-md w-full space-y-4">
        {/* Welcome Box with Actions */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg shadow-lg p-6 text-white">
          <h1 className="text-2xl font-bold mb-2">
            Welcome to the Village!
          </h1>
          <p className="text-white/90 mb-6">
            {credentials
              ? `Hi ${credentials.username}, what do you want to do today?`
              : 'What do you want to do today?'}
          </p>

          <div className="space-y-3">
            <button
              onClick={() => router.push('/offers/create?type=workshop')}
              className="w-full bg-white text-blue-600 font-semibold py-3 px-4 rounded-lg hover:bg-gray-100 transition flex items-center gap-3"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>Offer a workshop</span>
            </button>

            <button
              onClick={() => router.push('/book')}
              className="w-full bg-white/20 text-white font-semibold py-3 px-4 rounded-lg hover:bg-white/30 transition flex items-center gap-3 border border-white/30"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Book a room</span>
            </button>
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="space-y-3">
            <button
              onClick={() => router.push('/calendar')}
              className="w-full bg-gray-100 text-gray-700 font-semibold py-3 px-4 rounded-lg hover:bg-gray-200 transition flex items-center gap-3"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>View Schedule</span>
            </button>

            <button
              onClick={() => router.push('/marketplace')}
              className="w-full bg-gray-100 text-gray-700 font-semibold py-3 px-4 rounded-lg hover:bg-gray-200 transition flex items-center gap-3"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>Browse Marketplace</span>
            </button>

            {credentials ? (
              <button
                onClick={() => router.push(`/profile/${credentials.username}`)}
                className="w-full bg-gray-100 text-gray-700 font-semibold py-3 px-4 rounded-lg hover:bg-gray-200 transition flex items-center gap-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>My Profile</span>
              </button>
            ) : (
              <button
                onClick={() => router.push('/badge')}
                className="w-full bg-green-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-green-700 transition flex items-center gap-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <span>Claim Your Badge</span>
              </button>
            )}
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-500">
            Jan 26 - Feb 6, 2026
          </p>
        </div>
      </div>
    </main>
  );
}
