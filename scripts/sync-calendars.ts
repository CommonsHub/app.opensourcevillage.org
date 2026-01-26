#!/usr/bin/env npx tsx
/**
 * Google Calendar Sync Script
 *
 * Syncs local proposals.ics files to Google Calendar.
 * Run via: npm run sync-calendars
 *
 * This script:
 * 1. Checks each room's proposals.ics modification time vs last sync
 * 2. If changed, parses the ICS and syncs events to Google Calendar
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

// Load settings to get room calendar IDs
async function loadSettings(): Promise<{
  rooms: Array<{ name: string; slug?: string; calendarId: string }>;
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
  calendarId: string
): Promise<void> {
  const roomSlug = getRoomSlug(roomName);
  console.log(`\nSyncing ${roomName} (${roomSlug})...`);

  // Check if sync is needed
  if (!(await shouldSyncRoom(roomSlug))) {
    console.log('  No changes detected, skipping');
    return;
  }

  // Load local events from ICS
  const icsPath = path.join(CALENDARS_DIR, roomSlug, 'proposals.ics');
  let localEvents: ProposalEvent[] = [];

  try {
    const icsContent = await fs.readFile(icsPath, 'utf-8');
    localEvents = parseIcsFile(icsContent);
    console.log(`  Found ${localEvents.length} local events`);
  } catch (error) {
    console.log('  No proposals.ics file found');
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

  // Check for credentials
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

  // Sync each room
  for (const room of settings.rooms) {
    if (!room.calendarId) {
      console.log(`\nSkipping ${room.name}: no calendarId configured`);
      continue;
    }

    await syncRoom(calendar, room.name, room.calendarId);
  }

  console.log('\n=== Sync Complete ===');
}

// Run if executed directly
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { syncRoom, shouldSyncRoom, proposalToGoogleEvent };
