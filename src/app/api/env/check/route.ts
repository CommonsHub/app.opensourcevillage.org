/**
 * API route to check for required settings (NOSTR relays from settings.json)
 */

import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

interface Settings {
  nostrRelays?: string[];
  defaults?: {
    workshops?: {
      attendees?: {
        min?: number;
        max?: number;
      };
    };
  };
  tokenEconomics?: {
    initialBalance?: number;
    offerCreationCost?: number;
    proposalBurnCost?: number;
    rsvpCost?: number;
    claimCost?: number;
  };
  [key: string]: unknown;
}

async function loadSettings(): Promise<Settings> {
  try {
    const settingsPath = path.join(process.cwd(), 'settings.json');
    const content = await readFile(settingsPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function GET() {
  console.log('[API /env/check] Checking settings.json for NOSTR relays...');

  const missing: string[] = [];
  const configured: string[] = [];

  const settings = await loadSettings();

  // Check for nostrRelays in settings.json
  if (!settings.nostrRelays || settings.nostrRelays.length === 0) {
    console.log('[API /env/check] Missing required setting: nostrRelays');
    missing.push('NOSTR_RELAYS');
  } else {
    console.log(`[API /env/check] Found nostrRelays: ${settings.nostrRelays.length} relay(s)`);
    configured.push('NOSTR_RELAYS');
  }

  const response = {
    missing,
    configured,
    allSet: missing.length === 0,
    nostrRelays: settings.nostrRelays || [],
    settings: {
      defaults: settings.defaults,
      tokenEconomics: settings.tokenEconomics,
    },
  };

  console.log('[API /env/check] Result:', { ...response, settings: '...' });

  return NextResponse.json(response);
}
