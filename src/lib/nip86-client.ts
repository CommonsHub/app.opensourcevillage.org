/**
 * NIP-86: Relay Management API Client
 * https://github.com/nostr-protocol/nips/blob/master/86.md
 *
 * Provides functions to manage relay configuration including:
 * - Adding/removing allowed users
 * - Updating relay metadata
 * - Managing relay settings
 */

import { finalizeEvent, type EventTemplate, nip19, getPublicKey } from 'nostr-tools';

/**
 * NIP-86 endpoints
 */
const NIP86_ENDPOINTS = {
  ADD_USER: '/api/v1/nip86/users',
  REMOVE_USER: '/api/v1/nip86/users',
  GET_INFO: '/api/v1/nip86/info',
  UPDATE_SETTINGS: '/api/v1/nip86/settings',
} as const;

/**
 * Get admin secret key from environment for NIP-86 operations
 * Uses the same conversion approach as nostr.ts to ensure compatibility
 */
function getAdminSecretKey(): Uint8Array {
  const nsec = process.env.NOSTR_NSEC;
  if (!nsec) {
    throw new Error('NOSTR_NSEC not found in environment variables');
  }

  try {
    const decoded = nip19.decode(nsec);

    // Convert to array and back to Uint8Array to ensure compatibility across different realms
    if (decoded.data instanceof Uint8Array || Buffer.isBuffer(decoded.data)) {
      // Create a new Uint8Array from the existing array-like data
      const bytes = Array.from(decoded.data as Uint8Array);
      return Uint8Array.from(bytes);
    }

    // If it's a hex string, convert it to Uint8Array
    if (typeof decoded.data === 'string') {
      const buffer = Buffer.from(decoded.data, 'hex');
      const bytes = Array.from(buffer);
      return Uint8Array.from(bytes);
    }

    throw new Error(`Decoded NOSTR_NSEC is not in expected format: ${typeof decoded.data}`);
  } catch (err) {
    throw new Error(`Failed to decode NOSTR_NSEC: ${err}`);
  }
}

/**
 * Create a NIP-86 authorization event
 * This event proves the request is authorized by the relay admin
 */
function createAuthEvent(method: string, url: string, body?: object): string {
  const secretKey = getAdminSecretKey();

  // Create auth event as per NIP-86
  const event: EventTemplate = {
    kind: 27235, // NIP-86 auth event kind
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', method],
    ],
    content: body ? JSON.stringify(body) : '',
  };

  const signedEvent = finalizeEvent(event, secretKey);

  // Return base64-encoded event
  return Buffer.from(JSON.stringify(signedEvent)).toString('base64');
}

/**
 * Add a user (pubkey) to the relay's allowed list
 *
 * @param relayUrl - Base URL of the relay (e.g., 'https://nostr.commonshub.brussels')
 * @param npub - User's npub to add
 * @returns Success status and response
 */
export async function addUserToRelay(
  relayUrl: string,
  npub: string
): Promise<{ success: boolean; error?: string }> {
  console.log('[NIP-86] Adding user to relay:', { relayUrl, npub: npub.substring(0, 16) + '...' });

  try {
    // Decode npub to get pubkey
    const { data: pubkey } = nip19.decode(npub);
    if (typeof pubkey !== 'string') {
      throw new Error('Invalid npub format');
    }

    // Prepare request
    const endpoint = `${relayUrl}${NIP86_ENDPOINTS.ADD_USER}`;
    const requestBody = {
      pubkey,
    };

    // Create authorization event
    const authHeader = createAuthEvent('POST', endpoint, requestBody);

    console.log('[NIP-86] Sending request to:', endpoint);

    // Make request to relay
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Nostr ${authHeader}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[NIP-86] Failed to add user:', {
        status: response.status,
        error: errorText,
      });

      // Don't fail hard if relay doesn't support NIP-86
      if (response.status === 404 || response.status === 501) {
        console.warn('[NIP-86] Relay does not support NIP-86, skipping');
        return { success: false, error: 'Relay does not support NIP-86' };
      }

      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    console.log('[NIP-86] User added successfully:', { pubkey: pubkey.substring(0, 16) + '...' });

    return { success: true };

  } catch (error) {
    console.error('[NIP-86] Error adding user to relay:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Remove a user (pubkey) from the relay's allowed list
 *
 * @param relayUrl - Base URL of the relay
 * @param npub - User's npub to remove
 * @returns Success status and response
 */
export async function removeUserFromRelay(
  relayUrl: string,
  npub: string
): Promise<{ success: boolean; error?: string }> {
  console.log('[NIP-86] Removing user from relay:', { relayUrl, npub: npub.substring(0, 16) + '...' });

  try {
    // Decode npub to get pubkey
    const { data: pubkey } = nip19.decode(npub);
    if (typeof pubkey !== 'string') {
      throw new Error('Invalid npub format');
    }

    // Prepare request
    const endpoint = `${relayUrl}${NIP86_ENDPOINTS.REMOVE_USER}/${pubkey}`;

    // Create authorization event
    const authHeader = createAuthEvent('DELETE', endpoint);

    console.log('[NIP-86] Sending request to:', endpoint);

    // Make request to relay
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        'Authorization': `Nostr ${authHeader}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[NIP-86] Failed to remove user:', {
        status: response.status,
        error: errorText,
      });

      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    console.log('[NIP-86] User removed successfully:', { pubkey: pubkey.substring(0, 16) + '...' });

    return { success: true };

  } catch (error) {
    console.error('[NIP-86] Error removing user from relay:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get relay information
 *
 * @param relayUrl - Base URL of the relay
 * @returns Relay information
 */
export async function getRelayInfo(relayUrl: string): Promise<{
  success: boolean;
  info?: any;
  error?: string;
}> {
  try {
    const endpoint = `${relayUrl}${NIP86_ENDPOINTS.GET_INFO}`;

    console.log('[NIP-86] Getting relay info from:', endpoint);

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const info = await response.json();
    return { success: true, info };

  } catch (error) {
    console.error('[NIP-86] Error getting relay info:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Add user to all configured relays
 *
 * @param npub - User's npub to add
 * @returns Results for each relay
 */
export async function addUserToAllRelays(npub: string): Promise<{
  successful: string[];
  failed: Array<{ url: string; error: string }>;
}> {
  const settings = await import('../../settings.json');
  const relayUrls = settings.nostrRelays || [];

  console.log(`[NIP-86] Adding user to ${relayUrls.length} relays`);

  const results = await Promise.allSettled(
    relayUrls.map(url => {
      // Convert wss:// to https://
      const httpUrl = url.replace('wss://', 'https://').replace('ws://', 'http://');
      return addUserToRelay(httpUrl, npub);
    })
  );

  const successful: string[] = [];
  const failed: Array<{ url: string; error: string }> = [];

  results.forEach((result, index) => {
    const url = relayUrls[index];

    if (result.status === 'fulfilled' && result.value.success) {
      successful.push(url);
    } else {
      const error = result.status === 'fulfilled'
        ? result.value.error || 'Unknown error'
        : result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);

      failed.push({ url, error });
    }
  });

  console.log('[NIP-86] Add user summary:', {
    successful: successful.length,
    failed: failed.length,
  });

  return { successful, failed };
}
