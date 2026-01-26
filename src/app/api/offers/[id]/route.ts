/**
 * API endpoint for updating specific offers
 * PUT /api/offers/[id] - Update existing offer
 */

import { NextRequest, NextResponse } from 'next/server';
import { Offer } from '@/types';
import { nip19, verifyEvent } from 'nostr-tools';
import { publishNostrEvent } from '@/lib/nostr-publisher';
import { addProposalEvent, getRoomSlug, generateIcsFile, getProposalEvent } from '@/lib/local-calendar';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

/**
 * PUT - Update an existing offer
 * Body: { title, description, tags, startTime, endTime, room, maxAttendees, nostrEvent, npub }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: offerId } = await params;
    const body = await request.json();
    const {
      title,
      description,
      tags,
      startTime,
      endTime,
      room,
      maxAttendees,
      nostrEvent, // Signed kind 31922 event from client
      npub,
    } = body;

    // Validate required fields
    if (!npub) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: npub',
        },
        { status: 400 }
      );
    }

    // Load existing offer
    const offerPath = path.join(DATA_DIR, 'offers', `${offerId}.json`);
    let offer: Offer;

    try {
      const content = await fs.readFile(offerPath, 'utf-8');
      offer = JSON.parse(content);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Offer not found',
        },
        { status: 404 }
      );
    }

    // Authorization: Check if user is the original author
    // Note: npub always decodes to type 'npub' and data is the pubkey string
    const decoded = nip19.decode(npub) as unknown as { type: string; data: string };
    const userPubkey = decoded.data;

    if (offer.nostrAuthorPubkey && userPubkey && offer.nostrAuthorPubkey !== userPubkey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: You can only edit offers you created',
        },
        { status: 403 }
      );
    }

    // Also check the authors array for backward compatibility
    if (!offer.authors.includes(npub)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: You can only edit offers you created',
        },
        { status: 403 }
      );
    }

    // If NOSTR event is provided, validate it
    if (nostrEvent) {
      // Verify event signature
      const isValid = verifyEvent(nostrEvent);
      if (!isValid) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid NOSTR event signature',
          },
          { status: 400 }
        );
      }

      // Verify event kind is 31922 (calendar event)
      if (nostrEvent.kind !== 31922) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid event kind. Must be 31922 (calendar event)',
          },
          { status: 400 }
        );
      }

      // Verify event is signed by the same author
      if (nostrEvent.pubkey !== userPubkey) {
        return NextResponse.json(
          {
            success: false,
            error: 'Event must be signed by the offer author',
          },
          { status: 403 }
        );
      }

      // Verify d-tag matches (for replaceability)
      const dTag = nostrEvent.tags.find(t => t[0] === 'd')?.[1];
      if (offer.nostrDTag && dTag !== offer.nostrDTag) {
        return NextResponse.json(
          {
            success: false,
            error: 'Event d-tag must match the original offer d-tag',
          },
          { status: 400 }
        );
      }

      // Update NOSTR event ID (new event ID for the updated event)
      offer.nostrEventId = nostrEvent.id;

      // Publish the updated event to NOSTR relays (async)
      publishNostrEvent(nostrEvent).catch((err) => {
        console.error('[Offer API] Failed to publish updated calendar event:', err);
      });

      console.log('[Offer API] Updated NIP-52 calendar event:', {
        offerId,
        eventId: nostrEvent.id,
        dTag: offer.nostrDTag,
      });
    }

    // Update offer fields
    if (title !== undefined) offer.title = title.trim();
    if (description !== undefined) offer.description = description.trim();
    if (tags !== undefined) offer.tags = tags.map((t: string) => t.trim().toLowerCase());
    if (startTime !== undefined) offer.startTime = startTime;
    if (endTime !== undefined) offer.endTime = endTime;
    if (room !== undefined) offer.room = room;
    if (maxAttendees !== undefined) offer.maxAttendees = maxAttendees;

    offer.updatedAt = new Date().toISOString();

    // Save updated offer
    await fs.writeFile(offerPath, JSON.stringify(offer, null, 2));

    // Update calendar event if this is a workshop with room/time
    if (offer.room && offer.startTime && offer.endTime) {
      try {
        const roomSlug = getRoomSlug(offer.room);

        // Get existing calendar event to preserve attendees
        const existingCalendarEvent = await getProposalEvent(roomSlug, offer.id);
        const existingAttendees = existingCalendarEvent?.attendees || [];

        // Get author username from profile
        const profile = await findProfileByNpub(npub);
        let authorUsername = existingCalendarEvent?.authorUsername || '';
        if (profile && !authorUsername) {
          const profilePath = path.join(DATA_DIR, 'badges', profile.serialNumber, 'profile.json');
          try {
            const profileData = JSON.parse(await fs.readFile(profilePath, 'utf-8'));
            authorUsername = profileData.username || '';
          } catch {
            // Ignore
          }
        }

        // Map offer status to calendar status
        const calendarStatus = offer.status === 'cancelled'
          ? 'CANCELLED'
          : offer.status === 'confirmed'
          ? 'CONFIRMED'
          : 'TENTATIVE';

        await addProposalEvent(roomSlug, {
          offerId: offer.id,
          title: offer.title,
          description: offer.description,
          startTime: new Date(offer.startTime),
          endTime: new Date(offer.endTime),
          room: offer.room,
          status: calendarStatus,
          minRsvps: offer.minRsvps || 1,
          attendees: existingAttendees, // Preserve existing attendees
          authorNpub: npub,
          authorUsername,
        });

        // Regenerate ICS file
        await generateIcsFile(roomSlug);
        console.log('[Offer API] Updated calendar event for:', offer.id);
      } catch (calError) {
        console.error('[Offer API] Failed to update calendar event:', calError);
        // Don't fail the whole request, calendar update is secondary
      }
    }

    // Also update in user's profile
    // Note: This assumes profile structure - may need adjustment based on actual storage
    const profile = await findProfileByNpub(npub);
    if (profile) {
      const profilePath = path.join(
        DATA_DIR,
        'badges',
        profile.serialNumber,
        'profile.json'
      );

      const profileData = JSON.parse(await fs.readFile(profilePath, 'utf-8'));
      const offerIndex = profileData.offers.findIndex((o: Offer) => o.id === offerId);

      if (offerIndex !== -1) {
        profileData.offers[offerIndex] = offer;
        await fs.writeFile(profilePath, JSON.stringify(profileData, null, 2));
      }
    }

    return NextResponse.json({
      success: true,
      offer,
    });

  } catch (error) {
    console.error('Offer update error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * Helper to find profile by npub
 */
async function findProfileByNpub(npub: string): Promise<{ serialNumber: string } | null> {
  try {
    const badgesDir = path.join(DATA_DIR, 'badges');
    const badges = await fs.readdir(badgesDir);

    for (const serialNumber of badges) {
      const profilePath = path.join(badgesDir, serialNumber, 'profile.json');
      try {
        const content = await fs.readFile(profilePath, 'utf-8');
        const profile = JSON.parse(content);

        if (profile.npub === npub) {
          return { serialNumber };
        }
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}
