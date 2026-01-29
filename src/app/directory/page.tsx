'use client';

/**
 * Directory page - List of all villagers
 * Shows all profiles in the community
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/Avatar';

interface ProfileSummary {
  username: string;
  npub: string;
  name?: string;
  shortbio?: string;
  createdAt?: string;
}

export default function DirectoryPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const response = await fetch('/api/profiles');
        const data = await response.json();

        if (data.success) {
          setProfiles(data.profiles);
        } else {
          setError(data.error || 'Failed to load profiles');
        }
      } catch (err) {
        console.error('Failed to fetch profiles:', err);
        setError('Failed to connect to server');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfiles();
  }, []);

  // Filter profiles based on search query
  const filteredProfiles = profiles.filter((profile) => {
    const query = searchQuery.toLowerCase();
    return (
      profile.username.toLowerCase().includes(query) ||
      (profile.name?.toLowerCase().includes(query)) ||
      (profile.shortbio?.toLowerCase().includes(query))
    );
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Directory</h1>
          <p className="text-gray-600 mt-1">
            {profiles.length} villager{profiles.length !== 1 ? 's' : ''} in the community
          </p>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search villagers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading villagers...</span>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-medium">Error</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Profiles List */}
        {!isLoading && !error && (
          <>
            {filteredProfiles.length === 0 ? (
              <div className="bg-gray-100 rounded-lg p-8 text-center">
                <svg
                  className="w-12 h-12 text-gray-400 mx-auto mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <p className="text-gray-600">
                  {searchQuery
                    ? `No villagers found matching "${searchQuery}"`
                    : 'No villagers have joined yet'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredProfiles.map((profile) => (
                  <div
                    key={profile.npub}
                    onClick={() => router.push(`/profile/${profile.username}`)}
                    className="bg-white rounded-lg shadow-sm p-4 cursor-pointer hover:shadow-md transition flex items-center gap-4"
                  >
                    <Avatar name={profile.username} npub={profile.npub} size="md" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {profile.name || `@${profile.username}`}
                      </h3>
                      <p className="text-sm text-gray-600">@{profile.username}</p>
                      {profile.shortbio && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                          {profile.shortbio}
                        </p>
                      )}
                    </div>
                    <svg
                      className="w-5 h-5 text-gray-400 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
