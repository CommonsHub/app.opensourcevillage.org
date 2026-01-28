#!/usr/bin/env npx tsx
/**
 * Google Calendar Sync Script
 *
 * Bidirectional sync between local calendar files and Google Calendar.
 * Run via: npm run sync-calendars
 *
 * This script:
 * 1. Downloads events FROM Google Calendar and saves to local calendar.ics files
 * 2. Uploads local proposals.ics events TO Google Calendar
 * 3. Updates .sync-metadata with the new sync timestamp
 *
 * Requires: google-account-key.json in project root
 */

import fs from 'fs/promises';
import path from 'path';
import { google, calendar_v3 } from 'googleapis';
import { parseIcsFile, getRoomSlug, type ProposalEvent } from '../src/lib/local-calendar';

// Configuration
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const CALENDARS_DIR = path.join(DATA_DIR, 'calendars');
const CREDENTIALS_PATH = path.join(process.cwd(), 'google-account-key.json');

/**
 * Format date to ICS format (YYYYMMDDTHHMMSSZ)
 */
function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escape text for ICS format
 */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Convert Google Calendar events to ICS format
 */
function eventsToIcs(events: calendar_v3.Schema$Event[], calendarName: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Open Source Village//Calendar Sync//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    'X-WR-TIMEZONE:Europe/Brussels',
  ];

  for (const event of events) {
    if (!event.start || !event.id) continue;

    const startDate = event.start.dateTime
      ? new Date(event.start.dateTime)
      : event.start.date
      ? new Date(event.start.date)
      : null;

    const endDate = event.end?.dateTime
      ? new Date(event.end.dateTime)
      : event.end?.date
      ? new Date(event.end.date)
      : startDate;

    if (!startDate || !endDate) continue;

    lines.push('BEGIN:VEVENT');
    lines.push(`DTSTART:${formatIcsDate(startDate)}`);
    lines.push(`DTEND:${formatIcsDate(endDate)}`);
    lines.push(`DTSTAMP:${formatIcsDate(new Date())}`);
    lines.push(`UID:${event.id}@google.com`);
    lines.push(`SUMMARY:${escapeIcsText(event.summary || 'Untitled')}`);

    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    }

    if (event.location) {
      lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    }

    const status = event.status?.toUpperCase() || 'CONFIRMED';
    lines.push(`STATUS:${status}`);

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Download events from Google Calendar using authenticated API and save to local calendar.ics file
 */
async function downloadFromGoogleCalendar(
  calendar: calendar_v3.Calendar,
  roomName: string,
  calendarId: string,
  eventDates: { start: string; end: string }
): Promise<boolean> {
  const roomSlug = getRoomSlug(roomName);
  const calendarDir = path.join(CALENDARS_DIR, roomSlug);
  const calendarPath = path.join(calendarDir, 'calendar.ics');

  try {
    // Create directory if it doesn't exist
    await fs.mkdir(calendarDir, { recursive: true });

    console.log(`  Fetching events from Google Calendar API...`);

    // Use event dates from settings (start at midnight, end at end of day)
    const timeMin = new Date(`${eventDates.start}T00:00:00Z`);
    const timeMax = new Date(`${eventDates.end}T23:59:59Z`);

    console.log(`  Date range: ${eventDates.start} to ${eventDates.end}`);

    const response = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
    });

    const events = response.data.items || [];
    console.log(`  Found ${events.length} events`);

    // Convert to ICS format
    const icsContent = eventsToIcs(events, roomName);

    // Save to local file
    await fs.writeFile(calendarPath, icsContent, 'utf-8');
    console.log(`  Saved to ${calendarPath}`);

    return true;
  } catch (error: any) {
    console.error(`  Error downloading calendar:`, error.message || error);
    return false;
  }
}

/**
 * Download all room calendars from Google using authenticated API
 */
