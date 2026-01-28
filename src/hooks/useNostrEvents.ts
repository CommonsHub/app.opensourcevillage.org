/**
 * useNostrEvents Hook
 *
 * Subscribes to Nostr events from relays in real-time.
 * Uses the centralized nostr-connection module for all relay operations.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { nip19 } from 'nostr-tools';
import {
  subscribe,
  unsubscribe,
  getPrimaryRelayUrl,
  isRelayInBackoff,
  type NostrEvent,
  type NostrFilter,
} from '@/lib/nostr';

export type { NostrEvent };

// Alias for backward compatibility
type NostrEventData = NostrEvent;

interface UseNostrEventsOptions {
  /** Subscribe to events authored by this pubkey */
  authorPubkey?: string;
  /** Subscribe to events mentioning this pubkey in p tags */
  mentionedPubkey?: string;
  /** Filter by specific event kinds */
  kinds?: number[];
  /** Maximum number of events to keep */
  limit?: number;
  /** Whether to auto-connect on mount */
  autoConnect?: boolean;
  /** Subscribe to all events of specified kinds (no user filter) */
  subscribeAll?: boolean;
}

interface UseNostrEventsResult {
  events: NostrEventData[];
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
}

/**
 * Convert npub to hex pubkey
 */
function npubToHex(npubOrPubkey: string): string {
  // Already a hex pubkey (64 hex characters)
  if (/^[0-9a-f]{64}$/i.test(npubOrPubkey)) {
    return npubOrPubkey.toLowerCase();
  }

  // Convert npub to hex
  if (npubOrPubkey.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(npubOrPubkey);
      if (decoded.type === 'npub') {
        return decoded.data as string;
      }
    } catch {
      console.error('[useNostrEvents] Failed to decode npub:', npubOrPubkey);
    }
  }

  return npubOrPubkey;
}

/**
 * Hook to subscribe to Nostr events
 */
export function useNostrEvents(options: UseNostrEventsOptions): UseNostrEventsResult {
  const {
    authorPubkey,
    mentionedPubkey,
    kinds,
    limit = 50,
    autoConnect = true,
    subscribeAll = false,
  } = options;

  const [events, setEvents] = useState<NostrEventData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const eventsMapRef = useRef<Map<string, NostrEventData>>(new Map());
  const subscriptionIdRef = useRef<string | null>(null);
  const relayUrlRef = useRef<string | null>(null);

  // Convert pubkeys to hex if needed
  const authorHex = authorPubkey ? npubToHex(authorPubkey) : undefined;
  const mentionedHex = mentionedPubkey ? npubToHex(mentionedPubkey) : undefined;

  const connect = useCallback(async () => {
    const relayUrl = getPrimaryRelayUrl();
    relayUrlRef.current = relayUrl;

    // Check if relay is in backoff
    const backoffStatus = isRelayInBackoff(relayUrl);
    if (backoffStatus.inBackoff) {
      console.log(`[useNostrEvents] Relay ${relayUrl} in backoff, waiting ${backoffStatus.waitTime}s`);
      setError(`Rate limited, retry in ${backoffStatus.waitTime}s`);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Build filters
    const filters: NostrFilter[] = [];

    if (subscribeAll) {
      // Subscribe to all events of specified kinds (no user filter)
      const allFilter: NostrFilter = { limit };
      if (kinds && kinds.length > 0) {
        allFilter.kinds = kinds;
      }
      filters.push(allFilter);
    } else {
      if (authorHex) {
        const authorFilter: NostrFilter = { authors: [authorHex], limit };
        if (kinds && kinds.length > 0) {
          authorFilter.kinds = kinds;
        }
        filters.push(authorFilter);
      }

      if (mentionedHex) {
        const mentionedFilter: NostrFilter = { '#p': [mentionedHex], limit };
        if (kinds && kinds.length > 0) {
          mentionedFilter.kinds = kinds;
        }
        filters.push(mentionedFilter);
      }
    }

    if (filters.length === 0) {
      console.log('[useNostrEvents] No filters specified, not subscribing');
      setIsLoading(false);
      return;
    }

    const subId = await subscribe(relayUrl, filters, {
      onEvent: (event) => {
        // Add event to map (deduplication by id)
        if (!eventsMapRef.current.has(event.id)) {
          eventsMapRef.current.set(event.id, event);

          // Update state with sorted events (newest first)
          const allEvents = Array.from(eventsMapRef.current.values());
          allEvents.sort((a, b) => b.created_at - a.created_at);

          // Apply limit
          const limitedEvents = allEvents.slice(0, limit);
          setEvents(limitedEvents);
        }
      },
      onEose: () => {
        console.log('[useNostrEvents] End of stored events');
        setIsLoading(false);
      },
      onError: (err) => {
        console.error('[useNostrEvents] Error:', err);
        setError(err);
        setIsConnected(false);
        setIsLoading(false);
      },
    });

    if (subId) {
      subscriptionIdRef.current = subId;
      setIsConnected(true);
    } else {
      setError('Failed to subscribe');
      setIsLoading(false);
    }
  }, [authorHex, mentionedHex, kinds, limit, subscribeAll]);

  const disconnect = useCallback(() => {
    if (subscriptionIdRef.current && relayUrlRef.current) {
      unsubscribe(relayUrlRef.current, subscriptionIdRef.current);
      subscriptionIdRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && (authorPubkey || mentionedPubkey || subscribeAll)) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, authorPubkey, mentionedPubkey, subscribeAll, connect, disconnect]);

  return {
    events,
    isConnected,
    isLoading,
    error,
    connect,
    disconnect,
  };
}

export default useNostrEvents;
