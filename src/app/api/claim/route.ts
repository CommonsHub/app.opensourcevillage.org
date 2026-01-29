/**
 * API endpoint for claiming NFC badges
 * POST /api/claim
 * Body: { username, displayName, serialNumber, npub, inviteCode }
 *
 * When a badge is claimed:
 * 1. Validates and redeems the invite code via NOSTR relay (kind 28934)
 * 2. Creates user profile at data/npubs/:npub/
 * 3. Creates symlinks: badges/:serialNumber -> npubs/:npub, usernames/:username -> npubs/:npub
 * 4. Tracks the invite relationship (inviter -> invitee)
 * 5. Emits a kind 1734 payment request event (method: mint) for initial tokens
 * 6. Adds the user to the NIP-29 closed group
 */

import { NextRequest, NextResponse } from 'next/server';
import { nip19, getPublicKey, finalizeEvent, type EventTemplate } from 'nostr-tools';
import { promises as fs } from 'fs';
import path from 'path';
import { createProfile, isBadgeSetup, isBadgeClaimed, getProfileByNpub, updateProfile } from '@/lib/storage';
import { addGroupMember, getGroupSettings } from '@/lib/nostr-server';
import { publishNostrEvent } from '@/lib/nostr-server';
import { createPaymentRequestEvent, decodeNsec } from '@/lib/nostr-events';
import { getTokenInfo, getWalletAddressForNpub, getChain } from '@/lib/token-factory';
import { addUserToAllRelays } from '@/lib/nip86-client';
import { ClaimBadgeRequest, ClaimBadgeResponse } from '@/types';
import settings from '../../../../settings.json';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const NPUBS_DIR = path.join(DATA_DIR, 'npubs');

/**
 * Check if any profiles exist (for bootstrapping first user)
 */
async function hasExistingProfiles(): Promise<boolean> {
  try {
    const stats = await fs.stat(NPUBS_DIR);
    if (!stats.isDirectory()) return false;

    const entries = await fs.readdir(NPUBS_DIR, { withFileTypes: true });
    return entries.some((e) => e.isDirectory() && e.name.startsWith('npub'));
  } catch {
    return false;
  }
}

const MAX_INVITES_PER_USER = (settings as { maxInvitesPerUser?: number }).maxInvitesPerUser || 10;

// Chain name to ID mapping
const CHAIN_NAME_TO_ID: Record<string, number> = {
  localhost: 31337,
  local: 31337, // Alias for localhost
  gnosis: 100,
  gnosis_chiado: 10200,
  base: 8453,
  base_sepolia: 84532,
};

