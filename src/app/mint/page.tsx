'use client';

/**
 * Mint Page
 *
 * Allows minting tokens to a given npub or username.
 * Only works on localhost for safety.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import settings from '../../../settings.json';

interface MintResult {
  success: boolean;
  message?: string;
  eventId?: string;
  publishedTo?: string[];
  recipient?: {
    npub: string;
    username?: string;
    walletAddress?: string;
    explorerUrl?: string;
  };
  error?: string;
}

interface NostrEvent {
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
  sig: string;
}

interface DebugEvent {
  timestamp: Date;
  type: 'request' | 'receipt' | 'connection' | 'error';
  event?: NostrEvent;
  message?: string;
}

export default function MintPage() {
  const [isLocalhost, setIsLocalhost] = useState<boolean | null>(null);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('50');
  const [isMinting, setIsMinting] = useState(false);
  const [result, setResult] = useState<MintResult | null>(null);

  // Debug panel state
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const debugPanelRef = useRef<HTMLDivElement>(null);

  const addDebugEvent = useCallback((event: DebugEvent) => {
    setDebugEvents((prev) => [...prev.slice(-49), event]); // Keep last 50 events
  }, []);

  // Connect to NOSTR relay for debug events
  useEffect(() => {
    const relayUrl = settings.nostrRelays?.[0];
    if (!relayUrl) return;

    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = () => {
      try {
        ws = new WebSocket(relayUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          addDebugEvent({
            timestamp: new Date(),
            type: 'connection',
            message: `Connected to ${relayUrl}`,
          });

          // Subscribe to payment events (1734 = request, 1735 = receipt)
          const subId = `mint_debug_${Date.now()}`;
          const filter = {
            kinds: [1734, 1735],
            since: Math.floor(Date.now() / 1000) - 3600, // Last hour
          };
          ws?.send(JSON.stringify(['REQ', subId, filter]));
        };

        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data);
            if (!Array.isArray(data)) return;

            const [type, ...rest] = data;

            if (type === 'EVENT' && rest[1]) {
              const event = rest[1] as NostrEvent;
              if (event.kind === 1734 || event.kind === 1735) {
                addDebugEvent({
                  timestamp: new Date(),
                  type: event.kind === 1734 ? 'request' : 'receipt',
                  event,
                });
              }
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onerror = () => {
          addDebugEvent({
            timestamp: new Date(),
            type: 'error',
            message: 'WebSocket error',
          });
        };

        ws.onclose = () => {
          setWsConnected(false);
          addDebugEvent({
            timestamp: new Date(),
            type: 'connection',
            message: 'Disconnected from relay',
          });

          // Reconnect after 5 seconds
          reconnectTimeout = setTimeout(connect, 5000);
        };
      } catch (err) {
        addDebugEvent({
          timestamp: new Date(),
          type: 'error',
          message: `Failed to connect: ${err}`,
        });
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [addDebugEvent]);

  // Auto-scroll debug panel
  useEffect(() => {
    if (debugPanelRef.current) {
      debugPanelRef.current.scrollTop = debugPanelRef.current.scrollHeight;
    }
  }, [debugEvents]);

  useEffect(() => {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    setIsLocalhost(isLocal);
  }, []);

  const handleMint = async () => {
    if (!recipient.trim() || !amount.trim()) return;

    setIsMinting(true);
    setResult(null);

    try {
      const response = await fetch('/api/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: recipient.trim(),
          amount: parseFloat(amount),
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mint tokens',
      });
    } finally {
      setIsMinting(false);
    }
  };

  const handleReset = () => {
    setRecipient('');
    setAmount('50');
    setResult(null);
  };

  // Loading state
  if (isLocalhost === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-600">Checking environment...</div>
      </div>
    );
  }

  // Not localhost
  if (!isLocalhost) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">
            This page is only available on localhost for safety reasons.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Mint Tokens</h1>
          <p className="text-gray-600 mb-6">
            Mint tokens to a user by their username or npub.
          </p>

          {!result && (
            <div className="space-y-4">
              <div>
                <label htmlFor="recipient" className="block text-sm font-medium text-gray-700 mb-1">
                  Recipient
                </label>
                <input
                  id="recipient"
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="username or npub1..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter a username (e.g., &quot;alice&quot;) or an npub (e.g., &quot;npub1abc...&quot;)
                </p>
              </div>

              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
                  Amount
                </label>
                <input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="50"
                  min="1"
                  step="1"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                />
              </div>

              <button
                onClick={handleMint}
                disabled={isMinting || !recipient.trim() || !amount.trim()}
                className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                {isMinting ? 'Minting...' : 'Mint Tokens'}
              </button>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  {result.success ? (
                    <>
                      <span className="text-green-600">&#10003;</span>
                      <span className="text-green-800">Mint Request Sent</span>
                    </>
                  ) : (
                    <>
                      <span className="text-red-600">&#10007;</span>
                      <span className="text-red-800">Mint Failed</span>
                    </>
                  )}
                </h3>

                {result.success ? (
                  <div className="text-sm text-gray-700 space-y-2">
                    <p>{result.message}</p>
                    {result.recipient && (
                      <>
                        <p>
                          <span className="font-medium">Recipient:</span>{' '}
                          {result.recipient.username || result.recipient.npub.slice(0, 20) + '...'}
                        </p>
                        {result.recipient.walletAddress && (
                          <p>
                            <span className="font-medium">Wallet:</span>{' '}
                            {result.recipient.explorerUrl ? (
                              <a
                                href={result.recipient.explorerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {result.recipient.walletAddress.slice(0, 10)}...{result.recipient.walletAddress.slice(-8)}
                                <span className="ml-1">↗</span>
                              </a>
                            ) : (
                              <span className="font-mono">
                                {result.recipient.walletAddress.slice(0, 10)}...{result.recipient.walletAddress.slice(-8)}
                              </span>
                            )}
                          </p>
                        )}
                      </>
                    )}
                    {result.eventId && (
                      <p className="font-mono text-xs text-gray-500 break-all">
                        Event ID: {result.eventId}
                      </p>
                    )}
                    {result.publishedTo && result.publishedTo.length > 0 && (
                      <div>
                        <p className="font-medium">Published to:</p>
                        <ul className="text-xs text-gray-500">
                          {result.publishedTo.map((url) => (
                            <li key={url}>{url}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      The payment processor will execute this mint request.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-red-700">{result.error}</p>
                )}
              </div>

              <button
                onClick={handleReset}
                className="w-full py-3 px-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                Mint More
              </button>
            </div>
          )}

          <p className="mt-6 text-xs text-gray-400 text-center">
            This page is only available on localhost
          </p>
        </div>

        {/* Debug Panel - NOSTR Events */}
        <div className="bg-gray-900 rounded-lg shadow-md p-4 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300">
              NOSTR Events (1734/1735)
            </h2>
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  wsConnected ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className="text-xs text-gray-500">
                {wsConnected ? 'Connected' : 'Disconnected'}
              </span>
              <button
                onClick={() => setDebugEvents([])}
                className="text-xs text-gray-500 hover:text-gray-300 ml-2"
              >
                Clear
              </button>
            </div>
          </div>

          <div
            ref={debugPanelRef}
            className="bg-black rounded p-3 h-64 overflow-y-auto font-mono text-xs"
          >
            {debugEvents.length === 0 ? (
              <p className="text-gray-600">Waiting for events...</p>
            ) : (
              debugEvents.map((item, index) => (
                <div
                  key={index}
                  className={`mb-2 pb-2 border-b border-gray-800 ${
                    item.type === 'request'
                      ? 'text-yellow-400'
                      : item.type === 'receipt'
                      ? 'text-green-400'
                      : item.type === 'error'
                      ? 'text-red-400'
                      : 'text-gray-500'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-600">
                      {item.timestamp.toLocaleTimeString()}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs ${
                        item.type === 'request'
                          ? 'bg-yellow-900 text-yellow-300'
                          : item.type === 'receipt'
                          ? 'bg-green-900 text-green-300'
                          : item.type === 'error'
                          ? 'bg-red-900 text-red-300'
                          : 'bg-gray-800 text-gray-400'
                      }`}
                    >
                      {item.type === 'request'
                        ? '1734 REQUEST'
                        : item.type === 'receipt'
                        ? '1735 RECEIPT'
                        : item.type.toUpperCase()}
                    </span>
                  </div>
                  {item.message && <p>{item.message}</p>}
                  {item.event && (
                    <div className="text-gray-400 mt-1">
                      <p>
                        ID: {item.event.id.slice(0, 16)}...
                      </p>
                      {item.event.tags.map((tag, i) => {
                        if (tag[0] === 'amount') {
                          return (
                            <p key={i}>
                              Amount: <span className="text-white">{tag[1]}</span>
                            </p>
                          );
                        }
                        if (tag[0] === 'p') {
                          return (
                            <p key={i}>
                              Recipient: <span className="text-white">{tag[1].slice(0, 16)}...</span>
                            </p>
                          );
                        }
                        if (tag[0] === 'status') {
                          return (
                            <p key={i}>
                              Status:{' '}
                              <span
                                className={
                                  tag[1] === 'success' ? 'text-green-400' : 'text-red-400'
                                }
                              >
                                {tag[1]}
                              </span>
                            </p>
                          );
                        }
                        if (tag[0] === 'tx') {
                          return (
                            <p key={i}>
                              TX: <span className="text-blue-400">{tag[1].slice(0, 20)}...</span>
                            </p>
                          );
                        }
                        if (tag[0] === 'method') {
                          return (
                            <p key={i}>
                              Method: <span className="text-white">{tag[1]}</span>
                            </p>
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
