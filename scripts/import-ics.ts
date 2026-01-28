#!/usr/bin/env npx tsx
/**
 * Import ICS file to a room's Google Calendar
 *
 * Usage: bun run import-ics <ics-url> <room-slug>
 *
 * Example:
 *   bun run import-ics https://example.com/calendar.ics ostrom
 *   bun run import-ics https://example.com/calendar.ics satoshi
 *
 * This script:
 * 1. Fetches ICS from URL
 * 2. Saves a copy to data/calendars/{roomSlug}/imported-{timestamp}.ics
 * 3. Creates events in the room's Google Calendar
 *
 * Requires: google-account-key.json in project root
 */

import fs from 'fs/promises';
import path from 'path';
import { google, calendar_v3 } from 'googleapis';

// Configuration
const CREDENTIALS_PATH = path.join(process.cwd(), 'google-account-key.json');
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const CALENDARS_DIR = path.join(DATA_DIR, 'calendars');

interface ParsedEvent {
  uid: string;
  summary: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  status: string;
}

interface RoomConfig {
  name: string;
  slug: string;
  calendarId: string;
}

/**
 * Parse iCal date format to JavaScript Date
 * Handles formats: YYYYMMDDTHHMMSSZ, YYYYMMDDTHHMMSS, YYYYMMDD
 */
function parseICalDate(dateStr: string): Date {
  // Remove any TZID parameter prefix
  const cleanDate = dateStr.includes(':') ? dateStr.split(':').pop()! : dateStr;

  // Remove Z suffix for parsing, we'll handle it separately
  const hasZ = cleanDate.endsWith('Z');
  const dateOnly = cleanDate.replace('Z', '');

  if (dateOnly.length === 8) {
    // All-day event: YYYYMMDD
    const year = parseInt(dateOnly.substring(0, 4));
    const month = parseInt(dateOnly.substring(4, 6)) - 1;
    const day = parseInt(dateOnly.substring(6, 8));
    return new Date(year, month, day);
  }

  // DateTime format: YYYYMMDDTHHMMSS
  const year = parseInt(dateOnly.substring(0, 4));
  const month = parseInt(dateOnly.substring(4, 6)) - 1;
  const day = parseInt(dateOnly.substring(6, 8));
  const hour = parseInt(dateOnly.substring(9, 11));
  const minute = parseInt(dateOnly.substring(11, 13));
  const second = parseInt(dateOnly.substring(13, 15)) || 0;

  if (hasZ) {
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }

  return new Date(year, month, day, hour, minute, second);
}

/**
 * Unescape iCal text fields
 */
function unescapeICalText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Parse ICS content into events
 */
function parseIcsContent(icsContent: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const eventBlocks = icsContent.split('BEGIN:VEVENT');

  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i];
    const endIndex = block.indexOf('END:VEVENT');
    if (endIndex === -1) continue;

    const eventData = block.substring(0, endIndex);
    const event = parseEventBlock(eventData);
    if (event) {
      events.push(event);
    }
  }

  return events;
}

/**
 * Parse a single VEVENT block
 */
function parseEventBlock(eventData: string): ParsedEvent | null {
  try {
    const lines = eventData.split(/\r?\n/).map(l => l.trimEnd());
    const fields: Record<string, string> = {};
    let currentField = '';

    // Parse fields (handle line continuations)
    for (const line of lines) {
      if (line.startsWith(' ') || line.startsWith('\t')) {
        // Continuation of previous field
        if (currentField) {
          fields[currentField] += line.substring(1);
        }
      } else if (line.includes(':')) {
        const colonIndex = line.indexOf(':');
        const key = line.substring(0, colonIndex);
        const value = line.substring(colonIndex + 1);
        currentField = key.split(';')[0]; // Handle parameters like DTSTART;TZID=...
        fields[currentField] = value;
      }
    }

    const uid = fields['UID'];
    const summary = fields['SUMMARY'];
    const dtStart = fields['DTSTART'];
    const dtEnd = fields['DTEND'];

    if (!uid || !summary || !dtStart) {
      return null;
    }

    return {
      uid,
      summary: unescapeICalText(summary),
      description: unescapeICalText(fields['DESCRIPTION'] || ''),
      startTime: parseICalDate(dtStart),
      endTime: dtEnd ? parseICalDate(dtEnd) : parseICalDate(dtStart),
      location: unescapeICalText(fields['LOCATION'] || ''),
      status: (fields['STATUS'] || 'CONFIRMED').toUpperCase(),
    };
  } catch (error) {
    console.error('Error parsing event block:', error);
    return null;
  }
}

