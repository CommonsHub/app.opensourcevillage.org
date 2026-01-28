'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

interface GitInfo {
  shortSha: string;
  message: string;
  date: string;
}

export default function Footer() {
  const pathname = usePathname();
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);

  // Check if we should hide the footer (must be before any conditional returns but after hooks)
  const isScreenRoute = pathname.startsWith('/screen') || pathname.endsWith('/screen');

  useEffect(() => {
    // Don't fetch if we're not going to show the footer
    if (isScreenRoute) return;

    fetch('/api/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.status?.git) {
          setGitInfo(data.status.git);
        }
      })
      .catch(() => {
        // Silently fail - footer will just not show git info
      });
  }, [isScreenRoute]);

  // Hide Footer on screen display routes (/screen and /YYYY/MM/DD/screen)
  if (isScreenRoute) {
    return null;
  }

  return (
    <footer className="mt-auto py-6 px-4 bg-gray-100 border-t border-gray-200">
      <div className="max-w-2xl mx-auto text-center text-sm text-gray-600">
        <p className="mb-2">
          Made with love for the village.{' '}
          <a
            href="https://github.com/CommonsHub/app.opensourcevillage.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Feel very welcome to contribute
          </a>
        </p>

        {gitInfo && (
          <p className="text-xs text-gray-500">
            <a
              href={`https://github.com/CommonsHub/app.opensourcevillage.org/commit/${gitInfo.shortSha}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:text-gray-700"
            >
              {gitInfo.shortSha}
            </a>
            {' - '}
            <span className="italic">{gitInfo.message}</span>
            {' - '}
            <span>{new Date(gitInfo.date).toLocaleDateString()}</span>
          </p>
        )}
      </div>
    </footer>
  );
}
