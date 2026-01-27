'use client';

/**
 * UserHeader Component
 *
 * Persistent header showing the logged-in user's avatar and balance.
 * - Avatar (top right) links to profile page
 * - Balance displayed to the left of avatar
 * - Only shown when user is logged in (has credentials in localStorage)
 *
 * Usage: Include in layout.tsx for global display
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar } from './Avatar';
import { getStoredCredentials } from '@/lib/nostr';
import { useTokenBalance } from '@/hooks/useTokenBalance';

interface UserProfile {
  picture?: string;
}

export default function UserHeader() {
  const [credentials, setCredentials] = useState<{ username: string; npub: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mounted, setMounted] = useState(false);

  // Use the token balance hook for real-time updates
  const { balance, isLoading: balanceLoading } = useTokenBalance(credentials?.npub || null);

  useEffect(() => {
    setMounted(true);
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