async function downloadAllCalendars(
  calendar: calendar_v3.Calendar,
  settings: {
    rooms: Array<{ name: string; slug?: string; calendarId: string }>;
    eventDates?: { start: string; end: string };
  }
): Promise<{ success: number; failed: number }> {
  console.log('\n--- Downloading events FROM Google Calendar ---');

  // Get event dates from settings or use defaults
  const eventDates = settings.eventDates || {
    start: new Date().toISOString().split('T')[0],
    end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  };

  console.log(`Event date range: ${eventDates.start} to ${eventDates.end}`);

  let success = 0;
  let failed = 0;

  for (const room of settings.rooms) {
    if (!room.calendarId) {
      console.log(`\nSkipping ${room.name}: no calendarId configured`);
      continue;
    }

    console.log(`\nDownloading ${room.name}...`);
    const result = await downloadFromGoogleCalendar(calendar, room.name, room.calendarId, eventDates);

    if (result) {
      success++;
    } else {
      failed++;
    }
  }

  // Update metadata
  const metadataPath = path.join(CALENDARS_DIR, 'metadata.json');
  const metadata = {
    lastRefresh: new Date().toISOString(),
    roomsRefreshed: success,
    roomsFailed: failed,
  };

  try {
    await fs.mkdir(CALENDARS_DIR, { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8');
  } catch (error) {
    console.error('Error writing metadata:', error);
  }

  console.log(`\nDownload complete: ${success} succeeded, ${failed} failed`);
  return { success, failed };
}

// Load settings to get room calendar IDs and event dates
async function loadSettings(): Promise<{
  rooms: Array<{ name: string; slug?: string; calendarId: string }>;
  eventDates?: { start: string; end: string };
}> {
  const settingsPath = path.join(process.cwd(), 'settings.json');
  const content = await fs.readFile(settingsPath, 'utf-8');
  return JSON.parse(content);
}

// Get Google Calendar API client
async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  const authClient = await auth.getClient();
  return google.calendar({ version: 'v3', auth: authClient as any });
}

// getRoomSlug is imported from local-calendar.ts

// Offer interface matching the stored JSON format
interface Offer {
  id: string;
  type: string;
  title: string;
  description?: string;
  authors: string[];
  status: string;
  startTime?: string;
  endTime?: string;
  room?: string;
  rsvpCount?: number;
  minRsvps?: number;
  maxAttendees?: number;
}

/**
 * Load all confirmed offers (workshop, private) from data/offers directory
 */
async function loadConfirmedOffers(): Promise<Offer[]> {
  const offersDir = path.join(DATA_DIR, 'offers');
  const offers: Offer[] = [];

  try {
    const files = await fs.readdir(offersDir);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const content = await fs.readFile(path.join(offersDir, file), 'utf-8');
        const offer: Offer = JSON.parse(content);

        // Only include confirmed workshops and private events with a room and time
        if (
          offer.status === 'confirmed' &&
          (offer.type === 'workshop' || offer.type === 'private') &&
          offer.room &&
          offer.startTime
        ) {
          offers.push(offer);
        }
      } catch (err) {
        console.warn(`  Warning: Could not parse ${file}`);
      }
    }
  } catch (err) {
    console.warn('  Warning: Could not read offers directory');
  }

  return offers;
}

/**
 * Convert Offer to ProposalEvent format for syncing
 */
function offerToProposalEvent(offer: Offer): ProposalEvent {
  return {
    offerId: offer.id,
    title: offer.title,
    description: offer.description || '',
    startTime: new Date(offer.startTime!),
    endTime: offer.endTime ? new Date(offer.endTime) : new Date(new Date(offer.startTime!).getTime() + 60 * 60 * 1000),
    room: offer.room!,
    status: 'CONFIRMED',
    minRsvps: offer.minRsvps || 1,
    attendees: [], // We don't have attendee details here, but count is in rsvpCount
  };
}

// Get last sync time from .sync-metadata
async function getLastSyncTime(roomSlug: string): Promise<Date | null> {
  const metadataPath = path.join(CALENDARS_DIR, roomSlug, '.sync-metadata');
  try {
    const content = await fs.readFile(metadataPath, 'utf-8');
    return new Date(content.trim());
  } catch {
    return null;
  }
}

// Update sync metadata
async function updateSyncMetadata(roomSlug: string): Promise<void> {
  const metadataPath = path.join(CALENDARS_DIR, roomSlug, '.sync-metadata');
  await fs.writeFile(metadataPath, new Date().toISOString());
}

// Get file modification time
async function getFileModTime(filePath: string): Promise<Date | null> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime;
  } catch {
    return null;
  }
}

// Check if room needs syncing
async function shouldSyncRoom(roomSlug: string): Promise<boolean> {
  const proposalsPath = path.join(CALENDARS_DIR, roomSlug, 'proposals.ics');
  const proposalsModTime = await getFileModTime(proposalsPath);

  if (!proposalsModTime) {
    // No proposals file, nothing to sync
    return false;
  }

  const lastSyncTime = await getLastSyncTime(roomSlug);
  if (!lastSyncTime) {
    // Never synced, should sync
    return true;
  }

  // Sync if proposals.ics is newer than last sync
  return proposalsModTime > lastSyncTime;
}

