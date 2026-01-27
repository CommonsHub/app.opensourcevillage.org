/**
 * API endpoint to fetch all NOSTR events
 * GET /api/nostr/events - Get all NOSTR events with optional filters
 *
 * Query parameters:
 * - limit: number (default: 100)
 * - offset: number (default: 0)
 * - kinds: comma-separated list of event kinds (e.g., "1,7,1734")
 * - pubkeys: comma-separated list of hex pubkeys
 */

import { NextRequest, NextResponse } from 'next/server';
import { readAllNostrEvents, getUniquePubkeys, type GlobalEventEntry } from '@/lib/nostr-logger';
import { NOSTR_KINDS } from '@/lib/nostr-events';
import { nip19 } from 'nostr-tools';

// Event kind descriptions for display
const EVENT_KIND_INFO: Record<number, { name: string; description: string }> = {
  [NOSTR_KINDS.PROFILE]: { name: 'Profile', description: 'User profile metadata (name, bio, avatar)' },
  [NOSTR_KINDS.NOTE]: { name: 'Note', description: 'Text notes and offer announcements' },
  [NOSTR_KINDS.REACTION]: { name: 'Reaction', description: 'Reactions and RSVPs to events' },
  [NOSTR_KINDS.PAYMENT_REQUEST]: { name: 'Payment Request', description: 'Token mint/transfer/burn requests' },
  [NOSTR_KINDS.PAYMENT_RECEIPT]: { name: 'Payment Receipt', description: 'Confirmed token transactions' },
  [NOSTR_KINDS.CALENDAR_EVENT]: { name: 'Calendar Event', description: 'Workshop/calendar events (NIP-52)' },
  31923: { name: 'Calendar RSVP', description: 'Calendar event RSVPs (NIP-52)' },
  22242: { name: 'Auth', description: 'NIP-42 authentication' },
};

/**
 * Convert hex pubkey to npub
 */
function hexToNpub(hex: string): string {
  try {
    return nip19.npubEncode(hex);
  } catch {
    return hex;
  }
}

/**
 * GET all NOSTR events with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const kindsParam = searchParams.get('kinds');
    const pubkeysParam = searchParams.get('pubkeys');

    // Parse kinds array
    let kinds: number[] | undefined;
    if (kindsParam) {
      kinds = kindsParam.split(',').map(k => parseInt(k.trim(), 10)).filter(k => !isNaN(k));
    }

    // Parse pubkeys array
    let pubkeys: string[] | undefined;
    if (pubkeysParam) {
      pubkeys = pubkeysParam.split(',').map(p => p.trim()).filter(Boolean);
    }

    // Read events from global file
    const entries = readAllNostrEvents({ limit, offset, kinds, pubkeys });

    // Get unique pubkeys for filter dropdown
    const allPubkeys = getUniquePubkeys();

    // Transform entries to include npub and kind info
    const events = entries.map(entry => {
      const kindInfo = EVENT_KIND_INFO[entry.event.kind] || {
        name: `Kind ${entry.event.kind}`,
        description: 'Unknown event type'
      };

      return {
        ...entry,
        npub: hexToNpub(entry.event.pubkey),
        kindInfo,
      };
    });

    // Transform pubkeys to include npub
    const pubkeyList = allPubkeys.map(pubkey => ({
      pubkey,
      npub: hexToNpub(pubkey),
    }));

    return NextResponse.json({
      success: true,
      events,
      count: events.length,
      pubkeys: pubkeyList,
      kindInfo: EVENT_KIND_INFO,
    });
  } catch (error) {
    console.error('[NOSTR Events API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
