#!/usr/bin/env npx ts-node

/**
 * Refresh Google Calendar cache
 *
 * Fetches iCal data from all room calendars and saves to local cache.
 * Cache location: data/calendars/:room_slug/calendar.ics
 *
 * Usage:
 *   npm run refresh-calendars
 *   npx ts-node scripts/refresh-calendars.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Room configurations from settings.json
interface Room {
  name: string;
  calendarId: string;
  capacity: number;
  location: string;
}

// Convert room name to slug (e.g., "Ostrom Room" -> "ostrom-room")
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

async function fetchCalendarIcs(calendarId: string): Promise<string | null> {
  const icalUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;

  try {
    console.log(`  Fetching from: ${icalUrl.substring(0, 80)}...`);
    const response = await fetch(icalUrl);

    if (!response.ok) {
      console.error(`  Failed to fetch: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.text();
    console.log(`  Received ${data.length} bytes`);
    return data;
  } catch (error) {
    console.error(`  Error fetching calendar:`, error);
    return null;
  }
}

async function refreshCalendars() {
  console.log('=== Refreshing Google Calendar Cache ===\n');

  // Load settings
  const settingsPath = join(process.cwd(), 'settings.json');
  if (!existsSync(settingsPath)) {
    console.error('Error: settings.json not found');
    process.exit(1);
  }

  const settings = JSON.parse(require('fs').readFileSync(settingsPath, 'utf-8'));
  const rooms: Room[] = settings.rooms || [];

  if (rooms.length === 0) {
    console.error('Error: No rooms configured in settings.json');
    process.exit(1);
  }

  console.log(`Found ${rooms.length} rooms to refresh\n`);

  const cacheDir = join(process.cwd(), 'data', 'calendars');

  // Ensure cache directory exists
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  let successCount = 0;
  let errorCount = 0;

  for (const room of rooms) {
    const slug = toSlug(room.name);
    console.log(`[${room.name}] (${slug})`);

    if (!room.calendarId) {
      console.log('  Skipping: No calendar ID configured\n');
      continue;
    }

    const roomCacheDir = join(cacheDir, slug);

    // Ensure room cache directory exists
    if (!existsSync(roomCacheDir)) {
      mkdirSync(roomCacheDir, { recursive: true });
    }

    const icsData = await fetchCalendarIcs(room.calendarId);

    if (icsData) {
      const cachePath = join(roomCacheDir, 'calendar.ics');
      writeFileSync(cachePath, icsData, 'utf-8');
      console.log(`  Cached to: ${cachePath}\n`);
      successCount++;
    } else {
      console.log(`  Failed to cache\n`);
      errorCount++;
    }
  }

  console.log('=== Summary ===');
  console.log(`Successfully cached: ${successCount}/${rooms.length}`);
  if (errorCount > 0) {
    console.log(`Failed: ${errorCount}`);
  }

  // Write metadata
  const metadataPath = join(cacheDir, 'metadata.json');
  const metadata = {
    lastRefresh: new Date().toISOString(),
    roomsRefreshed: successCount,
    roomsFailed: errorCount,
    rooms: rooms.map(r => ({
      name: r.name,
      slug: toSlug(r.name),
      calendarId: r.calendarId ? '***' : null,
    })),
  };
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8');
  console.log(`\nMetadata written to: ${metadataPath}`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

// Run the script
refreshCalendars().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
