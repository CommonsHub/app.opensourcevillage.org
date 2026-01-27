/**
 * NOSTR Status Component
 *
 * Shows connection status to NOSTR relays in dev mode
 */

'use client';

import { useEffect, useState } from 'react';
import { getRelayStatus, initializeRelayConnections } from '@/lib/nostr';

export default function NostrStatus() {
  const [relayStatus, setRelayStatus] = useState<Array<{ url: string; status: string }>>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true); // Default collapsed

  useEffect(() => {
    // Load collapse state from localStorage
    if (typeof window !== 'undefined') {
      const savedState = localStorage.getItem('osv_nostr_relays_collapsed');
      if (savedState !== null) {
        setIsCollapsed(savedState === 'true');
      }
    }
  }, []);

  useEffect(() => {
    // Only show in dev mode on localhost
    if (typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      setIsVisible(true);

      // Initial check
      const status = getRelayStatus();
      setRelayStatus(status);

      // Pre-connect to relays
      if (status.every(s => s.status === 'disconnected')) {
        setIsInitializing(true);
        console.log('[NostrStatus] Pre-connecting to NOSTR relays...');

        initializeRelayConnections()
          .then(() => {
            console.log('[NostrStatus] ✓ Relays initialized');
            const newStatus = getRelayStatus();
            setRelayStatus(newStatus);
          })
          .catch((err) => {
            console.error('[NostrStatus] Failed to initialize relays:', err);
          })
          .finally(() => {
            setIsInitializing(false);
          });
      }

      // Check relay status every 5 seconds
      const interval = setInterval(() => {
        const status = getRelayStatus();
        setRelayStatus(status);
      }, 5000);

      return () => clearInterval(interval);
    }
  }, []);

  if (!isVisible || relayStatus.length === 0) {
    return null;
  }

  const connectedCount = relayStatus.filter(r => r.status === 'connected').length;
  const totalCount = relayStatus.length;

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    if (typeof window !== 'undefined') {
      localStorage.setItem('osv_nostr_relays_collapsed', String(newState));
    }
  };

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white rounded-lg shadow-lg text-xs font-mono z-50 max-w-xs">
      <button
        onClick={toggleCollapse}
        className="w-full p-3 text-left flex items-center justify-between hover:bg-gray-800 rounded-lg transition"
      >
        <div className="text-gray-400 font-semibold uppercase tracking-wide text-[10px] flex items-center gap-2">
          NOSTR Relays
          {isInitializing && (
            <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-400"></div>
          )}
          {isCollapsed && !isInitializing && (
            <>
              <div className={`w-2 h-2 rounded-full ${
                connectedCount === totalCount ? 'bg-green-500' :
                connectedCount === 0 ? 'bg-red-500' :
                'bg-orange-500'
              }`} />
              <span className="text-gray-500">{connectedCount}/{totalCount}</span>
            </>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {!isCollapsed && (
        <div className="px-3 pb-3 space-y-1">
          {relayStatus.map((relay) => (
            <div key={relay.url} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                relay.status === 'connected' ? 'bg-green-500' :
                relay.status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                relay.status === 'error' ? 'bg-red-500' :
                'bg-gray-500'
              }`} />
              <span className="text-gray-300 truncate text-[11px]">
                {relay.url.replace('wss://', '')}
              </span>
            </div>
          ))}
          {relayStatus.every(r => r.status === 'disconnected') && !isInitializing && (
            <div className="text-gray-500 text-[10px] mt-2 italic">
              Click to connect
            </div>
          )}
        </div>
      )}
    </div>
  );
}
