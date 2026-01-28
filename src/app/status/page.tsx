'use client';

/**
 * Status Page
 *
 * Displays server status information including git info, uptime, and service status
 */

import { useEffect, useState } from 'react';

interface ServiceStatus {
  running: boolean;
  status: string;
  pid?: number;
  logs?: string[];
}

interface RelayStatus {
  url: string;
  connected: boolean;
  error?: string;
}

interface StatusData {
  git: {
    sha: string;
    shortSha: string;
    message: string;
    date: string;
  };
  server: {
    timestamp: string;
    uptime: string;
    uptimeSeconds: number;
    loadAverage: number[];
  };
  data: {
    directorySize: string;
    directorySizeBytes: number;
    npubCount: number;
  };
  services: {
    paymentProcessor: ServiceStatus;
    nostrListener: ServiceStatus;
    mainApp: ServiceStatus;
    calendarSync: ServiceStatus;
  };
  wallet: {
    address: string;
    backupAddress: string | null;
    chain: string;
    explorerUrl: string;
  };
  nostr: {
    npub: string;
    relays: string[];
    relayStatus: RelayStatus[];
  };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition"
      title="Copy to clipboard"
    >
      {copied ? (
        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

function AddressDisplay({
  label,
  address,
  explorerUrl
}: {
  label: string;
  address: string;
  explorerUrl?: string;
}) {
  const isValid = address.startsWith('0x') || address.startsWith('npub');
  const truncated = isValid && address.length > 20
    ? `${address.slice(0, 10)}...${address.slice(-8)}`
    : address;

  return (
    <div className="p-3 bg-gray-50 rounded-lg">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-sm font-mono text-gray-900 truncate" title={address}>
          {truncated}
        </code>
        {isValid && (
          <>
            <CopyButton text={address} />
            {explorerUrl && (
              <a
                href={`${explorerUrl}${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded transition"
                title="View on explorer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RelayStatusBadge({ relay }: { relay: RelayStatus }) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <code className="text-sm font-mono text-gray-700 truncate flex-1" title={relay.url}>
        {relay.url}
      </code>
      <span
        className={`ml-2 px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${
          relay.connected
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        }`}
        title={relay.error}
      >
        {relay.connected ? 'connected' : relay.error || 'disconnected'}
      </span>
    </div>
  );
}

function ServiceBadge({ service, name }: { service: ServiceStatus; name: string }) {
  const [expanded, setExpanded] = useState(false);
  const hasLogs = service.logs && service.logs.length > 0;

  return (
    <div className="bg-gray-50 rounded-lg overflow-hidden">
      <button
        onClick={() => hasLogs && setExpanded(!expanded)}
        className={`w-full flex items-center justify-between p-3 ${hasLogs ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-2">
          {hasLogs && (
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          <span className="font-medium text-gray-900">{name}</span>
          {service.pid && (
            <span className="text-xs text-gray-500">PID: {service.pid}</span>
          )}
        </div>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            service.running
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}
        >
          {service.status}
        </span>
      </button>
      {expanded && hasLogs && (
        <div className="border-t border-gray-200 bg-gray-900 p-3 max-h-64 overflow-y-auto">
          <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-all">
            {service.logs!.join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function StatusPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/status');
      const data = await response.json();

      if (data.success) {
        setStatus(data.status);
        setLastUpdate(new Date());
        setError('');
      } else {
        setError(data.error || 'Failed to fetch status');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Refresh every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Loading status...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h1 className="text-xl font-bold text-red-800">Error</h1>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Server Status</h1>
          <div className="text-sm text-gray-500">
            Last update: {lastUpdate?.toLocaleTimeString()}
          </div>
        </div>

        {/* Git Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Git
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-500">Commit</div>
              <code className="text-sm font-mono text-blue-600">{status.git.shortSha}</code>
            </div>
            <div>
              <div className="text-sm text-gray-500">Date</div>
              <div className="text-sm text-gray-900">{status.git.date}</div>
            </div>
            <div className="col-span-2">
              <div className="text-sm text-gray-500">Message</div>
              <div className="text-sm text-gray-900">{status.git.message}</div>
            </div>
          </div>
        </div>

        {/* Server Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
            Server
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-500">Uptime</div>
              <div className="text-lg font-semibold text-gray-900">{status.server.uptime}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Load Average</div>
              <div className="text-lg font-semibold text-gray-900">
                {status.server.loadAverage.map(l => l.toFixed(2)).join(' / ')}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Server Time</div>
              <div className="text-sm text-gray-900">
                {new Date(status.server.timestamp).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Data Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
            Data
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-500">Directory Size</div>
              <div className="text-lg font-semibold text-gray-900">{status.data.directorySize}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Profiles (npubs)</div>
              <div className="text-lg font-semibold text-gray-900">{status.data.npubCount}</div>
            </div>
          </div>
        </div>

        {/* Services */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Services
          </h2>
          <div className="space-y-2">
            <ServiceBadge service={status.services.mainApp} name="Main App (osv)" />
            <ServiceBadge service={status.services.paymentProcessor} name="Payment Processor" />
            <ServiceBadge service={status.services.nostrListener} name="NOSTR Listener" />
            <ServiceBadge service={status.services.calendarSync} name="Calendar Sync (cron)" />
          </div>
        </div>

        {/* Wallet */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Wallet
            <span className="text-xs font-normal text-gray-500 ml-2">({status.wallet.chain})</span>
          </h2>
          <div className="space-y-3">
            <AddressDisplay
              label="Server Address"
              address={status.wallet.address}
              explorerUrl={status.wallet.explorerUrl}
            />
            {status.wallet.backupAddress && (
              <AddressDisplay
                label="Backup Address"
                address={status.wallet.backupAddress}
                explorerUrl={status.wallet.explorerUrl}
              />
            )}
          </div>
        </div>

        {/* NOSTR */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
            NOSTR
          </h2>
          <div className="space-y-4">
            <AddressDisplay
              label="Server npub"
              address={status.nostr.npub}
            />
            <div>
              <div className="text-sm text-gray-500 mb-2">Relays</div>
              <div className="space-y-2">
                {status.nostr.relayStatus.map((relay) => (
                  <RelayStatusBadge key={relay.url} relay={relay} />
                ))}
                {status.nostr.relayStatus.length === 0 && (
                  <div className="text-sm text-gray-500 italic">No relays configured</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* JSON Link */}
        <div className="text-center">
          <a
            href="/status.json"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            View as JSON →
          </a>
        </div>
      </div>
    </div>
  );
}
