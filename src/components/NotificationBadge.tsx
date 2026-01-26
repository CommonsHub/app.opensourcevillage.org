/**
 * Notification Badge Component
 *
 * Displays unread notification count badge.
 * Used in navigation to show notification count.
 *
 * @example
 * ```tsx
 * <NotificationBadge npub={user.npub} />
 * ```
 */

'use client';

import { useUnreadCount } from '@/hooks/useNotifications';

interface NotificationBadgeProps {
  npub: string | null;
  className?: string;
}

export function NotificationBadge({ npub, className = '' }: NotificationBadgeProps) {
  const unreadCount = useUnreadCount(npub);

  if (unreadCount === 0) {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full ${className}`}
    >
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  );
}
