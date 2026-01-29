'use client';

/**
 * Post page - Simple interface to post a message (kind 1 nostr note)
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredCredentials } from '@/lib/nostr';
import { useNostrPublisher } from '@/hooks/useNostrPublisher';

const MAX_LENGTH = 280;

export default function PostPage() {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [credentials, setCredentials] = useState<{ username: string; npub: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { publishNote, isPublishing } = useNostrPublisher();

  useEffect(() => {
    const creds = getStoredCredentials();
    if (!creds) {
      router.push('/badge');
      return;
    }
    setCredentials(creds);
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isPublishing) return;

    setError(null);

    try {
      const result = await publishNote({ content: content.trim() });

      if (result.success) {
        setSuccess(true);
        setContent('');
        // Redirect to home after a short delay
        setTimeout(() => {
          router.push('/');
        }, 1500);
      } else {
        setError(result.error || 'Failed to post message');
      }
    } catch (err) {
      console.error('Failed to post:', err);
      setError('Failed to post message');
    }
  };

  if (!credentials) {
    return null;
  }

  const remainingChars = MAX_LENGTH - content.length;
  const isOverLimit = remainingChars < 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <main className="max-w-lg mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-4">Post a message</h1>

          {success ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <svg className="w-12 h-12 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-green-800 font-medium">Message posted!</p>
              <p className="text-green-600 text-sm mt-1">Redirecting to home...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="What's happening in the village?"
                  className={`w-full h-32 p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isOverLimit ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'
                  }`}
                  maxLength={MAX_LENGTH + 50} // Allow some buffer for typing
                  autoFocus
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-gray-500">
                    Posting as @{credentials.username}
                  </p>
                  <p className={`text-sm ${isOverLimit ? 'text-red-500 font-medium' : remainingChars < 50 ? 'text-yellow-600' : 'text-gray-400'}`}>
                    {remainingChars}
                  </p>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!content.trim() || isPublishing || isOverLimit}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPublishing ? 'Posting...' : 'Post'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
