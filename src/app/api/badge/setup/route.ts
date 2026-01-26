/**
 * API endpoint for setting up NFC badges
 * POST /api/badge/setup
 * Body: { serialNumber }
 *
 * Creates a badge marker at data/badges/:serialNumber
 * This must be done before a badge can be claimed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { setupBadge, isBadgeSetup, isBadgeClaimed } from '@/lib/storage';

export interface SetupBadgeRequest {
  serialNumber: string;
}

export interface SetupBadgeResponse {
  success: boolean;
  serialNumber?: string;
  error?: string;
  alreadyExists?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: SetupBadgeRequest = await request.json();
    const { serialNumber } = body;

    // Validate serial number
    if (!serialNumber) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required field: serialNumber',
        } as SetupBadgeResponse,
        { status: 400 }
      );
    }

    // Validate serial number format (alphanumeric, colons allowed for NFC UIDs)
    const serialRegex = /^[a-zA-Z0-9:-]+$/;
    if (!serialRegex.test(serialNumber)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid serial number format',
        } as SetupBadgeResponse,
        { status: 400 }
      );
    }

    // Set up the badge
    const result = await setupBadge(serialNumber);

    console.log(`[Badge Setup] Badge ${serialNumber} setup complete (alreadyExists: ${result.alreadyExists})`);

    return NextResponse.json({
      success: true,
      serialNumber,
      alreadyExists: result.alreadyExists,
    } as SetupBadgeResponse);

  } catch (error) {
    console.error('Badge setup error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      } as SetupBadgeResponse,
      { status: 500 }
    );
  }
}

/**
 * GET - Check if a badge is set up
 * Query: ?serialNumber=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const serialNumber = searchParams.get('serialNumber');

    if (!serialNumber) {
      return NextResponse.json(
        { success: false, error: 'Missing serialNumber parameter' },
        { status: 400 }
      );
    }

    const exists = await isBadgeSetup(serialNumber);
    const claimed = exists ? await isBadgeClaimed(serialNumber) : false;

    return NextResponse.json({
      success: true,
      exists,
      serialNumber,
      claimed,
    });

  } catch (error) {
    console.error('Badge check error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
