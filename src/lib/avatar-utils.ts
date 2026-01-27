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
 * 3. Generated avatar (SVG with gradient)
 *
 * @param name - Display name or username for generated avatar
 * @param npub - User's npub for deterministic colors
 * @param profile - Optional profile data with picture field
 * @returns Avatar URL
 */
export function getAvatarUrl(name: string, npub?: string, profile?: { picture?: string }): string {
  // Check for NOSTR picture field (Blossom URL)
  if (profile?.picture) {
    return profile.picture;
  }

  // Fallback to generated avatar
  return getGeneratedAvatar(name, npub);
}

/**
 * Generate a deterministic color from a string (npub)
 * Returns an HSL color with good saturation and lightness for backgrounds
 */
function hashToColor(str: string, offset: number = 0): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash) + offset;
    hash = hash & hash;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

/**
 * Generate an SVG avatar with gradient background and centered letter
 *
 * @param name - Display name or username (first letter will be shown)
 * @param npub - User's npub (used to generate deterministic colors)
 * @returns SVG data URL
 */
export function getGeneratedAvatar(name: string, npub: string = ''): string {
  const letter = (name || '?').charAt(0).toUpperCase();
  const seed = npub || name;

  // Generate 3 colors based on npub
  const color1 = hashToColor(seed, 0);
  const color2 = hashToColor(seed, 100);
  const color3 = hashToColor(seed, 200);

  // Create SVG with gradient background and centered letter
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color1}"/>
          <stop offset="50%" style="stop-color:${color2}"/>
          <stop offset="100%" style="stop-color:${color3}"/>
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#grad)"/>
      <text x="50" y="50" dy="0.35em" text-anchor="middle" font-family="system-ui, sans-serif" font-size="45" font-weight="600" fill="white">${letter}</text>
    </svg>
  `.trim().replace(/\n\s*/g, '');

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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
 * @param name - Display name or username for generated avatar
 * @param npub - User's npub (for checking uploaded avatars)
 * @param profile - Optional profile data
 * @returns Avatar data with type information
 */
export async function getAvatarData(
  name: string,
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
    url: getGeneratedAvatar(name),
    isGenerated: true,
    isUploaded: false,
    isBlossom: false,
  };
}
