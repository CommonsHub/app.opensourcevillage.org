/**
 * NOSTR Helper Functions
 *
 * Includes NIP-29 (Relay-based Groups) functionality for managing closed groups
 */

import { finalizeEvent, type EventTemplate, type Event as NostrEvent, nip19, getPublicKey, generateSecretKey, utils } from 'nostr-tools';

const { hexToBytes, bytesToHex } = utils;
import settings from '../../settings.json';

export type { NostrEvent };

/**
 * NIP-29 Event Kinds for Group Management
 */
export const NIP29_KINDS = {
  GROUP_METADATA: 39000,      // Create/update group metadata
  GROUP_ADMINS: 39001,        // Set group admins
  GROUP_MEMBERS: 39002,       // Set group members
  ADD_USER: 9000,             // Add user to group
  REMOVE_USER: 9001,          // Remove user from group
  EDIT_METADATA: 9002,        // Edit group metadata
  DELETE_EVENT: 9005,         // Delete event from group
  GROUP_NOTE: 9,              // Group chat message (kind 9 + h tag)
  GROUP_REPLY: 10,            // Reply to group message (kind 10 + h tag)
} as const;

/**
 * NIP-52 Event Kinds for Calendar Events
 */
export const NIP52_KINDS = {
  CALENDAR_EVENT: 31922,      // Calendar event (date-based)
  CALENDAR_TIME_EVENT: 31923, // Calendar event (time-based)
} as const;

/**
 * Get admin secret key from environment
 */
function getAdminSecretKey(): Uint8Array {
  const nsec = process.env.NOSTR_NSEC;
  if (!nsec) {
    throw new Error('NOSTR_NSEC not found in environment variables');
  }

  try {
    const decoded = nip19.decode(nsec);
    const data = decoded.data as Uint8Array;

    // Convert to hex string first, then use nostr-tools' hexToBytes
    // This ensures the Uint8Array is from nostr-tools' realm
    const hexString = bytesToHex(data);
    return hexToBytes(hexString);
  } catch (err) {
    throw new Error(`Failed to decode NOSTR_NSEC: ${err}`);
  }
}

/**
 * Create a NIP-29 closed group
 *
 * @param groupId - Unique identifier for the group
 * @param name - Group name
 * @param description - Group description
 * @param isPrivate - Whether the group is private
 * @param isClosed - Whether the group is closed (requires approval to join)
 * @returns Signed NOSTR event for group creation
 */
export function createClosedGroup(
  groupId: string,
  name: string,
  description: string,
  isPrivate: boolean = true,
  isClosed: boolean = true
): NostrEvent {
  console.log('[NOSTR NIP-29] Creating closed group:', groupId);

  const secretKey = getAdminSecretKey();
  const publicKey = getPublicKey(secretKey);

  // NIP-29: Group metadata event (kind 39000)
  const event: EventTemplate = {
    kind: NIP29_KINDS.GROUP_METADATA,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', groupId],                    // d-tag: group identifier
      ['name', name],                    // Group name
      ['about', description],            // Group description
      ['picture', ''],                   // Group picture URL (optional)
      ['private', isPrivate ? 'true' : 'false'],  // Private flag
      ['closed', isClosed ? 'true' : 'false'],    // Closed flag
      ['p', publicKey, '', 'admin'],     // Admin pubkey
    ],
    content: description,
  };

  const signedEvent = finalizeEvent(event, secretKey);

  console.log('[NOSTR NIP-29] Group created:', {
    groupId,
    name,
    eventId: signedEvent.id,
  });

  return signedEvent;
}

/**
 * Add a member to a NIP-29 group
 *
 * @param groupId - Group identifier
 * @param memberNpub - Member's npub to add
 * @param role - Member role (default: 'member')
 * @returns Signed NOSTR event for adding member
 */
export function addGroupMember(
  groupId: string,
  memberNpub: string,
  role: string = 'member'
): NostrEvent {
  console.log('[NOSTR NIP-29] Adding member to group:', { groupId, memberNpub, role });

  const secretKey = getAdminSecretKey();

  // Decode npub to get public key
  let memberPubkey: string;
  try {
    const { data: pubkey } = nip19.decode(memberNpub);
    memberPubkey = pubkey as string;
  } catch (err) {
    throw new Error(`Invalid npub format: ${memberNpub}`);
  }

  // NIP-29: Add user event (kind 9000)
  const event: EventTemplate = {
    kind: NIP29_KINDS.ADD_USER,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['h', groupId],                    // h-tag: group identifier
      ['p', memberPubkey, '', role],     // p-tag: member pubkey with role
    ],
    content: `Added ${memberNpub} to group ${groupId} as ${role}`,
  };

  const signedEvent = finalizeEvent(event, secretKey);

  console.log('[NOSTR NIP-29] Member added:', {
    groupId,
    memberNpub: memberNpub.substring(0, 16) + '...',
    eventId: signedEvent.id,
  });

  return signedEvent;
}

