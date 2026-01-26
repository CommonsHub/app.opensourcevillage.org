/**
 * POST /api/calendar/refresh - Refresh calendar cache from Google
 *
 * Query Parameters:
 * - room: Specific room name to refresh (optional, defaults to all rooms)
 *
 * This endpoint fetches fresh data from Google Calendar and updates the local cache.
 * Call this after modifying or adding events to ensure the cache is up-to-date.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  refreshAllCalendars,
  refreshRoomCalendar,
  getCacheMetadata,
  ROOMS,
} from '@/lib/google-calendar';

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const roomName = searchParams.get('room');

    console.log('[API /calendar/refresh] Starting cache refresh...');

    if (roomName) {
      // Refresh specific room
      const validRoomNames = ROOMS.map(r => r.name);
      if (!validRoomNames.includes(roomName)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid room name: ${roomName}`,
            validRooms: validRoomNames,
          },
          { status: 400 }
        );
      }

      console.log(`[API /calendar/refresh] Refreshing ${roomName}...`);
      const success = await refreshRoomCalendar(roomName);

      return NextResponse.json({
        success,
        message: success
          ? `Successfully refreshed ${roomName} calendar`
          : `Failed to refresh ${roomName} calendar`,
        room: roomName,
        metadata: getCacheMetadata(),
      });
    } else {
      // Refresh all rooms
      console.log('[API /calendar/refresh] Refreshing all rooms...');
      const result = await refreshAllCalendars();

      return NextResponse.json({
        success: result.failed === 0,
        message: `Refreshed ${result.success}/${ROOMS.length} calendars`,
        roomsRefreshed: result.success,
        roomsFailed: result.failed,
        metadata: getCacheMetadata(),
      });
    }
  } catch (error) {
    console.error('[API /calendar/refresh] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to refresh calendar cache',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET to check cache status
export async function GET() {
  const metadata = getCacheMetadata();

  return NextResponse.json({
    success: true,
    cached: metadata !== null,
    metadata,
    rooms: ROOMS.map(r => r.name),
  });
}
