'use client';

/**
 * Wallet Setup Component
 *
 * Checks wallet balance on startup. If insufficient, displays
 * the wallet address and instructions to top up.
 * Uses voltaire.tevm.sh for local chain balance viewing.
 */

import { useEffect, useState } from 'react';

interface WalletInfo {
  address: string;
  balance: string;
  balanceFormatted: string;
  chain: string;
  chainName: string;
  nativeCurrency: string;
  explorerUrl: string;
  hasEnoughBalance: boolean;
  minBalance: string;
}

interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  chain: string;
  deployed: boolean;
}

export default function WalletSetup() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState<string>('');
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    checkWalletStatus();

    // Poll for balance updates every 5 seconds when balance is low
    const interval = setInterval(() => {
      if (wallet && !wallet.hasEnoughBalance) {
        checkWalletStatus();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [wallet?.hasEnoughBalance]);

  const checkWalletStatus = async () => {
    try {
      const response = await fetch('/api/wallet/status');
      const data = await response.json();

      if (data.success) {
        setWallet(data.wallet);
        setToken(data.token);
      } else {
        setError(data.error || 'Failed to check wallet status');
      }
    } catch (err) {
      console.error('[WalletSetup] Error:', err);
      // Don't show error for network issues - wallet features are optional
    } finally {
      setIsChecking(false);
    }
  };

  const copyAddress = () => {
    if (wallet?.address) {
      navigator.clipboard.writeText(wallet.address);
    }
  };

  const formatBalance = (balance: string) => {
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.0001) return '< 0.0001';
    return num.toFixed(4);
  };

  // Don't render if checking, no wallet, or wallet has enough balance
  if (isChecking || !wallet || wallet.hasEnoughBalance) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Wallet Balance Low
            </h2>
            <p className="text-sm text-gray-600">
              The deployer wallet needs funds to deploy contracts and execute transactions.
            </p>
          </div>
        </div>

        {/* Wallet Address */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Wallet Address</span>
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
              {wallet.chainName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-white border border-gray-200 rounded px-3 py-2 font-mono text-gray-900 truncate">
              {wallet.address}
            </code>
            <button
              onClick={copyAddress}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition"
              title="Copy address"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Balance */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-red-50 rounded-lg p-3">
            <p className="text-xs text-red-600 font-medium mb-1">Current Balance</p>
            <p className="text-lg font-bold text-red-700">
              {formatBalance(wallet.balanceFormatted)} {wallet.nativeCurrency}
            </p>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-xs text-green-600 font-medium mb-1">Minimum Required</p>
            <p className="text-lg font-bold text-green-700">
              0.001 {wallet.nativeCurrency}
            </p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-blue-900 mb-2">
            <strong>To continue:</strong>
          </p>
          <ol className="text-sm text-blue-800 list-decimal list-inside space-y-1">
            <li>Copy the wallet address above</li>
            <li>Send at least 0.001 {wallet.nativeCurrency} to this address</li>
            <li>This page will automatically update when funds arrive</li>
          </ol>
        </div>

        {/* View on Explorer */}
        <a
          href={wallet.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 transition"
        >
          <span>View on Block Explorer</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>

        {/* Debug toggle */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="mt-4 text-xs text-gray-500 hover:text-gray-700"
        >
          {showDetails ? 'Hide' : 'Show'} technical details
        </button>

        {showDetails && (
          <div className="mt-2 text-xs text-gray-500 font-mono bg-gray-50 rounded p-2">
            <p>Chain: {wallet.chain}</p>
            <p>Chain ID: {wallet.chainName}</p>
            <p>Balance (wei): {wallet.balance}</p>
            {token && (
              <>
                <p className="mt-2 border-t pt-2">Token: {token.name} ({token.symbol})</p>
                <p>Token Address: {token.address}</p>
              </>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}