// Convert ProposalEvent to Google Calendar event
function proposalToGoogleEvent(
  event: ProposalEvent
): calendar_v3.Schema$Event {
  // Note: We don't sync attendees to Google Calendar because service accounts
  // cannot add attendees without Domain-Wide Delegation of Authority.
  // Attendee info is stored in extendedProperties for reference.

  // Build description with attendee count
  const attendeeInfo = event.attendees.length > 0
    ? `\n\nRSVPs: ${event.attendees.length} (${event.attendees.map(a => a.username).join(', ')})`
    : '';

  return {
    summary: event.title,
    description: (event.description || '') + attendeeInfo,
    location: event.room,
    start: {
      dateTime: event.startTime.toISOString(),
      timeZone: 'UTC',
    },
    end: {
      dateTime: event.endTime.toISOString(),
      timeZone: 'UTC',
    },
    // Map local status to Google Calendar status
    // Google supports: 'confirmed', 'tentative', 'cancelled'
    status: event.status === 'CANCELLED'
      ? 'cancelled'
      : event.status === 'TENTATIVE'
      ? 'tentative'
      : 'confirmed',
    // Store our UID for matching
    iCalUID: `offer-${event.offerId}@opensourcevillage.org`,
    // Extended properties for OSV-specific data
    extendedProperties: {
      private: {
        osvOfferId: event.offerId,
        osvMinRsvps: String(event.minRsvps),
        osvStatus: event.status,
        osvAttendeeCount: String(event.attendees.length),
        osvAttendeeNpubs: event.attendees.map((a) => a.npub).join(','),
      },
    },
    // Note: attendees field omitted - service accounts can't add attendees
  };
}

// Fetch existing events from Google Calendar
async function fetchExistingEvents(
  calendar: calendar_v3.Calendar,
  calendarId: string
): Promise<Map<string, calendar_v3.Schema$Event>> {
  const events = new Map<string, calendar_v3.Schema$Event>();

  try {
    // Fetch events from 30 days ago to 1 year in the future
    // This ensures we find events that may have been synced before
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const response = await calendar.events.list({
      calendarId,
      timeMin: thirtyDaysAgo.toISOString(),
      timeMax: oneYearFromNow.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
    });

    for (const event of response.data.items || []) {
      if (event.iCalUID?.includes('@opensourcevillage.org')) {
        events.set(event.iCalUID, event);
      }
    }
  } catch (error) {
    console.error(`Error fetching events from ${calendarId}:`, error);
  }

  return events;
}

// Sync events to Google Calendar
async function syncToGoogleCalendar(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  localEvents: ProposalEvent[]
): Promise<{ created: number; updated: number; deleted: number; errors: number }> {
  const stats = { created: 0, updated: 0, deleted: 0, errors: 0 };

  // Fetch existing events from Google
  const existingEvents = await fetchExistingEvents(calendar, calendarId);
  const localUids = new Set(
    localEvents.map((e) => `offer-${e.offerId}@opensourcevillage.org`)
  );

  // Create or update local events
  for (const localEvent of localEvents) {
    // Only sync confirmed events to Google Calendar
    // Tentative and cancelled events should be deleted (if they exist) or skipped
    if (localEvent.status !== 'CONFIRMED') continue;

    const uid = `offer-${localEvent.offerId}@opensourcevillage.org`;
    const existingEvent = existingEvents.get(uid);
    const googleEvent = proposalToGoogleEvent(localEvent);

    try {
      if (existingEvent) {
        // Update existing event - remove iCalUID as it's immutable
        const { iCalUID, ...updateEvent } = googleEvent;
        await calendar.events.update({
          calendarId,
          eventId: existingEvent.id!,
          requestBody: updateEvent,
        });
        stats.updated++;
        console.log(`  Updated: ${localEvent.title}`);
      } else {
        // Create new event
        try {
          await calendar.events.insert({
            calendarId,
            requestBody: googleEvent,
          });
          stats.created++;
          console.log(`  Created: ${localEvent.title}`);
        } catch (insertError: any) {
          // If event already exists (wasn't in our fetch window), try to find and update it
          if (insertError.message?.includes('identifier already exists') ||
              insertError.code === 409) {
            console.log(`  Event exists, searching to update: ${localEvent.title}`);
            // Search for the event by iCalUID using import endpoint
            try {
              const { iCalUID, ...updateEvent } = googleEvent;
              // Use list with iCalUID filter to find the event
              const searchResult = await calendar.events.list({
                calendarId,
                iCalUID: uid,
                maxResults: 1,
              });
              if (searchResult.data.items && searchResult.data.items.length > 0) {
                const foundEvent = searchResult.data.items[0];
                await calendar.events.update({
                  calendarId,
                  eventId: foundEvent.id!,
                  requestBody: updateEvent,
                });
                stats.updated++;
                console.log(`  Updated (found by UID): ${localEvent.title}`);
              } else {
                throw new Error('Event exists but could not be found for update');
              }
            } catch (searchError) {
              console.error(`  Error finding/updating ${localEvent.title}:`, searchError);
              stats.errors++;
            }
          } else {
            throw insertError;
          }
        }
      }
    } catch (error) {
      console.error(`  Error syncing ${localEvent.title}:`, error);
      stats.errors++;
    }
  }

  // Delete events that are no longer local or not confirmed
  for (const [uid, existingEvent] of existingEvents) {
    const localEvent = localEvents.find(
      (e) => `offer-${e.offerId}@opensourcevillage.org` === uid
    );

    // Delete if event doesn't exist locally or is not confirmed
    if (!localEvent || localEvent.status !== 'CONFIRMED') {
      try {
        await calendar.events.delete({
          calendarId,
          eventId: existingEvent.id!,
        });
        stats.deleted++;
        console.log(`  Deleted: ${existingEvent.summary}`);
      } catch (error) {
        console.error(`  Error deleting ${existingEvent.summary}:`, error);
        stats.errors++;
      }
    }
  }

  return stats;
}

