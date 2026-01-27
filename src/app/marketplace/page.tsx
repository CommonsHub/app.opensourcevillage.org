'use client';

/**
 * Marketplace page - Browse all offers
 * Shows generic offers and allows filtering by tags
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredCredentials } from '@/lib/nostr';
import { Offer } from '@/types';

const SUGGESTED_TAGS = [
  'web3', 'ai', '1:1', 'mentorship', 'design',
  'networking', 'open-source', 'security', 'talk', 'workshop'
];

export default function MarketplacePage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{ username: string; npub: string } | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [filteredOffers, setFilteredOffers] = useState<Offer[]>([]);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const creds = getStoredCredentials();
    setCredentials(creds);
    loadOffers();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [offers, activeTags]);

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

  const applyFilters = () => {
    if (activeTags.size === 0) {
      setFilteredOffers(offers);
      return;
    }

    const filtered = offers.filter((offer) => {
      return offer.tags.some((tag) => activeTags.has(tag));
    });

    setFilteredOffers(filtered);
  };

  const toggleTag = (tag: string) => {
    const newTags = new Set(activeTags);
    if (newTags.has(tag)) {
      newTags.delete(tag);
    } else {
      newTags.add(tag);
    }
    setActiveTags(newTags);
  };

  const clearFilters = () => {
    setActiveTags(new Set());
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
      {/* Top App Bar */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              className="text-gray-600 hover:text-gray-900"
              onClick={() => router.push('/')}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="font-semibold text-gray-900">Marketplace</h1>
          </div>

          {credentials && (
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-semibold text-gray-900">47</p>
                <p className="text-xs text-gray-500 -mt-0.5">tokens</p>
              </div>
              <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white text-sm font-bold">
                {credentials.username.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 sticky top-14 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <p className="text-xs font-medium text-gray-600 mb-2">Filter by topics:</p>
          <div className="flex flex-wrap gap-2 mb-2">
            {SUGGESTED_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition ${
                  activeTags.has(tag)
                    ? 'bg-blue-100 text-blue-800 border-blue-500'
                    : 'bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200'
                }`}
              >
                {tag} {activeTags.has(tag) && '✓'}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {activeTags.size} topic{activeTags.size !== 1 ? 's' : ''} selected
            </p>
            {activeTags.size > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

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
        {filteredOffers.length === 0 ? (
          <div className="bg-gray-100 rounded-lg p-8 text-center">
            <p className="text-gray-600 mb-2">
              {activeTags.size > 0 ? 'No offers match your filters' : 'No offers yet'}
            </p>
            <p className="text-sm text-gray-500">
              {activeTags.size > 0
                ? 'Try selecting different topics or clear filters'
                : 'Be the first to make an offer!'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOffers.map((offer) => (
              <a
                key={offer.id}
                href={`/offers/${offer.id}`}
                className="block bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition border-l-4 border-purple-500"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">{offer.title}</h3>
                    <p className="text-sm text-gray-600 line-clamp-2">{offer.description}</p>
                  </div>
                  <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded ml-2">
                    {offer.type}
                  </span>
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
              </a>
            ))}
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
    </div>
  );
}
