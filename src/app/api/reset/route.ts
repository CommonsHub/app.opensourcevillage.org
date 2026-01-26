/**
 * Reset API Route
 *
 * Deletes all data in the data/ directory.
 * Only works on localhost for safety.
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

// Files and directories to preserve during reset
const PRESERVED_ITEMS = new Set([
  'reserved_usernames.txt',
  'calendars',
]);

/**
 * Check if the request is from localhost
 */
function isLocalhost(request: NextRequest): boolean {
  const host = request.headers.get('host') || '';
  const forwardedHost = request.headers.get('x-forwarded-host') || '';

  const isLocal =
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('[::1]') ||
    forwardedHost.startsWith('localhost') ||
    forwardedHost.startsWith('127.0.0.1');

  return isLocal;
}

/**
 * Recursively delete directory contents, preserving specified items
 */
async function deleteDirectoryContents(dirPath: string): Promise<{ deleted: string[]; preserved: string[]; errors: string[] }> {
  const deleted: string[] = [];
  const preserved: string[] = [];
  const errors: string[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Skip preserved items
      if (PRESERVED_ITEMS.has(entry.name)) {
        preserved.push(fullPath);
        continue;
      }

      try {
        if (entry.isDirectory()) {
          await fs.rm(fullPath, { recursive: true, force: true });
          deleted.push(fullPath);
        } else {
          await fs.unlink(fullPath);
          deleted.push(fullPath);
        }
      } catch (err) {
        errors.push(`${fullPath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    errors.push(`${dirPath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { deleted, preserved, errors };
}

export async function POST(request: NextRequest) {
  // Security check: only allow on localhost
  if (!isLocalhost(request)) {
    return NextResponse.json(
      { error: 'This endpoint is only available on localhost' },
      { status: 403 }
    );
  }

  try {
    // Check if data directory exists
    try {
      await fs.access(DATA_DIR);
    } catch {
      return NextResponse.json({
        success: true,
        message: 'Data directory does not exist, nothing to delete',
        deleted: [],
      });
    }

    // Delete all contents of data directory (except preserved items)
    const { deleted, preserved, errors } = await deleteDirectoryContents(DATA_DIR);

    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        message: 'Some files could not be deleted',
        deleted,
        preserved,
        errors,
      });
    }

    const preservedMsg = preserved.length > 0 ? ` (preserved: ${preserved.map(p => path.basename(p)).join(', ')})` : '';
    return NextResponse.json({
      success: true,
      message: `Deleted ${deleted.length} items from data directory${preservedMsg}`,
      deleted,
      preserved,
    });
  } catch (err) {
    console.error('[Reset API] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Security check: only allow on localhost
  if (!isLocalhost(request)) {
    return NextResponse.json(
      { error: 'This endpoint is only available on localhost' },
      { status: 403 }
    );
  }

  // Return info about what would be deleted
  try {
    try {
      await fs.access(DATA_DIR);
    } catch {
      return NextResponse.json({
        exists: false,
        message: 'Data directory does not exist',
        contents: [],
      });
    }

    const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
    const contents = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      preserved: PRESERVED_ITEMS.has(entry.name),
    }));

    return NextResponse.json({
      exists: true,
      path: DATA_DIR,
      contents,
      preservedItems: Array.from(PRESERVED_ITEMS),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
