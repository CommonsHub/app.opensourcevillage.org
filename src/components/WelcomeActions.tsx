'use client';

/**
 * WelcomeActions Component - Reusable action box for homepage and calendar
 * Shows "Welcome to the Village" with action buttons
 */

import { useRouter } from 'next/navigation';

interface WelcomeActionsProps {
  username?: string;
  date?: string; // ISO date string for workshop pre-fill
}

export default function WelcomeActions({ username, date }: WelcomeActionsProps) {
  const router = useRouter();

  const workshopUrl = date
    ? `/offers/create?type=workshop&date=${date}`
    : '/offers/create?type=workshop';

  return (
    <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg shadow-lg p-6 text-white">
      <h1 className="text-2xl font-bold mb-2">
        Welcome to the Village!
      </h1>
      <p className="text-white/90 mb-6">
        {username
          ? `Hi ${username}, what do you want to do today?`
          : 'What do you want to do today?'}
      </p>

      <div className="space-y-3">
        <button
          onClick={() => router.push(workshopUrl)}
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
  );
}
