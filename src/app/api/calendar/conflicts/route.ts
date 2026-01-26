/**
 * GET /api/calendar/conflicts
 *
 * Check for time slot conflicts in a room's calendar.
 * Returns both confirmed conflicts (blocking) and tentative conflicts (warning).
 *
 * Query Parameters:
 * - room: Room name or slug (required)
 * - start: ISO 8601 start time (required)
 * - end: ISO 8601 end time (required)
 *
 * Example: /api/calendar/conflicts?room=ostrom-room&start=2026-01-28T14:00:00Z&end=2026-01-28T16:00:00Z
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkConflicts, getRoomSlug } from '@/lib/local-calendar';
import { fetchAllRoomEvents, ROOMS } from '@/lib/google-calendar';

interface ConflictInfo {
  type: 'confirmed' | 'tentative';
  title: string;
  startTime: string;
  endTime: string;
  offerId?: string;
  source: 'proposal' | 'google';
}

interface ConflictsResponse {
  success: boolean;
  hasConfirmedConflict: boolean;
  hasTentativeConflict: boolean;
  conflicts: ConflictInfo[];
  error?: string;
}

/**
 * Check if two time ranges overlap
 */
function timesOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean {
  return start1 < end2 && end1 > start2;
}

export async function GET(request: NextRequest): Promise<NextResponse<ConflictsResponse>> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const roomParam = searchParams.get('room');
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    const excludeOfferId = searchParams.get('excludeOfferId');

    // Validate required parameters
    if (!roomParam) {
      return NextResponse.json(
        { success: false, hasConfirmedConflict: false, hasTentativeConflict: false, conflicts: [], error: 'Missing required parameter: room' },
        { status: 400 }
      );
    }

    if (!startParam) {
      return NextResponse.json(
        { success: false, hasConfirmedConflict: false, hasTentativeConflict: false, conflicts: [], error: 'Missing required parameter: start' },
        { status: 400 }
      );
    }

    if (!endParam) {
      return NextResponse.json(
        { success: false, hasConfirmedConflict: false, hasTentativeConflict: false, conflicts: [], error: 'Missing required parameter: end' },
        { status: 400 }
      );
    }

    // Parse dates
    const startTime = new Date(startParam);
    const endTime = new Date(endParam);

    if (isNaN(startTime.getTime())) {
      return NextResponse.json(
        { success: false, hasConfirmedConflict: false, hasTentativeConflict: false, conflicts: [], error: 'Invalid start date format' },
        { status: 400 }
      );
    }

    if (isNaN(endTime.getTime())) {
      return NextResponse.json(
        { success: false, hasConfirmedConflict: false, hasTentativeConflict: false, conflicts: [], error: 'Invalid end date format' },
        { status: 400 }
      );
    }

    if (endTime <= startTime) {
      return NextResponse.json(
        { success: false, hasConfirmedConflict: false, hasTentativeConflict: false, conflicts: [], error: 'End time must be after start time' },
        { status: 400 }
      );
    }

    // Convert room parameter to slug if it's a room name
    let roomSlug = roomParam;
    const matchingRoom = ROOMS.find(
      (r) => r.name === roomParam || getRoomSlug(r.name) === roomParam
    );
    if (matchingRoom) {
      roomSlug = getRoomSlug(matchingRoom.name);
    }

    const conflicts: ConflictInfo[] = [];

    // Check proposal calendar conflicts
    try {
      const proposalConflicts = await checkConflicts(roomSlug, startTime, endTime);

      for (const event of proposalConflicts.confirmed) {
        // Skip if this is the offer being edited
        if (excludeOfferId && event.offerId === excludeOfferId) {
          continue;
        }
        conflicts.push({
          type: 'confirmed',
          title: event.title,
          startTime: event.startTime.toISOString(),
          endTime: event.endTime.toISOString(),
          offerId: event.offerId,
          source: 'proposal',
        });
      }

      for (const event of proposalConflicts.tentative) {
        // Skip if this is the offer being edited
        if (excludeOfferId && event.offerId === excludeOfferId) {
          continue;
        }
        conflicts.push({
          type: 'tentative',
          title: event.title,
          startTime: event.startTime.toISOString(),
          endTime: event.endTime.toISOString(),
          offerId: event.offerId,
          source: 'proposal',
        });
      }
    } catch (error) {
      console.warn('[Conflicts API] Error checking proposal conflicts:', error);
      // Continue to check Google Calendar
    }

    // Check Google Calendar for official events (always confirmed)
    if (matchingRoom) {
      try {
        const googleEvents = await fetchAllRoomEvents(
          [matchingRoom.name],
          startTime,
          endTime,
          false // use cache
        );

        for (const event of googleEvents) {
          const eventStart = new Date(event.startTime);
          const eventEnd = new Date(event.endTime);

          if (timesOverlap(startTime, endTime, eventStart, eventEnd)) {
            conflicts.push({
              type: 'confirmed',
              title: event.title,
              startTime: eventStart.toISOString(),
              endTime: eventEnd.toISOString(),
              source: 'google',
            });
          }
        }
      } catch (error) {
        console.warn('[Conflicts API] Error fetching Google Calendar:', error);
        // Don't fail - just return what we have
      }
    }

    // Determine conflict status
    const hasConfirmedConflict = conflicts.some((c) => c.type === 'confirmed');
    const hasTentativeConflict = conflicts.some((c) => c.type === 'tentative');

    return NextResponse.json({
      success: true,
      hasConfirmedConflict,
      hasTentativeConflict,
      conflicts,
    });
  } catch (error) {
    console.error('[Conflicts API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        hasConfirmedConflict: false,
        hasTentativeConflict: false,
        conflicts: [],
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