/**
 * Remove a member from a NIP-29 group
 *
 * @param groupId - Group identifier
 * @param memberNpub - Member's npub to remove
 * @returns Signed NOSTR event for removing member
 */
export function removeGroupMember(
  groupId: string,
  memberNpub: string
): NostrEvent {
  console.log('[NOSTR NIP-29] Removing member from group:', { groupId, memberNpub });

  const secretKey = getAdminSecretKey();

  // Decode npub to get public key
  let memberPubkey: string;
  try {
    const { data: pubkey } = nip19.decode(memberNpub);
    memberPubkey = pubkey as string;
  } catch (err) {
    throw new Error(`Invalid npub format: ${memberNpub}`);
  }

  // NIP-29: Remove user event (kind 9001)
  const event: EventTemplate = {
    kind: NIP29_KINDS.REMOVE_USER,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['h', groupId],                    // h-tag: group identifier
      ['p', memberPubkey],               // p-tag: member pubkey to remove
    ],
    content: `Removed ${memberNpub} from group ${groupId}`,
  };

  const signedEvent = finalizeEvent(event, secretKey);

  console.log('[NOSTR NIP-29] Member removed:', {
    groupId,
    memberNpub: memberNpub.substring(0, 16) + '...',
    eventId: signedEvent.id,
  });

  return signedEvent;
}

/**
 * Get the configured NIP-29 group settings
 */
export function getGroupSettings() {
  return settings.nip29Group;
}

/**
 * Initialize the NIP-29 group (create if doesn't exist)
 * This should be called on server startup
 *
 * @returns The group creation event
 */
export function initializeGroup(): NostrEvent {
  const groupSettings = getGroupSettings();

  return createClosedGroup(
    groupSettings.id,
    groupSettings.name,
    groupSettings.description,
    groupSettings.isPrivate,
    groupSettings.isClosed
  );
}

/**
 * Create a NIP-52 calendar event and post to NIP-29 group
 *
 * @param groupId - Group identifier
 * @param dTag - Unique identifier for this event (for replaceability)
 * @param title - Event title
 * @param description - Event description
 * @param startTime - Start time in Unix timestamp (seconds)
 * @param endTime - End time in Unix timestamp (seconds)
 * @param location - Event location/room (optional)
 * @param tags - Additional tags (optional)
 * @param authorSecretKey - Secret key of the author (user's nsec, not admin)
 * @returns Signed NOSTR event for calendar event
 */
export function createCalendarEvent(
  groupId: string,
  dTag: string,
  title: string,
  description: string,
  startTime: number,
  endTime: number,
  location?: string,
  tags: string[] = [],
  authorSecretKey?: Uint8Array
): NostrEvent {
  console.log('[NOSTR NIP-52] Creating calendar event:', { dTag, title });

  // Use author's key if provided, otherwise use admin key
  const secretKey = authorSecretKey || getAdminSecretKey();
  const publicKey = getPublicKey(secretKey);

  // NIP-52: Calendar event (kind 31922) + NIP-29: h-tag for group
  const eventTags: string[][] = [
    ['d', dTag],                      // d-tag: unique identifier for replaceability
    ['h', groupId],                   // h-tag: group identifier (NIP-29)
    ['title', title],                 // Event title
    ['start', startTime.toString()],  // Start timestamp
    ['end', endTime.toString()],      // End timestamp
  ];

  // Add location if provided
  if (location) {
    eventTags.push(['location', location]);
  }

  // Add custom tags
  tags.forEach(tag => {
    eventTags.push(['t', tag]);
  });

  const event: EventTemplate = {
    kind: NIP52_KINDS.CALENDAR_EVENT,
    created_at: Math.floor(Date.now() / 1000),
    tags: eventTags,
    content: description,
  };

  const signedEvent = finalizeEvent(event, secretKey);

  console.log('[NOSTR NIP-52] Calendar event created:', {
    dTag,
    title,
    eventId: signedEvent.id,
    groupId,
  });

  return signedEvent;
}

/**
 * Helper to get user's secret key from nsec
 * Used when users create/update their own events
 */
export function getUserSecretKey(nsec: string): Uint8Array {
  if (!nsec || !nsec.startsWith('nsec1')) {
    throw new Error('Invalid nsec format');
  }

  try {
    const decoded = nip19.decode(nsec);
    const data = decoded.data as Uint8Array;

    // Convert to hex string first, then use nostr-tools' hexToBytes
    // This ensures the Uint8Array is from nostr-tools' realm
    const hexString = bytesToHex(data);
    return hexToBytes(hexString);
  } catch (err) {
    throw new Error(`Failed to decode nsec: ${err}`);
  }
}
