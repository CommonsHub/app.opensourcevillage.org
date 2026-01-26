'use client';

/**
 * Onboarding Page
 *
 * Shows community values that new villagers must acknowledge.
 * Redirects to homepage (calendar) after completion.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getStoredCredentials } from '@/lib/nostr-client';

const COMMUNITY_VALUES = [
  {
    id: 'care',
    text: 'Take care of this space like this is your home, unless you are messy, then take care of this space like this is somebody else\'s home.',
  },
  {
    id: 'welcome',
    text: 'Actively welcome other people to the village. Engage in conversations. Make people feel at home.',
  },
  {
    id: 'contribute',
    text: 'Contribute! This space is alive when everybody contributes their piece. Propose a workshop, help clean the space, volunteer, send a pull request, the surface of contributions is wide!',
  },
  {
    id: 'report',
    text: 'Noticing misbehaviors, report it to one of the stewards.',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [checkedValues, setCheckedValues] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [displayName, setDisplayName] = useState<string>('');

  useEffect(() => {
    // Check if user is logged in
    const credentials = getStoredCredentials();
    if (!credentials) {
      // Not logged in, redirect to home
      router.push('/');
      return;
    }

    // Check if already completed onboarding
    const completed = localStorage.getItem('osv_onboarding_completed');
    if (completed === 'true') {
      router.push('/calendar');
      return;
    }

    // Get display name
    const name = localStorage.getItem('osv_displayName') || credentials.username;
    setDisplayName(name);
  }, [router]);

  const handleCheckboxChange = (id: string) => {
    const newChecked = new Set(checkedValues);
    if (newChecked.has(id)) {
      newChecked.delete(id);
    } else {
      newChecked.add(id);
    }
    setCheckedValues(newChecked);
  };

  const allChecked = checkedValues.size === COMMUNITY_VALUES.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!allChecked) return;

    setIsSubmitting(true);

    // Mark onboarding as completed
    localStorage.setItem('osv_onboarding_completed', 'true');
    localStorage.setItem('osv_onboarding_completed_at', new Date().toISOString());

    // Redirect to calendar (homepage)
    router.push('/calendar');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
          <div className="flex justify-center mb-6">
            <Image
              src="/opensourcevillage-logo-black-white.png"
              alt="Open Source Village"
              width={120}
              height={120}
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome to the Village{displayName ? `, ${displayName}` : ''}!
          </h1>

          <p className="text-gray-600 mb-6">
            Before you explore, please take a moment to acknowledge our community values.
            These help us maintain a welcoming and productive space for everyone.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4 mb-8">
              {COMMUNITY_VALUES.map((value) => (
                <label
                  key={value.id}
                  className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    checkedValues.has(value.id)
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checkedValues.has(value.id)}
                    onChange={() => handleCheckboxChange(value.id)}
                    className="mt-1 h-5 w-5 text-green-600 rounded border-gray-300 focus:ring-green-500"
                  />
                  <span className="text-gray-700">{value.text}</span>
                </label>
              ))}
            </div>

            <button
              type="submit"
              disabled={!allChecked || isSubmitting}
              className="w-full bg-green-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Entering the village...' : 'I understand, let me in!'}
            </button>

            {!allChecked && (
              <p className="text-sm text-gray-500 text-center mt-3">
                Please acknowledge all community values to continue
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
