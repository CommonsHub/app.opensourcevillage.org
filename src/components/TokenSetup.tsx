'use client';

/**
 * TokenSetup Component
 *
 * Shows when no token is configured, allowing users to either:
 * - Set an existing token address
 * - Deploy a new token with custom name and symbol
 */

import { useState } from 'react';

// Available chains for deployment
const CHAINS = [
  { value: 'gnosis', label: 'Gnosis', testnet: false },
  { value: 'gnosis_chiado', label: 'Gnosis Chiado (Testnet)', testnet: true },
  { value: 'base', label: 'Base', testnet: false },
  { value: 'base_sepolia', label: 'Base Sepolia (Testnet)', testnet: true },
];

interface TokenSetupProps {
  chain: string | null;
  onComplete: () => void;
}

export default function TokenSetup({ chain: initialChain, onComplete }: TokenSetupProps) {
  const [mode, setMode] = useState<'choose' | 'set' | 'deploy'>('choose');
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokenName, setTokenName] = useState('Open Source Village Token');
  const [tokenSymbol, setTokenSymbol] = useState('OSV');
  const [selectedChain, setSelectedChain] = useState(initialChain || 'gnosis_chiado');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSetToken = async () => {
    if (!tokenAddress || !tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
      setError('Invalid token address. Must be a valid 0x address.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/token/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenAddress }),
      });

      const data = await response.json();

      if (data.success) {
        onComplete();
      } else {
        setError(data.error || 'Failed to set token address');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeployToken = async () => {
    if (!tokenName.trim() || !tokenSymbol.trim()) {
      setError('Token name and symbol are required.');
      return;
    }

    if (tokenSymbol.length > 10) {
      setError('Token symbol should be 10 characters or less.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/wallet/deploy-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tokenName,
          symbol: tokenSymbol,
          chain: selectedChain,
        }),
      });

      const data = await response.json();

      if (data.success) {
        onComplete();
      } else {
        setError(data.error || 'Failed to deploy token');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Token Not Configured</h2>
          <p className="text-sm text-gray-600 mt-2">
            No token is set up for this app. Configure a token to enable balance tracking.
          </p>
          {mode === 'choose' && initialChain && (
            <div className="mt-3 inline-flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span className="text-sm font-medium text-gray-700">
                Current chain: {CHAINS.find(c => c.value === initialChain)?.label || initialChain}
              </span>
            </div>
          )}
        </div>

        {/* Mode Selection */}
        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('set')}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium py-3 px-4 rounded-xl transition text-left"
            >
              <div className="font-semibold">Set existing token address</div>
              <div className="text-sm text-gray-500">Use a token that&apos;s already deployed</div>
            </button>
            <button
              onClick={() => setMode('deploy')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition text-left"
            >
              <div className="font-semibold">Deploy a new token</div>
              <div className="text-sm text-blue-200">Create a fresh ERC-20 token</div>
            </button>
          </div>
        )}

        {/* Set Token Address */}
        {mode === 'set' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Token Address
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-mono text-sm"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setMode('choose');
                  setError('');
                }}
                className="px-4 py-2 text-gray-600 font-medium hover:text-gray-800 transition"
              >
                Back
              </button>
              <button
                onClick={handleSetToken}
                disabled={isLoading || !tokenAddress}
                className="flex-1 bg-blue-600 text-white font-semibold py-3 px-4 rounded-xl hover:bg-blue-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Saving...' : 'Set Token Address'}
              </button>
            </div>
          </div>
        )}

        {/* Deploy New Token */}
        {mode === 'deploy' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Blockchain
              </label>
              <select
                value={selectedChain}
                onChange={(e) => setSelectedChain(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              >
                {CHAINS.map((chain) => (
                  <option key={chain.value} value={chain.value}>
                    {chain.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {CHAINS.find(c => c.value === selectedChain)?.testnet
                  ? 'Testnet - Free to use for testing'
                  : 'Mainnet - Requires real tokens for gas'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Token Name
              </label>
              <input
                type="text"
                placeholder="My Community Token"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Token Symbol
              </label>
              <input
                type="text"
                placeholder="MCT"
                value={tokenSymbol}
                onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                maxLength={10}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 uppercase"
              />
              <p className="text-xs text-gray-500 mt-1">Max 10 characters</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setMode('choose');
                  setError('');
                }}
                className="px-4 py-2 text-gray-600 font-medium hover:text-gray-800 transition"
              >
                Back
              </button>
              <button
                onClick={handleDeployToken}
                disabled={isLoading || !tokenName.trim() || !tokenSymbol.trim()}
                className="flex-1 bg-green-600 text-white font-semibold py-3 px-4 rounded-xl hover:bg-green-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Deploying...' : 'Deploy Token'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
