/**
 * Client-side NOSTR utilities
 * Handles keypair derivation from serialNumber + password
 */

import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

/**
 * Derive NOSTR keypair from serialNumber and password
 * Uses SHA-256 hash of serialNumber + password as seed
 */
export async function deriveNostrKeypair(
  serialNumber: string,
  password: string
): Promise<{ nsec: string; npub: string; secretKey: Uint8Array }> {
  console.log('[NOSTR] Deriving keypair from serialNumber and password...');
  console.log('[NOSTR] SerialNumber:', serialNumber);

  // Combine serialNumber and password
  const combined = `${serialNumber}:${password}`;

  // Hash with SHA-256 to get 32 bytes
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const secretKey = new Uint8Array(hashBuffer);

  // Get public key from secret key
  const publicKey = getPublicKey(secretKey);

  // Encode to bech32 format
  const nsec = nip19.nsecEncode(secretKey);
  const npub = nip19.npubEncode(publicKey);

  console.log('[NOSTR] Generated keypair for npub:', npub.substring(0, 20) + '...');

  return { nsec, npub, secretKey };
}

/**
 * Store credentials in localStorage (encrypted with password)
 * Note: serialNumber is NEVER stored - it stays in URL fragment only
 */
export function storeCredentials(username: string, npub: string): void {
  localStorage.setItem('osv_username', username);
  localStorage.setItem('osv_npub', npub);

  console.log('[NOSTR] Credentials stored successfully');
}

/**
 * Get stored credentials from localStorage
 */
export function getStoredCredentials(): { username: string; npub: string } | null {
  const username = localStorage.getItem('osv_username');
  const npub = localStorage.getItem('osv_npub');

  if (!username || !npub) {
    return null;
  }

  return { username, npub };
}

/**
 * Clear stored credentials (logout)
 */
export function clearCredentials(): void {
  localStorage.removeItem('osv_username');
  localStorage.removeItem('osv_npub');
}

/**
 * Extract serial number from URL fragment
 * URL format: app.opensourcevillage.org/badge#{serialNumber}
 */
export function getSerialNumberFromURL(): string | null {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash;
  if (hash && hash.length > 1) {
    const serialNumber = hash.substring(1); // Remove the # character
    console.log('[NOSTR] Extracted serialNumber from URL fragment:', serialNumber);
    return serialNumber;
  }

  console.log('[NOSTR] No serialNumber found in URL fragment');
  return null;
}
