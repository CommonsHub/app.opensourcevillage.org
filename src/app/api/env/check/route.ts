/**
 * API route to return settings from settings.json
 * Used by OfferForm to load workshop defaults
 */

import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

interface Settings {
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
  const settings = await loadSettings();

  return NextResponse.json({
    settings: {
      defaults: settings.defaults,
      tokenEconomics: settings.tokenEconomics,
    },
  });
}
