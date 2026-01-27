/**
 * Mint API Route
 *
 * POST /api/mint
 * Mints tokens to a given npub or username.
 * Only works on localhost for safety.
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { nip19 } from 'nostr-tools';
import {
  createPaymentRequestEvent,
  decodeNsec,
} from '@/lib/nostr-events';
import { publishNostrEvent } from '@/lib/nostr-server';
import { getWalletAddressForNpub } from '@/lib/token-factory';

// Block explorer URLs for each chain
const CHAIN_EXPLORERS: Record<number, string> = {
  31337: 'https://voltaire.tevm.sh', // localhost
  100: 'https://gnosisscan.io/address', // gnosis
  10200: 'https://gnosis-chiado.blockscout.com/address', // gnosis_chiado
  8453: 'https://basescan.org/address', // base
  84532: 'https://sepolia.basescan.org/address', // base_sepolia
};

const CHAIN_NAME_TO_ID: Record<string, number> = {
  localhost: 31337,
  local: 31337, // Alias for localhost
  gnosis: 100,
  gnosis_chiado: 10200,
  base: 8453,
  base_sepolia: 84532,
};

const NPUBS_DIR = path.join(process.cwd(), 'data', 'npubs');

function isLocalhost(request: NextRequest): boolean {
  const host = request.headers.get('host') || '';
  return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]');
}

async function resolveToNpub(recipient: string): Promise<{ npub: string; username?: string } | null> {
  // If it's already an npub
  if (recipient.startsWith('npub1')) {
    try {
      nip19.decode(recipient);
      return { npub: recipient };
    } catch {
      return null;
    }
  }

  // It's a username - look up the npub
  try {
    const entries = await fs.readdir(NPUBS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('npub')) continue;

      const profilePath = path.join(NPUBS_DIR, entry.name, 'profile.json');
      try {
        const content = await fs.readFile(profilePath, 'utf-8');
        const profile = JSON.parse(content);
        if (profile.username?.toLowerCase() === recipient.toLowerCase()) {
          return { npub: entry.name, username: profile.username };
        }
      } catch {
        // Skip profiles we can't read
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return null;
}

export async function POST(request: NextRequest) {
  // Only allow on localhost
  if (!isLocalhost(request)) {
    return NextResponse.json(
      { success: false, error: 'This endpoint is only available on localhost' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { recipient, amount } = body;

    if (!recipient) {
      return NextResponse.json(
        { success: false, error: 'Recipient (npub or username) is required' },
        { status: 400 }
      );
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    // Resolve recipient to npub
    const resolved = await resolveToNpub(recipient);
    if (!resolved) {
      return NextResponse.json(
        { success: false, error: `Could not find user: ${recipient}` },
        { status: 404 }
      );
    }

    // Check required environment variables
    const nostrNsec = process.env.NOSTR_NSEC;
    const tokenAddress = process.env.TOKEN_ADDRESS;

    if (!nostrNsec) {
      return NextResponse.json(
        { success: false, error: 'NOSTR_NSEC environment variable is not set' },
        { status: 500 }
      );
    }

    if (!tokenAddress) {
      return NextResponse.json(
        { success: false, error: 'TOKEN_ADDRESS environment variable is not set' },
        { status: 500 }
      );
    }

    // Get chain configuration from env var
    const chainName = process.env.CHAIN || 'gnosis';
    const chainId = CHAIN_NAME_TO_ID[chainName];

    if (!chainId) {
      return NextResponse.json(
        { success: false, error: `Unknown chain: ${chainName}` },
        { status: 500 }
      );
    }

    const tokenSymbol = process.env.TOKEN_SYMBOL || 'OSV';

    // Decode NOSTR secret key
    let secretKey: Uint8Array;
    try {
      secretKey = decodeNsec(nostrNsec);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to decode NOSTR_NSEC' },
        { status: 500 }
      );
    }

    // Get wallet address for recipient
    let walletAddress: string;
    try {
      walletAddress = await getWalletAddressForNpub(resolved.npub);
    } catch (error) {
      console.error('[Mint API] Failed to get wallet address:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to get wallet address for recipient' },
        { status: 500 }
      );
    }

    // Create payment request event
    const event = createPaymentRequestEvent(secretKey, {
      recipientNpub: resolved.npub,
      recipientAddress: walletAddress,
      senderNpub: 'system', // 'system' indicates this is a mint, not a transfer
      amount: parsedAmount,
      tokenAddress,
      chainId,
      tokenSymbol,
      context: 'badge_claim', // Using badge_claim context for manual mints
      description: `Manual mint of ${parsedAmount} ${tokenSymbol} tokens via web UI`,
      method: 'mint',
    });

    // Publish to relays using the shared publisher with NIP-42 auth
    const result = await publishNostrEvent(event, { secretKey });

    if (result.success) {
      const explorerBaseUrl = CHAIN_EXPLORERS[chainId] || '';
      return NextResponse.json({
        success: true,
        message: `Mint request sent for ${parsedAmount} ${tokenSymbol} to ${resolved.username || resolved.npub}`,
        eventId: event.id,
        publishedTo: result.published,
        recipient: {
          npub: resolved.npub,
          username: resolved.username,
          walletAddress,
          explorerUrl: explorerBaseUrl ? `${explorerBaseUrl}/${walletAddress}` : undefined,
        },
      });
    } else {
      const errorDetail = result.failed.length > 0
        ? result.failed.map(f => `${f.url}: ${f.error}`).join('; ')
        : 'No relay accepted the event';
      return NextResponse.json(
        {
          success: false,
          error: `Failed to publish mint request: ${errorDetail}`,
          relayErrors: result.failed,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Mint API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
