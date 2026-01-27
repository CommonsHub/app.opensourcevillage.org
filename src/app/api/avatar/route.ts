/**
 * Avatar Upload API Endpoint
 *
 * POST /api/avatar - Upload user avatar image
 *
 * Flow:
 * 1. Save to $DATA_DIR/npubs/{npub}/avatar.png
 * 2. Upload to Primal Blossom server
 * 3. Return both local and Blossom URLs
 * 4. Client updates NOSTR kind 0 with picture field
 *
 * @see specs/TECHNICAL_SPEC.md#avatar-upload-flow
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { validateNpub } from '@/lib/nostr-server';

// Maximum avatar file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed image types
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// Data directory
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');

// ============================================================================
// POST /api/avatar
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Parse form data
    const formData = await request.formData();
    const file = formData.get('avatar') as File | null;
    const npub = formData.get('npub') as string | null;

    // Validate inputs
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!npub) {
      return NextResponse.json(
        { success: false, error: 'npub is required' },
        { status: 400 }
      );
    }

    if (!validateNpub(npub)) {
      return NextResponse.json(
        { success: false, error: 'Invalid npub format' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 }
      );
    }

    // Read file data
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Determine file extension
    const extension = getFileExtension(file.type);

    // Create profile directory if it doesn't exist
    const profileDir = join(DATA_DIR, 'npubs', npub);
    await mkdir(profileDir, { recursive: true });

    // Save file
    const filename = `avatar.${extension}`;
    const filepath = join(profileDir, filename);
    await writeFile(filepath, buffer);

    // Create local URL
    const localUrl = `/data/npubs/${npub}/${filename}`;

    // Upload to Blossom server (optional, can fail gracefully)
    let blossomUrl: string | null = null;
    try {
      blossomUrl = await uploadToBlossom(buffer, file.type, npub);
    } catch (error) {
      console.error('Failed to upload to Blossom server:', error);
      // Continue without Blossom URL - local avatar will still work
    }

    return NextResponse.json({
      success: true,
      localUrl,
      blossomUrl,
      message: 'Avatar uploaded successfully',
    });
  } catch (error) {
    console.error('Failed to upload avatar:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to upload avatar',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get file extension from MIME type
 */
function getFileExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return map[mimeType] || 'jpg';
}

/**
 * Upload image to Primal Blossom server
 *
 * Blossom is a NOSTR-compatible file storage protocol.
 * Primal provides a public Blossom server at https://blossom.primal.net
 *
 * @see https://github.com/opencollective/opendocs (reference)
 * @see https://github.com/hzrd149/blossom (protocol)
 */
async function uploadToBlossom(
  buffer: Buffer,
  mimeType: string,
  npub: string
): Promise<string> {
  // Primal Blossom server endpoint
  const BLOSSOM_SERVER = 'https://blossom.primal.net/upload';

  // Create form data for Blossom upload
  const formData = new FormData();
  // Convert Buffer to Uint8Array for Blob compatibility
  const uint8Array = new Uint8Array(buffer);
  const blob = new Blob([uint8Array], { type: mimeType });
  formData.append('file', blob, 'avatar.jpg');

  // Upload to Blossom
  const response = await fetch(BLOSSOM_SERVER, {
    method: 'POST',
    body: formData,
    headers: {
      // Optional: Add NOSTR auth header if required
      // 'Authorization': `Nostr ${base64(signedEvent)}`
    },
  });

  if (!response.ok) {
    throw new Error(`Blossom upload failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Blossom returns a URL or hash
  // Format: https://blossom.primal.net/{hash}
  if (data.url) {
    return data.url;
  } else if (data.sha256) {
    return `https://blossom.primal.net/${data.sha256}`;
  } else {
    throw new Error('Blossom server returned invalid response');
  }
}

/**
 * Get current avatar for user
 *
 * GET /api/avatar?npub={npub}
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const npub = searchParams.get('npub');

    if (!npub) {
      return NextResponse.json(
        { success: false, error: 'npub is required' },
        { status: 400 }
      );
    }

    if (!validateNpub(npub)) {
      return NextResponse.json(
        { success: false, error: 'Invalid npub format' },
        { status: 400 }
      );
    }

    // Check for avatar file
    const profileDir = join(DATA_DIR, 'npubs', npub);

    // Try different extensions
    for (const ext of ['jpg', 'png', 'webp']) {
      const filepath = join(profileDir, `avatar.${ext}`);
      try {
        const fs = await import('fs/promises');
        await fs.access(filepath);

        // File exists
        const localUrl = `/data/npubs/${npub}/avatar.${ext}`;
        return NextResponse.json({
          success: true,
          localUrl,
          exists: true,
        });
      } catch {
        // File doesn't exist, try next extension
        continue;
      }
    }

    // No avatar found
    return NextResponse.json({
      success: true,
      exists: false,
      message: 'No avatar uploaded',
    });
  } catch (error) {
    console.error('Failed to get avatar:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get avatar',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
