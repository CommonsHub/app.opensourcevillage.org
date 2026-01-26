/**
 * Debug Info Component
 *
 * Shows debug information in dev mode (localhost only)
 * Displays serial number, npub, username, secret key status, and last NOSTR event
 */

'use client';

import { useEffect, useState } from 'react';
import { nip19 } from 'nostr-tools';
import { getStoredCredentials } from '@/lib/nostr-client';
import { getStoredSecretKey } from '@/lib/nostr-events';

interface NostrEvent {
  id: string;
  kind: number;
  created_at: number;
  content: string;
  tags: any[];
}

interface WalletInfo {
  address: string;
  chain: string;
  chainId: number;
}

interface TokenBalance {
  confirmed: number;
  pending: number;
  total: number;
}

// Block explorer URLs by chain
const BLOCK_EXPLORERS: Record<string, string> = {
  gnosis: 'https://gnosisscan.io',
  gnosis_chiado: 'https://gnosis-chiado.blockscout.com',
  base: 'https://basescan.org',
  base_sepolia: 'https://sepolia.basescan.org',
  localhost: '',
};

export default function DebugInfo() {
  const [isVisible, setIsVisible] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true); // Default collapsed
  const [credentials, setCredentials] = useState<{ username: string; npub: string } | null>(null);
  const [nsec, setNsec] = useState<string | null>(null);
  const [serialNumber, setSerialNumber] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState<number>(0);
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [copiedField, setCopiedField] = useState<'npub' | 'pubkey' | 'nsec' | null>(null);
  const [pubkey, setPubkey] = useState<string | null>(null);

  useEffect(() => {
    // Load collapse state from localStorage
    if (typeof window !== 'undefined') {
      const savedState = localStorage.getItem('osv_debug_info_collapsed');
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

      // Get credentials and secret key
      const creds = getStoredCredentials();
      const storedNsec = getStoredSecretKey();
      setNsec(storedNsec);

      if (creds) {
        setCredentials(creds);

        // Derive pubkey (hex) from npub
        try {
          const decoded = nip19.decode(creds.npub);
          if (decoded.type === 'npub') {
            setPubkey(decoded.data as string);
          }
        } catch (err) {
          console.error('[DebugInfo] Failed to decode npub:', err);
        }

        loadDebugInfo(creds.username, creds.npub);

        // Refresh events every 10 seconds
        const interval = setInterval(() => {
          loadDebugInfo(creds.username, creds.npub);
          // Also refresh nsec in case it changed
          setNsec(getStoredSecretKey());
        }, 10000);

        return () => clearInterval(interval);
      }
    }
  }, []);

  const loadDebugInfo = async (username: string, npub: string) => {
    try {
      const response = await fetch(`/api/profile/${username}`);
      const data = await response.json();

      if (data.success && data.profile) {
        // In dev mode, the API includes serialNumber
        if (data.profile.serialNumber) {
          setSerialNumber(data.profile.serialNumber);
        }
      }

      // Load NOSTR events (directly by npub)
      const eventsResponse = await fetch(`/api/nostr-events/${npub}`);
      const eventsData = await eventsResponse.json();
      if (eventsData.success) {
        setEventCount(eventsData.count || 0);
        setEvents(eventsData.events || []);
      }

      // Load wallet address
      const walletResponse = await fetch(`/api/wallet/address/${npub}`);
      const walletData = await walletResponse.json();
      if (walletData.success) {
        setWalletInfo({
          address: walletData.walletAddress,
          chain: walletData.chain,
          chainId: walletData.chainId,
        });
      }

      // Load balance
      const balanceResponse = await fetch(`/api/balance/${npub}`);
      const balanceData = await balanceResponse.json();
      if (balanceData.success) {
        setBalance(balanceData.balance);
      }
    } catch (err) {
      console.error('[DebugInfo] Failed to load debug info:', err);
    }
  };

  if (!isVisible || !credentials) {
    return null;
  }

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    if (typeof window !== 'undefined') {
      localStorage.setItem('osv_debug_info_collapsed', String(newState));
    }
  };

  const handleCopy = async (field: 'npub' | 'pubkey' | 'nsec', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const CopyButton = ({ field, value }: { field: 'npub' | 'pubkey' | 'nsec'; value: string }) => (
    <button
      onClick={() => handleCopy(field, value)}
      className="ml-1 p-0.5 text-gray-400 hover:text-white transition"
      title={`Copy ${field}`}
    >
      {copiedField === field ? (
        <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white rounded-lg shadow-lg text-xs font-mono z-40 max-w-sm" style={{ bottom: '6rem' }}>
      <button
        onClick={toggleCollapse}
        className="w-full p-3 text-left flex items-center justify-between hover:bg-gray-800 rounded-lg transition"
      >
        <div className="text-gray-400 font-semibold uppercase tracking-wide text-[10px] flex items-center gap-2">
          Debug Info
          {isCollapsed && (
            <span className="text-gray-500">
              {eventCount} event{eventCount !== 1 ? 's' : ''}
            </span>
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
          {serialNumber && (
            <div className="flex gap-2">
              <span className="text-gray-500 w-24 flex-shrink-0">Serial:</span>
              <span className="text-green-400 break-all">{serialNumber}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="text-gray-500 w-24 flex-shrink-0">NPub:</span>
            <span className="text-blue-400 break-all text-[10px] flex items-center">
              {credentials.npub}
              <CopyButton field="npub" value={credentials.npub} />
            </span>
          </div>
          {pubkey && (
            <div className="flex gap-2">
              <span className="text-gray-500 w-24 flex-shrink-0">Pubkey:</span>
              <span className="text-blue-300 break-all text-[10px] flex items-center">
                {pubkey}
                <CopyButton field="pubkey" value={pubkey} />
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="text-gray-500 w-24 flex-shrink-0">Username:</span>
            <span className="text-purple-400">@{credentials.username}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-500 w-24 flex-shrink-0">NSec:</span>
            {nsec ? (
              <span className="text-orange-400 break-all text-[10px] flex items-center">
                {nsec.substring(0, 12)}...{nsec.substring(nsec.length - 8)}
                <CopyButton field="nsec" value={nsec} />
              </span>
            ) : (
              <span className="text-red-400">✗ Missing</span>
            )}
          </div>
          {walletInfo && (
            <div className="flex gap-2">
              <span className="text-gray-500 w-24 flex-shrink-0">Wallet:</span>
              <div className="flex items-center gap-1">
                {BLOCK_EXPLORERS[walletInfo.chain] ? (
                  <a
                    href={`${BLOCK_EXPLORERS[walletInfo.chain]}/address/${walletInfo.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-yellow-400 hover:text-yellow-300 underline text-[10px] break-all"
                  >
                    {walletInfo.address.substring(0, 6)}...{walletInfo.address.substring(38)}
                  </a>
                ) : (
                  <span className="text-yellow-400 text-[10px] break-all">
                    {walletInfo.address.substring(0, 6)}...{walletInfo.address.substring(38)}
                  </span>
                )}
                <span className="text-gray-600 text-[9px]">({walletInfo.chain})</span>
              </div>
            </div>
          )}
          {balance && (
            <div className="flex gap-2">
              <span className="text-gray-500 w-24 flex-shrink-0">Balance:</span>
              <span className="text-green-400">
                {balance.confirmed}
                {balance.pending > 0 && (
                  <span className="text-yellow-400"> (+{balance.pending} pending)</span>
                )}
              </span>
            </div>
          )}
          <div className="flex gap-2 pb-2">
            <span className="text-gray-500 w-24 flex-shrink-0">Events:</span>
            <span className="text-cyan-400">{eventCount}</span>
          </div>

          {/* NOSTR Events List */}
          <div className="border-t border-gray-700 pt-2">
            <div className="text-gray-400 font-semibold mb-2 text-[10px] uppercase tracking-wide">
              Latest Events
            </div>
            {events.length === 0 ? (
              <div className="text-gray-500 text-[9px] italic">No events logged yet</div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {events.slice().reverse().slice(0, 5).map((event) => (
                  <div key={event.id} className="bg-gray-800 rounded p-2 border border-gray-700">
                    <div className="flex items-center gap-2 mb-1 text-[9px]">
                      <span className="text-purple-400 font-semibold">
                        Kind {event.kind}
                      </span>
                      <span className="text-gray-600">•</span>
                      <a
                        href={`https://njump.me/${event.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 underline"
                      >
                        {event.id.substring(0, 6)}...
                      </a>
                      <span className="text-gray-600">•</span>
                      <span className="text-gray-500">
                        {new Date(event.created_at * 1000).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    {event.content && (
                      <div className="text-gray-300 text-[10px] mt-1 p-1 bg-gray-900 rounded">
                        {event.content.length > 60
                          ? event.content.substring(0, 60) + '...'
                          : event.content}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