// Main sync function
async function syncRoom(
  calendar: calendar_v3.Calendar,
  roomName: string,
  calendarId: string,
  confirmedOffers: Offer[]
): Promise<void> {
  const roomSlug = getRoomSlug(roomName);
  console.log(`\nSyncing ${roomName} (${roomSlug})...`);

  // Load local events from proposals.ics (if exists)
  const icsPath = path.join(CALENDARS_DIR, roomSlug, 'proposals.ics');
  let localEvents: ProposalEvent[] = [];

  try {
    const icsContent = await fs.readFile(icsPath, 'utf-8');
    localEvents = parseIcsFile(icsContent);
    console.log(`  Found ${localEvents.length} events from proposals.ics`);
  } catch (error) {
    console.log('  No proposals.ics file found');
  }

  // Add confirmed offers for this room
  const roomOffers = confirmedOffers.filter(o => o.room === roomName);
  const offerEvents = roomOffers.map(offerToProposalEvent);
  console.log(`  Found ${offerEvents.length} confirmed offers for this room`);

  // Merge events (avoid duplicates by offerId)
  const existingOfferIds = new Set(localEvents.map(e => e.offerId));
  for (const offerEvent of offerEvents) {
    if (!existingOfferIds.has(offerEvent.offerId)) {
      localEvents.push(offerEvent);
    }
  }

  console.log(`  Total events to sync: ${localEvents.length}`);

  if (localEvents.length === 0) {
    console.log('  No events to sync');
    return;
  }

  // Sync to Google Calendar
  const stats = await syncToGoogleCalendar(calendar, calendarId, localEvents);
  console.log(
    `  Completed: ${stats.created} created, ${stats.updated} updated, ${stats.deleted} deleted, ${stats.errors} errors`
  );

  // Update sync metadata
  if (stats.errors === 0) {
    await updateSyncMetadata(roomSlug);
    console.log('  Sync metadata updated');
  } else {
    console.log('  Sync metadata NOT updated due to errors');
  }
}

// Main entry point
async function main(): Promise<void> {
  console.log('=== Google Calendar Sync ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // Check for credentials (required for both download and upload now)
  try {
    await fs.access(CREDENTIALS_PATH);
  } catch {
    console.error(
      'Error: google-account-key.json not found. Please add Google service account credentials.'
    );
    process.exit(1);
  }

  // Load settings
  const settings = await loadSettings();
  if (!settings.rooms || settings.rooms.length === 0) {
    console.error('Error: No rooms configured in settings.json');
    process.exit(1);
  }

  // Get Calendar API client
  const calendar = await getCalendarClient();
  console.log('Google Calendar API client initialized');

  // Step 1: Download events FROM Google Calendar (using authenticated API)
  await downloadAllCalendars(calendar, settings);

  // Step 2: Upload confirmed events TO Google Calendar
  console.log('\n--- Uploading confirmed events TO Google Calendar ---');

  // Load all confirmed offers
  const confirmedOffers = await loadConfirmedOffers();
  console.log(`Found ${confirmedOffers.length} confirmed offers to sync`);

  // Sync each room
  for (const room of settings.rooms) {
    if (!room.calendarId) {
      console.log(`\nSkipping ${room.name}: no calendarId configured`);
      continue;
    }

    await syncRoom(calendar, room.name, room.calendarId, confirmedOffers);
  }

  console.log('\n=== Sync Complete ===');
}

// Run if executed directly
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { syncRoom, shouldSyncRoom, proposalToGoogleEvent };
