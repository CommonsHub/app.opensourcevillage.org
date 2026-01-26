/**
 * Avatar Utilities Tests
 *
 * Tests for avatar-related helper functions.
 */

import { describe, it, expect } from '@jest/globals';
import {
  getGeneratedAvatar,
  validateAvatarFile,
  getAvatarSizeClass,
  updateNostrProfileWithAvatar,
} from '../avatar-utils';

// ============================================================================
// Generated Avatar Tests
// ============================================================================

describe('getGeneratedAvatar', () => {
  it('should generate consistent avatar URL for same npub', () => {
    const npub = 'npub1test123';
    const url1 = getGeneratedAvatar(npub);
    const url2 = getGeneratedAvatar(npub);

    expect(url1).toBe(url2);
  });

  it('should generate different avatars for different npubs', () => {
    const npub1 = 'npub1test123';
    const npub2 = 'npub1test456';

    const url1 = getGeneratedAvatar(npub1);
    const url2 = getGeneratedAvatar(npub2);

    expect(url1).not.toBe(url2);
  });

  it('should include npub in URL for deterministic generation', () => {
    const npub = 'npub1test123';
    const url = getGeneratedAvatar(npub);

    expect(url).toContain(npub);
  });

  it('should use boring-avatars beam style', () => {
    const npub = 'npub1test123';
    const url = getGeneratedAvatar(npub);

    expect(url).toContain('boringavatars.com/beam');
  });

  it('should use custom size when provided', () => {
    const npub = 'npub1test123';
    const url = getGeneratedAvatar(npub, 200);

    expect(url).toContain('/200/');
  });

  it('should use default size of 120', () => {
    const npub = 'npub1test123';
    const url = getGeneratedAvatar(npub);

    expect(url).toContain('/120/');
  });

  it('should include custom color palette', () => {
    const npub = 'npub1test123';
    const url = getGeneratedAvatar(npub);

    expect(url).toContain('colors=');
    expect(url).toContain('264653'); // Deep teal
  });
});

// ============================================================================
// Avatar File Validation Tests
// ============================================================================

describe('validateAvatarFile', () => {
  it('should accept valid JPEG file', () => {
    const file = new File(['test'], 'avatar.jpg', { type: 'image/jpeg' });
    const result = validateAvatarFile(file);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should accept valid PNG file', () => {
    const file = new File(['test'], 'avatar.png', { type: 'image/png' });
    const result = validateAvatarFile(file);

    expect(result.valid).toBe(true);
  });

  it('should accept valid WebP file', () => {
    const file = new File(['test'], 'avatar.webp', { type: 'image/webp' });
    const result = validateAvatarFile(file);

    expect(result.valid).toBe(true);
  });

  it('should reject invalid file type', () => {
    const file = new File(['test'], 'avatar.gif', { type: 'image/gif' });
    const result = validateAvatarFile(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid file type');
  });

  it('should reject file over 5MB', () => {
    // Create a large buffer (6MB)
    const largeBuffer = new Uint8Array(6 * 1024 * 1024);
    const file = new File([largeBuffer], 'avatar.jpg', { type: 'image/jpeg' });
    const result = validateAvatarFile(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('too large');
  });

  it('should accept file under 5MB', () => {
    // Create a small buffer (1MB)
    const smallBuffer = new Uint8Array(1 * 1024 * 1024);
    const file = new File([smallBuffer], 'avatar.jpg', { type: 'image/jpeg' });
    const result = validateAvatarFile(file);

    expect(result.valid).toBe(true);
  });

  it('should accept file exactly at 5MB limit', () => {
    // Create buffer exactly 5MB
    const buffer = new Uint8Array(5 * 1024 * 1024);
    const file = new File([buffer], 'avatar.jpg', { type: 'image/jpeg' });
    const result = validateAvatarFile(file);

    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// Avatar Size Class Tests
// ============================================================================

describe('getAvatarSizeClass', () => {
  it('should return correct class for xs size', () => {
    const className = getAvatarSizeClass('xs');
    expect(className).toBe('w-6 h-6');
  });

  it('should return correct class for sm size', () => {
    const className = getAvatarSizeClass('sm');
    expect(className).toBe('w-8 h-8');
  });

  it('should return correct class for md size', () => {
    const className = getAvatarSizeClass('md');
    expect(className).toBe('w-12 h-12');
  });

  it('should return correct class for lg size', () => {
    const className = getAvatarSizeClass('lg');
    expect(className).toBe('w-16 h-16');
  });

  it('should return correct class for xl size', () => {
    const className = getAvatarSizeClass('xl');
    expect(className).toBe('w-24 h-24');
  });
});

// ============================================================================
// NOSTR Profile Update Tests
// ============================================================================

describe('updateNostrProfileWithAvatar', () => {
  it('should add picture field to empty profile', () => {
    const profile = {};
    const blossomUrl = 'https://blossom.primal.net/abc123';

    const updated = updateNostrProfileWithAvatar(blossomUrl, profile);

    expect(updated.picture).toBe(blossomUrl);
  });

  it('should update existing picture field', () => {
    const profile = {
      name: 'Alice',
      picture: 'https://old-url.com/avatar.jpg',
    };
    const blossomUrl = 'https://blossom.primal.net/abc123';

    const updated = updateNostrProfileWithAvatar(blossomUrl, profile);

    expect(updated.picture).toBe(blossomUrl);
    expect(updated.name).toBe('Alice');
  });

  it('should preserve other profile fields', () => {
    const profile = {
      name: 'Alice',
      about: 'Developer',
      website: 'https://example.com',
      nip05: 'alice@example.com',
    };
    const blossomUrl = 'https://blossom.primal.net/abc123';

    const updated = updateNostrProfileWithAvatar(blossomUrl, profile);

    expect(updated.picture).toBe(blossomUrl);
    expect(updated.name).toBe('Alice');
    expect(updated.about).toBe('Developer');
    expect(updated.website).toBe('https://example.com');
    expect(updated.nip05).toBe('alice@example.com');
  });

  it('should not mutate original profile object', () => {
    const profile = { name: 'Alice' };
    const blossomUrl = 'https://blossom.primal.net/abc123';

    const updated = updateNostrProfileWithAvatar(blossomUrl, profile);

    expect(profile.picture).toBeUndefined();
    expect(updated.picture).toBe(blossomUrl);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Avatar Utils Edge Cases', () => {
  it('should handle empty npub for generated avatar', () => {
    const url = getGeneratedAvatar('');
    expect(url).toContain('boringavatars.com');
  });

  it('should handle very long npub', () => {
    const longNpub = 'npub1' + 'a'.repeat(100);
    const url = getGeneratedAvatar(longNpub);
    expect(url).toContain('boringavatars.com');
  });

  it('should handle special characters in npub', () => {
    const npub = 'npub1test@#$%';
    const url = getGeneratedAvatar(npub);
    expect(url).toContain('boringavatars.com');
  });

  it('should handle zero size for generated avatar', () => {
    const npub = 'npub1test123';
    const url = getGeneratedAvatar(npub, 0);
    expect(url).toContain('/0/');
  });

  it('should handle very large size for generated avatar', () => {
    const npub = 'npub1test123';
    const url = getGeneratedAvatar(npub, 9999);
    expect(url).toContain('/9999/');
  });
});
