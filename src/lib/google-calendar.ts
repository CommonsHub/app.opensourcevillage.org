/**
 * Google Calendar Integration
 *
 * Fetches events from Google Calendar feeds for room scheduling.
 * Uses local cache first (data/calendars/:slug/calendar.ics), falls back to remote fetch.
 *
 * @see specs/rooms.md for calendar IDs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  organizer?: string;
  room?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
}

export interface Room {
  name: string;
  calendarId: string;
  capacity: number;
  location: string;
  furniture?: string;
}

/**
 * Room definitions from specs/rooms.md
 */
export const ROOMS: Room[] = [
  {
    name: 'Ostrom Room',
    calendarId: 'c_72861dcac23416de3fe708f857f5c74f2e2578fe7da94dcee0a55922734417ef@group.calendar.google.com',
    capacity: 80,
    location: '2nd floor, main room',
    furniture: 'chairs, podium, large TV, sound system, microphones, boxes'
  },
  {
    name: 'Satoshi Room',
    calendarId: 'c_fce54b1bddc311791897f8a8723d0b10d7e3b69ea520baee0d267ce9d3266068@group.calendar.google.com',
    capacity: 15,
    location: '2nd floor, across the bridge',
    furniture: '3 tables, 15 chairs, flipchart'
  },
  {
    name: 'Angel Room',
    calendarId: 'c_3950a43f7dcd7c13415ca8d85ec6f96daffa9baf952ea653a063d03f22a5a6fe@group.calendar.google.com',
    capacity: 12,
    location: '2nd floor, in the back'
  },
  {
    name: 'Mush Room',
    calendarId: 'c_928d7621e14426ed508df906a7881dafc079757b44cea074d2434b405f86df7a@group.calendar.google.com',
    capacity: 10,
    location: '1st floor in the back (mezannine)',
    furniture: '8 chairs'
  },
  {
    name: 'Phone Booth',
    calendarId: 'c_d85b07cd944c033724c8b4adbea66840619181e445e2e6c8062cc0f761f15218@group.calendar.google.com',
    capacity: 1,
    location: 'Various'
  }
];

/**
 * Load room slugs from settings.json
 */
function loadRoomSlugsFromSettings(): Map<string, string> {
  const slugMap = new Map<string, string>();
  try {
    const settingsPath = join(process.cwd(), 'settings.json');
    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content);
      if (settings.rooms) {
        for (const room of settings.rooms) {
          if (room.name && room.slug) {
            slugMap.set(room.name, room.slug);
          }
        }
      }
    }
  } catch (error) {
    console.error('[Calendar] Error loading room slugs from settings:', error);
  }
  return slugMap;
}

// Cache the room slugs
let roomSlugCache: Map<string, string> | null = null;

/**
 * Convert room name to slug using settings.json slugs
 * Falls back to generating slug from name if not found in settings
 */
