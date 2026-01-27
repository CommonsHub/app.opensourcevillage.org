'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNostrPublisher } from '@/hooks/useNostrPublisher';
import { getStoredCredentials } from '@/lib/nostr';

interface SendTokensDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  recipientUsername: string;
  recipient: string;
  senderBalance: number;
  onSuccess?: (newBalance: number) => void;
}

export function SendTokensDrawer({
  isOpen,
  onClose,
  recipientUsername,
  recipient,
  senderBalance,
  onSuccess,
}: SendTokensDrawerProps) {
  const [amount, setAmount] = useState(1);
  const [description, setDescription] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');
  const [animatingBalance, setAnimatingBalance] = useState<number | null>(null);

  const { publishPaymentRequest, isPublishing } = useNostrPublisher();

  // Reset state when drawer opens
  useEffect(() => {
    if (isOpen) {
      setAmount(1);
      setDescription('');
      setError('');
      setShowSuccess(false);
      setAnimatingBalance(null);
    }
  }, [isOpen]);

  const handleIncrement = useCallback(() => {
    setAmount((prev) => Math.min(prev + 1, senderBalance));
  }, [senderBalance]);

  const handleDecrement = useCallback(() => {
    setAmount((prev) => Math.max(prev - 1, 1));
  }, []);

  const handleAmountChange = useCallback((value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1 && num <= senderBalance) {
      setAmount(num);
    }
  }, [senderBalance]);

  const handleConfirm = async () => {
    if (amount < 1 || amount > senderBalance) {
      setError('Invalid amount');
      return;
    }

    const credentials = getStoredCredentials();
    if (!credentials?.npub) {
      setError('Please log in to send tokens');
      return;
    }

    setIsSending(true);
    setError('');

    try {
      const result = await publishPaymentRequest({
        recipient,
        sender: credentials.npub,
        amount,
        context: 'transfer',
        description: description || `Sent ${amount} tokens to @${recipientUsername}`,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to send tokens');
      }

      // Show success animation
      setShowSuccess(true);
      const newBalance = senderBalance - amount;
      setAnimatingBalance(newBalance);

      // Notify parent of success
      if (onSuccess) {
        onSuccess(newBalance);
      }

      // Close drawer after animation
      setTimeout(() => {
        onClose();
      }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send tokens');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black transition-opacity z-40 ${
          isOpen ? 'opacity-50' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="bg-white rounded-t-3xl shadow-2xl max-w-lg mx-auto">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
          </div>

          {showSuccess ? (
            /* Success State */
            <div className="px-6 pb-8 pt-4 text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center animate-bounce">
                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Sent!</h3>
              <p className="text-gray-600 mb-4">
                {amount} tokens sent to @{recipientUsername}
              </p>
              {animatingBalance !== null && (
                <div className="bg-blue-50 rounded-xl p-4 inline-block">
                  <p className="text-sm text-gray-600">Your new balance</p>
                  <p className="text-3xl font-bold text-blue-600 animate-pulse">
                    {animatingBalance} tokens
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Form State */
            <div className="px-6 pb-8 pt-2">
              {/* Header */}
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">Send Tokens</h2>
                <p className="text-gray-500 text-sm">to @{recipientUsername}</p>
              </div>

              {/* Current Balance */}
              <div className="bg-gray-50 rounded-xl p-4 mb-6 text-center">
                <p className="text-sm text-gray-500">Your balance</p>
                <p className="text-2xl font-bold text-gray-900">{senderBalance} tokens</p>
              </div>

              {/* Amount Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
                  Amount to send
                </label>
                <div className="flex items-center justify-center gap-4">
                  {/* Decrement Button */}
                  <button
                    type="button"
                    onClick={handleDecrement}
                    disabled={amount <= 1 || isSending}
                    className="w-16 h-16 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-3xl font-bold text-gray-700 transition-colors active:scale-95"
                  >
                    −
                  </button>

                  {/* Amount Display */}
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    min={1}
                    max={senderBalance}
                    disabled={isSending}
                    className="w-24 h-20 text-center text-4xl font-bold text-gray-900 border-2 border-gray-200 rounded-2xl focus:border-blue-500 focus:outline-none disabled:opacity-50"
                  />

                  {/* Increment Button */}
                  <button
                    type="button"
                    onClick={handleIncrement}
                    disabled={amount >= senderBalance || isSending}
                    className="w-16 h-16 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-3xl font-bold text-gray-700 transition-colors active:scale-95"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Description */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Note (optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this for?"
                  disabled={isSending}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none disabled:opacity-50"
                  maxLength={100}
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Confirm Button */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isSending || isPublishing || amount < 1 || amount > senderBalance}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-colors text-lg flex items-center justify-center gap-2"
              >
                {isSending || isPublishing ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending...
                  </>
                ) : (
                  <>
                    Send {amount} token{amount !== 1 ? 's' : ''}
                  </>
                )}
              </button>

              {/* Cancel Link */}
              <button
                type="button"
                onClick={onClose}
                disabled={isSending}
                className="w-full mt-3 text-gray-500 hover:text-gray-700 font-medium py-2 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default SendTokensDrawer;
