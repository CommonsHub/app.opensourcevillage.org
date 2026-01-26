/**
 * Deploy Token API
 *
 * POST /api/wallet/deploy-token
 * Deploys the community token if not already deployed
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getWalletInfo,
  getOrDeployToken,
  getTokenInfo,
} from '@/lib/token-factory';

export interface DeployTokenRequest {
  name?: string;
  symbol?: string;
  chain?: 'gnosis' | 'gnosis_chiado' | 'base' | 'base_sepolia';
}

export interface DeployTokenResponse {
  success: boolean;
  token?: {
    address: string;
    name: string;
    symbol: string;
    chain: string;
    deployed: boolean;
    isNew: boolean;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<DeployTokenResponse>> {
  try {
    // Check wallet has enough balance
    const wallet = await getWalletInfo();
    if (!wallet.hasEnoughBalance) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient balance. Need at least 0.001 ${wallet.nativeCurrency}. Current: ${wallet.balanceFormatted}`,
        },
        { status: 400 }
      );
    }

    // Check if token already exists
    const existingToken = await getTokenInfo();

    // Parse request body
    let name = 'Open Source Village Token';
    let symbol = 'OSV';
    let chain: 'gnosis' | 'gnosis_chiado' | 'base' | 'base_sepolia' | undefined;

    try {
      const body = await request.json() as DeployTokenRequest;
      if (body.name) name = body.name;
      if (body.symbol) symbol = body.symbol;
      if (body.chain) chain = body.chain;
    } catch {
      // Use defaults if no body
    }

    // Deploy or get existing token
    const token = await getOrDeployToken(name, symbol, chain);

    return NextResponse.json({
      success: true,
      token: {
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        chain: token.chain,
        deployed: token.deployed,
        isNew: !existingToken,
      },
    });
  } catch (error) {
    console.error('[API] Deploy token error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to deploy token',
      },
      { status: 500 }
    );
  }
}
