'use client';

/**
 * Claim page - Stepper onboarding flow for new users
 * Accessed via URL fragment: /claim#{serialNumber}
 *
 * Steps:
 * 1. How should we call you? (display name)
 * 2. How can people mention you? @username
 * 3. Pick a password (or PIN) - shows debug info on localhost
 * 4. Paste invitation code from a buddy
 * 5. Redirect to /onboarding for community values
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  deriveNostrKeypair,
  storeCredentials,
  getStoredCredentials,
  getSerialNumberFromURL,
} from '@/lib/nostr-client';
import { storeSecretKey } from '@/lib/nostr-events';
import { redeemInviteCode } from '@/lib/nostr-relay-client';

type Step = 'loading' | 1 | 2 | 3 | 4;

export default function ClaimPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('loading');
  const [serialNumber, setSerialNumber] = useState<string | null>(null);
  const [isFirstUser, setIsFirstUser] = useState(false);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [password, setPassword] = useState('');
  const [usePinMode, setUsePinMode] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  // Validation state
  const [usernameError, setUsernameError] = useState('');
  const [usernameValid, setUsernameValid] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);

  // General state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Keypair state (created in step 3)
  const [keypair, setKeypair] = useState<{
    npub: string;
    nsec: string;
    secretKey: Uint8Array;
  } | null>(null);

  // Check environment and serial number on mount
  useEffect(() => {
    const init = async () => {
      // Check for existing credentials
      const credentials = getStoredCredentials();
      if (credentials) {
        router.replace(`/profile/${credentials.username}`);
        return;
      }

      // Check if any profiles exist (for first user flow)
      try {
        const response = await fetch('/api/profiles/exists');
        const data = await response.json();
        setIsFirstUser(!data.exists);
      } catch {
        // Default to requiring invite code if check fails
        setIsFirstUser(false);
      }

      // Get serial number from URL
      const serial = getSerialNumberFromURL();
      setSerialNumber(serial);

      if (!serial) {
        setError('No badge serial number found. Please scan your NFC badge.');
      }
      setStep(1);
    };

    init();
  }, [router]);

  // Auto-generate username from display name
  useEffect(() => {
    if (!usernameEdited && displayName) {
      const generated = displayName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 20);
      setUsername(generated);
    }
  }, [displayName, usernameEdited]);

  // Validate username format and availability
  useEffect(() => {
    if (!username) {
      setUsernameError('');
      setUsernameValid(false);
      return;
    }

    const regex = /^[a-zA-Z0-9_-]{3,20}$/;
    if (!regex.test(username)) {
      setUsernameError('3-20 characters, letters, numbers, - and _ only');
      setUsernameValid(false);
      return;
    }

    setUsernameChecking(true);
    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(`/api/username?username=${encodeURIComponent(username)}`);
        const data = await response.json();

        if (!data.available) {
          setUsernameError(data.message || 'Already taken');
          setUsernameValid(false);
        } else {
          setUsernameError('');
          setUsernameValid(true);
        }
      } catch {
        setUsernameError('Could not check availability');
        setUsernameValid(false);
      } finally {
        setUsernameChecking(false);
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [username]);

  // Step validation
  const canProceedStep1 = displayName.trim().length >= 2;
  const canProceedStep2 = usernameValid && !usernameChecking;
  const canProceedStep3 = usePinMode ? password.length >= 4 : password.length >= 1;
  const canProceedStep4 = /^[0-9a-f]{192}$/i.test(inviteCode.trim());

  // Create keypair when password is entered (step 3)
  const handleCreateKeypair = async () => {
    if (!serialNumber || !canProceedStep3) return;

    setIsLoading(true);
    setError('');

    try {
      const derived = await deriveNostrKeypair(serialNumber, password);
      setKeypair(derived);
    } catch (err) {
      setError('Failed to create identity. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Re-create keypair when password changes
  useEffect(() => {
    if (step === 3 && canProceedStep3 && serialNumber) {
      const timeoutId = setTimeout(handleCreateKeypair, 300);
      return () => clearTimeout(timeoutId);
    } else if (step === 3) {
      setKeypair(null);
    }
  }, [password, step, serialNumber, canProceedStep3]);

  const handleNextStep = async () => {
    if (step === 3) {
      if (!keypair) {
        setError('Please enter a password first');
        return;
      }
      // Save credentials locally so DebugInfo can show them
      storeCredentials(username, keypair.npub);
      storeSecretKey(keypair.nsec);

      if (isFirstUser) {
        // First user - skip invite code step and claim directly
        await handleClaimBadge();
      } else {
        // Regular user - go to invite code step
        setStep(4);
      }
    } else if (step === 4) {
      await handleJoinVillage();
    } else if (typeof step === 'number') {
      setStep((step + 1) as Step);
    }
  };

  const handlePrevStep = () => {
    if (typeof step === 'number' && step > 1) {
      setStep((step - 1) as Step);
      setError('');
    }
  };

  // First user claiming badge without invite code
  const handleClaimBadge = async () => {
    if (!keypair || !serialNumber) {
      setError('Session expired. Please refresh and try again.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Create profile on the server (no invite code needed for first user)
      const response = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          displayName,
          serialNumber,
          npub: keypair.npub,
          // No inviteCode for first user
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to create profile');
        setIsLoading(false);
        return;
      }

      // Store credentials locally
      storeCredentials(username, keypair.npub);
      storeSecretKey(keypair.nsec);
      localStorage.setItem('osv_displayName', displayName);

      // Redirect to onboarding
      router.push('/onboarding');

    } catch (err) {
      console.error('Claim error:', err);
      setError('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  };

  // Regular user joining with invite code
  const handleJoinVillage = async () => {
    if (!keypair || !serialNumber) {
      setError('Session expired. Please refresh and try again.');
      return;
    }

    const cleanCode = inviteCode.trim();
    setIsLoading(true);
    setError('');

    try {
      // 1. Redeem invite code directly with the relay (kind 28934)
      const redeemResult = await redeemInviteCode(cleanCode, keypair.secretKey);

      if (!redeemResult.success) {
        // "already a member" is OK - they can still create their profile
        const isAlreadyMember = redeemResult.error?.toLowerCase().includes('already a member');
        if (!isAlreadyMember) {
          setError(redeemResult.error || 'Failed to redeem invitation code');
          setIsLoading(false);
          return;
        }
        console.log('[Claim] User is already a member of the relay, continuing...');
      }

      // 2. Create profile on the server
      const response = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          displayName,
          serialNumber,
          npub: keypair.npub,
          inviteCode: cleanCode,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to create profile');
        setIsLoading(false);
        return;
      }

      // 3. Store credentials locally
      storeCredentials(username, keypair.npub);
      storeSecretKey(keypair.nsec);
      localStorage.setItem('osv_displayName', displayName);

      // 4. Redirect to onboarding
      router.push('/onboarding');

    } catch (err) {
      console.error('Join error:', err);
      setError('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  };

  // Loading state
  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  // No serial number error
  if (!serialNumber) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-5xl mb-4">🏷️</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">No Badge Detected</h1>
          <p className="text-gray-600 mb-6">Please scan your NFC badge to continue.</p>
          <button
            onClick={() => router.push('/')}
            className="text-blue-600 font-medium hover:text-blue-700"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="max-w-md w-full">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(isFirstUser ? [1, 2, 3] : [1, 2, 3, 4]).map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all ${
                s === step
                  ? 'w-8 bg-blue-600'
                  : s < (step as number)
                  ? 'w-2 bg-blue-400'
                  : 'w-2 bg-gray-300'
              }`}
            />
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Step 1: Display Name */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-4xl mb-3">👋</div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Welcome to the Village
                </h1>
                <p className="text-gray-500 mt-2">
                  How should we call you around here?
                </p>
              </div>

              <input
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400 text-center"
                autoFocus
              />

              <button
                onClick={handleNextStep}
                disabled={!canProceedStep1}
                className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-xl hover:bg-blue-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Username */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900">
                  Nice to meet you, {displayName}!
                </h1>
                <p className="text-gray-500 mt-2">
                  How can people mention you?
                </p>
              </div>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">@</span>
                <input
                  type="text"
                  placeholder="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value.toLowerCase());
                    setUsernameEdited(true);
                  }}
                  className="w-full pl-10 pr-4 py-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                  autoFocus
                />
              </div>

              <div className="h-5 text-sm">
                {usernameChecking && (
                  <p className="text-gray-500">Checking...</p>
                )}
                {!usernameChecking && usernameValid && (
                  <p className="text-green-600">✓ @{username} is available</p>
                )}
                {!usernameChecking && usernameError && (
                  <p className="text-red-500">{usernameError}</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handlePrevStep}
                  className="px-6 py-3 text-gray-600 font-medium hover:text-gray-800 transition"
                >
                  Back
                </button>
                <button
                  onClick={handleNextStep}
                  disabled={!canProceedStep2}
                  className="flex-1 bg-blue-600 text-white font-semibold py-3 px-4 rounded-xl hover:bg-blue-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Password/PIN with Debug Info */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-4xl mb-3">🔐</div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Secure your identity
                </h1>
                <p className="text-gray-500 mt-2">
                  {usePinMode ? 'Pick a PIN code (4-8 digits)' : 'Pick a password'}
                </p>
              </div>

              {!usePinMode ? (
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                  autoFocus
                />
              ) : (
                <input
                  type="number"
                  placeholder="PIN code"
                  value={password}
                  onChange={(e) => setPassword(e.target.value.slice(0, 8))}
                  className="w-full px-4 py-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400 text-center tracking-widest"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoFocus
                />
              )}

              <button
                type="button"
                onClick={() => {
                  setUsePinMode(!usePinMode);
                  setPassword('');
                }}
                className="w-full text-sm text-blue-600 hover:text-blue-700"
              >
                {usePinMode ? 'Use a password instead' : 'Use a simple PIN code instead'}
              </button>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handlePrevStep}
                  className="px-6 py-3 text-gray-600 font-medium hover:text-gray-800 transition"
                >
                  Back
                </button>
                <button
                  onClick={handleNextStep}
                  disabled={!keypair || isLoading}
                  className={`flex-1 font-semibold py-3 px-4 rounded-xl transition disabled:bg-gray-300 disabled:cursor-not-allowed ${
                    isFirstUser
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isLoading
                    ? isFirstUser
                      ? 'Claiming...'
                      : 'Creating...'
                    : isFirstUser
                    ? 'Claim Badge'
                    : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Invitation Code (only for non-first users) */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-4xl mb-3">🤝</div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Find a buddy
                </h1>
                <p className="text-gray-500 mt-2">
                  Ask a villager for their invitation code
                </p>
              </div>

              <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
                <p>
                  Go find someone in the village and ask them to share their invitation code with you.
                  They&apos;ll find it on their profile page.
                </p>
                <p className="mt-2 text-xs text-blue-600">
                  Note: Each villager can only invite up to 4 people.
                </p>
              </div>

              <div>
                <textarea
                  placeholder="Paste the invitation code here..."
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400 font-mono text-sm resize-none"
                  rows={3}
                />
                {/* TODO: Add camera activation component for QR scanning */}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handlePrevStep}
                  className="px-6 py-3 text-gray-600 font-medium hover:text-gray-800 transition"
                >
                  Back
                </button>
                <button
                  onClick={handleNextStep}
                  disabled={!canProceedStep4 || isLoading}
                  className="flex-1 bg-green-600 text-white font-semibold py-3 px-4 rounded-xl hover:bg-green-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Joining...' : 'Join the Village'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
