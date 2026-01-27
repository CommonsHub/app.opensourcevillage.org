'use client';

/**
 * FloatingActionMenu Component - Floating action button with expandable menu
 * Shows options for: Offer, Workshop, Book a room
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface FloatingActionMenuProps {
  date?: string; // ISO date string for workshop pre-fill
}

export default function FloatingActionMenu({ date }: FloatingActionMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const workshopUrl = date
    ? `/offers/create?type=workshop&date=${date}`
    : '/offers/create?type=workshop';

  const menuItems = [
    {
      label: 'Offer',
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
    <div ref={menuRef} className="fixed bottom-6 right-6 z-50">
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
