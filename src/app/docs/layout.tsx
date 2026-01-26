'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { name: 'Home', href: '/docs' },
  { name: 'Installation', href: '/docs/installation' },
  { name: 'Concepts', href: '/docs/concepts' },
  { name: 'Testing', href: '/docs/testing' },
  {
    name: 'API Reference',
    href: '/docs/api',
    children: [
      { name: 'Overview', href: '/docs/api' },
      { name: 'Badge Claim', href: '/docs/api/claim' },
      { name: 'Profile', href: '/docs/api/profile' },
      { name: 'Offers', href: '/docs/api/offers' },
      { name: 'RSVP', href: '/docs/api/rsvp' },
      { name: 'Wallet', href: '/docs/api/wallet' },
    ],
  },
  { name: 'FAQ', href: '/docs/faq' },
  { name: 'Contribute', href: '/docs/contribute' },
  { name: 'About', href: '/docs/about' },
];

function NavItem({
  item,
  pathname,
}: {
  item: (typeof navigation)[0];
  pathname: string;
}) {
  const isActive = pathname === item.href;
  const hasChildren = 'children' in item && item.children;
  const isParentActive = hasChildren && pathname.startsWith(item.href);

  return (
    <li>
      <Link
        href={item.href}
        className={`block py-1.5 px-3 rounded-md transition-colors ${
          isActive
            ? 'bg-blue-100 text-blue-700 font-medium'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        {item.name}
      </Link>
      {hasChildren && (isParentActive || isActive) && (
        <ul className="ml-4 mt-1 space-y-1 border-l border-gray-200 pl-2">
          {item.children.map((child) => (
            <li key={child.href}>
              <Link
                href={child.href}
                className={`block py-1 px-2 text-sm rounded transition-colors ${
                  pathname === child.href
                    ? 'text-blue-700 font-medium'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {child.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <Link href="/" className="font-bold text-xl text-black">
                Open Source Village
              </Link>
              <Link
                href="/docs"
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Documentation
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/commonshub/app.opensourcevillage.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-gray-900"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-8 py-8">
          {/* Sidebar */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <nav className="sticky top-24">
              <ul className="space-y-1">
                {navigation.map((item) => (
                  <NavItem key={item.href} item={item} pathname={pathname} />
                ))}
              </ul>
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            <article className="prose prose-gray max-w-none">{children}</article>
          </main>

          {/* Table of contents placeholder */}
          <aside className="hidden xl:block w-56 flex-shrink-0">
            <div className="sticky top-24 text-sm text-gray-500">
              {/* TOC would go here */}
            </div>
          </aside>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
          MIT {new Date().getFullYear()} © Open Source Village
        </div>
      </footer>
    </div>
  );
}
