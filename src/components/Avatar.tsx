/**
 * Avatar Display Component
 *
 * Reusable component for displaying user avatars.
 * Shows uploaded avatar, Blossom URL, or generated avatar as fallback.
 *
 * Usage:
 * ```tsx
 * <Avatar npub={user.npub} size="md" />
 * <Avatar npub={user.npub} profile={profile} size="lg" />
 * ```
 */

'use client';

import Image from 'next/image';
import { getAvatarUrl, getAvatarSizeClass } from '@/lib/avatar-utils';

interface AvatarProps {
  npub: string;
  profile?: { picture?: string };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  alt?: string;
}

export function Avatar({ npub, profile, size = 'md', className = '', alt }: AvatarProps) {
  const avatarUrl = getAvatarUrl(npub, profile);
  const sizeClass = getAvatarSizeClass(size);
  const altText = alt || `Avatar for ${npub.slice(0, 12)}...`;

  return (
    <div className={`${sizeClass} rounded-full overflow-hidden bg-gray-200 flex-shrink-0 ${className}`}>
      <Image
        src={avatarUrl}
        alt={altText}
        width={120}
        height={120}
        className="w-full h-full object-cover"
        unoptimized // For generated avatars and external URLs
      />
    </div>
  );
}

/**
 * Avatar with username component
 * Displays avatar and username side by side
 */
interface AvatarWithNameProps {
  npub: string;
  username?: string;
  profile?: { picture?: string };
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export function AvatarWithName({
  npub,
  username,
  profile,
  size = 'sm',
  className = '',
}: AvatarWithNameProps) {
  const displayName = username || npub.slice(0, 12) + '...';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Avatar npub={npub} profile={profile} size={size} />
      <span className="text-sm font-medium text-gray-900">{displayName}</span>
    </div>
  );
}

/**
 * Avatar stack component
 * Shows multiple avatars overlapping
 */
interface AvatarStackProps {
  users: Array<{ npub: string; profile?: { picture?: string } }>;
  maxVisible?: number;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export function AvatarStack({ users, maxVisible = 3, size = 'sm', className = '' }: AvatarStackProps) {
  const visible = users.slice(0, maxVisible);
  const remaining = users.length - maxVisible;
  const sizeClass = getAvatarSizeClass(size);

  return (
    <div className={`flex items-center ${className}`}>
      {visible.map((user, index) => (
        <div
          key={user.npub}
          className={`${sizeClass} rounded-full overflow-hidden bg-white border-2 border-white -ml-2 first:ml-0`}
          style={{ zIndex: visible.length - index }}
        >
          <Avatar npub={user.npub} profile={user.profile} size={size} />
        </div>
      ))}
      {remaining > 0 && (
        <div
          className={`${sizeClass} rounded-full bg-gray-300 border-2 border-white -ml-2 flex items-center justify-center`}
          style={{ zIndex: 0 }}
        >
          <span className="text-xs font-medium text-gray-700">+{remaining}</span>
        </div>
      )}
    </div>
  );
}
