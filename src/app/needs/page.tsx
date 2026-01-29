'use client';

/**
 * Needs page - Browse all needs
 * Shows requests from the community for help, resources, or services
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { getStoredCredentials } from '@/lib/nostr';
import { Offer } from '@/types';

interface NeedWithAuthor extends Offer {
  authorUsername?: string;
}

export default function NeedsPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{ username: string; npub: string } | null>(null);
  const [needs, setNeeds] = useState<NeedWithAuthor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedNeedId, setExpandedNeedId] = useState<string | null>(null);
  const [showQRFor, setShowQRFor] = useState<string | null>(null);

  useEffect(() => {
    const creds = getStoredCredentials();
    setCredentials(creds);
    loadNeeds();
  }, []);

  const loadNeeds = async () => {
    try {
      const response = await fetch('/api/offers?type=need');
      const data = await response.json();

      if (data.success) {
        setNeeds(data.offers);
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load needs:', err);
      setIsLoading(false);
    }
  };

  const toggleExpand = (needId: string) => {
    setExpandedNeedId(expandedNeedId === needId ? null : needId);
    setShowQRFor(null);
  };

  const handleRequestTokens = (need: NeedWithAuthor, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowQRFor(showQRFor === need.id ? null : need.id);
  };

  const getPaymentUrl = (need: NeedWithAuthor) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const description = encodeURIComponent(`Helping with: ${need.title}`);
    return `${baseUrl}/profile/${need.authorUsername}?eventId=${need.id}&description=${description}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading needs...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Needs</h1>
          <p className="text-gray-600 mt-1">
            Help fellow villagers by fulfilling their needs
          </p>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Call to Action */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-lg shadow-lg p-6 mb-6 text-white">
          <h2 className="text-xl font-bold mb-2">Need help with something?</h2>
          <p className="text-sm opacity-90 mb-4">
            Let the community know what you need - skills, resources, or time
          </p>
          <button
            onClick={() => router.push('/offers/create?type=need')}
            className="bg-white text-orange-600 font-semibold py-2 px-6 rounded-lg hover:bg-gray-100 transition text-sm"
          >
            Post a Need
          </button>
        </div>

        {/* Needs List */}
        {needs.length === 0 ? (
          <div className="bg-gray-100 rounded-lg p-8 text-center">
            <p className="text-gray-600 mb-2">No needs posted yet</p>
            <p className="text-sm text-gray-500">Be the first to ask for help!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {needs.map((need) => {
              const isExpanded = expandedNeedId === need.id;
              const isOwnNeed = credentials && need.authors.includes(credentials.npub);
              const showingQR = showQRFor === need.id;

              return (
                <div
                  key={need.id}
                  onClick={() => toggleExpand(need.id)}
                  className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition border-l-4 border-orange-500 cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{need.title}</h3>
                      {need.authorUsername && (
                        <p className="text-xs text-gray-500">
                          by <span className="font-medium text-orange-600">@{need.authorUsername}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 ml-2">
                      <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                        need
                      </span>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {need.tags && need.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {need.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      {/* Description */}
                      <p className="text-sm text-gray-600 mb-4">
                        {need.description}
                      </p>

                      {/* Request tokens button - only show for own needs */}
                      {isOwnNeed && (
                        <div className="space-y-4">
                          <button
                            onClick={(e) => handleRequestTokens(need, e)}
                            className="w-full bg-orange-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-orange-700 transition flex items-center justify-center gap-2"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                            </svg>
                            {showingQR ? 'Hide QR Code' : 'Request Tokens'}
                          </button>

                          {showingQR && (
                            <div className="flex flex-col items-center gap-4 py-4 bg-gray-50 rounded-lg">
                              <p className="text-sm text-gray-600 text-center px-4">
                                Have someone scan this to send you tokens for this need:
                              </p>
                              <div className="bg-white p-4 rounded-lg border border-gray-200">
                                <QRCodeSVG
                                  value={getPaymentUrl(need)}
                                  size={180}
                                  level="M"
                                  includeMargin={false}
                                />
                              </div>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await navigator.clipboard.writeText(getPaymentUrl(need));
                                  } catch (err) {
                                    console.error('Failed to copy:', err);
                                  }
                                }}
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                              >
                                Copy link
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* For non-owners, show a link to help */}
                      {!isOwnNeed && need.authorUsername && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const description = encodeURIComponent(`Helping with: ${need.title}`);
                            router.push(`/profile/${need.authorUsername}?eventId=${need.id}&description=${description}`);
                          }}
                          className="w-full bg-green-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Help with tokens
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Action Button */}
      {credentials && (
        <button
          onClick={() => router.push('/offers/create?type=need')}
          className="fixed bottom-6 right-6 bg-orange-600 text-white w-14 h-14 rounded-full shadow-lg hover:bg-orange-700 transition flex items-center justify-center"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
    </div>
  );
}