/**
 * Load settings and find room by slug
 */
async function findRoomBySlug(slug: string): Promise<RoomConfig | null> {
  const settingsPath = path.join(process.cwd(), 'settings.json');
  const content = await fs.readFile(settingsPath, 'utf-8');
  const settings = JSON.parse(content);

  for (const room of settings.rooms || []) {
    if (room.slug === slug) {
      return {
        name: room.name,
        slug: room.slug,
        calendarId: room.calendarId,
      };
    }
  }

  return null;
}

/**
 * Get Google Calendar API client
 */
async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  const authClient = await auth.getClient();
  return google.calendar({ version: 'v3', auth: authClient as any });
}

/**
 * Convert parsed event to Google Calendar event format
 */
function toGoogleEvent(event: ParsedEvent, roomName: string): calendar_v3.Schema$Event {
  return {
    summary: event.summary,
    description: event.description,
    location: roomName,
    start: {
      dateTime: event.startTime.toISOString(),
      timeZone: 'Europe/Brussels',
    },
    end: {
      dateTime: event.endTime.toISOString(),
      timeZone: 'Europe/Brussels',
    },
    status: event.status === 'CANCELLED' ? 'cancelled' : 'confirmed',
    iCalUID: `imported-${event.uid}`,
  };
}

/**
 * Import events to Google Calendar
 */
async function importEvents(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  roomName: string,
  events: ParsedEvent[]
): Promise<{ created: number; skipped: number; errors: number }> {
  const stats = { created: 0, skipped: 0, errors: 0 };

  for (const event of events) {
    const googleEvent = toGoogleEvent(event, roomName);

    try {
      // Try to create the event
      await calendar.events.insert({
        calendarId,
        requestBody: googleEvent,
      });
      stats.created++;
      console.log(`  Created: ${event.summary} (${event.startTime.toISOString()})`);
    } catch (error: any) {
      if (error.code === 409 || error.message?.includes('identifier already exists')) {
        stats.skipped++;
        console.log(`  Skipped (exists): ${event.summary}`);
      } else {
        stats.errors++;
        console.error(`  Error creating "${event.summary}":`, error.message || error);
      }
    }
  }

  return stats;
}

/**
 * Fetch ICS content from URL
 */
