/**
 * useNostrEvents Hook
 *
 * Subscribes to Nostr events from relays in real-time.
 * Supports filtering by authors and mentioned pubkeys.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { nip19 } from 'nostr-tools';

const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'];

function getRelayUrls(): string[] {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('osv_relay_urls');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        // Fall through
      }
    }
  }
  return DEFAULT_RELAYS;
}

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

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
}

interface UseNostrEventsResult {
  events: NostrEvent[];
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
  } = options;

  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const eventsMapRef = useRef<Map<string, NostrEvent>>(new Map());
  const subscriptionIdRef = useRef<string | null>(null);

  // Convert pubkeys to hex if needed
  const authorHex = authorPubkey ? npubToHex(authorPubkey) : undefined;
  const mentionedHex = mentionedPubkey ? npubToHex(mentionedPubkey) : undefined;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const relayUrl = getRelayUrls()[0];
    if (!relayUrl) {
      setError('No relay URL configured');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const ws = new WebSocket(relayUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[useNostrEvents] Connected to relay:', relayUrl);
        setIsConnected(true);

        // Build filter for subscription
        // We need to subscribe to two filters:
        // 1. Events authored by the pubkey
        // 2. Events mentioning the pubkey in p tags
        const filters: any[] = [];

        if (authorHex) {
          const authorFilter: any = { authors: [authorHex] };
          if (kinds && kinds.length > 0) {
            authorFilter.kinds = kinds;
          }
          authorFilter.limit = limit;
          filters.push(authorFilter);
        }

        if (mentionedHex) {
          const mentionedFilter: any = { '#p': [mentionedHex] };
          if (kinds && kinds.length > 0) {
            mentionedFilter.kinds = kinds;
          }
          mentionedFilter.limit = limit;
          filters.push(mentionedFilter);
        }

        if (filters.length === 0) {
          console.log('[useNostrEvents] No filters specified, not subscribing');
          setIsLoading(false);
          return;
        }

        // Generate subscription ID
        const subId = `events_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        subscriptionIdRef.current = subId;

        // Send REQ message with filters
        const reqMessage = JSON.stringify(['REQ', subId, ...filters]);
        console.log('[useNostrEvents] Subscribing with filters:', filters);
        ws.send(reqMessage);
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (!Array.isArray(data) || data.length < 2) return;

          const [type, ...rest] = data;

          switch (type) {
            case 'EVENT': {
              const [subId, event] = rest;
              if (subId === subscriptionIdRef.current && event) {
                // Add event to map (deduplication by id)
                if (!eventsMapRef.current.has(event.id)) {
                  eventsMapRef.current.set(event.id, event as NostrEvent);

                  // Update state with sorted events (newest first)
                  const allEvents = Array.from(eventsMapRef.current.values());
                  allEvents.sort((a, b) => b.created_at - a.created_at);

                  // Apply limit
                  const limitedEvents = allEvents.slice(0, limit);
                  setEvents(limitedEvents);
                }
              }
              break;
            }

            case 'EOSE': {
              // End of stored events
              console.log('[useNostrEvents] End of stored events');
              setIsLoading(false);
              break;
            }

            case 'NOTICE': {
              console.log('[useNostrEvents] Relay notice:', rest[0]);
              break;
            }

            case 'CLOSED': {
              console.log('[useNostrEvents] Subscription closed:', rest[1]);
              break;
            }
          }
        } catch (err) {
          // Ignore parse errors
        }
      };

      ws.onerror = (err) => {
        console.error('[useNostrEvents] WebSocket error:', err);
        setError('Connection error');
        setIsConnected(false);
        setIsLoading(false);
      };

      ws.onclose = () => {
        console.log('[useNostrEvents] Connection closed');
        setIsConnected(false);
        wsRef.current = null;
        subscriptionIdRef.current = null;
      };

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setIsLoading(false);
    }
  }, [authorHex, mentionedHex, kinds, limit]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      // Send CLOSE message if subscription is active
      if (subscriptionIdRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(['CLOSE', subscriptionIdRef.current]));
      }
      wsRef.current.close();
      wsRef.current = null;
      subscriptionIdRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && (authorPubkey || mentionedPubkey)) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, authorPubkey, mentionedPubkey, connect, disconnect]);

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
