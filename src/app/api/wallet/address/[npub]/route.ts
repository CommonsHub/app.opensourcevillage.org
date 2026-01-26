/**
 * GET /api/wallet/address/[npub] - Get wallet address for an npub
 *
 * Returns the deterministic Safe wallet address for a given npub.
 * This address is where the user's tokens are held.
 *
 * Response:
 * {
 *   "success": true,
 *   "npub": "npub1...",
 *   "walletAddress": "0x...",
 *   "chain": "gnosis",
 *   "chainId": 100
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWalletAddressForNpub, getChain } from '@/lib/token-factory';
import { CHAIN_IDS } from '@/lib/nostr-events';

// Chain name to ID mapping
const CHAIN_NAME_TO_ID: Record<string, number> = {
  localhost: 31337,
  gnosis: 100,
  gnosis_chiado: 10200,
  base: 8453,
  base_sepolia: 84532,
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ npub: string }> }
) {
  try {
    const { npub } = await params;

    // Validate npub format
    if (!npub || !npub.startsWith('npub1')) {
      return NextResponse.json(
        { success: false, error: 'Invalid npub format' },
        { status: 400 }
      );
    }

    // Get wallet address
    const walletAddress = await getWalletAddressForNpub(npub);
    const chain = getChain();
    const chainId = CHAIN_NAME_TO_ID[chain] || 31337;

    return NextResponse.json({
      success: true,
      npub,
      walletAddress,
      chain,
      chainId,
    });
  } catch (error) {
    console.error('Error getting wallet address:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get wallet address',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
