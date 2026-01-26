'use client';

/**
 * Badge Setup Page
 *
 * Uses the Web NFC API to read NFC tags and set them up in the system.
 * This page is for administrators to initialize new badges before distribution.
 *
 * Note: Web NFC API is only available on Android Chrome.
 */

import { useState, useCallback, useEffect } from 'react';

interface NFCReadingEvent extends Event {
  serialNumber: string;
  message: {
    records: Array<{
      recordType: string;
      data: ArrayBuffer;
    }>;
  };
}

interface NDEFReader {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  write: (message: NDEFMessageInit, options?: { signal?: AbortSignal }) => Promise<void>;
  addEventListener: (type: string, callback: (event: NFCReadingEvent) => void) => void;
  removeEventListener: (type: string, callback: (event: NFCReadingEvent) => void) => void;
}

interface NDEFMessageInit {
  records: NDEFRecordInit[];
}

interface NDEFRecordInit {
  recordType: string;
  data?: string | BufferSource;
  mediaType?: string;
  id?: string;
  lang?: string;
  encoding?: string;
}

declare global {
  interface Window {
    NDEFReader?: new () => NDEFReader;
  }
}

interface SetupResult {
  serialNumber: string;
  success: boolean;
  alreadyExists?: boolean;
  nfcWritten?: boolean;
  nfcWriteError?: string;
  error?: string;
  timestamp: string;
}