export function toRoomSlug(name: string): string {
  // Load and cache room slugs from settings
  if (!roomSlugCache) {
    roomSlugCache = loadRoomSlugsFromSettings();
  }

  // Check if room has a slug defined in settings
  const settingsSlug = roomSlugCache.get(name);
  if (settingsSlug) {
    return settingsSlug;
  }

  // Fallback: generate slug from name
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Get the cache path for a room's calendar
 */
function getCachePath(roomSlug: string): string {
  return join(process.cwd(), 'data', 'calendars', roomSlug, 'calendar.ics');
}

/**
 * Read calendar data from local cache
 */
function readFromCache(roomSlug: string): string | null {
  const cachePath = getCachePath(roomSlug);
  try {
    if (existsSync(cachePath)) {
      return readFileSync(cachePath, 'utf-8');
    }
  } catch (error) {
    console.error(`[Calendar] Error reading cache for ${roomSlug}:`, error);
  }
  return null;
}

/**
 * Write calendar data to local cache
 */
function writeToCache(roomSlug: string, data: string): void {
  const cachePath = getCachePath(roomSlug);
  const cacheDir = join(process.cwd(), 'data', 'calendars', roomSlug);

  try {
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    writeFileSync(cachePath, data, 'utf-8');
    console.log(`[Calendar] Cached ${roomSlug} calendar`);
  } catch (error) {
    console.error(`[Calendar] Error writing cache for ${roomSlug}:`, error);
  }
}

/**
 * Fetch calendar from Google and update cache
 */
async function fetchAndCacheCalendar(calendarId: string, roomSlug: string): Promise<string | null> {
  try {
    const icalUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
    console.log(`[Calendar] Fetching ${roomSlug} from Google Calendar...`);

    const response = await fetch(icalUrl);

    if (!response.ok) {
      console.error(`[Calendar] Failed to fetch ${roomSlug}: ${response.status}`);
      return null;
    }

    const data = await response.text();
    writeToCache(roomSlug, data);
    return data;
  } catch (error) {
    console.error(`[Calendar] Error fetching ${roomSlug}:`, error);
    return null;
  }
}

/**
 * Refresh calendar cache for a specific room
 */
export async function refreshRoomCalendar(roomName: string): Promise<boolean> {
  const room = ROOMS.find(r => r.name === roomName);
  if (!room) {
    console.error(`[Calendar] Room not found: ${roomName}`);
    return false;
  }

  const slug = toRoomSlug(room.name);
  const data = await fetchAndCacheCalendar(room.calendarId, slug);
  return data !== null;
}

/**
 * Refresh calendar cache for all rooms
 */
export async function refreshAllCalendars(): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const room of ROOMS) {
    const slug = toRoomSlug(room.name);
    const data = await fetchAndCacheCalendar(room.calendarId, slug);
    if (data) {
      success++;
    } else {
      failed++;
    }
  }

  // Update metadata
  const metadataPath = join(process.cwd(), 'data', 'calendars', 'metadata.json');
  const metadata = {
    lastRefresh: new Date().toISOString(),
    roomsRefreshed: success,
    roomsFailed: failed,
  };

  try {
    const cacheDir = join(process.cwd(), 'data', 'calendars');
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8');
  } catch (error) {
    console.error('[Calendar] Error writing metadata:', error);
  }

  return { success, failed };
}

/**
 * Fetch events from a Google Calendar
 * Uses local cache first, falls back to remote fetch
 *
 * @param calendarId - Google Calendar ID
 * @param timeMin - Start date filter (optional)
 * @param timeMax - End date filter (optional)
 * @param forceRefresh - Skip cache and fetch from Google
 * @returns Array of calendar events
 */
export async function fetchCalendarEvents(
  calendarId: string,
  timeMin?: Date,
  timeMax?: Date,
  forceRefresh: boolean = false
): Promise<CalendarEvent[]> {
  // Find the room for this calendar
  const room = ROOMS.find(r => r.calendarId === calendarId);
  const roomSlug = room ? toRoomSlug(room.name) : null;

  let icalData: string | null = null;

  // Try to read from cache first (unless force refresh)
  if (!forceRefresh && roomSlug) {
    icalData = readFromCache(roomSlug);
    if (icalData) {
      console.log(`[Calendar] Using cached data for ${roomSlug}`);
    }
  }

  // If no cache or force refresh, fetch from Google
  if (!icalData) {
    if (roomSlug) {
      icalData = await fetchAndCacheCalendar(calendarId, roomSlug);
    } else {
      // Unknown room, fetch without caching
      try {
        const icalUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
        const response = await fetch(icalUrl);
        if (response.ok) {
          icalData = await response.text();
        }
      } catch (error) {
        console.error(`[Calendar] Error fetching calendar:`, error);
      }
    }
  }

  if (!icalData) {
    return [];
  }

  const events = parseICalData(icalData, calendarId);

  // Apply time filters if provided
  let filteredEvents = events;
  if (timeMin) {
    filteredEvents = filteredEvents.filter(e => e.startTime >= timeMin);
  }
  if (timeMax) {
    filteredEvents = filteredEvents.filter(e => e.startTime <= timeMax);
  }

  return filteredEvents;
}

