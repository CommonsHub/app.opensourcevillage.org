/**
 * API endpoint for RSVPs
 * POST /api/rsvp - RSVP to a workshop/offer
 * DELETE /api/rsvp - Cancel an RSVP
 *
 * For workshop proposals:
 * - RSVPs add attendees to the local calendar
 * - When threshold (minRsvps) is reached, offer status changes to 'confirmed'
 * - ICS file is regenerated for Google Calendar sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProfileByNpub, addToBlockchainQueue } from '@/lib/storage';
import { CreateRSVPRequest, CreateRSVPResponse, RSVP } from '@/types';
import {
  addAttendee,
  removeAttendee,
  updateEventStatus,
  generateIcsFile,
  getRoomSlug,
  getProposalEvent,
} from '@/lib/local-calendar';
import { getTokenInfo, getChain } from '@/lib/token-factory';
import { Token } from '@opencollective/token-factory';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

/**
 * Get user's on-chain token balance
 */
async function getOnChainBalance(npub: string): Promise<number> {
  const tokenInfo = await getTokenInfo();
  if (!tokenInfo) {
    throw new Error('Token not configured');
  }

  const chain = getChain();
  const token = new Token({
    name: tokenInfo.name,
    symbol: tokenInfo.symbol,
    chain,
    tokenAddress: tokenInfo.address as `0x${string}`,
    deployerPrivateKey: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const balance = await token.getBalance(`nostr:${npub}`);
  return Number(balance) / 1e6; // 6 decimals
}

/**
 * POST - RSVP to an offer/workshop
 * Body: { offerId, npub }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { offerId, npub } = body;

    // Validate required fields
    if (!offerId || !npub) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: offerId, npub',
        } as CreateRSVPResponse,
        { status: 400 }
      );
    }

    // Get user profile
    const profile = await getProfileByNpub(npub);
    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          error: 'Profile not found',
        } as CreateRSVPResponse,
        { status: 404 }
      );
    }

    // Get on-chain balance
    const userBalance = await getOnChainBalance(npub);

    // Check if user has enough tokens (need 1 token to RSVP)
    if (userBalance < 1) {
      return NextResponse.json(
        {
          success: false,
          error: 'Insufficient balance. You need at least 1 token to RSVP.',
        } as CreateRSVPResponse,
        { status: 400 }
      );
    }

    // Load the offer
    const offerPath = path.join(DATA_DIR, 'offers', `${offerId}.json`);
    let offerContent;
    try {
      offerContent = await fs.readFile(offerPath, 'utf-8');
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: 'Offer not found',
        } as CreateRSVPResponse,
        { status: 404 }
      );
    }

    const offer = JSON.parse(offerContent);

    // Only cancelled offers cannot receive RSVPs
    // Pending/tentative offers CAN receive RSVPs - they become confirmed once threshold is reached
    if (offer.status === 'cancelled') {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot RSVP to a cancelled offer.',
        } as CreateRSVPResponse,
        { status: 400 }
      );
    }

    // Cannot RSVP to an event that has already started
    if (offer.startTime && new Date(offer.startTime) <= new Date()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot RSVP to an event that has already started.',
        } as CreateRSVPResponse,
        { status: 400 }
      );
    }

    // Check if user already has an active RSVP
    const existingRSVP = profile.rsvps.find(
      (r) => r.offerId === offerId && r.status === 'active'
    );
    if (existingRSVP) {
      return NextResponse.json(
        {
          success: false,
          error: 'You have already RSVPed to this offer',
        } as CreateRSVPResponse,
        { status: 400 }
      );
    }

    // Check if user is the author
    if (offer.authors.includes(npub)) {
      return NextResponse.json(
        {
          success: false,
          error: 'You cannot RSVP to your own offer',
        } as CreateRSVPResponse,
        { status: 400 }
      );
    }

    // Check max attendees
    if (offer.maxAttendees) {
      const currentRsvpCount = offer.rsvpCount || 0;
      if (currentRsvpCount >= offer.maxAttendees) {
        return NextResponse.json(
          {
            success: false,
            error: 'This workshop is full.',
          } as CreateRSVPResponse,
          { status: 400 }
        );
      }
    }

    // Create RSVP
    const now = new Date().toISOString();
    const rsvp: RSVP = {
      offerId,
      npub,
      createdAt: now,
      status: 'active',
      tokensPaid: 1,
    };

    // Add RSVP to user's profile
    profile.rsvps.push(rsvp);

    // Update user's balance (deduct 1 token)
    profile.balance.confirmed -= 1;
    profile.balance.total -= 1;

    // Save updated profile
    const profilePath = path.join(
      DATA_DIR,
      'badges',
      profile.serialNumber,
      'profile.json'
    );
    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));

    // Queue blockchain transaction (transfer 1 token to offer author)
    await addToBlockchainQueue(profile.serialNumber, {
      type: 'transfer',
      from: npub,
      to: offer.authors[0], // Primary author gets the token
      amount: 1,
    });

    // Load RSVPs file for this offer
    const rsvpsDir = path.join(DATA_DIR, 'rsvps');
    await fs.mkdir(rsvpsDir, { recursive: true });

    const rsvpsPath = path.join(rsvpsDir, `${offerId}.jsonl`);
    const rsvpLine = JSON.stringify(rsvp) + '\n';
    await fs.appendFile(rsvpsPath, rsvpLine);

    // Count total active RSVPs
    const rsvpsContent = await fs.readFile(rsvpsPath, 'utf-8');
    const allRSVPs = rsvpsContent
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));

    // Get latest status for each user
    const rsvpsByUser = new Map<string, typeof rsvp>();
    for (const r of allRSVPs) {
      rsvpsByUser.set(r.npub, r);
    }
    const activeRSVPs = Array.from(rsvpsByUser.values()).filter(
      (r) => r.status === 'active'
    );

    // Update rsvpCount in offer
    offer.rsvpCount = activeRSVPs.length;
    offer.updatedAt = now;

    // Track if status changed to confirmed
    let statusChanged = false;

    // Check threshold for workshop proposals
    // Status changes: pending/tentative → confirmed when threshold is reached
    const minRsvps = offer.minRsvps || offer.minAttendees || 5;
    if (activeRSVPs.length >= minRsvps && (offer.status === 'tentative' || offer.status === 'pending')) {
      offer.status = 'confirmed';
      statusChanged = true;
      console.log(`[RSVP API] Offer ${offerId} confirmed - threshold reached (${activeRSVPs.length}/${minRsvps})`);
    }

    // Save updated offer
    await fs.writeFile(offerPath, JSON.stringify(offer, null, 2));

    // Update local calendar if offer has a room
    if (offer.room) {
      const roomSlug = getRoomSlug(offer.room);

      // Add attendee to local calendar
      await addAttendee(roomSlug, offerId, profile.profile.username || profile.username, npub);

      // Update event status if it changed
      if (statusChanged) {
        await updateEventStatus(roomSlug, offerId, 'CONFIRMED');
      }

      // Regenerate ICS file
      await generateIcsFile(roomSlug);

      console.log(`[RSVP API] Updated local calendar for ${offer.room}`);
    }

    return NextResponse.json({
      success: true,
      rsvp,
      rsvpCount: activeRSVPs.length,
      statusChanged,
      offerStatus: offer.status,
    } as CreateRSVPResponse & {
      rsvpCount: number;
      statusChanged: boolean;
      offerStatus: string;
    });

  } catch (error) {
    console.error('RSVP error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      } as CreateRSVPResponse,
      { status: 500 }
    );
  }
}

/**
 * DELETE - Cancel an RSVP
 * Body: { offerId, npub }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { offerId, npub } = body;

    if (!offerId || !npub) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: offerId, npub' },
        { status: 400 }
      );
    }

    // Get user profile
    const profile = await getProfileByNpub(npub);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Find the active RSVP
    const rsvpIndex = profile.rsvps.findIndex(
      (r) => r.offerId === offerId && r.status === 'active'
    );

    if (rsvpIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'No active RSVP found for this offer' },
        { status: 404 }
      );
    }

    // Load the offer to check if event has started
    const offerPath = path.join(DATA_DIR, 'offers', `${offerId}.json`);
    let offer;
    try {
      const offerContent = await fs.readFile(offerPath, 'utf-8');
      offer = JSON.parse(offerContent);

      // Cannot cancel RSVP for an event that has already started
      if (offer.startTime && new Date(offer.startTime) <= new Date()) {
        return NextResponse.json(
          { success: false, error: 'Cannot cancel RSVP for an event that has already started.' },
          { status: 400 }
        );
      }
    } catch {
      // Offer doesn't exist, allow cancellation anyway
    }

    // Cancel the RSVP
    profile.rsvps[rsvpIndex].status = 'cancelled';

    // Refund 1 token
    profile.balance.confirmed += 1;
    profile.balance.total += 1;

    // Save updated profile
    const profilePath = path.join(
      DATA_DIR,
      'badges',
      profile.serialNumber,
      'profile.json'
    );
    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));

    // Update RSVP in the JSONL file
    const rsvpsPath = path.join(DATA_DIR, 'rsvps', `${offerId}.jsonl`);
    const cancelledRSVP = { ...profile.rsvps[rsvpIndex] };
    const rsvpLine = JSON.stringify(cancelledRSVP) + '\n';
    await fs.appendFile(rsvpsPath, rsvpLine);

    // Queue blockchain transaction (refund)
    await addToBlockchainQueue(profile.serialNumber, {
      type: 'transfer',
      from: 'system', // System refund
      to: npub,
      amount: 1,
    });

    // If offer wasn't loaded earlier, just return success
    if (!offer) {
      return NextResponse.json({
        success: true,
        message: 'RSVP cancelled and token refunded',
      });
    }

    // Count active RSVPs
    const rsvpsContent = await fs.readFile(rsvpsPath, 'utf-8');
    const allRSVPs = rsvpsContent
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));

    const rsvpsByUser = new Map();
    for (const r of allRSVPs) {
      rsvpsByUser.set(r.npub, r);
    }
    const activeRSVPs = Array.from(rsvpsByUser.values()).filter(
      (r: any) => r.status === 'active'
    );

    // Update rsvpCount
    offer.rsvpCount = activeRSVPs.length;
    offer.updatedAt = new Date().toISOString();
    await fs.writeFile(offerPath, JSON.stringify(offer, null, 2));

    // Update local calendar if offer has a room
    if (offer.room) {
      const roomSlug = getRoomSlug(offer.room);

      // Remove attendee from local calendar
      await removeAttendee(roomSlug, offerId, npub);

      // Regenerate ICS file
      await generateIcsFile(roomSlug);

      console.log(`[RSVP API] Updated local calendar for ${offer.room} after cancellation`);
    }

    return NextResponse.json({
      success: true,
      message: 'RSVP cancelled and token refunded',
      rsvpCount: activeRSVPs.length,
    });

  } catch (error) {
    console.error('RSVP cancellation error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET - Get RSVPs for an offer
 * Query: ?offerId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const offerId = searchParams.get('offerId');

    if (!offerId) {
      return NextResponse.json(
        { success: false, error: 'Missing offerId parameter' },
        { status: 400 }
      );
    }

    const rsvpsPath = path.join(DATA_DIR, 'rsvps', `${offerId}.jsonl`);

    try {
      const rsvpsContent = await fs.readFile(rsvpsPath, 'utf-8');
      const allRSVPs = rsvpsContent
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));

      // Get only the latest status for each user
      const rsvpsByUser = new Map<string, RSVP>();
      for (const rsvp of allRSVPs) {
        rsvpsByUser.set(rsvp.npub, rsvp);
      }

      const activeRSVPs = Array.from(rsvpsByUser.values()).filter(
        (r) => r.status === 'active'
      );

      // Load offer to get minRsvps for threshold info
      let offerInfo = null;
      try {
        const offerPath = path.join(DATA_DIR, 'offers', `${offerId}.json`);
        const offerContent = await fs.readFile(offerPath, 'utf-8');
        const offer = JSON.parse(offerContent);
        offerInfo = {
          minRsvps: offer.minRsvps || offer.minAttendees || 5,
          status: offer.status,
          rsvpCount: offer.rsvpCount || activeRSVPs.length,
        };
      } catch {
        // Offer not found, just return RSVPs
      }

      return NextResponse.json({
        success: true,
        rsvps: activeRSVPs,
        count: activeRSVPs.length,
        offer: offerInfo,
      });
    } catch (error) {
      // File doesn't exist, no RSVPs yet
      return NextResponse.json({
        success: true,
        rsvps: [],
        count: 0,
      });
    }

  } catch (error) {
    console.error('Get RSVPs error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