export default function SetupPage() {
  const [isScanning, setIsScanning] = useState(false);
  const [nfcSupported, setNfcSupported] = useState<boolean | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [setupResults, setSetupResults] = useState<SetupResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Check NFC support on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setNfcSupported('NDEFReader' in window);
    }
  }, []);

  // Get the base URL for NFC tags
  const getBaseUrl = useCallback(() => {
    if (typeof window !== 'undefined') {
      return `${window.location.protocol}//${window.location.host}`;
    }
    return 'https://app.opensourcevillage.org';
  }, []);

  // Write URL to NFC tag
  const writeToNfc = useCallback(async (serialNumber: string): Promise<{ success: boolean; error?: string }> => {
    if (!window.NDEFReader) {
      return { success: false, error: 'NFC not supported' };
    }

    try {
      const ndef = new window.NDEFReader();
      const url = `${getBaseUrl()}/badge#${serialNumber}`;

      console.log('[NFC] Writing URL to tag:', url);

      await ndef.write({
        records: [
          {
            recordType: 'url',
            data: url,
          },
        ],
      });

      console.log('[NFC] URL written successfully');
      return { success: true };
    } catch (err) {
      console.error('[NFC] Write error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write to NFC tag',
      };
    }
  }, [getBaseUrl]);

  // Setup a badge via API and write to NFC
  const setupBadge = useCallback(async (serialNumber: string, writeNfc: boolean = false) => {
    try {
      const response = await fetch('/api/badge/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serialNumber }),
      });

      const data = await response.json();

      let nfcWritten = false;
      let nfcWriteError: string | undefined;

      // Write to NFC if requested and API call succeeded
      if (writeNfc && data.success) {
        const writeResult = await writeToNfc(serialNumber);
        nfcWritten = writeResult.success;
        nfcWriteError = writeResult.error;
      }

      const result: SetupResult = {
        serialNumber,
        success: data.success,
        alreadyExists: data.alreadyExists,
        nfcWritten,
        nfcWriteError,
        error: data.error,
        timestamp: new Date().toISOString(),
      };

      setSetupResults((prev) => [result, ...prev].slice(0, 50)); // Keep last 50
      setLastScanned(serialNumber);

      return result;
    } catch (err) {
      const result: SetupResult = {
        serialNumber,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };

      setSetupResults((prev) => [result, ...prev].slice(0, 50));
      return result;
    }
  }, [writeToNfc]);

  // Start NFC scanning
  const startScanning = useCallback(async () => {
    if (!window.NDEFReader) {
      setError('NFC is not supported on this device');
      return;
    }

    setError(null);
    setIsScanning(true);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const ndef = new window.NDEFReader();

      ndef.addEventListener('reading', async (event: NFCReadingEvent) => {
        const serialNumber = event.serialNumber;
        console.log('[NFC] Tag read:', serialNumber);

        if (serialNumber) {
          // Setup badge and write URL to NFC tag
          await setupBadge(serialNumber, true);
        }
      });

      await ndef.scan({ signal: controller.signal });
      console.log('[NFC] Scanning started');

    } catch (err) {
      console.error('[NFC] Scan error:', err);

      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('NFC permission denied. Please allow NFC access.');
        } else if (err.name === 'NotSupportedError') {
          setError('NFC is not supported on this device.');
        } else {
          setError(err.message);
        }
      }

      setIsScanning(false);
      setAbortController(null);
    }
  }, [setupBadge]);

  // Stop NFC scanning
  const stopScanning = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setIsScanning(false);
  }, [abortController]);

  // Manual setup (for testing without NFC)
  // Generate a random serial number for testing
  const generateRandomSerial = () => {
    const bytes = Array.from({ length: 7 }, () =>
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()
    );
    return bytes.join(':');
  };

  const [manualSerial, setManualSerial] = useState(() => generateRandomSerial());

  const handleManualSetup = async () => {
    if (!manualSerial.trim()) return;
    await setupBadge(manualSerial.trim());
    setManualSerial('');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Badge Setup</h1>
        <p className="text-gray-600 mb-6">
          Initialize NFC badges before distribution. Tap badges to register them in the system.
        </p>

        {/* NFC Support Status */}
        {nfcSupported === false && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800">
              <strong>NFC not supported.</strong> Web NFC is only available on Android Chrome.
              Use manual entry below for testing.
            </p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* NFC Scanning Controls */}
        {nfcSupported && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 text-black">NFC Scanner</h2>

            {!isScanning ? (
              <button
                onClick={startScanning}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Start Scanning
              </button>
            ) : (
              <div>
                <div className="flex items-center justify-center mb-4">
                  <div className="animate-pulse flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                    <span className="text-blue-600 font-medium">Scanning for NFC tags...</span>
                  </div>
                </div>
                <button
                  onClick={stopScanning}
                  className="w-full bg-gray-200 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                >
                  Stop Scanning
                </button>
              </div>
            )}

            {lastScanned && (
              <p className="mt-4 text-sm text-gray-600">
                Last scanned: <code className="bg-gray-100 px-2 py-1 rounded">{lastScanned}</code>
              </p>
            )}
          </div>
        )}

        {/* Manual Entry */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-black">Manual Entry</h2>
          <p className="text-sm text-gray-600 mb-4">
            Enter a serial number manually for testing or non-NFC badges.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={manualSerial}
              onChange={(e) => setManualSerial(e.target.value)}
              placeholder="e.g., 04:A3:B2:C1:D0:E9:F8"
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onKeyDown={(e) => e.key === 'Enter' && handleManualSetup()}
            />
            <button
              onClick={handleManualSetup}
              disabled={!manualSerial.trim()}
              className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Setup
            </button>
          </div>
        </div>

        {/* Results Log */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 text-black">
            Setup Log ({setupResults.length})
          </h2>

          {setupResults.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              No badges set up yet. Start scanning or enter a serial number.
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {setupResults.map((result, index) => (
                <div
                  key={`${result.serialNumber}-${result.timestamp}`}
                  className={`p-3 rounded-lg border ${
                    result.success
                      ? result.alreadyExists
                        ? 'bg-yellow-50 border-yellow-200'
                        : 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-sm font-mono text-black">{result.serialNumber}</code>
                    <div className="flex items-center gap-2">
                      {result.success && (
                        <a
                          href={`/badge#${result.serialNumber}`}
                          className="text-xs font-medium px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                        >
                          Claim
                        </a>
                      )}
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded ${
                          result.success
                            ? result.alreadyExists
                              ? 'bg-yellow-200 text-yellow-800'
                              : 'bg-green-200 text-green-800'
                            : 'bg-red-200 text-red-800'
                        }`}
                      >
                        {result.success
                          ? result.alreadyExists
                            ? 'Already Exists'
                            : 'Created'
                          : 'Failed'}
                      </span>
                      {result.success && result.nfcWritten !== undefined && (
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded ${
                            result.nfcWritten
                              ? 'bg-purple-200 text-purple-800'
                              : 'bg-orange-200 text-orange-800'
                          }`}
                        >
                          {result.nfcWritten ? 'NFC Written' : 'NFC Failed'}
                        </span>
                      )}
                    </div>
                  </div>
                  {result.error && (
                    <p className="text-red-600 text-sm mt-1">{result.error}</p>
                  )}
                  {result.nfcWriteError && (
                    <p className="text-orange-600 text-sm mt-1">NFC: {result.nfcWriteError}</p>
                  )}
                  <p className="text-gray-500 text-xs mt-1">
                    {new Date(result.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
