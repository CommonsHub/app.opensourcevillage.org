/**
 * GET /api/balance/[npub] - Get user's token balance
 *
 * Returns the user's token balance from the blockchain.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTokenInfo, getChain } from '@/lib/token-factory';
import { Token } from '@opencollective/token-factory';

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

    // Get token info
    const tokenInfo = await getTokenInfo();
    if (!tokenInfo) {
      const chain = getChain();
      return NextResponse.json({
        success: false,
        error: 'Token not configured',
        tokenNotConfigured: true,
        chain,
      });
    }

    // Query blockchain for balance
    try {
      const chain = getChain();
      const token = new Token({
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        chain,
        tokenAddress: tokenInfo.address as `0x${string}`,
        deployerPrivateKey: process.env.PRIVATE_KEY as `0x${string}`,
      });

      const balance = await token.getBalance(`nostr:${npub}`);
      const balanceInTokens = Number(balance) / 1e6; // 6 decimals

      return NextResponse.json({
        success: true,
        balance: {
          confirmed: balanceInTokens,
          total: balanceInTokens,
          lastUpdated: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error('Error querying blockchain balance:', err);
      // Return zero balance if blockchain query fails
      return NextResponse.json({
        success: true,
        balance: {
          confirmed: 0,
          total: 0,
          lastUpdated: new Date().toISOString()
        }
      });
    }
  } catch (error) {
    console.error('Error getting balance:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get balance',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
