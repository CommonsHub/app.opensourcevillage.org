/**
 * GET /api/token/info - Get token information
 *
 * Returns the token contract address, chain, and other info needed
 * for creating payment requests.
 *
 * Response:
 * {
 *   "success": true,
 *   "token": {
 *     "address": "0x...",
 *     "name": "Community Hour Token",
 *     "symbol": "CHT",
 *     "decimals": 6,
 *     "chain": "gnosis",
 *     "chainId": 100
 *   }
 * }
 */

import { NextResponse } from 'next/server';
import { getTokenInfo, getChain } from '@/lib/token-factory';

// Chain name to ID mapping
const CHAIN_NAME_TO_ID: Record<string, number> = {
  localhost: 31337,
  gnosis: 100,
  gnosis_chiado: 10200,
  base: 8453,
  base_sepolia: 84532,
};

// Chain name to explorer URL mapping
const CHAIN_EXPLORER: Record<string, string> = {
  localhost: 'https://voltaire.tevm.sh',
  gnosis: 'https://gnosisscan.io',
  gnosis_chiado: 'https://gnosis-chiado.blockscout.com',
  base: 'https://basescan.org',
  base_sepolia: 'https://sepolia.basescan.org',
};

export async function GET() {
  try {
    const tokenInfo = await getTokenInfo();
    const chain = getChain();
    const chainId = CHAIN_NAME_TO_ID[chain] || 31337;

    if (!tokenInfo) {
      return NextResponse.json({
        success: true,
        token: null,
        message: 'No token deployed yet',
      });
    }

    const explorer = CHAIN_EXPLORER[chain] || CHAIN_EXPLORER.localhost;

    return NextResponse.json({
      success: true,
      token: {
        address: tokenInfo.address,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        decimals: 6, // CHT uses 6 decimals
        chain: tokenInfo.chain,
        chainId,
        explorer,
      },
    });
  } catch (error) {
    console.error('Error getting token info:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get token info',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
