'use client';

/**
 * NostrFeed Component - Display a feed of kind 1 nostr notes
 * Fetches profiles (kind 0) from nostr to show author names
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useNostrEvents, type NostrEvent } from '@/hooks/useNostrEvents';
import { Avatar } from '@/components/Avatar';
import { nip19 } from 'nostr-tools';

interface NostrProfile {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
}

interface UserProfile {
  pubkey: string;
  npub: string;
  name?: string;
  username?: string; // from nip05 or local API
  picture?: string;
}

// Cache for local API profiles (username lookup) - module level to persist across renders
const localProfileCache = new Map<string, { username: string; npub: string } | null>();
const fetchingPubkeys = new Set<string>();

export default function NostrFeed() {
  const [localProfiles, setLocalProfiles] = useState<Map<string, { username: string; npub: string }>>(new Map());
  const isMounted = useRef(true);

  // Subscribe to kind 1 (notes) and kind 0 (profiles)
  const { events, isLoading, isConnected } = useNostrEvents({
    kinds: [0, 1],
    subscribeAll: true,
    limit: 100, // Get more to include profiles
    autoConnect: true,
  });

  // Separate notes and profiles from events
  const { notes, nostrProfiles } = useMemo(() => {
    const noteEvents: NostrEvent[] = [];
    const profileMap = new Map<string, UserProfile>();

    for (const event of events) {
      if (event.kind === 1) {
        noteEvents.push(event);
      } else if (event.kind === 0) {
        // Parse profile content
        try {
          const content: NostrProfile = JSON.parse(event.content);
          const npub = nip19.npubEncode(event.pubkey);
          profileMap.set(event.pubkey, {
            pubkey: event.pubkey,
            npub,
            name: content.display_name || content.name,
            picture: content.picture,
            username: content.nip05?.split('@')[0], // Extract username from nip05
          });
        } catch {
          // Invalid profile content
        }
      }
    }

    return { notes: noteEvents, nostrProfiles: profileMap };
  }, [events]);

  // Track mounted state
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Fetch local profiles for username lookup (for linking to profile pages)
  useEffect(() => {
    if (notes.length === 0) return;

    const pubkeys = [...new Set(notes.map(e => e.pubkey))];
    const pubkeysToFetch = pubkeys.filter(pk =>
      !localProfileCache.has(pk) && !fetchingPubkeys.has(pk)
    );

    if (pubkeysToFetch.length === 0) {
      // Check if we need to update state from cache
      const cached = new Map<string, { username: string; npub: string }>();
      for (const pk of pubkeys) {
        const profile = localProfileCache.get(pk);
        if (profile) cached.set(pk, profile);
      }
      if (cached.size > 0 && cached.size !== localProfiles.size) {
        setLocalProfiles(cached);
      }
      return;
    }

    // Mark as fetching
    pubkeysToFetch.forEach(pk => fetchingPubkeys.add(pk));

    const fetchProfiles = async () => {
      const newProfiles = new Map(localProfiles);

      for (const pubkey of pubkeysToFetch) {
        try {
          const response = await fetch(`/api/profile/${pubkey}`);
          const data = await response.json();

          if (data.success && data.profile) {
            const profile = { username: data.profile.username, npub: data.profile.npub };
            localProfileCache.set(pubkey, profile);
            newProfiles.set(pubkey, profile);
          } else {
            localProfileCache.set(pubkey, null);
          }
        } catch {
          localProfileCache.set(pubkey, null);
        }
        fetchingPubkeys.delete(pubkey);
      }

      if (isMounted.current && newProfiles.size > localProfiles.size) {
        setLocalProfiles(new Map(newProfiles));
      }
    };

    fetchProfiles();
  }, [notes]); // Only depend on notes, not localProfiles

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
  const topLevelNotes = notes.filter(event => {
    const hasReplyTag = event.tags.some(tag => tag[0] === 'e');
    return !hasReplyTag;
  });

  if (isLoading && topLevelNotes.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <p className="text-gray-500 text-center py-4">Loading feed...</p>
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
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            Live
          </span>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {topLevelNotes.map((event) => {
          const nostrProfile = nostrProfiles.get(event.pubkey);
          const localProfile = localProfiles.get(event.pubkey);

          // Prefer nostr profile for display, local profile for username/linking
          const displayName = nostrProfile?.name || localProfile?.username || event.pubkey.slice(0, 8);
          const username = localProfile?.username || nostrProfile?.username;
          const npub = localProfile?.npub || nostrProfile?.npub || '';
          const profileLink = username ? `/profile/${username}` : '#';

          return (
            <div key={event.id} className="p-4 hover:bg-gray-50 transition">
              <div className="flex gap-3">
                {/* Avatar */}
                <Link href={profileLink} className="flex-shrink-0">
                  <Avatar
                    name={displayName}
                    npub={npub}
                    size="md"
                  />
                </Link>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-1">
                    <Link
                      href={profileLink}
                      className="font-medium text-gray-900 hover:underline truncate"
                    >
                      {displayName}
                    </Link>
                    {username && displayName !== username && displayName !== `@${username}` && (
                      <span className="text-gray-500 text-sm truncate">@{username}</span>
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
