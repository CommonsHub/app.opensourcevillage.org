/**
 * API endpoint for live activity feed
 * GET /api/activity - Get recent Nostr events for the activity feed
 *
 * Query Parameters:
 * - limit: Maximum number of events to return (default: 20)
 * - kinds: Comma-separated list of event kinds to filter by
 */

import { NextRequest, NextResponse } from 'next/server';
import { readAllNostrEvents, type GlobalEventEntry } from '@/lib/nostr-logger';
import { NOSTR_KINDS } from '@/lib/nostr-events';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limitParam = searchParams.get('limit');
    const kindsParam = searchParams.get('kinds');

    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    // Default to payment receipts and calendar events for activity feed
    let kinds: number[] | undefined;
    if (kindsParam) {
      kinds = kindsParam.split(',').map(k => parseInt(k.trim(), 10)).filter(k => !isNaN(k));
    } else {
      // Default kinds for activity feed
      kinds = [
        NOSTR_KINDS.PAYMENT_RECEIPT,
        NOSTR_KINDS.CALENDAR_EVENT,
        NOSTR_KINDS.NOTE,
      ];
    }

    const entries = readAllNostrEvents({
      limit,
      kinds,
    });

    return NextResponse.json({
      success: true,
      events: entries,
      count: entries.length,
    });
  } catch (error) {
    console.error('[Activity API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
