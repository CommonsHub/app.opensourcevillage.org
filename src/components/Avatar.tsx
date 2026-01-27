/**
 * Avatar Display Component
 *
 * Reusable component for displaying user avatars.
 * Shows uploaded avatar, Blossom URL, or generated avatar as fallback.
 *
 * Usage:
 * ```tsx
 * <Avatar name={user.username} npub={user.npub} size="md" />
 * <Avatar name={user.username} npub={user.npub} profile={profile} size="lg" />
 * ```
 */

'use client';

import Image from 'next/image';
import { getAvatarSizeClass, getGeneratedAvatar } from '@/lib/avatar-utils';

interface AvatarProps {
  name: string;
  npub?: string;
  profile?: { picture?: string };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  alt?: string;
}

export function Avatar({ name, npub, profile, size = 'md', className = '', alt }: AvatarProps) {
  const sizeClass = getAvatarSizeClass(size);
  const altText = alt || `Avatar for ${name}`;
  const avatarUrl = profile?.picture || getGeneratedAvatar(name, npub);

  return (
    <div className={`${sizeClass} rounded-full overflow-hidden bg-gray-200 flex-shrink-0 ${className}`}>
      <Image
        src={avatarUrl}
        alt={altText}
        width={120}
        height={120}
        className="w-full h-full object-cover"
        unoptimized
      />
    </div>
  );
}

/**
 * Avatar with username component
 * Displays avatar and username side by side
 */
interface AvatarWithNameProps {
  name: string;
  npub?: string;
  profile?: { picture?: string };
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export function AvatarWithName({
  name,
  npub,
  profile,
  size = 'sm',
  className = '',
}: AvatarWithNameProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Avatar name={name} npub={npub} profile={profile} size={size} />
      <span className="text-sm font-medium text-gray-900">{name}</span>
    </div>
  );
}

/**
 * Avatar stack component
 * Shows multiple avatars overlapping
 */
interface AvatarStackProps {
  users: Array<{ name: string; npub?: string; profile?: { picture?: string } }>;
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
          key={user.npub || user.name}
          className={`${sizeClass} rounded-full overflow-hidden bg-white border-2 border-white -ml-2 first:ml-0`}
          style={{ zIndex: visible.length - index }}
        >
          <Avatar name={user.name} npub={user.npub} profile={user.profile} size={size} />
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
