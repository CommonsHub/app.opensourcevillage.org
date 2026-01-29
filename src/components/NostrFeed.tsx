'use client';

/**
 * NostrFeed Component - Display a feed of kind 1 nostr notes
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useNostrEvents, type NostrEvent } from '@/hooks/useNostrEvents';
import { Avatar } from '@/components/Avatar';

interface UserProfile {
  username: string;
  npub: string;
  name?: string;
}

// Cache for user profiles
const profileCache = new Map<string, UserProfile | null>();

export default function NostrFeed() {
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());

  // Subscribe to all kind 1 notes
  const { events, isLoading, isConnected } = useNostrEvents({
    kinds: [1],
    subscribeAll: true,
    limit: 30,
    autoConnect: true,
  });

  // Fetch profiles for event authors
  useEffect(() => {
    const fetchProfiles = async () => {
      const pubkeys = [...new Set(events.map(e => e.pubkey))];
      const newProfiles = new Map(profiles);

      for (const pubkey of pubkeys) {
        // Skip if already fetched or in cache
        if (newProfiles.has(pubkey) || profileCache.has(pubkey)) {
          if (profileCache.has(pubkey) && !newProfiles.has(pubkey)) {
            const cached = profileCache.get(pubkey);
            if (cached) newProfiles.set(pubkey, cached);
          }
          continue;
        }

        try {
          // Try to fetch profile by pubkey
          const response = await fetch(`/api/profile/${pubkey}`);
          const data = await response.json();

          if (data.success && data.profile) {
            const profile: UserProfile = {
              username: data.profile.username,
              npub: data.profile.npub,
              name: data.profile.profile?.name,
            };
            newProfiles.set(pubkey, profile);
            profileCache.set(pubkey, profile);
          } else {
            profileCache.set(pubkey, null);
          }
        } catch (err) {
          console.error('Failed to fetch profile:', err);
          profileCache.set(pubkey, null);
        }
      }

      if (newProfiles.size !== profiles.size) {
        setProfiles(newProfiles);
      }
    };

    if (events.length > 0) {
      fetchProfiles();
    }
  }, [events, profiles]);

  // Format relative time
  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;

    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

    return new Date(timestamp * 1000).toLocaleDateString();
  };

  // Filter out notes that reference other events (replies) - only show top-level notes
  const topLevelNotes = events.filter(event => {
    // Check if this note has an 'e' tag (reply to another event)
    const hasReplyTag = event.tags.some(tag => tag[0] === 'e');
    return !hasReplyTag;
  });

  if (isLoading && topLevelNotes.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-500">Loading feed...</span>
        </div>
      </div>
    );
  }

  if (topLevelNotes.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <p className="text-gray-500 text-center py-4">No messages yet. Be the first to post!</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Village Feed</h2>
        {isConnected && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Live
          </span>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {topLevelNotes.map((event) => {
          const profile = profiles.get(event.pubkey);

          return (
            <div key={event.id} className="p-4 hover:bg-gray-50 transition">
              <div className="flex gap-3">
                {/* Avatar */}
                <Link href={profile ? `/profile/${profile.username}` : '#'} className="flex-shrink-0">
                  <Avatar
                    name={profile?.username || event.pubkey.slice(0, 8)}
                    npub={profile?.npub || ''}
                    size="md"
                  />
                </Link>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-1">
                    {profile ? (
                      <Link
                        href={`/profile/${profile.username}`}
                        className="font-medium text-gray-900 hover:underline truncate"
                      >
                        {profile.name || `@${profile.username}`}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-600 truncate">
                        {event.pubkey.slice(0, 8)}...
                      </span>
                    )}
                    {profile && profile.name && (
                      <span className="text-gray-500 text-sm truncate">@{profile.username}</span>
                    )}
                    <span className="text-gray-400 text-sm flex-shrink-0">
                      {formatRelativeTime(event.created_at)}
                    </span>
                  </div>

                  {/* Note content */}
                  <p className="text-gray-800 whitespace-pre-wrap break-words">
                    {event.content}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