/**
 * Fetch events from multiple calendars (all rooms)
 *
 * @param roomNames - Array of room names to fetch (defaults to all rooms)
 * @param timeMin - Start date filter
 * @param timeMax - End date filter
 * @param forceRefresh - Skip cache and fetch from Google
 * @returns Array of calendar events with room information
 */
export async function fetchAllRoomEvents(
  roomNames?: string[],
  timeMin?: Date,
  timeMax?: Date,
  forceRefresh: boolean = false
): Promise<CalendarEvent[]> {
  const roomsToFetch = roomNames
    ? ROOMS.filter(r => roomNames.includes(r.name))
    : ROOMS;

  const eventPromises = roomsToFetch.map(async (room) => {
    const events = await fetchCalendarEvents(room.calendarId, timeMin, timeMax, forceRefresh);
    // Add room name to each event
    return events.map(event => ({
      ...event,
      room: room.name,
      location: event.location || room.location
    }));
  });

  const allEvents = await Promise.all(eventPromises);
  return allEvents.flat().sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

/**
 * Parse iCal format data into CalendarEvent objects
 */
function parseICalData(icalData: string, calendarId: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  // Split into events (VEVENT blocks)
  const eventBlocks = icalData.split('BEGIN:VEVENT');

  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i];
    const endIndex = block.indexOf('END:VEVENT');
    if (endIndex === -1) continue;

    const eventData = block.substring(0, endIndex);
    const event = parseEventBlock(eventData, calendarId);
    if (event) {
      events.push(event);
    }
  }

  return events;
}

/**
 * Parse a single VEVENT block into a CalendarEvent
 */
function parseEventBlock(eventData: string, calendarId: string): CalendarEvent | null {
  try {
    const lines = eventData.split('\n').map(l => l.trim()).filter(l => l);

    const fields: Record<string, string> = {};
    let currentField = '';

    // Parse fields (handle line continuations)
    for (const line of lines) {
      if (line.startsWith(' ') || line.startsWith('\t')) {
        // Continuation of previous field
        fields[currentField] += line.trim();
      } else {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex);
          const value = line.substring(colonIndex + 1);
          currentField = key.split(';')[0]; // Handle parameters like DTSTART;TZID=...
          fields[currentField] = value;
        }
      }
    }

    // Required fields
    const uid = fields['UID'];
    const summary = fields['SUMMARY'];
    const dtStart = fields['DTSTART'];
    const dtEnd = fields['DTEND'];

    if (!uid || !summary || !dtStart) {
      return null;
    }

    const event: CalendarEvent = {
      id: uid,
      title: unescapeICalText(summary),
      description: unescapeICalText(fields['DESCRIPTION'] || ''),
      startTime: parseICalDate(dtStart),
      endTime: dtEnd ? parseICalDate(dtEnd) : parseICalDate(dtStart),
      location: unescapeICalText(fields['LOCATION'] || ''),
      organizer: parseOrganizer(fields['ORGANIZER']),
      status: parseStatus(fields['STATUS'])
    };

    return event;
  } catch (error) {
    console.error('Error parsing event block:', error);
    return null;
  }
}

/**
 * Parse iCal date format to JavaScript Date
 */
