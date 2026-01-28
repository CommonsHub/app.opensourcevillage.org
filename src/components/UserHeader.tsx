'use client';

/**
 * UserHeader Component
 *
 * Persistent header showing the logged-in user's avatar and balance.
 * - Avatar (top right) links to profile page
 * - Balance displayed to the left of avatar
 * - Only shown when user is logged in (has credentials in localStorage)
 * - Subscribes to payment receipt events (kind 1735) to auto-refresh balance
 *
 * Usage: Include in layout.tsx for global display
 */

import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { Avatar } from './Avatar';
import { getStoredCredentials } from '@/lib/nostr';
import { useTokenBalance } from '@/hooks/useTokenBalance';
import { useNostrEvents } from '@/hooks/useNostrEvents';
import { NOSTR_KINDS } from '@/lib/nostr-events';

interface UserProfile {
  picture?: string;
}

export default function UserHeader() {
  const [credentials, setCredentials] = useState<{ username: string; npub: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mounted, setMounted] = useState(false);

  // Use the token balance hook for real-time updates
  const { balance, isLoading: balanceLoading, refresh: refreshBalance } = useTokenBalance(credentials?.npub || null);

  // Memoize the kinds array to prevent infinite re-renders
  const paymentReceiptKinds = useMemo(() => [NOSTR_KINDS.PAYMENT_RECEIPT], []);

  // Subscribe to payment receipt events where the user is mentioned (as recipient)
  const { events: paymentEvents } = useNostrEvents({
    mentionedPubkey: credentials?.npub || undefined,
    kinds: paymentReceiptKinds,
    autoConnect: !!credentials?.npub,
  });

  // Track last seen payment event to detect new ones
  const lastPaymentEventIdRef = useRef<string | null>(null);

  // Refresh balance when new payment events arrive
  useEffect(() => {
    if (paymentEvents.length > 0) {
      const latestEvent = paymentEvents[0];
      if (latestEvent.id !== lastPaymentEventIdRef.current) {
        lastPaymentEventIdRef.current = latestEvent.id;
        // Refresh balance when we receive a new payment event
        refreshBalance();
      }
    }
  }, [paymentEvents, refreshBalance]);

  // Load credentials and profile on mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Separate effect for loading credentials after mount
  useEffect(() => {
    if (!mounted) return;

    const creds = getStoredCredentials();
    setCredentials(creds);

    if (creds) {
      // Fetch profile for custom avatar
      fetch(`/api/profile/${creds.username}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.profile) {
            setProfile(data.profile);
          }
        })
        .catch(() => {
          // Silently fail - will use default dicebear avatar
        });
    }
  }, [mounted]);

  // Listen for storage changes (e.g., login in another tab)
  useEffect(() => {
    const handleStorageChange = () => {
      const creds = getStoredCredentials();
      setCredentials(creds);
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Don't render on server or if not logged in
  if (!mounted || !credentials) {
    return null;
  }

  return (
    <Link
      href={`/profile/${credentials.username}`}
      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
    >
      {/* Balance */}
      <span className="text-sm font-medium text-gray-700">
        {!balanceLoading && balance !== null ? (
          <span className="flex items-center gap-1">
            <span className="text-green-600">{balance.confirmed}</span>
            <span className="text-gray-400 text-xs">tokens</span>
          </span>
        ) : (
          <span className="text-gray-400">...</span>
        )}
      </span>

      {/* Avatar */}
      <Avatar
        name={credentials.username}
        npub={credentials.npub}
        profile={profile || undefined}
        size="sm"
        alt={`${credentials.username}'s avatar`}
      />
    </Link>
  );
}
