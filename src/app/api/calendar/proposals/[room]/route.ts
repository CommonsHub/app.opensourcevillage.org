/**
 * GET /api/calendar/proposals/[room]
 *
 * Serves the proposals.ics file for a specific room.
 * This allows external calendar applications to subscribe to community proposals.
 *
 * Example: /api/calendar/proposals/ostrom-room.ics
 *
 * Note: The [room] segment should include the .ics extension (e.g., "ostrom-room.ics")
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getRoomSlug, getProposalEvents, generateIcsFile } from '@/lib/local-calendar';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const CALENDARS_DIR = path.join(DATA_DIR, 'calendars');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ room: string }> }
) {
  try {
    const { room } = await params;

    // Remove .ics extension if present
    const roomSlug = room.replace(/\.ics$/, '');

    // Try to read the ICS file
    const icsPath = path.join(CALENDARS_DIR, roomSlug, 'proposals.ics');

    try {
      // Try to read existing ICS file
      const icsContent = await fs.readFile(icsPath, 'utf-8');

      return new NextResponse(icsContent, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `inline; filename="${roomSlug}-proposals.ics"`,
          'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        },
      });
    } catch (error) {
      // File doesn't exist, generate it on-the-fly
      const events = await getProposalEvents(roomSlug);

      if (events.length === 0) {
        // Return empty calendar
        const emptyIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Open Source Village//Proposals//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${roomSlug} Proposals
END:VCALENDAR`;

        return new NextResponse(emptyIcs, {
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': `inline; filename="${roomSlug}-proposals.ics"`,
            'Cache-Control': 'public, max-age=300',
          },
        });
      }

      // Generate and serve the ICS
      await generateIcsFile(roomSlug);
      const icsContent = await fs.readFile(icsPath, 'utf-8');

      return new NextResponse(icsContent, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `inline; filename="${roomSlug}-proposals.ics"`,
          'Cache-Control': 'public, max-age=300',
        },
      });
    }
  } catch (error) {
    console.error('[Proposals ICS] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate proposals calendar',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