function parseICalDate(dateStr: string): Date {
  // Remove TZID parameter if present
  const cleanDate = dateStr.split(':').pop() || dateStr;

  // Format: 20260126T140000Z or 20260126T140000 or 20260126
  if (cleanDate.includes('T')) {
    const [datePart, timePart] = cleanDate.split('T');
    const year = parseInt(datePart.substring(0, 4));
    const month = parseInt(datePart.substring(4, 6)) - 1; // JS months are 0-indexed
    const day = parseInt(datePart.substring(6, 8));

    const hour = parseInt(timePart.substring(0, 2));
    const minute = parseInt(timePart.substring(2, 4));
    const second = parseInt(timePart.substring(4, 6));

    // Check if UTC (ends with Z)
    if (timePart.endsWith('Z')) {
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    } else {
      return new Date(year, month, day, hour, minute, second);
    }
  } else {
    // Date only
    const year = parseInt(cleanDate.substring(0, 4));
    const month = parseInt(cleanDate.substring(4, 6)) - 1;
    const day = parseInt(cleanDate.substring(6, 8));
    return new Date(year, month, day);
  }
}

/**
 * Parse ORGANIZER field to extract email or name
 */
function parseOrganizer(organizer?: string): string | undefined {
  if (!organizer) return undefined;

  // Extract CN (Common Name) if present
  const cnMatch = organizer.match(/CN=([^:;]+)/);
  if (cnMatch) {
    return unescapeICalText(cnMatch[1]);
  }

  // Extract email from mailto:
  const emailMatch = organizer.match(/mailto:([^\s]+)/);
  if (emailMatch) {
    return emailMatch[1];
  }

  return organizer;
}

/**
 * Parse STATUS field
 */
function parseStatus(status?: string): 'confirmed' | 'tentative' | 'cancelled' {
  if (!status) return 'confirmed';

  const normalized = status.toLowerCase();
  if (normalized === 'tentative') return 'tentative';
  if (normalized === 'cancelled') return 'cancelled';
  return 'confirmed';
}

/**
 * Unescape iCal text (remove backslash escapes)
 */
function unescapeICalText(text: string): string {
  return text
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Generate iCal feed URL for subscribing to user's RSVPs
 */
export function generateRSVPCalendarUrl(npub: string): string {
  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://app.opensourcevillage.org';

  return `${baseUrl}/api/calendar/rsvp/${npub}.ics`;
}

/**
 * Get events happening within a specific time range
 */
export function getEventsInRange(
  events: CalendarEvent[],
  startDate: Date,
  endDate: Date
): CalendarEvent[] {
  return events.filter(event => {
    return event.startTime >= startDate && event.startTime <= endDate;
  });
}

/**
 * Get events for today
 */
export function getTodaysEvents(events: CalendarEvent[]): CalendarEvent[] {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  return getEventsInRange(events, startOfDay, endOfDay);
}

/**
 * Check if a room is available at a given time
 */
export function isRoomAvailable(
  roomName: string,
  startTime: Date,
  endTime: Date,
  events: CalendarEvent[]
): boolean {
  const roomEvents = events.filter(e => e.room === roomName);

  for (const event of roomEvents) {
    // Skip zero-duration events (they don't block any time)
    if (event.startTime.getTime() === event.endTime.getTime()) {
      continue;
    }

    // Check for overlap
    if (
      (startTime >= event.startTime && startTime < event.endTime) ||
      (endTime > event.startTime && endTime <= event.endTime) ||
      (startTime <= event.startTime && endTime >= event.endTime)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Find available rooms for a time slot
 */
export function findAvailableRooms(
  startTime: Date,
  endTime: Date,
  events: CalendarEvent[],
  minCapacity?: number
): Room[] {
  let rooms = ROOMS;

  if (minCapacity) {
    rooms = rooms.filter(r => r.capacity >= minCapacity);
  }

  return rooms.filter(room =>
    isRoomAvailable(room.name, startTime, endTime, events)
  );
}

/**
 * Get cache metadata (last refresh time, etc.)
 */
export function getCacheMetadata(): { lastRefresh: string | null; roomsRefreshed: number } | null {
  const metadataPath = join(process.cwd(), 'data', 'calendars', 'metadata.json');
  try {
    if (existsSync(metadataPath)) {
      const data = readFileSync(metadataPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[Calendar] Error reading metadata:', error);
  }
  return null;
}
