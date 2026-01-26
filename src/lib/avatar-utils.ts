/**
 * Avatar Utilities
 *
 * Helper functions for avatar management:
 * - Get avatar URL (uploaded or generated)
 * - Update NOSTR kind 0 with avatar
 * - Delete avatar
 *
 * @see specs/TECHNICAL_SPEC.md#avatar-upload-flow
 */

/**
 * Get avatar URL for a user
 *
 * Priority order:
 * 1. Custom uploaded avatar (local)
 * 2. NOSTR kind 0 picture field (Blossom URL)
 * 3. Generated avatar (boring-avatars)
 *
 * @param npub - User's npub
 * @param profile - Optional profile data with picture field
 * @returns Avatar URL
 */
export function getAvatarUrl(npub: string, profile?: { picture?: string }): string {
  // Check for local uploaded avatar
  const localAvatar = `/data/npubs/${npub}/avatar.jpg`;

  // Check for NOSTR picture field (Blossom URL)
  if (profile?.picture) {
    return profile.picture;
  }

  // Fallback to generated avatar
  return getGeneratedAvatar(npub);
}

/**
 * Generate a consistent avatar URL from npub
 *
 * Uses boring-avatars "beam" style with custom color palette.
 *
 * @see https://boringavatars.com/
 * @param npub - User's npub
 * @param size - Avatar size in pixels (default: 120)
 * @returns Generated avatar URL
 */
export function getGeneratedAvatar(npub: string, size: number = 120): string {
  // Custom color palette for Open Source Village
  const colors = [
    '264653', // Deep teal
    '2a9d8f', // Teal
    'e9c46a', // Yellow
    'f4a261', // Orange
    'e76f51', // Coral
  ];

  return `https://source.boringavatars.com/beam/${size}/${npub}?colors=${colors.join(',')}`;
}

/**
 * Check if user has uploaded a custom avatar
 *
 * @param npub - User's npub
 * @returns Promise resolving to true if avatar exists
 */
export async function hasUploadedAvatar(npub: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/avatar?npub=${npub}`);
    const data = await response.json();
    return data.success && data.exists;
  } catch (error) {
    console.error('Failed to check avatar:', error);
    return false;
  }
}

/**
 * Update NOSTR kind 0 with avatar URL
 *
 * This should be called after successful avatar upload to sync
 * the avatar across NOSTR clients.
 *
 * @param blossomUrl - Blossom URL from avatar upload
 * @param currentProfile - Current NOSTR kind 0 data
 * @returns Updated NOSTR kind 0 content
 */
export function updateNostrProfileWithAvatar(
  blossomUrl: string,
  currentProfile: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...currentProfile,
    picture: blossomUrl,
  };
}

/**
 * Validate avatar image file
 *
 * @param file - File to validate
 * @returns Validation result with error message if invalid
 */
export function validateAvatarFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Please upload a JPEG, PNG, or WebP image.',
    };
  }

  // Check file size (5MB max)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'File too large. Maximum size is 5MB.',
    };
  }

  return { valid: true };
}

/**
 * Get avatar size class for Tailwind
 *
 * @param size - Size variant
 * @returns Tailwind classes for width and height
 */
export function getAvatarSizeClass(
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
): string {
  const sizes = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  };
  return sizes[size];
}

/**
 * Avatar component data interface
 */
export interface AvatarData {
  url: string;
  isGenerated: boolean;
  isUploaded: boolean;
  isBlossom: boolean;
}

/**
 * Get comprehensive avatar data for a user
 *
 * @param npub - User's npub
 * @param profile - Optional profile data
 * @returns Avatar data with type information
 */
export async function getAvatarData(
  npub: string,
  profile?: { picture?: string }
): Promise<AvatarData> {
  // Check for uploaded avatar
  const hasUploaded = await hasUploadedAvatar(npub);

  if (hasUploaded) {
    return {
      url: `/data/npubs/${npub}/avatar.jpg`,
      isGenerated: false,
      isUploaded: true,
      isBlossom: false,
    };
  }

  // Check for Blossom URL in NOSTR profile
  if (profile?.picture) {
    return {
      url: profile.picture,
      isGenerated: false,
      isUploaded: false,
      isBlossom: true,
    };
  }

  // Use generated avatar
  return {
    url: getGeneratedAvatar(npub),
    isGenerated: true,
    isUploaded: false,
    isBlossom: false,
  };
}
