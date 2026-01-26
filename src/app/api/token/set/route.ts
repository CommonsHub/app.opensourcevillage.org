/**
 * POST /api/token/set - Set an existing token address
 *
 * Saves a token address to settings.json for an already deployed token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadSettings, saveSettings, getChain } from '@/lib/token-factory';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenAddress, name, symbol } = body;

    // Validate token address
    if (!tokenAddress || !tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
      return NextResponse.json(
        { success: false, error: 'Invalid token address' },
        { status: 400 }
      );
    }

    const chain = getChain();

    // Save to settings.json
    const settings = await loadSettings();
    settings.token = {
      address: tokenAddress,
      name: name || 'Community Token',
      symbol: symbol || 'TOKEN',
      chain,
      setAt: new Date().toISOString(),
    };
    await saveSettings(settings);

    console.log(`[TokenSet] Token address set to ${tokenAddress} on ${chain}`);

    return NextResponse.json({
      success: true,
      token: settings.token,
    });
  } catch (error) {
    console.error('Error setting token:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to set token address',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
