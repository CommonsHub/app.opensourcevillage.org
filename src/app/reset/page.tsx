'use client';

/**
 * Reset Page
 *
 * On localhost: clears localStorage and server-side data
 * On production: clears localStorage only
 */

import { useState, useEffect } from 'react';

interface ResetResult {
  localStorage: { cleared: boolean; error?: string };
  serverData?: { success: boolean; message: string; deleted?: string[]; error?: string };
}

export default function ResetPage() {
  const [isLocalhost, setIsLocalhost] = useState<boolean | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [result, setResult] = useState<ResetResult | null>(null);
  const [serverInfo, setServerInfo] = useState<{ exists: boolean; contents: { name: string; type: string; preserved?: boolean }[]; preservedItems?: string[] } | null>(null);

  useEffect(() => {
    // Check if we're on localhost
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    setIsLocalhost(isLocal);

    // Fetch server data info (only on localhost)
    if (isLocal) {
      fetch('/api/reset')
        .then((res) => res.json())
        .then((data) => setServerInfo(data))
        .catch(console.error);
    }
  }, []);

  const handleResetLocalStorage = async () => {
    if (!confirm('Are you sure you want to clear your local data? You will be logged out.')) {
      return;
    }

    setIsResetting(true);
    const resetResult: ResetResult = {
      localStorage: { cleared: false },
    };

    // Clear localStorage
    try {
      const itemCount = localStorage.length;
      localStorage.clear();
      resetResult.localStorage = { cleared: true };
      console.log(`[Reset] Cleared ${itemCount} items from localStorage`);
    } catch (err) {
      resetResult.localStorage = {
        cleared: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    setResult(resetResult);
    setIsResetting(false);
  };

  const handleResetAll = async () => {
    if (!confirm('Are you sure you want to reset ALL data (localStorage + server)? This cannot be undone.')) {
      return;
    }

    setIsResetting(true);
    const resetResult: ResetResult = {
      localStorage: { cleared: false },
      serverData: { success: false, message: '' },
    };

    // Clear localStorage
    try {
      const itemCount = localStorage.length;
      localStorage.clear();
      resetResult.localStorage = { cleared: true };
      console.log(`[Reset] Cleared ${itemCount} items from localStorage`);
    } catch (err) {
      resetResult.localStorage = {
        cleared: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Clear server data
    try {
      const response = await fetch('/api/reset', { method: 'POST' });
      const data = await response.json();

      if (response.ok) {
        resetResult.serverData = {
          success: data.success,
          message: data.message,
          deleted: data.deleted,
        };
      } else {
        resetResult.serverData = {
          success: false,
          message: 'API request failed',
          error: data.error,
        };
      }
    } catch (err) {
      resetResult.serverData = {
        success: false,
        message: 'Failed to call reset API',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    setResult(resetResult);
    setIsResetting(false);
  };

  // Loading state
  if (isLocalhost === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            {isLocalhost ? 'Reset All Data' : 'Reset Local Data'}
          </h1>
          <p className="text-gray-600 mb-6">
            {isLocalhost
              ? <>This will clear all localStorage and delete all files in the <code className="bg-gray-100 px-1 rounded">data/</code> directory.</>
              : 'This will clear your local browser data and log you out. Your profile data on the server will remain intact.'}
          </p>

          {/* Server data info (localhost only) */}
          {isLocalhost && serverInfo && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h2 className="font-semibold text-gray-700 mb-2">Server Data</h2>
              {serverInfo.exists ? (
                <ul className="text-sm text-gray-600 space-y-1">
                  {serverInfo.contents.map((item) => (
                    <li key={item.name} className={`flex items-center gap-2 ${item.preserved ? 'text-green-600' : ''}`}>
                      <span>{item.type === 'directory' ? '📁' : '📄'}</span>
                      <span>{item.name}</span>
                      {item.preserved && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">preserved</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No data directory exists</p>
              )}
            </div>
          )}

          {/* Reset buttons */}
          {!result && (
            <div className="space-y-3">
              <button
                onClick={handleResetLocalStorage}
                disabled={isResetting}
                className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-semibold rounded-lg transition-colors"
              >
                {isResetting ? 'Resetting...' : isLocalhost ? 'Reset localStorage Only' : 'Reset Local Data & Logout'}
              </button>
              {isLocalhost && (
                <button
                  onClick={handleResetAll}
                  disabled={isResetting}
                  className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold rounded-lg transition-colors"
                >
                  {isResetting ? 'Resetting...' : 'Reset All Data (localStorage + Server)'}
                </button>
              )}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg ${result.localStorage.cleared ? 'bg-green-50' : 'bg-red-50'}`}>
                <h3 className="font-semibold mb-1">
                  {result.localStorage.cleared ? '✓' : '✗'} localStorage
                </h3>
                <p className="text-sm text-gray-600">
                  {result.localStorage.cleared
                    ? 'Cleared successfully'
                    : `Error: ${result.localStorage.error}`}
                </p>
              </div>

              {result.serverData && (
                <div className={`p-4 rounded-lg ${result.serverData.success ? 'bg-green-50' : 'bg-red-50'}`}>
                  <h3 className="font-semibold mb-1">
                    {result.serverData.success ? '✓' : '✗'} Server Data
                  </h3>
                  <p className="text-sm text-gray-600">{result.serverData.message}</p>
                  {result.serverData.error && (
                    <p className="text-sm text-red-600 mt-1">Error: {result.serverData.error}</p>
                  )}
                  {result.serverData.deleted && result.serverData.deleted.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-sm text-gray-500 cursor-pointer">
                        Deleted {result.serverData.deleted.length} items
                      </summary>
                      <ul className="text-xs text-gray-500 mt-1 max-h-40 overflow-auto">
                        {result.serverData.deleted.map((path) => (
                          <li key={path} className="truncate">{path}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              <button
                onClick={() => window.location.href = '/'}
                className="w-full py-3 px-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                Go to Home
              </button>
            </div>
          )}

          {isLocalhost && (
            <p className="mt-6 text-xs text-gray-400 text-center">
              Server reset is only available on localhost
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
