'use client';

/**
 * NOSTR Events Page
 *
 * Displays all NOSTR events recorded by the nostr-listener.
 * Features:
 * - List of events with date, time, kind (with hover description), and content
 * - Expandable rows to see full event JSON
 * - Filter by npub (shows username if available, cached in localStorage)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getRelayUrls, subscribe, unsubscribe, disconnectAll, type NostrEvent } from '@/lib/nostr';
import { nip19 } from 'nostr-tools';

interface KindInfo {
  name: string;
  description: string;
}

interface EventEntry {
  timestamp: string;
  source: string;
  mentioned?: boolean;
  event: NostrEvent;
  npub: string;
  kindInfo: KindInfo;
  isLive?: boolean; // True if event came from live subscription
}

interface PubkeyInfo {
  pubkey: string;
  npub: string;
}

// Cache key for usernames
const USERNAME_CACHE_KEY = 'nostr_npub_usernames';

export default function NostrEventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [pubkeys, setPubkeys] = useState<PubkeyInfo[]>([]);
  const [kindInfo, setKindInfo] = useState<Record<number, KindInfo>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPubkey, setSelectedPubkey] = useState<string>('');
  const [selectedKinds, setSelectedKinds] = useState<number[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [usernameCache, setUsernameCache] = useState<Record<string, string>>({});
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [liveEventCount, setLiveEventCount] = useState(0);
  const subscriptionIds = useRef<Map<string, string>>(new Map());
  const seenEventIds = useRef<Set<string>>(new Set());

  // Load username cache from localStorage
  useEffect(() => {
    try {
      const cached = localStorage.getItem(USERNAME_CACHE_KEY);
      if (cached) {
        setUsernameCache(JSON.parse(cached));
      }
    } catch {
      // Ignore errors
    }
  }, []);

  // Save username cache to localStorage
  const saveUsernameCache = useCallback((cache: Record<string, string>) => {
    try {
      localStorage.setItem(USERNAME_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Ignore errors
    }
  }, []);

  // Fetch username for an npub
  const fetchUsername = useCallback(async (npub: string) => {
    if (usernameCache[npub]) return;

    try {
      const res = await fetch(`/api/profile/${npub}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.profile?.username) {
          const newCache = { ...usernameCache, [npub]: data.profile.username };
          setUsernameCache(newCache);
          saveUsernameCache(newCache);
        }
      }
    } catch {
      // Ignore errors
    }
  }, [usernameCache, saveUsernameCache]);

  // Fetch usernames for all pubkeys
  useEffect(() => {
    pubkeys.forEach(p => fetchUsername(p.npub));
  }, [pubkeys, fetchUsername]);

  // Fetch events
  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setLiveEventCount(0); // Reset live event count on refresh

    try {
      const params = new URLSearchParams();
      params.set('limit', '200');

      if (selectedPubkey) {
        params.set('pubkeys', selectedPubkey);
      }

      if (selectedKinds.length > 0) {
        params.set('kinds', selectedKinds.join(','));
      }

      const res = await fetch(`/api/nostr/events?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch events');
      }

      const data = await res.json();
      if (data.success) {
        setEvents(data.events);
        setPubkeys(data.pubkeys);
        setKindInfo(data.kindInfo);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPubkey, selectedKinds]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Mark existing events as seen (to avoid duplicates from live subscription)
  useEffect(() => {
    events.forEach(e => seenEventIds.current.add(e.event.id));
  }, [events]);

  // Live subscription to NOSTR relays
  useEffect(() => {
    const setupLiveSubscription = async () => {
      const relayUrls = getRelayUrls();
      if (relayUrls.length === 0) {
        console.log('[NostrPage] No relay URLs configured');
        return;
      }

      console.log('[NostrPage] Setting up live subscriptions to', relayUrls.length, 'relays');
      setIsLiveConnected(false);

      for (const relayUrl of relayUrls) {
        try {
          // Subscribe to all events (no filter = all events)
          // Use since: now to only get new events
          const subId = await subscribe(relayUrl, [{ since: Math.floor(Date.now() / 1000) }], {
            onEvent: (event: NostrEvent) => {
              // Skip if we've already seen this event
              if (seenEventIds.current.has(event.id)) {
                return;
              }
              seenEventIds.current.add(event.id);

              console.log('[NostrPage] Live event received:', event.kind, event.id.slice(0, 8));

              // Convert to EventEntry format
              const npub = nip19.npubEncode(event.pubkey);
              const newEntry: EventEntry = {
                timestamp: new Date(event.created_at * 1000).toISOString(),
                source: relayUrl,
                event,
                npub,
                kindInfo: kindInfo[event.kind] || { name: `Kind ${event.kind}`, description: `Event kind ${event.kind}` },
                isLive: true,
              };

              // Prepend new event to the list
              setEvents(prev => [newEntry, ...prev]);
              setLiveEventCount(prev => prev + 1);

              // Fetch username for this npub if not cached
              fetchUsername(npub);
            },
            onEose: () => {
              console.log('[NostrPage] EOSE received from', relayUrl);
              setIsLiveConnected(true);
            },
            onError: (error) => {
              console.error('[NostrPage] Subscription error from', relayUrl, ':', error);
            },
          });

          if (subId) {
            subscriptionIds.current.set(relayUrl, subId);
            console.log('[NostrPage] Subscribed to', relayUrl, 'with subId', subId);
            setIsLiveConnected(true);
          }
        } catch (err) {
          console.error('[NostrPage] Failed to subscribe to', relayUrl, ':', err);
        }
      }
    };

    setupLiveSubscription();

    // Cleanup on unmount
    return () => {
      console.log('[NostrPage] Cleaning up subscriptions');
      for (const [relayUrl, subId] of subscriptionIds.current) {
        unsubscribe(relayUrl, subId);
      }
      subscriptionIds.current.clear();
      disconnectAll();
    };
  }, [kindInfo, fetchUsername]);

  // Toggle event expansion
  const toggleExpand = (eventId: string) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  // Format date/time
  const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    };
  };

  // Truncate content for display
  const truncateContent = (content: string, maxLength = 100) => {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  };

  // Get display name for npub
  const getDisplayName = (npub: string) => {
    if (usernameCache[npub]) {
      return usernameCache[npub];
    }
    return npub.slice(0, 12) + '...';
  };

  // Get unique kinds from events
  const uniqueKinds = Array.from(new Set(events.map(e => e.event.kind))).sort((a, b) => a - b);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Top App Bar */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              className="text-gray-600 hover:text-gray-900"
              onClick={() => router.push('/')}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="font-semibold text-gray-900">NOSTR Events</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Live connection indicator */}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
                title={isLiveConnected ? 'Live updates active' : 'Connecting...'}
              />
              <span className="text-xs text-gray-500">
                {isLiveConnected ? 'Live' : 'Offline'}
              </span>
              {liveEventCount > 0 && (
                <span className="text-xs text-green-600 font-medium">
                  +{liveEventCount}
                </span>
              )}
            </div>

            <button
              onClick={fetchEvents}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex flex-wrap gap-3">
            {/* Pubkey Filter */}
            <select
              value={selectedPubkey}
              onChange={(e) => setSelectedPubkey(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All users</option>
              {pubkeys.map(p => (
                <option key={p.pubkey} value={p.pubkey}>
                  {getDisplayName(p.npub)}
                </option>
              ))}
            </select>

            {/* Kind Filter */}
            <select
              value={selectedKinds.length === 1 ? selectedKinds[0].toString() : ''}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedKinds(value ? [parseInt(value, 10)] : []);
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All kinds</option>
              {uniqueKinds.map(kind => (
                <option key={kind} value={kind}>
                  {kindInfo[kind]?.name || `Kind ${kind}`} ({kind})
                </option>
              ))}
            </select>

            {/* Clear filters */}
            {(selectedPubkey || selectedKinds.length > 0) && (
              <button
                onClick={() => {
                  setSelectedPubkey('');
                  setSelectedKinds([]);
                }}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-4">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading events...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <p className="text-red-600">{error}</p>
            <button
              onClick={fetchEvents}
              className="mt-2 text-sm text-red-700 hover:text-red-800 underline"
            >
              Try again
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="bg-gray-100 rounded-lg p-8 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-gray-600 mb-2">No events found</p>
            <p className="text-sm text-gray-500">
              Events will appear here once the NOSTR listener records them
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map(entry => {
              const { date, time } = formatDateTime(entry.timestamp);
              const isExpanded = expandedEvents.has(entry.event.id);

              return (
                <div
                  key={entry.event.id}
                  className="bg-white rounded-lg border border-gray-200 overflow-hidden"
                >
                  {/* Event row */}
                  <button
                    onClick={() => toggleExpand(entry.event.id)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      {/* Date/Time */}
                      <div className="flex-shrink-0 text-center w-16">
                        <div className="text-xs text-gray-500">{date}</div>
                        <div className="text-sm font-medium text-gray-700">{time}</div>
                      </div>

                      {/* Kind badge */}
                      <div className="flex-shrink-0">
                        <span
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 cursor-help"
                          title={entry.kindInfo?.description || `Event kind ${entry.event.kind}`}
                        >
                          {entry.kindInfo?.name || `Kind ${entry.event.kind}`}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">
                          {truncateContent(entry.event.content || '(no content)')}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {getDisplayName(entry.npub)}
                          {entry.mentioned && (
                            <span className="ml-2 text-orange-600">(mentioned)</span>
                          )}
                          {entry.isLive && (
                            <span className="ml-2 text-green-600 font-medium">(live)</span>
                          )}
                        </p>
                      </div>

                      {/* Expand indicator */}
                      <div className="flex-shrink-0">
                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                      <div className="space-y-3">
                        {/* Event metadata */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500">Event ID:</span>
                            <span className="ml-2 font-mono text-gray-700">{entry.event.id.slice(0, 16)}...</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Kind:</span>
                            <span className="ml-2 text-gray-700">{entry.event.kind}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Source:</span>
                            <span className="ml-2 text-gray-700">{entry.source}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Created:</span>
                            <span className="ml-2 text-gray-700">
                              {new Date(entry.event.created_at * 1000).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Full content */}
                        {entry.event.content && (
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Content:</div>
                            <pre className="text-xs font-mono bg-white p-2 rounded border border-gray-200 overflow-x-auto whitespace-pre-wrap">
                              {entry.event.content}
                            </pre>
                          </div>
                        )}

                        {/* Tags */}
                        {entry.event.tags.length > 0 && (
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Tags:</div>
                            <div className="flex flex-wrap gap-1">
                              {entry.event.tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-200 text-gray-700"
                                  title={tag.join(', ')}
                                >
                                  [{tag[0]}] {tag.length > 1 ? truncateContent(tag[1], 20) : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Full JSON */}
                        <details className="text-xs">
                          <summary className="text-gray-500 cursor-pointer hover:text-gray-700">
                            View full event JSON
                          </summary>
                          <pre className="mt-2 font-mono bg-white p-2 rounded border border-gray-200 overflow-x-auto text-[10px]">
                            {JSON.stringify(entry.event, null, 2)}
                          </pre>
                        </details>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Event count */}
        {!isLoading && !error && events.length > 0 && (
          <div className="text-center text-sm text-gray-500 mt-4">
            Showing {events.length} events
          </div>
        )}
      </main>
    </div>
  );
}
