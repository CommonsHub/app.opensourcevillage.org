/**
 * API endpoint for cancelling an offer/workshop
 * POST /api/offers/[id]/cancel
 *
 * This endpoint:
 * 1. Updates the offer status to 'cancelled'
 * 2. Updates the calendar event status
 * 3. Publishes NOSTR events to refund the author and all RSVPs
 */

import { NextRequest, NextResponse } from 'next/server';
import { Offer, RSVP } from '@/types';
import { nip19, getPublicKey } from 'nostr-tools';
import { publishNostrEvent } from '@/lib/nostr-server';
import { createPaymentRequestEvent, CHAIN_IDS } from '@/lib/nostr-events';
import { addProposalEvent, getRoomSlug, generateIcsFile, getProposalEvent } from '@/lib/local-calendar';
import { getWalletAddressForNpub } from '@/lib/token-factory';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

// Get token info from environment variables
function getTokenInfo(): { address: string; symbol: string; chainId: number } | null {
  const address = process.env.TOKEN_ADDRESS;
  if (!address) return null;

  const chainName = process.env.CHAIN || 'gnosis';
  const chainId = CHAIN_IDS[chainName] || CHAIN_IDS.gnosis;

  return {
    address,
    symbol: process.env.TOKEN_SYMBOL || 'OSV',
    chainId,
  };
}

