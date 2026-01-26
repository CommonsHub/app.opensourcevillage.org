/**
 * Wallet Status API
 *
 * GET /api/wallet/status
 * Returns wallet address, balance, and chain information
 */

import { NextResponse } from 'next/server';
import {
  getWalletInfo,
  getTokenInfo,
  type WalletInfo,
  type TokenInfo,
} from '@/lib/token-factory';

export interface WalletStatusResponse {
  success: boolean;
  wallet?: WalletInfo;
  token?: TokenInfo | null;
  error?: string;
}

export async function GET(): Promise<NextResponse<WalletStatusResponse>> {
  try {
    const wallet = await getWalletInfo();
    const token = await getTokenInfo();

    // Convert BigInt values to strings for JSON serialization
    const walletSerialized = {
      ...wallet,
      balance: wallet.balance.toString(),
      minBalance: wallet.minBalance.toString(),
    };

    return NextResponse.json({
      success: true,
      wallet: walletSerialized as unknown as WalletInfo,
      token,
    });
  } catch (error) {
    console.error('[API] Wallet status error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get wallet status',
      },
      { status: 500 }
    );
  }
}
