/**
 * GET /api/profiles/exists - Check if any profiles exist
 *
 * Returns whether the data/profiles directory exists and has any profiles.
 * Used to determine if this is a fresh install (first user doesn't need invite code).
 */

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Profiles are stored in data/npubs/:npub/
const NPUBS_DIR = path.join(process.cwd(), 'data', 'npubs');

export async function GET() {
  try {
    // Check if npubs directory exists
    try {
      const stats = await fs.stat(NPUBS_DIR);
      if (!stats.isDirectory()) {
        return NextResponse.json({ exists: false, count: 0 });
      }
    } catch {
      // Directory doesn't exist
      return NextResponse.json({ exists: false, count: 0 });
    }

    // Count profiles (subdirectories starting with 'npub')
    const entries = await fs.readdir(NPUBS_DIR, { withFileTypes: true });
    const profileCount = entries.filter(
      (e) => e.isDirectory() && e.name.startsWith('npub')
    ).length;

    return NextResponse.json({
      exists: profileCount > 0,
      count: profileCount,
    });
  } catch (error) {
    console.error('Error checking profiles:', error);
    return NextResponse.json({ exists: false, count: 0 });
  }
}
