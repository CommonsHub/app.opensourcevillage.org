'use client';

/**
 * Profile edit page
 * Allows user to edit their profile information
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredCredentials, deriveNostrKeypair, getSerialNumberFromURL } from '@/lib/nostr-client';
import { getStoredSecretKey, decodeNsec, createProfileEvent, storeSecretKey } from '@/lib/nostr-events';
import { publishEvent } from '@/lib/nostr-relay';

interface SocialLink {
  type: string;
  url: string;
}

export default function ProfileEditPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{ username: string; npub: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [reenterPassword, setReenterPassword] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [shortbio, setShortbio] = useState('');
  const [talkAbout, setTalkAbout] = useState('');
  const [helpWith, setHelpWith] = useState('');
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [newLinkUrl, setNewLinkUrl] = useState('');

  useEffect(() => {
    const creds = getStoredCredentials();
    if (!creds) {
      router.push('/badge');
      return;
    }

    setCredentials(creds);
    loadProfile(creds.username);

    // Check if secret key exists
    const nsec = getStoredSecretKey();
    if (!nsec) {
      console.log('[Profile Edit] No secret key found - will prompt for password');
    }
  }, [router]);

  const loadProfile = async (username: string) => {
    try {
      const response = await fetch(`/api/profile/${username}`);
      const data = await response.json();

      if (data.success && data.profile) {
        const { profile } = data.profile;
        setName(profile.name || '');
        setShortbio(profile.shortbio || '');
        setTalkAbout(profile.talkAbout || '');
        setHelpWith(profile.helpWith || '');
        setLinks(profile.links || []);
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load profile:', err);
      setError('Failed to load profile');
      setIsLoading(false);
    }
  };

  const detectLinkType = (url: string): string => {
    if (url.includes('github.com')) return 'github';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'x';
    if (url.includes('bsky.app') || url.includes('bluesky.')) return 'bluesky';
    return 'website';
  };

  const addLink = () => {
    if (!newLinkUrl.trim()) return;

    const type = detectLinkType(newLinkUrl);
    setLinks([...links, { type, url: newLinkUrl }]);
    setNewLinkUrl('');
  };

  const removeLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const handleRestoreSecretKey = async () => {
    if (!reenterPassword || !credentials) {
      setError('Please enter your password');
      return;
    }

    try {
      // Get serial number from URL fragment
      const serialNumber = getSerialNumberFromURL();
      if (!serialNumber) {
        setError('Serial number not found. To restore your secret key, visit your badge claim page at /badge#YOUR_SERIAL and re-enter your password there.');
        return;
      }

      console.log('[Profile Edit] Re-deriving secret key from password...');
      const { nsec, npub } = await deriveNostrKeypair(serialNumber, reenterPassword);

      // Verify the npub matches
      if (npub !== credentials.npub) {
        setError('Incorrect password. The derived key does not match your profile.');
        return;
      }

      // Store the secret key
      storeSecretKey(nsec);
      console.log('[Profile Edit] ✓ Secret key restored and stored');

      setShowPasswordPrompt(false);
      setReenterPassword('');
      setError('');

      // Now submit the form
      setTimeout(() => {
        const form = document.querySelector('form');
        if (form) {
          form.requestSubmit();
        }
      }, 100);
    } catch (err) {
      console.error('[Profile Edit] Failed to restore secret key:', err);
      setError('Failed to restore secret key. Please check your password.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!credentials) return;

    // Check if secret key exists first
    const nsec = getStoredSecretKey();
    if (!nsec) {
      console.log('[Profile Edit] No secret key found - prompting for password');
      setShowPasswordPrompt(true);
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess(false);

    try {
      const updates = {
        name: name.trim() || undefined,
        shortbio: shortbio.trim() || undefined,
        talkAbout: talkAbout.trim() || undefined,
        helpWith: helpWith.trim() || undefined,
        links: links.length > 0 ? links : undefined,
      };

      // Create and publish NOSTR profile event
      let nostrEvent = null;
      try {
        console.log('[Profile Edit] Creating NOSTR profile event...');

        const secretKey = decodeNsec(nsec);

        // Build NOSTR profile content (NIP-01 format)
        const profileContent: any = {};
        if (name.trim()) profileContent.name = name.trim();
        if (shortbio.trim()) profileContent.about = shortbio.trim();

        // Add picture if available (from avatar)
        // TODO: Add picture URL when avatar upload is implemented

        // Create and sign the event
        nostrEvent = createProfileEvent(secretKey, profileContent);
        console.log('[Profile Edit] NOSTR event created:', nostrEvent.id);

        // Publish to NOSTR relays directly
        console.log('[Profile Edit] Publishing event to NOSTR relays...');
        const publishResult = await publishEvent(nostrEvent);

        console.log('[Profile Edit] ✓ Published to', publishResult.successful.length, 'relays');
        if (publishResult.failed.length > 0) {
          console.warn('[Profile Edit] Failed to publish to some relays:', publishResult.failed);
        }
      } catch (eventError) {
        console.error('[Profile Edit] Failed to create/publish NOSTR event:', eventError);
        // Continue without NOSTR event - profile update will still work
      }

      const response = await fetch(`/api/profile/${credentials.username}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updates,
          npub: credentials.npub,
          nostrEvent, // Include the signed NOSTR event
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to update profile');
        setIsSaving(false);
        return;
      }

      console.log('[Profile Edit] ✓ Profile updated successfully');
      setSuccess(true);
      setIsSaving(false);

      // Redirect to public profile after 1 second
      setTimeout(() => {
        router.push(`/profile/${credentials.username}`);
      }, 1000);
    } catch (err) {
      console.error('[Profile Edit] Failed to update profile:', err);
      setError('Failed to update profile');
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Profile Edit Form */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alice Smith"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
            />
          </div>

          {/* Short Bio */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <label htmlFor="shortbio" className="block text-sm font-medium text-gray-700 mb-1">
              Short Bio
            </label>
            <textarea
              id="shortbio"
              value={shortbio}
              onChange={(e) => setShortbio(e.target.value)}
              placeholder="Building open source tools for decentralized communities"
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
            />
          </div>

          {/* Talk About */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <label htmlFor="talkAbout" className="block text-sm font-medium text-gray-700 mb-1">
              I&apos;d love to talk about:
            </label>
            <textarea
              id="talkAbout"
              value={talkAbout}
              onChange={(e) => setTalkAbout(e.target.value)}
              placeholder="Decentralized protocols, community building, and how we can create more sustainable open source projects..."
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
            />
          </div>

          {/* Help With */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <label htmlFor="helpWith" className="block text-sm font-medium text-gray-700 mb-1">
              I could use help with:
            </label>
            <textarea
              id="helpWith"
              value={helpWith}
              onChange={(e) => setHelpWith(e.target.value)}
              placeholder="Frontend development, UX design, and marketing strategies for developer tools..."
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
            />
          </div>

          {/* Social Links */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Social Links</h3>

            {/* Existing Links */}
            {links.length > 0 && (
              <div className="space-y-2 mb-3">
                {links.map((link, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={link.url}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900"
                    />
                    <button
                      type="button"
                      onClick={() => removeLink(index)}
                      className="text-red-600 hover:text-red-700 px-3 py-2"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Link */}
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://github.com/username"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
              />
              <button
                type="button"
                onClick={addLink}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition"
              >
                + Add
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              We automatically detect GitHub, Twitter, Bluesky, and other links
            </p>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800">Profile updated successfully!</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </main>

      {/* Password Prompt Modal */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Re-enter Your Password
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              To publish NOSTR events, we need to restore your secret key. Please re-enter your password or PIN.
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="reenter-password" className="block text-sm font-medium text-gray-700 mb-1">
                Password or PIN
              </label>
              <input
                type="password"
                id="reenter-password"
                value={reenterPassword}
                onChange={(e) => setReenterPassword(e.target.value)}
                placeholder="Enter your password or PIN"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRestoreSecretKey();
                  }
                }}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowPasswordPrompt(false);
                  setReenterPassword('');
                  setError('');
                }}
                className="flex-1 bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRestoreSecretKey}
                className="flex-1 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition"
              >
                Restore Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
