/**
 * API endpoint for creating offers/workshops
 * POST /api/offers - Create new offer/workshop
 *
 * For workshop proposals:
 * 1. Validates fields including minRsvps (minimum 2)
 * 2. Checks conflicts via local calendar and Google Calendar
 * 3. Creates offer with status: 'pending'
 * 4. Returns pendingBurn: true to indicate client should create burn payment request
 */

import { NextRequest, NextResponse } from "next/server";
import { getProfileByNpub, addToBlockchainQueue } from "@/lib/storage";
import { CreateOfferRequest, CreateOfferResponse, Offer } from "@/types";
import { publishNostrEvent } from "@/lib/nostr-server";
import {
  checkConflicts,
  getRoomSlug,
  addProposalEvent,
  generateIcsFile,
  type ProposalEvent,
} from "@/lib/local-calendar";
import { fetchAllRoomEvents, ROOMS } from "@/lib/google-calendar";
import { getTokenInfo, getChain } from "@/lib/token-factory";
import { Token } from "@opencollective/token-factory";
import { nip19, verifyEvent } from "nostr-tools";
import fs from "fs/promises";
import path from "path";

// Use function to get DATA_DIR at runtime (for testing)
function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), "data");
}

/**
 * Get user's on-chain token balance
 */
async function getOnChainBalance(npub: string): Promise<number> {
  const tokenInfo = await getTokenInfo();
  if (!tokenInfo) {
    throw new Error("Token not configured");
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

// Load settings for token economics, defaults, and rooms
async function loadSettings(): Promise<{
  tokenEconomics: {
    proposalBurnCost: number;
  };
  defaults: {
    workshops: {
      attendees: {
        min: number;
        max: number;
      };
    };
  };
  rooms: Array<{
    name: string;
    slug?: string;
    hourlyCost?: number;
  }>;
}> {
  try {
    const settingsPath = path.join(process.cwd(), "settings.json");
    const content = await fs.readFile(settingsPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      tokenEconomics: {
        proposalBurnCost: 1,
      },
      defaults: {
        workshops: {
          attendees: {
            min: 3,
            max: 10,
          },
        },
      },
      rooms: [],
    };
  }
}

/**
 * Calculate the cost to book a room based on hourly rate and duration
 */
function calculateRoomCost(
  roomName: string,
  startTime: string,
  endTime: string,
  rooms: Array<{ name: string; hourlyCost?: number }>,
): number {
  const room = rooms.find((r) => r.name === roomName);
  const hourlyCost = room?.hourlyCost || 1;

  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

  return Math.ceil(hourlyCost * durationHours);
}

/**
 * Check if two time ranges overlap
 */
function timesOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date,
): boolean {
  return start1 < end2 && end1 > start2;
}

interface ConflictInfo {
  type: "confirmed" | "tentative";
  title: string;
  startTime: string;
  endTime: string;
}

/**
 * Check for conflicts in a room
 */
async function checkAllConflicts(
  room: string,
  startTime: Date,
  endTime: Date,
): Promise<{ confirmed: ConflictInfo[]; tentative: ConflictInfo[] }> {
  const confirmed: ConflictInfo[] = [];
  const tentative: ConflictInfo[] = [];

  // Get room slug
  const roomSlug = getRoomSlug(room);
  const matchingRoom = ROOMS.find(
    (r) => r.name === room || getRoomSlug(r.name) === room,
  );

  // Check proposal calendar
  try {
    const proposalConflicts = await checkConflicts(
      roomSlug,
      startTime,
      endTime,
    );

    for (const event of proposalConflicts.confirmed) {
      confirmed.push({
        type: "confirmed",
        title: event.title,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
      });
    }

    for (const event of proposalConflicts.tentative) {
      tentative.push({
        type: "tentative",
        title: event.title,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
      });
    }
  } catch (error) {
    console.warn("[Offer API] Error checking proposal conflicts:", error);
  }

  // Check Google Calendar
  if (matchingRoom) {
    try {
      const googleEvents = await fetchAllRoomEvents(
        [matchingRoom.name],
        startTime,
        endTime,
        false,
      );

      for (const event of googleEvents) {
        const eventStart = new Date(event.startTime);
        const eventEnd = new Date(event.endTime);

        if (timesOverlap(startTime, endTime, eventStart, eventEnd)) {
          confirmed.push({
            type: "confirmed",
            title: event.title,
            startTime: eventStart.toISOString(),
            endTime: eventEnd.toISOString(),
          });
        }
      }
    } catch (error) {
      console.warn("[Offer API] Error fetching Google Calendar:", error);
    }
  }

  return { confirmed, tentative };
}

/**
 * POST - Create a new offer/workshop
 * Body: { type, title, description, tags, startTime, endTime, room, maxAttendees, minRsvps, npub, nostrEvent (optional) }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const settings = await loadSettings();
    const {
      type,
      title,
      description,
      tags = [],
      startTime,
      endTime,
      room,
      maxAttendees = settings.defaults.workshops.attendees.max,
      minRsvps = settings.defaults.workshops.attendees.min,
      npub,
      nostrEvent, // Optional: signed kind 31922 calendar event from client
    } = body;

    // Validate required fields
    if (!type || !title || !description || !npub) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: type, title, description, npub",
        } as CreateOfferResponse,
        { status: 400 },
      );
    }

    // Validate type
    if (!["workshop", "1:1", "other", "private"].includes(type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid type. Must be: workshop, 1:1, other, or private",
        } as CreateOfferResponse,
        { status: 400 },
      );
    }

    // Validate minRsvps for workshops (must be >= 2)
    if (
      type === "workshop" &&
      minRsvps < settings.defaults.workshops.attendees.min
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Minimum RSVPs must be at least ${settings.defaults.workshops.attendees.min} for workshop proposals`,
        } as CreateOfferResponse,
        { status: 400 },
      );
    }

    // Get profile to verify user exists and has tokens
    const profile = await getProfileByNpub(npub);
    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          error: "Profile not found",
        } as CreateOfferResponse,
        { status: 404 },
      );
    }

    // Calculate the cost based on room and duration
    let requiredCost = 1; // Default cost
    if (room && startTime && endTime) {
      requiredCost = calculateRoomCost(
        room,
        startTime,
        endTime,
        settings.rooms,
      );
    }

    // Get on-chain balance
    const userBalance = await getOnChainBalance(npub);

    // Check if user has enough tokens
    if (userBalance < requiredCost) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient balance. You need at least ${requiredCost} token${requiredCost !== 1 ? "s" : ""} to book this room.`,
        } as CreateOfferResponse,
        { status: 400 },
      );
    }

    // Check for conflicts if this is a scheduled workshop
    let conflictWarning: string | undefined;
    if (
      (type === "workshop" || type === "1:1") &&
      room &&
      startTime &&
      endTime
    ) {
      const conflicts = await checkAllConflicts(
        room,
        new Date(startTime),
        new Date(endTime),
      );

      // Block if there's a confirmed conflict
      if (conflicts.confirmed.length > 0) {
        const conflictInfo = conflicts.confirmed[0];
        return NextResponse.json(
          {
            success: false,
            error: `Time slot conflict: "${conflictInfo.title}" is already scheduled from ${new Date(conflictInfo.startTime).toLocaleTimeString()} to ${new Date(conflictInfo.endTime).toLocaleTimeString()}`,
          } as CreateOfferResponse,
          { status: 409 },
        );
      }

      // Warn about tentative conflicts
      if (conflicts.tentative.length > 0) {
        conflictWarning = `Note: There ${conflicts.tentative.length === 1 ? "is" : "are"} ${conflicts.tentative.length} tentative proposal(s) for overlapping time slots.`;
      }
    }

    // Create offer object
    const offerId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const offer: Offer = {
      id: offerId,
      type,
      title: title.trim(),
      description: description.trim(),
      authors: [npub],
      tags: tags.map((t: string) => t.trim().toLowerCase()),
      createdAt: now,
      updatedAt: now,
      status: "pending", // Will change to 'tentative' after burn confirmed
      publicationCost: requiredCost, // Cost to publish/create (will be burned)
      rewardPerAttendee: 1, // Reward per RSVP
      minRsvps: type === "workshop" ? minRsvps : type === "1:1" ? 1 : undefined,
      rsvpCount: 0,
    };

    // Add workshop-specific fields if applicable
    if (type === "workshop" || type === "1:1") {
      if (startTime) offer.startTime = startTime;
      if (endTime) offer.endTime = endTime;
      if (room) offer.room = room;
      if (maxAttendees) offer.maxAttendees = maxAttendees;
      offer.minAttendees = type === "1:1" ? 1 : minRsvps;
    }

    // Handle NIP-52 calendar event if provided
    if (nostrEvent) {
      try {
        // Verify event signature
        const isValid = verifyEvent(nostrEvent);
        if (!isValid) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid NOSTR event signature",
            } as CreateOfferResponse,
            { status: 400 },
          );
        }

        // Verify event kind is 31922 (calendar event)
        if (nostrEvent.kind !== 31922) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid event kind. Must be 31922 (calendar event)",
            } as CreateOfferResponse,
            { status: 400 },
          );
        }

        // Verify event is signed by the offer author
        const decoded = nip19.decode(npub) as unknown as {
          type: string;
          data: string;
        };
        const authorPubkey = decoded.data;
        if (nostrEvent.pubkey !== authorPubkey) {
          return NextResponse.json(
            {
              success: false,
              error: "Event must be signed by the offer author",
            } as CreateOfferResponse,
            { status: 403 },
          );
        }

        // Extract d-tag from event
        const dTag = nostrEvent.tags.find((t) => t[0] === "d")?.[1];
        if (!dTag) {
          return NextResponse.json(
            {
              success: false,
              error: "Calendar event must include a d-tag",
            } as CreateOfferResponse,
            { status: 400 },
          );
        }

        // Store NOSTR event info in offer
        offer.nostrEventId = nostrEvent.id;
        offer.nostrDTag = dTag;
        offer.nostrAuthorPubkey = authorPubkey as string;

        // Publish to NOSTR relays (async, don't block response)
        publishNostrEvent(nostrEvent).catch((err) => {
          console.error("[Offer API] Failed to publish calendar event:", err);
        });

        console.log("[Offer API] NIP-52 calendar event published:", {
          offerId,
          eventId: nostrEvent.id,
          dTag,
        });
      } catch (err) {
        console.error("[Offer API] Failed to handle calendar event:", err);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to process NOSTR calendar event",
          } as CreateOfferResponse,
          { status: 400 },
        );
      }
    } else if (type === "workshop" && startTime && endTime) {
      // Warn if workshop is created without NOSTR event
      console.warn("[Offer API] Workshop created without NOSTR calendar event");
    }

    // Save offer to file system
    const offersDir = path.join(getDataDir(), "offers");
    await fs.mkdir(offersDir, { recursive: true });

    const offerPath = path.join(offersDir, `${offerId}.json`);
    await fs.writeFile(offerPath, JSON.stringify(offer, null, 2));

    // Add to user's offers list in their profile
    const profilePath = path.join(
      getDataDir(),
      "badges",
      profile.serialNumber,
      "profile.json",
    );
    profile.offers.push(offer);
    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));

    // NOTE: We no longer deduct tokens here.
    // The client should publish a burn payment request (kind 1734)
    // which the payment processor will handle.
    // The proposal listener will update the offer status to 'tentative'
    // once the burn is confirmed.

    // Add to local calendar immediately (as TENTATIVE) so it shows up right away
    // The proposal listener will update status when burn is confirmed
    if (
      (type === "workshop" || type === "1:1") &&
      room &&
      startTime &&
      endTime
    ) {
      try {
        const roomSlug = getRoomSlug(room);

        const proposalEvent: ProposalEvent = {
          offerId,
          title: title.trim(),
          description: description.trim(),
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          room,
          status: "TENTATIVE",
          minRsvps: type === "workshop" ? minRsvps : 1,
          attendees: [],
          author: npub,
          authorUsername: profile?.username,
        };

        await addProposalEvent(roomSlug, proposalEvent);
        await generateIcsFile(roomSlug);

        console.log("[Offer API] Added proposal to calendar:", {
          offerId,
          room,
          roomSlug,
        });
      } catch (calError) {
        console.error("[Offer API] Failed to add to calendar:", calError);
        // Don't fail the request, just log the error
      }
    }

    console.log("[Offer API] Offer created, pending burn confirmation:", {
      offerId,
      type,
      title,
      room,
      minRsvps: offer.minRsvps,
    });

    // Return offer with pendingBurn flag
    return NextResponse.json({
      success: true,
      offer,
      pendingBurn: true, // Client should create burn payment request
      conflictWarning, // Include warning about tentative conflicts
    } as CreateOfferResponse & {
      pendingBurn: boolean;
      conflictWarning?: string;
    });
  } catch (error) {
    console.error("Offer creation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      } as CreateOfferResponse,
      { status: 500 },
    );
  }
}

/**
 * Get username for an npub from profile data
 */
async function getUsernameByNpub(npub: string): Promise<string | null> {
  try {
    const profile = await getProfileByNpub(npub);
    return profile?.username || null;
  } catch {
    return null;
  }
}

/**
 * GET - List all offers
 * Query params: ?type=workshop&status=confirmed
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const typeFilter = searchParams.get("type");
    const statusFilter = searchParams.get("status");

    const offersDir = path.join(getDataDir(), "offers");

    // Ensure directory exists
    try {
      await fs.access(offersDir);
    } catch {
      return NextResponse.json({
        success: true,
        offers: [],
      });
    }

    // Read all offer files
    const files = await fs.readdir(offersDir);
    const offers: (Offer & { authorUsername?: string })[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const offerPath = path.join(offersDir, file);
      const content = await fs.readFile(offerPath, "utf-8");
      const offer = JSON.parse(content);

      // Apply filters
      if (typeFilter && offer.type !== typeFilter) continue;
      if (statusFilter && offer.status !== statusFilter) continue;

      // Get author username for the first author
      if (offer.authors && offer.authors.length > 0) {
        const authorUsername = await getUsernameByNpub(offer.authors[0]);
        if (authorUsername) {
          offer.authorUsername = authorUsername;
        }
      }

      offers.push(offer);
    }

    // Sort by creation date (newest first)
    offers.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return NextResponse.json({
      success: true,
      offers,
    });
  } catch (error) {
    console.error("Offers list error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}
