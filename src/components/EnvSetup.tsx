'use client';

/**
 * Environment Setup Component
 *
 * Checks for required settings (NOSTR relays) in settings.json.
 * If missing, displays a form to collect them and save to settings.json.
 */

import { useEffect, useState } from 'react';

interface CheckResponse {
  missing: string[];
  configured: string[];
  allSet: boolean;
  nostrRelays: string[];
}

export default function EnvSetup() {
  const [needsSetup, setNeedsSetup] = useState(false);
  const [relayUrl, setRelayUrl] = useState('');
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    checkSettings();
  }, []);

  const checkSettings = async () => {
    console.log('[EnvSetup] Checking settings.json for NOSTR relays...');

    try {
      const response = await fetch('/api/env/check');
      const data: CheckResponse = await response.json();

      console.log('[EnvSetup] Settings check result:', data);

      if (!data.allSet || data.nostrRelays.length === 0) {
        console.log('[EnvSetup] Missing NOSTR relays, showing setup modal');
        setNeedsSetup(true);
        // Set default relay URL
        setRelayUrl('wss://relay.damus.io');
      } else {
        console.log('[EnvSetup] NOSTR relays configured:', data.nostrRelays);
      }
    } catch (err) {
      console.error('[EnvSetup] Error checking settings:', err);
      setError('Failed to check settings. Make sure the server is running.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);

    const trimmedUrl = relayUrl.trim();
    if (!trimmedUrl) {
      setError('Please enter a valid relay URL');
      setIsSaving(false);
      return;
    }

    // Validate URL format
    if (!trimmedUrl.startsWith('ws://') && !trimmedUrl.startsWith('wss://')) {
      setError('Relay URL must start with ws:// or wss://');
      setIsSaving(false);
      return;
    }

    console.log('[EnvSetup] Saving NOSTR relay:', trimmedUrl);

    try {
      const response = await fetch('/api/env/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nostrRelays: [trimmedUrl],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save settings');
      }

      console.log('[EnvSetup] Settings saved successfully');
      setSuccess(true);
      setNeedsSetup(false);

      // Reload page after 2 seconds to pick up new settings
      setTimeout(() => {
        console.log('[EnvSetup] Reloading page to apply new settings');
        window.location.reload();
      }, 2000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[EnvSetup] Error saving settings:', errorMsg);
      setError(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  // Don't render anything if checking or no setup needed
  if (isChecking || !needsSetup) {
    return null;
  }

  // Show success message
  if (success) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <div className="text-center">
            <div className="text-green-600 text-5xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Configuration Saved!
            </h2>
            <p className="text-gray-600">
              Reloading application with new settings...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show setup form
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 my-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          NOSTR Relay Setup Required
        </h2>
        <p className="text-gray-600 mb-6">
          Please provide a NOSTR relay URL to publish and receive events.
          This will be saved to your settings.json file.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 mb-6">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="relayUrl"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              NOSTR Relay URL
              <span className="text-red-600 ml-1">*</span>
            </label>
            <input
              type="text"
              id="relayUrl"
              value={relayUrl}
              onChange={(e) => setRelayUrl(e.target.value)}
              placeholder="wss://relay.damus.io"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
            />
            <p className="mt-1 text-sm text-gray-500">
              WebSocket URL of a NOSTR relay (e.g., wss://relay.damus.io, wss://nos.lol)
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Alternatively, you can manually add NOSTR relays to settings.json in the project root.
            Add a &quot;nostrRelays&quot; array with your relay URLs.
          </p>
        </div>
      </div>
    </div>
  );
}