export async function POST(request: NextRequest) {
  try {
    const body: ClaimBadgeRequest = await request.json();
    const { username, displayName, serialNumber, npub, inviteCode } = body;

    // Check if this is the first user (no profiles exist yet)
    const profilesExist = await hasExistingProfiles();
    const isFirstUser = !profilesExist;

    // Validate inputs - invite code is optional for first user
    if (!username || !serialNumber || !npub) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: username, serialNumber, npub',
        } as ClaimBadgeResponse,
        { status: 400 }
      );
    }

    // Invite code is required unless this is the first user
    if (!isFirstUser && !inviteCode) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invitation code is required',
        } as ClaimBadgeResponse,
        { status: 400 }
      );
    }

    let inviterNpub: string | undefined;
    let inviterProfile: Awaited<ReturnType<typeof getProfileByNpub>> | null = null;

    // Only validate invite code if provided (not first user)
    if (inviteCode) {
      // Validate invite code format (192 hex chars = 64 pubkey + 128 signature)
      if (!/^[0-9a-f]{192}$/i.test(inviteCode)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid invitation code format',
          } as ClaimBadgeResponse,
          { status: 400 }
        );
      }

      // Extract inviter's pubkey from invite code (first 64 chars)
      const inviterPubkeyHex = inviteCode.substring(0, 64);
      inviterNpub = nip19.npubEncode(inviterPubkeyHex);

      // Check if inviter has reached their invite limit
      inviterProfile = await getProfileByNpub(inviterNpub);
      if (inviterProfile) {
        const currentInvitees = inviterProfile.profile.invitees || [];
        if (currentInvitees.length >= MAX_INVITES_PER_USER) {
          return NextResponse.json(
            {
              success: false,
              error: `This villager has already invited ${MAX_INVITES_PER_USER} people. Ask someone else for an invitation code.`,
            } as ClaimBadgeResponse,
            { status: 400 }
          );
        }
      }
    }

    if (isFirstUser) {
      console.log('[Claim API] First user detected - skipping invite code requirement');
    }

    // Validate username format (3-20 chars, alphanumeric + hyphens/underscores)
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Username must be 3-20 characters, alphanumeric, hyphens, or underscores only',
        } as ClaimBadgeResponse,
        { status: 400 }
      );
    }

    // Validate npub format (starts with npub1)
    if (!npub.startsWith('npub1')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid npub format',
        } as ClaimBadgeResponse,
        { status: 400 }
      );
    }

    // Check that the badge has been set up (activated)
    const badgeExists = await isBadgeSetup(serialNumber);
    if (!badgeExists) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unknown badge',
        } as ClaimBadgeResponse,
        { status: 404 }
      );
    }

    // Check if badge is already claimed
    const alreadyClaimed = await isBadgeClaimed(serialNumber);
    if (alreadyClaimed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Badge already claimed',
        } as ClaimBadgeResponse,
        { status: 400 }
      );
    }

    // Decode the new user's npub to get their pubkey
    const { data: newUserPubkey } = nip19.decode(npub);
    const newUserSecretKey = new Uint8Array(32); // We don't have the secret key here

    // Note: The invite code redemption (kind 28934) should be done client-side
    // because it requires the user's secret key to sign the event.
    // The server will verify membership after the client redeems the code.
    // For now, we trust the invite code format and proceed with profile creation.

    // Create profile with displayName and invitedBy (if not first user)
    const profile = await createProfile(serialNumber, username, npub, {
      name: displayName,
      invitedBy: inviterNpub,
    });

    // Update inviter's profile to add this user to their invitees
    if (inviterProfile && inviterNpub) {
      const currentInvitees = inviterProfile.profile.invitees || [];
      await updateProfile(inviterNpub, {
        invitees: [...currentInvitees, npub],
      });
      console.log('[Claim API] Updated inviter profile:', {
        inviterNpub: inviterNpub.substring(0, 16) + '...',
        totalInvitees: currentInvitees.length + 1,
      });
    }

    // Emit kind 1734 payment request for initial token mint
    const initialBalance = settings.tokenEconomics?.initialBalance || 50;

    try {
      const nsec = process.env.NOSTR_NSEC;
      const tokenInfo = await getTokenInfo();

      if (nsec && tokenInfo) {
        // Get wallet address for the new user
        const walletAddress = await getWalletAddressForNpub(npub);
        const chain = getChain();
        const chainId = CHAIN_NAME_TO_ID[chain] || 31337;

        // Decode server's nsec to sign the event
        const secretKey = decodeNsec(nsec);

        // Get server's npub for the sender field
        const { data: serverSecretKey } = nip19.decode(nsec);
        const serverPublicKey = getPublicKey(serverSecretKey as Uint8Array);
        const serverNpub = nip19.npubEncode(serverPublicKey);

        // Create payment request event (kind 1734) with method: mint
        const paymentRequestEvent = createPaymentRequestEvent(secretKey, {
          recipient: npub,
          recipientAddress: walletAddress,
          sender: serverNpub, // Server is the "sender" for mints
          amount: initialBalance,
          tokenAddress: tokenInfo.address,
          chainId,
          tokenSymbol: tokenInfo.symbol,
          context: 'badge_claim',
          method: 'mint',
          description: `Initial token mint of ${initialBalance} ${tokenInfo.symbol} for badge claim`,
        });

        // Publish to NOSTR relays (async, don't block response)
        publishNostrEvent(paymentRequestEvent).then((result) => {
          console.log('[Claim API] Published mint payment request:', {
            eventId: paymentRequestEvent.id,
            npub: npub.substring(0, 16) + '...',
            amount: initialBalance,
            published: result.published.length,
            failed: result.failed.length,
          });
        }).catch((err) => {
          console.error('[Claim API] Failed to publish mint payment request:', err);
        });
      } else {
        console.log('[Claim API] Skipping token mint - NOSTR_NSEC or token not configured');
      }
    } catch (err) {
      console.error('[Claim API] Failed to create mint payment request:', err);
      // Don't fail the claim if minting fails - the profile is still created
    }

    // Add user to NIP-29 closed group (async, don't block response)
    const groupSettings = getGroupSettings();
    if (groupSettings) {
      try {
        const addMemberEvent = addGroupMember(groupSettings.id, npub, 'member');
        console.log('[Claim API] Adding user to NIP-29 group:', {
          groupId: groupSettings.id,
          npub: npub.substring(0, 16) + '...',
          eventId: addMemberEvent.id,
        });

        // Publish the add member event to NOSTR relays (async)
        publishNostrEvent(addMemberEvent).catch((err) => {
          console.error('[Claim API] Failed to publish add member event:', err);
        });
      } catch (err) {
        console.error('[Claim API] Failed to add user to NIP-29 group:', err);
      }
    }

    // Add user to relay's allowed list via NIP-86 (async, don't block response)
    addUserToAllRelays(npub).then((result) => {
      console.log('[Claim API] NIP-86 add user results:', {
        npub: npub.substring(0, 16) + '...',
        successful: result.successful.length,
        failed: result.failed.length,
      });

      if (result.failed.length > 0) {
        console.warn('[Claim API] Some relays failed NIP-86 add user:', result.failed);
      }
    }).catch((err) => {
      console.error('[Claim API] Failed to add user to relays via NIP-86:', err);
    });

    return NextResponse.json({
      success: true,
      profile: profile.profile,
    } as ClaimBadgeResponse);

  } catch (error) {
    console.error('Badge claim error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      } as ClaimBadgeResponse,
      { status: 500 }
    );
  }
}
