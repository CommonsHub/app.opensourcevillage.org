'use client';

/**
 * Workshop/Offer edit page
 * Uses the shared OfferForm component in edit mode
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getStoredCredentials } from '@/lib/nostr-client';
import OfferForm from '@/components/OfferForm';
import { Offer } from '@/types';

export default function OfferEditPage() {
  const params = useParams();
  const router = useRouter();
  const offerId = params.id as string;

  const [credentials, setCredentials] = useState<{ username: string; npub: string } | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const creds = getStoredCredentials();
    if (!creds) {
      router.push('/badge');
      return;
    }
    setCredentials(creds);
    loadOffer(creds);
  }, [offerId, router]);

  const loadOffer = async (creds: { username: string; npub: string }) => {
    try {
      const response = await fetch(`/api/offers`);
      const data = await response.json();

      if (data.success) {
        const foundOffer = data.offers.find((o: Offer) => o.id === offerId);
        if (foundOffer) {
          // Check if user is the author
          if (!foundOffer.authors.includes(creds.npub)) {
            setError('You can only edit offers you created');
            setIsLoading(false);
            return;
          }
          setOffer(foundOffer);
        } else {
          setError('Offer not found');
        }
      } else {
        setError('Failed to load offer');
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load offer:', err);
      setError('Failed to load offer details');
      setIsLoading(false);
    }
  };

  const handleSuccess = (updatedOffer: Offer) => {
    // Redirect to calendar (for workshops) or marketplace (for others)
    if (updatedOffer.type === 'workshop' || updatedOffer.type === '1:1') {
      router.push('/calendar');
    } else {
      router.push('/marketplace');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Error</h1>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.back()}
            className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 transition"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!offer || !credentials) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <main className="max-w-2xl mx-auto px-4 py-6">
        <OfferForm
          mode="edit"
          initialData={offer}
          credentials={credentials}
          onSuccess={handleSuccess}
        />
      </main>
    </div>
  );
}
