'use client';

/**
 * FloatingActionMenu Component - Floating action button with expandable menu
 * Shows options for: Offer, Workshop, Book a room
 *
 * Shown globally when logged in, hidden on create/edit pages
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getStoredCredentials } from '@/lib/nostr';

interface FloatingActionMenuProps {
  date?: string; // ISO date string for workshop pre-fill
}

// Pages where the FAB should be hidden (create/edit forms)
const HIDDEN_PATHS = [
  '/offers/create',
  '/profile/edit',
  '/book',
  '/badge',
  '/claim',
  '/onboarding',
  '/onboard',
  '/post',
];

export default function FloatingActionMenu({ date }: FloatingActionMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Check login status on mount
  useEffect(() => {
    setMounted(true);
    const creds = getStoredCredentials();
    setIsLoggedIn(!!creds);
  }, []);

  // Listen for storage changes (login/logout)
  useEffect(() => {
    const handleStorageChange = () => {
      const creds = getStoredCredentials();
      setIsLoggedIn(!!creds);
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Don't render until mounted (to avoid hydration issues)
  if (!mounted) return null;

  // Don't show if not logged in
  if (!isLoggedIn) return null;

  // Hide on create/edit pages
  const shouldHide = HIDDEN_PATHS.some(p => pathname.startsWith(p)) || pathname.endsWith('/edit');
  if (shouldHide) return null;

  const workshopUrl = date
    ? `/offers/create?type=workshop&date=${date}`
    : '/offers/create?type=workshop';

  const menuItems = [
    {
      label: 'Post a message',
      description: 'Share with the village',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      ),
      onClick: () => {
        router.push('/post');
        setIsOpen(false);
      },
    },
    {
      label: 'Share an offer',
      description: 'Goods or services',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      onClick: () => {
        router.push('/offers/create?type=offer');
        setIsOpen(false);
      },
    },
    {
      label: 'Post a need',
      description: 'Ask for help',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      onClick: () => {
        router.push('/offers/create?type=need');
        setIsOpen(false);
      },
    },
    {
      label: 'Workshop',
      description: 'Share knowledge',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      onClick: () => {
        router.push(workshopUrl);
        setIsOpen(false);
      },
    },
    {
      label: 'Book a room',
      description: 'Reserve space',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      onClick: () => {
        router.push('/book');
        setIsOpen(false);
      },
    },
  ];

  return (
    <div ref={menuRef} className="fixed bottom-6 right-6 z-40">
      {/* Menu Items */}
      <div
        className={`absolute bottom-16 right-0 transition-all duration-200 ${
          isOpen
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-2 pointer-events-none'
        }`}
      >
        <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden min-w-[180px]">
          {menuItems.map((item, index) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition text-left ${
                index !== menuItems.length - 1 ? 'border-b border-gray-100' : ''
              }`}
            >
              <div className="text-blue-600">{item.icon}</div>
              <div>
                <div className="font-medium text-gray-900">{item.label}</div>
                <div className="text-xs text-gray-500">{item.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* FAB Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`bg-blue-600 text-white w-14 h-14 rounded-full shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center ${
          isOpen ? 'rotate-45' : ''
        }`}
        title={isOpen ? 'Close menu' : 'Create new'}
      >
        <svg
          className="w-6 h-6 transition-transform"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
      </button>
    </div>
  );
}
