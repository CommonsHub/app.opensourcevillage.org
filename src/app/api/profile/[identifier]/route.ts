/**
 * API endpoint for user profiles
 * GET /api/profile/[identifier] - Get profile by username or npub
 * PUT /api/profile/[identifier] - Update profile
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getProfileByUsername,
  getProfileByNpub,
  updateProfile,
  getProfileBySerialNumber,
} from '@/lib/storage';
import { logNostrEventToAll, type NostrEvent } from '@/lib/nostr-logger';
import { UserProfile } from '@/types';

/**
 * GET profile by username or npub
 * /api/profile/alice or /api/profile/npub1...
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;

    // Try to fetch by username first, then npub, then serial number
    let profile = await getProfileByUsername(identifier);

    if (!profile && identifier.startsWith('npub1')) {
      profile = await getProfileByNpub(identifier);
    }

    // Try serial number lookup (for badge scans)
    if (!profile) {
      profile = await getProfileBySerialNumber(identifier);
    }

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Return profile data without sensitive information
    const responseData: any = {
      success: true,
      profile: {
        username: profile.username,
        npub: profile.npub,
        profile: profile.profile,
        balance: profile.balance,
        offers: profile.offers,
        rsvps: profile.rsvps,
      },
    };

    // In development mode, include serialNumber for debugging
    if (process.env.NODE_ENV === 'development') {
      responseData.profile.serialNumber = profile.serialNumber;
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT - Update profile
 * /api/profile/[identifier]
 * Body: { updates: Partial<UserProfile>, npub: string, nostrEvent?: NostrEvent }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;
    const body = await request.json();
    const { updates, npub, nostrEvent } = body;

    if (!updates || !npub) {
      return NextResponse.json(
        { success: false, error: 'Missing updates or npub' },
        { status: 400 }
      );
    }

    // Fetch the profile to verify ownership and get serialNumber
    let profile = await getProfileByUsername(identifier);

    if (!profile && identifier.startsWith('npub1')) {
      profile = await getProfileByNpub(identifier);
    }

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Verify that the requester owns this profile
    if (profile.npub !== npub) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - you can only update your own profile' },
        { status: 403 }
      );
    }

    // Validate updates (don't allow changing npub, username, serialNumber)
    const allowedFields = ['name', 'shortbio', 'talkAbout', 'helpWith', 'links'];
    const sanitizedUpdates: Partial<UserProfile> = {};

    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        sanitizedUpdates[key as keyof UserProfile] = updates[key];
      }
    }

    // Update the profile
    const updated = await updateProfile(profile.serialNumber, sanitizedUpdates);

    // Log NOSTR event if provided
    if (nostrEvent) {
      console.log('[Profile API] Logging NOSTR event to npub nostr_events.jsonl:', nostrEvent.id);
      logNostrEventToAll(nostrEvent);
    } else {
      console.log('[Profile API] No NOSTR event provided, skipping event logging');
    }

    return NextResponse.json({
      success: true,
      profile: updated.profile,
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
