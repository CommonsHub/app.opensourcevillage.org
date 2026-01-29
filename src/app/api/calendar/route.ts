/**
 * GET /api/calendar - Fetch calendar events from all rooms or specific rooms
 *
 * Returns merged events from:
 * - Official events from Google Calendar
 * - Community proposal events from local calendar
 *
 * Query Parameters:
 * - rooms: Comma-separated list of room names (optional, defaults to all rooms)
 * - from: ISO date string for start of range (optional, defaults to now)
 * - to: ISO date string for end of range (optional, defaults to 7 days from now)
 * - refresh: Set to "true" to force refresh from Google Calendar (skip cache)
 * - includeProposals: Set to "false" to exclude community proposals (default: true)
 *
 * Example: /api/calendar?rooms=Ostrom Room,Satoshi Room&from=2026-01-26T00:00:00Z
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchAllRoomEvents, ROOMS, getCacheMetadata } from '@/lib/google-calendar';
import { getAllProposalEvents, getProposalEvents, getRoomSlug } from '@/lib/local-calendar';
import type { CalendarEvent, Offer } from '@/types';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

// Load offer details by offerId
async function getOfferDetails(offerId: string): Promise<{ tags: string[]; type: string }> {
  try {
    const offerPath = path.join(DATA_DIR, 'offers', `${offerId}.json`);
    const content = await fs.readFile(offerPath, 'utf-8');
    const offer: Offer = JSON.parse(content);
    return {
      tags: offer.tags || [],
      type: offer.type || 'workshop',
    };
  } catch {
    return { tags: [], type: 'workshop' };
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const roomsParam = searchParams.get('rooms');
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const refreshParam = searchParams.get('refresh');
    const includeProposalsParam = searchParams.get('includeProposals');

    // Parse room names
    const roomNames = roomsParam
      ? roomsParam.split(',').map(r => r.trim())
      : undefined;

    // Validate room names
    if (roomNames) {
      const validRoomNames = ROOMS.map(r => r.name);
      const invalidRooms = roomNames.filter(name => !validRoomNames.includes(name));

      if (invalidRooms.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid room names: ${invalidRooms.join(', ')}`,
            validRooms: validRoomNames
          },
          { status: 400 }
        );
      }
    }

    // Parse date range (default to now -> 7 days from now)
    const timeMin = fromParam ? new Date(fromParam) : new Date();
    const timeMax = toParam
      ? new Date(toParam)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Validate dates
    if (isNaN(timeMin.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid "from" date format' },
        { status: 400 }
      );
    }

    if (isNaN(timeMax.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid "to" date format' },
        { status: 400 }
      );
    }

    if (timeMax <= timeMin) {
      return NextResponse.json(
        { success: false, error: '"to" date must be after "from" date' },
        { status: 400 }
      );
    }

    // Check if force refresh is requested
    const forceRefresh = refreshParam === 'true';
    const includeProposals = includeProposalsParam !== 'false';

    // Fetch official events (from cache or Google)
    const officialEvents = await fetchAllRoomEvents(roomNames, timeMin, timeMax, forceRefresh);

    // Mark official events - convert from google-calendar format to API format
    // Include room in ID to differentiate same event across multiple room calendars
    const markedOfficialEvents: (CalendarEvent & { isProposal?: boolean; proposalStatus?: string })[] =
      officialEvents.map((e) => ({
        id: `${e.room || 'unknown'}-${e.id}`,
        title: e.title,
        description: e.description,
        startTime: e.startTime instanceof Date ? e.startTime.toISOString() : e.startTime,
        endTime: e.endTime instanceof Date ? e.endTime.toISOString() : e.endTime,
        room: e.room || '',
        tags: [],
        isOfficial: true,
        isProposal: false,
      }));

    // Fetch community proposals
    let proposalEvents: (CalendarEvent & { isProposal?: boolean; proposalStatus?: string; minRsvps?: number; rsvpCount?: number })[] = [];

    if (includeProposals) {
      try {
        let allProposals;

        if (roomNames) {
          // Get proposals for specific rooms
          const roomSlugs = roomNames.map((name) => getRoomSlug(name));
          const proposalPromises = roomSlugs.map((slug) => getProposalEvents(slug));
          const proposalResults = await Promise.all(proposalPromises);
          allProposals = proposalResults.flat();
        } else {
          // Get proposals for all rooms
          allProposals = await getAllProposalEvents();
        }

        console.log('[Calendar API] Found', allProposals.length, 'proposals from local calendar');

        // Filter by date range
        const filteredProposals = allProposals
          .filter((p) => {
            const startTime = new Date(p.startTime);
            const endTime = new Date(p.endTime);
            // Event overlaps with requested range
            const inRange = startTime < timeMax && endTime > timeMin;
            if (!inRange) {
              console.log('[Calendar API] Filtered out proposal (out of range):', p.offerId, p.title, p.startTime);
            }
            return inRange;
          })
          .filter((p) => {
            if (p.status === 'CANCELLED') {
              console.log('[Calendar API] Filtered out proposal (cancelled):', p.offerId);
              return false;
            }
            return true;
          });

        console.log('[Calendar API]', filteredProposals.length, 'proposals after filtering');
        if (filteredProposals.length > 0) {
          console.log('[Calendar API] Proposal rooms:', filteredProposals.map(p => p.room));
        }

        // Load offer details for each proposal and convert to CalendarEvent format
        proposalEvents = await Promise.all(
          filteredProposals.map(async (p) => {
            const { tags, type } = await getOfferDetails(p.offerId);
            return {
              id: `proposal-${p.offerId}`,
              title: p.title,
              description: p.description,
              startTime: p.startTime.toISOString(),
              endTime: p.endTime.toISOString(),
              room: p.room,
              tags,
              isOfficial: false,
              isProposal: true,
              proposalStatus: p.status.toLowerCase(),
              offerId: p.offerId,
              offerType: type,
              minRsvps: p.minRsvps,
              rsvpCount: p.attendees.length,
              rsvpList: p.attendees.map((a) => ({ username: a.username, npub: a.npub })),
              author: p.author,
              authorUsername: p.authorUsername,
            };
          })
        );
      } catch (error) {
        console.warn('[Calendar API] Error fetching proposals:', error);
        // Don't fail the whole request, just skip proposals
      }
    }

    // Merge and sort by start time
    const allEvents = [...markedOfficialEvents, ...proposalEvents].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    // Get cache metadata
    const cacheMetadata = getCacheMetadata();

    return NextResponse.json({
      success: true,
      events: allEvents,
      meta: {
        count: allEvents.length,
        officialCount: markedOfficialEvents.length,
        proposalCount: proposalEvents.length,
        from: timeMin.toISOString(),
        to: timeMax.toISOString(),
        rooms: roomNames || ROOMS.map(r => r.name),
        cached: !forceRefresh && cacheMetadata !== null,
        lastRefresh: cacheMetadata?.lastRefresh || null,
        includesProposals: includeProposals,
      }
    });
  } catch (error) {
    console.error('Error fetching calendar events:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch calendar events',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
