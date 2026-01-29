'use client';

/**
 * NostrFeed Component - Display a feed of kind 1 nostr notes
 * Fetches profiles (kind 0) from nostr to show author names
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useNostrEvents, type NostrEvent } from '@/hooks/useNostrEvents';
import { Avatar } from '@/components/Avatar';
import { nip19 } from 'nostr-tools';
import { subscribe, unsubscribe, getPrimaryRelayUrl } from '@/lib/nostr';

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
  username?: string;
  picture?: string;
}

// Cache for profiles - module level to persist across renders
const nostrProfileCache = new Map<string, UserProfile>();
const localProfileCache = new Map<string, { username: string; npub: string } | null>();
const fetchingPubkeys = new Set<string>();

// Define kinds array outside component to prevent recreation on every render
const NOTE_KINDS = [1];

export default function NostrFeed() {
  const [nostrProfiles, setNostrProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [localProfiles, setLocalProfiles] = useState<Map<string, { username: string; npub: string }>>(new Map());
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const isMounted = useRef(true);
  const profileSubRef = useRef<string | null>(null);

  // Subscribe to kind 1 (notes) only
  const { events, isLoading, isConnected } = useNostrEvents({
    kinds: NOTE_KINDS,
    subscribeAll: true,
    limit: 50,
    autoConnect: true,
  });

  // Mark as loaded once we finish loading for the first time
  useEffect(() => {
    if (!isLoading && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [isLoading, hasLoadedOnce]);

  // Filter notes (only kind 1)
  const notes = useMemo(() => {
    return events.filter(e => e.kind === 1);
  }, [events]);

  // Track mounted state
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Fetch nostr profiles (kind 0) for note authors
  useEffect(() => {
    if (notes.length === 0) return;

    const authorPubkeys = [...new Set(notes.map(e => e.pubkey))];
    const pubkeysToFetch = authorPubkeys.filter(pk => !nostrProfileCache.has(pk));

    if (pubkeysToFetch.length === 0) {
      // Update state from cache if needed
      const cached = new Map<string, UserProfile>();
      for (const pk of authorPubkeys) {
        const profile = nostrProfileCache.get(pk);
        if (profile) cached.set(pk, profile);
      }
      if (cached.size > 0 && cached.size !== nostrProfiles.size) {
        setNostrProfiles(cached);
      }
      return;
    }

    // Subscribe to kind 0 for specific authors
    const fetchProfiles = async () => {
      const relayUrl = getPrimaryRelayUrl();

      // Unsubscribe from previous profile subscription
      if (profileSubRef.current) {
        unsubscribe(relayUrl, profileSubRef.current);
        profileSubRef.current = null;
      }

      const newProfiles = new Map(nostrProfiles);

      const subId = await subscribe(relayUrl, [{ kinds: [0], authors: pubkeysToFetch }], {
        onEvent: (event: NostrEvent) => {
          if (event.kind === 0 && !nostrProfileCache.has(event.pubkey)) {
            try {
              const content: NostrProfile = JSON.parse(event.content);
              const npub = nip19.npubEncode(event.pubkey);
              const profile: UserProfile = {
                pubkey: event.pubkey,
                npub,
                name: content.display_name || content.name,
                picture: content.picture,
                username: content.nip05?.split('@')[0],
              };
              nostrProfileCache.set(event.pubkey, profile);
              newProfiles.set(event.pubkey, profile);
            } catch {
              // Invalid profile content
            }
          }
        },
        onEose: () => {
          if (isMounted.current) {
            setNostrProfiles(new Map(newProfiles));
          }
          // Unsubscribe after getting stored events
          if (subId) {
            unsubscribe(relayUrl, subId);
          }
        },
        onError: (err: string) => {
          console.error('[NostrFeed] Error fetching profiles:', err);
        },
      });

      profileSubRef.current = subId;
    };

    fetchProfiles();

    return () => {
      const relayUrl = getPrimaryRelayUrl();
      if (profileSubRef.current) {
        unsubscribe(relayUrl, profileSubRef.current);
        profileSubRef.current = null;
      }
    };
  }, [notes.length]); // Only re-run when notes count changes

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
  }, [notes.length]); // Only depend on notes count

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
  const topLevelNotes = useMemo(() => {
    return notes.filter(event => {
      const hasReplyTag = event.tags.some(tag => tag[0] === 'e');
      return !hasReplyTag;
    });
  }, [notes]);

  if (!hasLoadedOnce && topLevelNotes.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <p className="text-gray-500 text-center py-4">Loading feed...</p>
      </div>
    );
  }

  if (hasLoadedOnce && topLevelNotes.length === 0) {
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