async function fetchIcs(url: string): Promise<string> {
  console.log(`Fetching ICS from: ${url}`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ICS: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

/**
 * Save ICS content to local file
 */
async function saveIcsLocally(roomSlug: string, icsContent: string, sourceUrl: string): Promise<string> {
  const calendarDir = path.join(CALENDARS_DIR, roomSlug);

  // Create directory if it doesn't exist
  await fs.mkdir(calendarDir, { recursive: true });

  // Create filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `imported-${timestamp}.ics`;
  const filePath = path.join(calendarDir, filename);

  // Add import metadata as comments at the top
  const header = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Open Source Village//ICS Import//EN',
    'VERSION:2.0',
    `X-OSV-IMPORT-SOURCE:${sourceUrl}`,
    `X-OSV-IMPORT-DATE:${new Date().toISOString()}`,
  ].join('\r\n');

  // Replace the original VCALENDAR header with our enriched one
  const enrichedContent = icsContent.replace(
    /BEGIN:VCALENDAR[^\r\n]*(\r?\n)([^\r\n]*VERSION[^\r\n]*(\r?\n))?/i,
    header + '\r\n'
  );

  await fs.writeFile(filePath, enrichedContent, 'utf-8');

  return filePath;
}

/**
 * Save import log
 */
async function saveImportLog(
  roomSlug: string,
  sourceUrl: string,
  events: ParsedEvent[],
  stats: { created: number; skipped: number; errors: number }
): Promise<string> {
  const calendarDir = path.join(CALENDARS_DIR, roomSlug);
  const logPath = path.join(calendarDir, 'import-log.json');

  // Load existing log or create new
  let log: any[] = [];
  try {
    const existing = await fs.readFile(logPath, 'utf-8');
    log = JSON.parse(existing);
  } catch {
    // File doesn't exist, start fresh
  }

  // Add new entry
  log.push({
    timestamp: new Date().toISOString(),
    source: sourceUrl,
    eventsFound: events.length,
    created: stats.created,
    skipped: stats.skipped,
    errors: stats.errors,
    events: events.map(e => ({
      uid: e.uid,
      summary: e.summary,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime.toISOString(),
    })),
  });

  await fs.writeFile(logPath, JSON.stringify(log, null, 2) + '\n', 'utf-8');

  return logPath;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: bun run import-ics <ics-url> <room-slug>');
    console.log('');
    console.log('Available room slugs:');
    const settingsPath = path.join(process.cwd(), 'settings.json');
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content);
    for (const room of settings.rooms || []) {
      console.log(`  ${room.slug} - ${room.name}`);
    }
    process.exit(1);
  }

  const [icsUrl, roomSlug] = args;

  console.log('=== ICS Import Tool ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // Check for credentials
  try {
    await fs.access(CREDENTIALS_PATH);
  } catch {
    console.error('Error: google-account-key.json not found.');
    console.error('Please add Google service account credentials to the project root.');
    process.exit(1);
  }

  // Find room
  const room = await findRoomBySlug(roomSlug);
  if (!room) {
    console.error(`Error: Room with slug "${roomSlug}" not found.`);
    console.log('');
    console.log('Available room slugs:');
    const settingsPath = path.join(process.cwd(), 'settings.json');
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content);
    for (const r of settings.rooms || []) {
      console.log(`  ${r.slug} - ${r.name}`);
    }
    process.exit(1);
  }

  console.log(`Target room: ${room.name} (${room.slug})`);
  console.log(`Google Calendar ID: ${room.calendarId}`);

  // Fetch and parse ICS
  const icsContent = await fetchIcs(icsUrl);
  const events = parseIcsContent(icsContent);

  console.log(`Found ${events.length} events in ICS file`);

  if (events.length === 0) {
    console.log('No events to import.');
    process.exit(0);
  }

  // Show preview
  console.log('\nEvents to import:');
  for (const event of events.slice(0, 10)) {
    console.log(`  - ${event.summary} (${event.startTime.toLocaleDateString()})`);
  }
  if (events.length > 10) {
    console.log(`  ... and ${events.length - 10} more`);
  }

  // Save ICS file locally
  console.log('\n--- Saving files ---');
  const icsFilePath = await saveIcsLocally(room.slug, icsContent, icsUrl);
  console.log(`[CREATED] ${icsFilePath}`);

  // Get Calendar API client
  const calendar = await getCalendarClient();
  console.log('\nGoogle Calendar API client initialized');

  // Import events to Google Calendar
  console.log('\n--- Importing to Google Calendar ---');
  console.log(`Calendar: ${room.name} (${room.calendarId})`);
  const stats = await importEvents(calendar, room.calendarId, room.name, events);

  // Save import log
  const logFilePath = await saveImportLog(room.slug, icsUrl, events, stats);
  console.log(`\n[UPDATED] ${logFilePath}`);

  console.log('\n=== Import Complete ===');
  console.log('');
  console.log('Files updated:');
  console.log(`  ${icsFilePath}`);
  console.log(`  ${logFilePath}`);
  console.log('');
  console.log('Google Calendar updated:');
  console.log(`  Calendar: ${room.name}`);
  console.log(`  Created: ${stats.created} events`);
  console.log(`  Skipped: ${stats.skipped} (already exist)`);
  console.log(`  Errors: ${stats.errors}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
