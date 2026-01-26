/**
 * useTokenBalance Hook
 *
 * React hook for fetching and managing token balance in components.
 * Automatically refreshes balance on mount and provides manual refresh.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { TokenBalance, formatBalance } from '@/lib/token-balance';

export interface UseTokenBalanceResult {
  balance: TokenBalance | null;
  isLoading: boolean;
  error: string | null;
  tokenNotConfigured: boolean;
  chain: string | null;
  refresh: () => Promise<void>;
  formatted: string;
}

/**
 * Fetch and manage user's token balance
 *
 * @param npub - User's npub
 * @param autoRefreshMs - Auto-refresh interval in ms (0 = disabled, default: 30000)
 * @returns Balance state and actions
 */
export function useTokenBalance(
  npub: string | null,
  autoRefreshMs: number = 30000
): UseTokenBalanceResult {
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenNotConfigured, setTokenNotConfigured] = useState(false);
  const [chain, setChain] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!npub) {
      setBalance(null);
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/balance/${npub}`);
      const data = await response.json();

      if (data.success) {
        setBalance(data.balance);
        setTokenNotConfigured(false);
      } else if (data.tokenNotConfigured) {
        setTokenNotConfigured(true);
        setChain(data.chain || null);
        setError('Token not configured');
      } else {
        setError(data.error || 'Failed to fetch balance');
      }
    } catch (err) {
      console.error('Error fetching balance:', err);
      setError('Network error');
    } finally {
      setIsLoading(false);
    }
  }, [npub]);

  // Initial fetch
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefreshMs <= 0 || !npub) return;

    const interval = setInterval(fetchBalance, autoRefreshMs);
    return () => clearInterval(interval);
  }, [autoRefreshMs, npub, fetchBalance]);

  // Formatted balance string
  const formatted = balance ? formatBalance(balance) : '-- CHT';

  return {
    balance,
    isLoading,
    error,
    tokenNotConfigured,
    chain,
    refresh: fetchBalance,
    formatted
  };
}