/**
 * POST - Cancel an offer and refund all participants
 * Body: { npub }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: offerId } = await params;
    const body = await request.json();
    const { npub } = body;

    // Validate required fields
    if (!npub) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: npub' },
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
        { success: false, error: 'Offer not found' },
        { status: 404 }
      );
    }

    // Check if already cancelled
    if (offer.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'Offer is already cancelled' },
        { status: 400 }
      );
    }

    // Authorization: Check if user is the original author
    const decoded = nip19.decode(npub) as unknown as { type: string; data: string };
    const userPubkey = decoded.data;

    if (offer.nostrAuthorPubkey && userPubkey && offer.nostrAuthorPubkey !== userPubkey) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: You can only cancel offers you created' },
        { status: 403 }
      );
    }

    // Also check the authors array for backward compatibility
    if (!offer.authors.includes(npub)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: You can only cancel offers you created' },
        { status: 403 }
      );
    }

    // Get RSVPs for this offer from the calendar event
    let attendees: Array<{ username: string; npub: string }> = [];
    if (offer.room && offer.startTime) {
      try {
        const roomSlug = getRoomSlug(offer.room);
        const calendarEvent = await getProposalEvent(roomSlug, offerId);
        if (calendarEvent?.attendees) {
          attendees = calendarEvent.attendees;
        }
      } catch (err) {
        console.error('[Cancel API] Failed to get calendar event:', err);
      }
    }

    // Update offer status to cancelled
    offer.status = 'cancelled';
    offer.updatedAt = new Date().toISOString();
    await fs.writeFile(offerPath, JSON.stringify(offer, null, 2));

    // Update calendar event status to CANCELLED
    if (offer.room && offer.startTime && offer.endTime) {
      try {
        const roomSlug = getRoomSlug(offer.room);
        await addProposalEvent(roomSlug, {
          offerId: offer.id,
          title: offer.title,
          description: offer.description,
          startTime: new Date(offer.startTime),
          endTime: new Date(offer.endTime),
          room: offer.room,
          status: 'CANCELLED',
          minRsvps: offer.minRsvps || 1,
          attendees: attendees,
          author: npub,
        });
        await generateIcsFile(roomSlug);
        console.log('[Cancel API] Updated calendar event to CANCELLED');
      } catch (err) {
        console.error('[Cancel API] Failed to update calendar event:', err);
      }
    }

    // Determine if refund is eligible
    // For private bookings: only refund if cancelling more than 1 hour before start time
    // For workshops: always refund
    const isPrivateBooking = offer.type === 'private';
    const startTime = offer.startTime ? new Date(offer.startTime) : null;
    const now = new Date();
    const hoursUntilStart = startTime ? (startTime.getTime() - now.getTime()) / (1000 * 60 * 60) : 0;
    const eligibleForRefund = isPrivateBooking ? hoursUntilStart > 1 : true;

    console.log('[Cancel API] Refund eligibility:', {
      isPrivateBooking,
      hoursUntilStart: hoursUntilStart.toFixed(2),
      eligibleForRefund,
    });

    // Publish refund NOSTR events
    // - Author refund: mint tokens (proposal creation cost) - only if eligible
    // - Attendee refunds: transfer from author back to attendees (RSVP tokens)
    const nsec = process.env.NOSTR_NSEC;
    const tokenInfo = getTokenInfo();

    if (nsec && tokenInfo && eligibleForRefund) {
      try {
        const { data: serverSecretKey } = nip19.decode(nsec);
        const serverPublicKey = getPublicKey(serverSecretKey as Uint8Array);
        const serverNpub = nip19.npubEncode(serverPublicKey);

        // Refund the author (proposal cost) via mint
        const authorRefundAmount = offer.publicationCost || 1;
        const authorWalletAddress = await getWalletAddressForNpub(npub);

        if (authorWalletAddress) {
          const refundDescription = isPrivateBooking
            ? `Refund ${authorRefundAmount} token${authorRefundAmount !== 1 ? 's' : ''} for cancelled booking: ${offer.title}`
            : `Refund ${authorRefundAmount} token${authorRefundAmount !== 1 ? 's' : ''} for cancelled workshop: ${offer.title}`;

          const authorRefundEvent = createPaymentRequestEvent(serverSecretKey as Uint8Array, {
            recipient: npub,
            recipientAddress: authorWalletAddress,
            sender: serverNpub,
            amount: authorRefundAmount,
            tokenAddress: tokenInfo.address,
            chainId: tokenInfo.chainId,
            tokenSymbol: tokenInfo.symbol,
            context: 'refund',
            method: 'mint',
            description: refundDescription,
          });

          publishNostrEvent(authorRefundEvent).then((result) => {
            console.log('[Cancel API] Published author refund (mint):', {
              eventId: authorRefundEvent.id,
              npub: npub.substring(0, 16) + '...',
              amount: authorRefundAmount,
              published: result.published.length,
            });
          }).catch((err) => {
            console.error('[Cancel API] Failed to publish author refund:', err);
          });
        }

        // Refund each attendee (1 token each for RSVP) via transfer from author
        // Only for non-private bookings (private bookings don't have RSVPs)
        if (!isPrivateBooking) {
          for (const attendee of attendees) {
            try {
              const attendeeWalletAddress = await getWalletAddressForNpub(attendee.npub);
              if (attendeeWalletAddress) {
                const attendeeRefundEvent = createPaymentRequestEvent(serverSecretKey as Uint8Array, {
                  recipient: attendee.npub,
                  recipientAddress: attendeeWalletAddress,
                  sender: npub, // Author is the sender (returning RSVP tokens)
                  amount: 1,
                  tokenAddress: tokenInfo.address,
                  chainId: tokenInfo.chainId,
                  tokenSymbol: tokenInfo.symbol,
                  context: 'refund',
                  method: 'transfer',
                  description: `Refund 1 token for cancelled workshop RSVP: ${offer.title}`,
                });

                publishNostrEvent(attendeeRefundEvent).then((result) => {
                  console.log('[Cancel API] Published attendee refund (transfer from author):', {
                    eventId: attendeeRefundEvent.id,
                    attendee: attendee.npub.substring(0, 16) + '...',
                    published: result.published.length,
                  });
                }).catch((err) => {
                  console.error('[Cancel API] Failed to publish attendee refund:', err);
                });
              }
            } catch (err) {
              console.error('[Cancel API] Failed to refund attendee:', attendee.npub, err);
            }
          }
        }

        console.log('[Cancel API] Refund events published:', {
          authorRefund: authorRefundAmount,
          attendeeRefunds: isPrivateBooking ? 0 : attendees.length,
        });
      } catch (err) {
        console.error('[Cancel API] Failed to create refund events:', err);
      }
    } else if (!eligibleForRefund) {
      console.log('[Cancel API] Skipping refund - private booking cancelled less than 1 hour before start');
    } else {
      console.log('[Cancel API] Skipping refunds - NOSTR_NSEC or token not configured');
    }

    // Update user's profile to mark the offer as cancelled
    const profile = await findProfileByNpub(npub);
    if (profile) {
      try {
        const profilePath = path.join(DATA_DIR, 'badges', profile.serialNumber, 'profile.json');
        const profileData = JSON.parse(await fs.readFile(profilePath, 'utf-8'));
        const offerIndex = profileData.offers?.findIndex((o: Offer) => o.id === offerId);

        if (offerIndex !== undefined && offerIndex !== -1) {
          profileData.offers[offerIndex].status = 'cancelled';
          await fs.writeFile(profilePath, JSON.stringify(profileData, null, 2));
        }
      } catch (err) {
        console.error('[Cancel API] Failed to update profile:', err);
      }
    }

    return NextResponse.json({
      success: true,
      message: isPrivateBooking ? 'Booking cancelled successfully' : 'Event cancelled successfully',
      refunds: eligibleForRefund ? {
        author: offer.publicationCost || 1,
        attendees: isPrivateBooking ? 0 : attendees.length,
      } : null,
    });

  } catch (error) {
    console.error('[Cancel API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
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
