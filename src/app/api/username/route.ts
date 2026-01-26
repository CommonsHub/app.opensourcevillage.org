/**
 * Username availability check API
 * GET /api/username?username=<username>
 *
 * Returns whether a username is available for registration
 * Checks for:
 * 1. Reserved usernames (from data/reserved_usernames.txt)
 * 2. Existing symlink in DATA_DIR/usernames/:username
 */

import { NextRequest, NextResponse } from 'next/server';
import { lstatSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Cache reserved usernames in memory
let reservedUsernamesCache: Set<string> | null = null;

/**
 * Load reserved usernames from data/reserved_usernames.txt
 * Returns a Set of lowercase reserved usernames
 */
function loadReservedUsernames(): Set<string> {
  if (reservedUsernamesCache) {
    return reservedUsernamesCache;
  }

  const reservedPath = join(process.cwd(), 'data', 'reserved_usernames.txt');
  const reserved = new Set<string>();

  try {
    if (existsSync(reservedPath)) {
      const content = readFileSync(reservedPath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (trimmed && !trimmed.startsWith('#')) {
          reserved.add(trimmed.toLowerCase());
        }
      }

      console.log(`[Username API] Loaded ${reserved.size} reserved usernames`);
    } else {
      console.warn('[Username API] Reserved usernames file not found:', reservedPath);
    }
  } catch (error) {
    console.error('[Username API] Error loading reserved usernames:', error);
  }

  reservedUsernamesCache = reserved;
  return reserved;
}

/**
 * Check if a username is reserved
 */
function isReservedUsername(username: string): boolean {
  const reserved = loadReservedUsernames();
  return reserved.has(username.toLowerCase());
}

/**
 * Check if a username is available
 * Checks for symlink in DATA_DIR/usernames/:username
 */
export async function GET(request: NextRequest) {
  try {
    // Read DATA_DIR at request time (not module load time) for testability
    const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');

    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    // Validate username parameter
    if (!username) {
      return NextResponse.json(
        { error: 'Username parameter is required' },
        { status: 400 }
      );
    }

    // Validate username format (allow uppercase, hyphens too)
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json(
        {
          available: false,
          error: 'Invalid username format. Must be 3-20 characters, alphanumeric, hyphens, or underscores only.'
        },
        { status: 400 }
      );
    }

    // Check if username is reserved
    if (isReservedUsername(username)) {
      return NextResponse.json({
        available: false,
        username,
        message: 'This username is reserved'
      });
    }

    // Check if username symlink exists in DATA_DIR/usernames/:username
    // Note: usernames are stored lowercase to ensure case-insensitive uniqueness
    // Use lstatSync to detect symlinks even if they're broken (target doesn't exist)
    const usernamePath = join(DATA_DIR, 'usernames', username.toLowerCase());

    try {
      const stats = lstatSync(usernamePath);
      // Username is taken (symlink exists)
      return NextResponse.json({
        available: false,
        username,
        message: 'Username already taken'
      });
    } catch (err) {
      // ENOENT means symlink doesn't exist - username is available
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // Username is available (no symlink)
        return NextResponse.json({
          available: true,
          username
        });
      }
      // Other errors should be thrown
      throw err;
    }

  } catch (error) {
    console.error('Error checking username availability:', error);
    return NextResponse.json(
      { error: 'Internal server error while checking username availability' },
      { status: 500 }
    );
  }
}
