'use client';

/**
 * PWA Install Prompt Component
 * Shows a banner prompting users to install the app
 */

import { useState, useEffect } from 'react';
import { showInstallPrompt, isPWAInstalled } from '@/lib/pwa';

export default function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (isPWAInstalled()) {
      return;
    }

    // Check if user has dismissed the prompt
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
      return;
    }

    // Listen for the installable event
    const handleInstallable = () => {
      setShowPrompt(true);
    };

    window.addEventListener('pwa-installable', handleInstallable);

    // Listen for app installed event
    const handleInstalled = () => {
      setShowPrompt(false);
    };

    window.addEventListener('pwa-installed', handleInstalled);

    return () => {
      window.removeEventListener('pwa-installable', handleInstallable);
      window.removeEventListener('pwa-installed', handleInstalled);
    };
  }, []);

  const handleInstall = async () => {
    const accepted = await showInstallPrompt();

    if (accepted) {
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setIsDismissed(true);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  const handleDismissTemporary = () => {
    setShowPrompt(false);
  };

  if (!showPrompt || isDismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg animate-slide-up">
      <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="flex-shrink-0">
            <svg
              className="w-10 h-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm sm:text-base">
              Install Open Source Village
            </p>
            <p className="text-xs sm:text-sm text-white/90 mt-0.5">
              Get quick access and work offline
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleInstall}
            className="bg-white text-blue-600 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-blue-50 transition whitespace-nowrap"
          >
            Install
          </button>
          <button
            onClick={handleDismissTemporary}
            className="text-white/90 hover:text-white p-2 sm:hidden"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <div className="hidden sm:flex gap-2">
            <button
              onClick={handleDismissTemporary}
              className="text-white/90 hover:text-white text-sm underline"
            >
              Later
            </button>
            <button
              onClick={handleDismiss}
              className="text-white/90 hover:text-white text-sm underline"
            >
              Never
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
