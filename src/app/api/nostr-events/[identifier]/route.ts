/**
 * API endpoint to fetch NOSTR events for a profile
 * GET /api/nostr-events/[identifier] - Get NOSTR events by username or npub
 *
 * Reads events from: data/npubs/:npub/nostr_events.jsonl
 * Events are recorded by the separate record-nostr-events process
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getProfileByUsername,
} from '@/lib/storage';
import { readNostrEvents, type NostrEvent } from '@/lib/nostr-logger';

/**
 * GET NOSTR events for a profile
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;

    console.log('[NOSTR Events API] Fetching events for:', identifier);

    let npub: string;

    // If identifier is already an npub, use it directly
    if (identifier.startsWith('npub1')) {
      npub = identifier;
    } else {
      // Otherwise, look up by username to get npub
      const profile = await getProfileByUsername(identifier);

      if (!profile) {
        return NextResponse.json(
          { success: false, error: 'Profile not found' },
          { status: 404 }
        );
      }

      npub = profile.npub;
    }

    // Read NOSTR events from per-npub log file
    const events = readNostrEvents(npub);

    // Sort by created_at descending (newest first)
    events.sort((a, b) => b.created_at - a.created_at);

    console.log('[NOSTR Events API] Found', events.length, 'events for', identifier);

    return NextResponse.json({
      success: true,
      events,
      count: events.length,
      npub,
    });
  } catch (error) {
    console.error('[NOSTR Events API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
