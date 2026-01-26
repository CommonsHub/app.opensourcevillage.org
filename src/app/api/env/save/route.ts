/**
 * API route to save environment variables to .env.local file
 *
 * Supports saving:
 * - CHAIN: The blockchain to use (gnosis, gnosis_chiado, base, base_sepolia)
 * - TOKEN_ADDRESS: The deployed token contract address
 * - NOSTR_RELAYS: Comma-separated list of NOSTR relay URLs
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const ENV_FILE_PATH = path.join(process.cwd(), '.env.local');

/**
 * Read and parse .env.local file into key-value pairs
 */
async function readEnvFile(): Promise<Map<string, string>> {
  const envMap = new Map<string, string>();

  try {
    const content = await readFile(ENV_FILE_PATH, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('#') || !line.trim()) {
        continue;
      }

      const equalIndex = line.indexOf('=');
      if (equalIndex > 0) {
        const key = line.substring(0, equalIndex).trim();
        const value = line.substring(equalIndex + 1).trim();
        envMap.set(key, value);
      }
    }
  } catch (error) {
    // File doesn't exist, return empty map
    console.log('[API /env/save] .env.local not found, will create new file');
  }

  return envMap;
}

/**
 * Write key-value pairs to .env.local file
 */
async function writeEnvFile(envMap: Map<string, string>): Promise<void> {
  const lines: string[] = [
    '# Open Source Village - Local Environment Variables',
    '# This file is auto-generated. Manual edits may be overwritten.',
    '',
  ];

  // Group variables by category
  const categories: Record<string, string[]> = {
    '# NOSTR Configuration': ['NOSTR_RELAYS', 'NOSTR_NSEC'],
    '# Token Configuration': ['CHAIN', 'TOKEN_ADDRESS', 'PRIVATE_KEY', 'BACKUP_PRIVATE_KEY'],
    '# Other': [],
  };

  const categorized = new Set<string>();

  for (const [category, keys] of Object.entries(categories)) {
    const categoryLines: string[] = [];

    for (const key of keys) {
      if (envMap.has(key)) {
        categoryLines.push(`${key}=${envMap.get(key)}`);
        categorized.add(key);
      }
    }

    if (categoryLines.length > 0) {
      lines.push(category);
      lines.push(...categoryLines);
      lines.push('');
    }
  }

  // Add any uncategorized keys
  const uncategorizedLines: string[] = [];
  for (const [key, value] of envMap) {
    if (!categorized.has(key)) {
      uncategorizedLines.push(`${key}=${value}`);
    }
  }

  if (uncategorizedLines.length > 0) {
    lines.push('# Other');
    lines.push(...uncategorizedLines);
    lines.push('');
  }

  await writeFile(ENV_FILE_PATH, lines.join('\n'), 'utf-8');
}

export async function POST(request: NextRequest) {
  console.log('[API /env/save] Received request to save environment variables');

  try {
    const body = await request.json();
    console.log('[API /env/save] Request body:', Object.keys(body));

    // Read existing env file
    const envMap = await readEnvFile();
    const updated: string[] = [];

    // Update CHAIN if provided
    if (body.CHAIN !== undefined) {
      const validChains = ['gnosis', 'gnosis_chiado', 'base', 'base_sepolia'];
      if (!validChains.includes(body.CHAIN)) {
        return NextResponse.json(
          { success: false, error: `Invalid chain. Must be one of: ${validChains.join(', ')}` },
          { status: 400 }
        );
      }
      envMap.set('CHAIN', body.CHAIN);
      updated.push('CHAIN');
      console.log('[API /env/save] Updated CHAIN:', body.CHAIN);
    }

    // Update TOKEN_ADDRESS if provided
    if (body.TOKEN_ADDRESS !== undefined) {
      if (body.TOKEN_ADDRESS && (!body.TOKEN_ADDRESS.startsWith('0x') || body.TOKEN_ADDRESS.length !== 42)) {
        return NextResponse.json(
          { success: false, error: 'Invalid token address. Must be a valid 0x address.' },
          { status: 400 }
        );
      }
      envMap.set('TOKEN_ADDRESS', body.TOKEN_ADDRESS);
      updated.push('TOKEN_ADDRESS');
      console.log('[API /env/save] Updated TOKEN_ADDRESS:', body.TOKEN_ADDRESS);
    }

    // Update NOSTR_RELAYS if provided
    if (body.NOSTR_RELAYS !== undefined) {
      let relays: string[];

      if (Array.isArray(body.NOSTR_RELAYS)) {
        relays = body.NOSTR_RELAYS.filter((r: string) => r && r.trim());
      } else if (typeof body.NOSTR_RELAYS === 'string') {
        relays = body.NOSTR_RELAYS.split(',').map((r: string) => r.trim()).filter((r: string) => r);
      } else {
        relays = [];
      }

      envMap.set('NOSTR_RELAYS', relays.join(','));
      updated.push('NOSTR_RELAYS');
      console.log('[API /env/save] Updated NOSTR_RELAYS:', relays);
    }

    // Write back to file
    await writeEnvFile(envMap);

    console.log('[API /env/save] Successfully saved .env.local');

    return NextResponse.json({
      success: true,
      message: 'Environment variables saved successfully',
      updated,
    });
  } catch (error) {
    console.error('[API /env/save] Error saving environment variables:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save environment variables',
      },
      { status: 500 }
    );
  }
}
