/**
 * API endpoint for listing all profiles
 * GET /api/profiles - Get all profiles
 */

import { NextResponse } from 'next/server';
import { getAllProfiles } from '@/lib/storage';

/**
 * GET all profiles
 */
export async function GET() {
  try {
    const profiles = await getAllProfiles();

    // Return profiles without sensitive information
    const publicProfiles = profiles.map((profile) => ({
      username: profile.username,
      npub: profile.npub,
      name: profile.profile.name,
      shortbio: profile.profile.shortbio,
      createdAt: profile.profile.createdAt,
    }));

    return NextResponse.json({
      success: true,
      profiles: publicProfiles,
      count: publicProfiles.length,
    });
  } catch (error) {
    console.error('Error fetching profiles:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
