'use client';

/**
 * Transactions Page
 *
 * Shows user's token transaction history.
 * Currently displays balance only - transaction history is fetched from blockchain.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredCredentials } from '@/lib/nostr-client';
import { useTokenBalance } from '@/hooks/useTokenBalance';
import { TOKEN_ECONOMICS } from '@/lib/token-balance';

export default function TransactionsPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{ username: string; npub: string } | null>(null);

  useEffect(() => {
    const creds = getStoredCredentials();
    if (!creds) {
      router.push('/');
      return;
    }
    setCredentials(creds);
  }, [router]);

  const { balance, isLoading, refresh } = useTokenBalance(credentials?.npub || null);

  if (!credentials) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Top App Bar */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              className="text-gray-600 hover:text-gray-900"
              onClick={() => router.push('/')}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="font-semibold text-gray-900">Transactions</h1>
          </div>

          <button
            onClick={refresh}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            Refresh
          </button>
        </div>
      </header>

      {/* Balance Card */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-1">Current Balance</p>
            <p className="text-4xl font-bold text-gray-900">
              {isLoading ? '...' : balance?.confirmed ?? 0}
            </p>
            <p className="text-sm text-gray-500">{TOKEN_ECONOMICS.TOKEN_SYMBOL}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-gray-100 rounded-lg p-8 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-600 mb-2">Transaction history coming soon</p>
          <p className="text-sm text-gray-500">
            Your balance is tracked on the Gnosis Chain blockchain
          </p>
        </div>
      </main>
    </div>
  );
}
