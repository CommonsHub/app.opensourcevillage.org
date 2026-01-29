"use client";

/**
 * Onboard page - Show QR code to onboard another villager
 * Directly displays the invite QR code for easy sharing
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { getStoredCredentials, getOrRequestInviteCode } from "@/lib/nostr";
import { getStoredSecretKey } from "@/lib/nostr-events";

export default function OnboardPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{
    username: string;
    npub: string;
  } | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [remainingInvites, setRemainingInvites] = useState(4);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    const creds = getStoredCredentials();
    if (!creds) {
      router.push("/badge");
      return;
    }
    setCredentials(creds);
    loadInviteCode(creds);
  }, [router]);

  const loadInviteCode = async (creds: { username: string; npub: string }) => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch profile to get invitees count
      const profileRes = await fetch(`/api/profile/${creds.username}`);
      const profileData = await profileRes.json();

      if (profileData.success && profileData.profile) {
        const invitees = profileData.profile.invitees || [];
        setRemainingInvites(4 - invitees.length);

        if (invitees.length >= 4) {
          setError("You have reached your onboarding limit (4 villagers)");
          setIsLoading(false);
          return;
        }
      }

      // Check for stored secret key
      const nsec = getStoredSecretKey();
      if (!nsec) {
        setNeedsAuth(true);
        setIsLoading(false);
        return;
      }

      // Request invite code
      const result = await getOrRequestInviteCode(nsec);

      if (result.success && result.inviteCode) {
        setInviteCode(result.inviteCode);
      } else {
        setError(result.error || "Failed to get invite code");
      }
    } catch (err) {
      console.error("Failed to load invite code:", err);
      setError("Failed to load invite code");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;

    try {
      await navigator.clipboard.writeText(inviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (!credentials) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <main className="max-w-md mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Onboard a Villager
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {remainingInvites > 0
              ? `You can onboard ${remainingInvites} more villager${remainingInvites > 1 ? "s" : ""}`
              : "You have reached your onboarding limit"}
          </p>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading invite code...</span>
            </div>
          )}

          {error && !isLoading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {needsAuth && !isLoading && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800 mb-3">
                To generate an invitation code, please scan your badge and enter
                your password.
              </p>
              <button
                onClick={() => router.push("/badge")}
                className="inline-flex items-center gap-2 text-sm font-medium text-amber-700 hover:text-amber-900"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                  />
                </svg>
                Scan my badge
              </button>
            </div>
          )}

          {inviteCode && !isLoading && (
            <div className="flex flex-col items-center gap-6">
              <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                <QRCodeSVG
                  value={inviteCode}
                  size={240}
                  level="M"
                  includeMargin={true}
                />
              </div>

              <p className="text-sm text-gray-600 text-center max-w-xs">
                Let the new villager scan this QR code with their phone to join
                the village
              </p>

              <button
                onClick={handleCopyCode}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300 transition"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                {codeCopied ? "Copied!" : "Copy invite code"}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
