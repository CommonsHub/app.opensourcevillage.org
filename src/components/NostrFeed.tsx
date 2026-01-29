'use client';

/**
 * NostrFeed Component - Display a feed of kind 1 nostr notes
 * Subscribes to kind 0 profiles directly from relay for live updates
 */

import { useState, useEffect, useMemo, useRef } from 'react';
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

// Define kinds array outside component to prevent recreation on every render
const NOTE_KINDS = [1];

export default function NostrFeed() {
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const isMounted = useRef(true);
  const profileSubRef = useRef<string | null>(null);
  const subscribedPubkeysRef = useRef<Set<string>>(new Set());

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

  // Extract all pubkeys from notes (authors + mentions)
  const allPubkeys = useMemo(() => {
    const pubkeys = new Set<string>();
    for (const note of notes) {
      // Add author
      pubkeys.add(note.pubkey);
      // Add mentioned pubkeys from p tags
      for (const tag of note.tags) {
        if (tag[0] === 'p' && tag[1]) {
          pubkeys.add(tag[1]);
        }
      }
    }
    return pubkeys;
  }, [notes]);

  // Subscribe to kind 0 profiles - keep subscription open for live updates
  useEffect(() => {
    if (allPubkeys.size === 0) return;

    const relayUrl = getPrimaryRelayUrl();
    const pubkeysArray = [...allPubkeys];

    // Check if we need to update the subscription (new pubkeys added)
    const newPubkeys = pubkeysArray.filter(pk => !subscribedPubkeysRef.current.has(pk));

    if (newPubkeys.length === 0 && profileSubRef.current) {
      // No new pubkeys and we already have a subscription
      return;
    }

    // Update tracked pubkeys
    pubkeysArray.forEach(pk => subscribedPubkeysRef.current.add(pk));

    const setupProfileSubscription = async () => {
      // Unsubscribe from previous subscription if exists
      if (profileSubRef.current) {
        unsubscribe(relayUrl, profileSubRef.current);
        profileSubRef.current = null;
      }

      const subId = await subscribe(relayUrl, [{ kinds: [0], authors: pubkeysArray }], {
        onEvent: (event: NostrEvent) => {
          if (event.kind === 0) {
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

              if (isMounted.current) {
                setProfiles(prev => {
                  const existing = prev.get(event.pubkey);
                  // Only update if this is a newer event or we don't have this profile
                  if (!existing) {
                    const newMap = new Map(prev);
                    newMap.set(event.pubkey, profile);
                    return newMap;
                  }
                  // Always update to get latest profile changes
                  const newMap = new Map(prev);
                  newMap.set(event.pubkey, profile);
                  return newMap;
                });
              }
            } catch {
              // Invalid profile content
            }
          }
        },
        onEose: () => {
          // Don't unsubscribe - keep listening for profile updates
        },
        onError: (err: string) => {
          console.error('[NostrFeed] Error fetching profiles:', err);
        },
      });

      profileSubRef.current = subId;
    };

    setupProfileSubscription();

    return () => {
      if (profileSubRef.current) {
        unsubscribe(relayUrl, profileSubRef.current);
        profileSubRef.current = null;
      }
    };
  }, [allPubkeys.size]); // Re-run when pubkey count changes

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
          const profile = profiles.get(event.pubkey);
          const displayName = profile?.name || event.pubkey.slice(0, 8);
          const username = profile?.username;
          const npub = profile?.npub || nip19.npubEncode(event.pubkey);
          const profileLink = username ? `/profile/${username}` : `/profile/${npub}`;

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
