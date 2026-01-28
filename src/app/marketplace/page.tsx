'use client';

/**
 * Marketplace page - Browse all offers
 * Shows generic offers and allows filtering by tags
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredCredentials } from '@/lib/nostr';
import { useTokenBalance } from '@/hooks/useTokenBalance';
import { SendTokensDrawer } from '@/components/SendTokensDrawer';
import { Offer } from '@/types';

interface OfferWithAuthor extends Offer {
  authorUsername?: string;
}

export default function MarketplacePage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{ username: string; npub: string } | null>(null);
  const [offers, setOffers] = useState<OfferWithAuthor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);

  // Send tokens drawer state
  const [sendDrawerOpen, setSendDrawerOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<OfferWithAuthor | null>(null);

  // Get user's balance for sending tokens
  const { balance, refresh: refreshBalance } = useTokenBalance(credentials?.npub || null);

  useEffect(() => {
    const creds = getStoredCredentials();
    setCredentials(creds);
    loadOffers();
  }, []);

  const loadOffers = async () => {
    try {
      const response = await fetch('/api/offers?type=other');
      const data = await response.json();

      if (data.success) {
        setOffers(data.offers);
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load offers:', err);
      setIsLoading(false);
    }
  };

  const toggleExpand = (offerId: string) => {
    setExpandedOfferId(expandedOfferId === offerId ? null : offerId);
  };

  const handleSendTokens = (offer: OfferWithAuthor, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!credentials) {
      router.push('/badge');
      return;
    }
    setSelectedOffer(offer);
    setSendDrawerOpen(true);
  };

  const handleSendSuccess = (newBalance: number) => {
    refreshBalance();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading offers...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Call to Action */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg shadow-lg p-6 mb-6 text-white">
          <h2 className="text-xl font-bold mb-2">Have something to offer?</h2>
          <p className="text-sm opacity-90 mb-4">Share your skills, time, or resources with the community</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => router.push('/offers/create?type=other')}
              className="bg-white text-blue-600 font-semibold py-2 px-6 rounded-lg hover:bg-gray-100 transition text-sm"
            >
              🎁 Make an Offer
            </button>
            <button
              onClick={() => router.push('/offers/create?type=workshop')}
              className="bg-white bg-opacity-20 text-white font-semibold py-2 px-6 rounded-lg hover:bg-opacity-30 transition text-sm border border-white"
            >
              🎓 Propose a Workshop
            </button>
          </div>
        </div>

        {/* Offers List */}
        {offers.length === 0 ? (
          <div className="bg-gray-100 rounded-lg p-8 text-center">
            <p className="text-gray-600 mb-2">No offers yet</p>
            <p className="text-sm text-gray-500">Be the first to make an offer!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {offers.map((offer) => {
              const isExpanded = expandedOfferId === offer.id;
              const isOwnOffer = credentials && offer.authors.includes(credentials.npub);

              return (
                <div
                  key={offer.id}
                  onClick={() => toggleExpand(offer.id)}
                  className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition border-l-4 border-purple-500 cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{offer.title}</h3>
                      {offer.authorUsername && (
                        <p className="text-xs text-gray-500">
                          by <span className="font-medium text-purple-600">@{offer.authorUsername}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 ml-2">
                      <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                        {offer.type}
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

                  {offer.tags && offer.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {offer.tags.map((tag) => (
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
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      {/* Description */}
                      <p className="text-sm text-gray-600 mb-4">
                        {offer.description}
                      </p>

                      {/* Send tokens button - don't show for own offers */}
                      {!isOwnOffer && (
                        <button
                          onClick={(e) => handleSendTokens(offer, e)}
                          className="w-full bg-green-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Send tokens
                        </button>
                      )}

                      {isOwnOffer && (
                        <p className="text-sm text-gray-500 text-center italic">
                          This is your offer
                        </p>
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
          onClick={() => router.push('/offers/create?type=other')}
          className="fixed bottom-6 right-6 bg-blue-600 text-white w-14 h-14 rounded-full shadow-lg hover:bg-blue-700 transition flex items-center justify-center"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}

      {/* Send Tokens Drawer */}
      {selectedOffer && (
        <SendTokensDrawer
          isOpen={sendDrawerOpen}
          onClose={() => {
            setSendDrawerOpen(false);
            setSelectedOffer(null);
          }}
          recipientUsername={selectedOffer.authorUsername || 'Unknown'}
          recipient={selectedOffer.authors[0]}
          senderBalance={balance?.confirmed || 0}
          onSuccess={handleSendSuccess}
          defaultDescription={`Thank you for "${selectedOffer.title}"`}
        />
      )}
    </div>
  );
}
