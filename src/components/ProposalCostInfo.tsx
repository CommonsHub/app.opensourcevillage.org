'use client';

/**
 * ProposalCostInfo Component
 *
 * Displays the cost of proposing a workshop and the user's current token balance.
 * Used in the create workshop form and room detail pages.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getStoredCredentials } from '@/lib/nostr-client';
import { useTokenBalance } from '@/hooks/useTokenBalance';

interface ProposalCostInfoProps {
  cost?: number;
  className?: string;
}

export default function ProposalCostInfo({ cost = 1, className = '' }: ProposalCostInfoProps) {
  const [credentials, setCredentials] = useState<{ npub: string } | null>(null);

  // Get user credentials on mount
  useEffect(() => {
    const creds = getStoredCredentials();
    if (creds) {
      setCredentials(creds);
    }
  }, []);

  // Fetch token balance
  const { balance, isLoading: balanceLoading } = useTokenBalance(credentials?.npub || null, 0);

  const hasEnoughBalance = balance ? balance.confirmed >= cost : false;

  return (
    <div className={`text-center text-sm text-gray-600 ${className}`}>
      <p>Cost: {cost} token{cost !== 1 ? 's' : ''} (if cancelled, you'll be refunded)</p>
      <p className="mt-1">
        Current balance:{' '}
        {balanceLoading ? (
          <span className="text-gray-400">loading...</span>
        ) : balance ? (
          <span className={`font-medium ${hasEnoughBalance ? 'text-gray-900' : 'text-red-600'}`}>
            {balance.confirmed} token{balance.confirmed !== 1 ? 's' : ''}
            {!hasEnoughBalance && ' (insufficient)'}
          </span>
        ) : credentials ? (
          <span className="text-gray-400">--</span>
        ) : (
          <Link href="/badge" className="text-blue-600 hover:text-blue-800">
            Sign in to view
          </Link>
        )}
      </p>
    </div>
  );
}
