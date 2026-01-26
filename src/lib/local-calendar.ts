/**
 * Local Calendar (ICS) Management
 *
 * Manages local ICS files for community workshop proposals.
 * These files are synced to Google Calendar via a separate cron job.
 *
 * Storage structure:
 * data/calendars/
 *   ostrom/
 *     events.json       # JSON store of proposal events
 *     proposals.ics     # Generated ICS file for Google sync
 *     .sync-metadata    # Last sync timestamp
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const CALENDARS_DIR = path.join(DATA_DIR, 'calendars');

// Cache for room slug lookup from settings.json
interface RoomConfig {
  name: string;
  slug?: string;
}

let roomsCache: RoomConfig[] | null = null;

function loadRoomsFromSettings(): RoomConfig[] {
  if (roomsCache) return roomsCache;

  try {
    const settingsPath = path.join(process.cwd(), 'settings.json');
    const content = fsSync.readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(content);
    const rooms: RoomConfig[] = settings.rooms || [];
    roomsCache = rooms;
    return rooms;
  } catch {
    return [];
  }
}

/**
 * Attendee in a proposal event
 */
export interface Attendee {
  username: string;
  npub: string;
}

/**
 * Proposal event stored in local calendar
 */
export interface ProposalEvent {
  offerId: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  room: string;
  status: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED';
  minRsvps: number;
  attendees: Attendee[];
  createdAt?: Date;
  updatedAt?: Date;
  // Author info
  authorNpub?: string;
  authorUsername?: string;
}

/**
 * Conflict detection result
 */
export interface ConflictResult {
  tentative: ProposalEvent[];
  confirmed: ProposalEvent[];
}

/**
 * Get the slug for a room from settings.json, or generate one from the name
 */
export function getRoomSlug(roomName: string): string {
  const rooms = loadRoomsFromSettings();
  const room = rooms.find(r => r.name === roomName);
  if (room?.slug) {
    return room.slug;
  }
  // Fallback: generate slug from name
  return roomName.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Get the directory path for a room's calendar data
 */
function getRoomDir(roomSlug: string): string {
  return path.join(CALENDARS_DIR, roomSlug);
}

/**
 * Get the path to the events JSON file for a room
 */
function getEventsPath(roomSlug: string): string {
  return path.join(getRoomDir(roomSlug), 'events.json');
}

/**
 * Get the path to the proposals ICS file for a room
 */
function getIcsPath(roomSlug: string): string {
  return path.join(getRoomDir(roomSlug), 'proposals.ics');
}

/**
 * Ensure room directory exists
 */
async function ensureRoomDir(roomSlug: string): Promise<void> {
  await fs.mkdir(getRoomDir(roomSlug), { recursive: true });
}

/**
 * Load events from JSON file
 */
async function loadEvents(roomSlug: string): Promise<ProposalEvent[]> {
  try {
    const content = await fs.readFile(getEventsPath(roomSlug), 'utf-8');
    const data = JSON.parse(content);
    // Convert date strings back to Date objects
    return data.map((event: any) => ({
      ...event,
      startTime: new Date(event.startTime),
      endTime: new Date(event.endTime),
      createdAt: event.createdAt ? new Date(event.createdAt) : undefined,
      updatedAt: event.updatedAt ? new Date(event.updatedAt) : undefined,
    }));
  } catch (error) {
    // File doesn't exist or is empty
    return [];
  }
}

/**
 * Save events to JSON file
 */
async function saveEvents(roomSlug: string, events: ProposalEvent[]): Promise<void> {
  await ensureRoomDir(roomSlug);
  await fs.writeFile(getEventsPath(roomSlug), JSON.stringify(events, null, 2));
}

/**
 * Add a proposal event to a room's calendar
 */
export async function addProposalEvent(
  roomSlug: string,
  event: ProposalEvent
): Promise<void> {
  const events = await loadEvents(roomSlug);

  // Check if event already exists
  const existingIndex = events.findIndex((e) => e.offerId === event.offerId);
  if (existingIndex >= 0) {
    // Update existing event
    events[existingIndex] = {
      ...event,
      updatedAt: new Date(),
    };
  } else {
    // Add new event
    events.push({
      ...event,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  await saveEvents(roomSlug, events);
}

/**
 * Update an event's status
 */
export async function updateEventStatus(
  roomSlug: string,
  offerId: string,
  status: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED'
): Promise<void> {
  const events = await loadEvents(roomSlug);
  const eventIndex = events.findIndex((e) => e.offerId === offerId);

  if (eventIndex >= 0) {
    events[eventIndex].status = status;
    events[eventIndex].updatedAt = new Date();
    await saveEvents(roomSlug, events);
  }
}

/**
 * Add an attendee to an event
 */
export async function addAttendee(
  roomSlug: string,
  offerId: string,
  username: string,
  npub: string
): Promise<void> {
  const events = await loadEvents(roomSlug);
  const eventIndex = events.findIndex((e) => e.offerId === offerId);

  if (eventIndex >= 0) {
    const event = events[eventIndex];
    // Check if attendee already exists
    if (!event.attendees.some((a) => a.npub === npub)) {
      event.attendees.push({ username, npub });
      event.updatedAt = new Date();
      await saveEvents(roomSlug, events);
    }
  }
}

/**
 * Remove an attendee from an event
 */
export async function removeAttendee(
  roomSlug: string,
  offerId: string,
  npub: string
): Promise<void> {
  const events = await loadEvents(roomSlug);
  const eventIndex = events.findIndex((e) => e.offerId === offerId);

  if (eventIndex >= 0) {
    const event = events[eventIndex];
    event.attendees = event.attendees.filter((a) => a.npub !== npub);
    event.updatedAt = new Date();
    await saveEvents(roomSlug, events);
  }
}

/**
 * Get all proposal events for a room
 */
export async function getProposalEvents(roomSlug: string): Promise<ProposalEvent[]> {
  return loadEvents(roomSlug);
}

/**
 * Get all proposal events across all rooms
 */
export async function getAllProposalEvents(): Promise<ProposalEvent[]> {
  const allEvents: ProposalEvent[] = [];

  try {
    const roomDirs = await fs.readdir(CALENDARS_DIR);

    for (const roomDir of roomDirs) {
      const events = await loadEvents(roomDir);
      allEvents.push(...events);
    }
  } catch (error) {
    // Calendars directory doesn't exist
  }

  return allEvents;
}

/**
 * Check if two time ranges overlap
 */
function timesOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean {
  return start1 < end2 && end1 > start2;
}

/**
 * Check for conflicts with existing events
 */
export async function checkConflicts(
  roomSlug: string,
  start: Date,
  end: Date
): Promise<ConflictResult> {
  const events = await loadEvents(roomSlug);

  const tentative: ProposalEvent[] = [];
  const confirmed: ProposalEvent[] = [];

  for (const event of events) {
    // Skip cancelled events
    if (event.status === 'CANCELLED') continue;

    if (timesOverlap(start, end, event.startTime, event.endTime)) {
      if (event.status === 'CONFIRMED') {
        confirmed.push(event);
      } else if (event.status === 'TENTATIVE') {
        tentative.push(event);
      }
    }
  }

  return { tentative, confirmed };
}

/**
 * Format date for ICS (YYYYMMDDTHHMMSSZ)
 */
function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escape text for ICS (handle newlines, commas, semicolons)
 */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Generate ICS file content from events
 */
function generateIcsContent(events: ProposalEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Open Source Village//Proposals//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const event of events) {
    // Skip cancelled events in ICS output
    if (event.status === 'CANCELLED') continue;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:offer-${event.offerId}@opensourcevillage.org`);
    lines.push(`DTSTART:${formatIcsDate(event.startTime)}`);
    lines.push(`DTEND:${formatIcsDate(event.endTime)}`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    lines.push(`LOCATION:${escapeIcsText(event.room)}`);
    lines.push(`STATUS:${event.status}`);
    lines.push(`X-OSV-OFFER-ID:${event.offerId}`);
    lines.push(`X-OSV-MIN-RSVPS:${event.minRsvps}`);

    // Add attendees
    for (const attendee of event.attendees) {
      lines.push(`ATTENDEE;PARTSTAT=ACCEPTED;CN=${attendee.username}:${attendee.npub}`);
    }

    if (event.createdAt) {
      lines.push(`DTSTAMP:${formatIcsDate(event.createdAt)}`);
    } else {
      lines.push(`DTSTAMP:${formatIcsDate(new Date())}`);
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

/**
 * Generate ICS file for a room
 */
export async function generateIcsFile(roomSlug: string): Promise<void> {
  const events = await loadEvents(roomSlug);
  const icsContent = generateIcsContent(events);

  await ensureRoomDir(roomSlug);
  await fs.writeFile(getIcsPath(roomSlug), icsContent);
}

/**
 * Parse ICS file content to events
 */
export function parseIcsFile(content: string): ProposalEvent[] {
  const events: ProposalEvent[] = [];
  const lines = content.split(/\r?\n/);

  let currentEvent: Partial<ProposalEvent> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {
        attendees: [],
      };
    } else if (line === 'END:VEVENT' && currentEvent) {
      if (
        currentEvent.offerId &&
        currentEvent.title &&
        currentEvent.startTime &&
        currentEvent.endTime &&
        currentEvent.status
      ) {
        events.push(currentEvent as ProposalEvent);
      }
      currentEvent = null;
    } else if (currentEvent) {
      // Parse properties
      if (line.startsWith('UID:offer-')) {
        const match = line.match(/^UID:offer-(.+)@opensourcevillage\.org$/);
        if (match) {
          currentEvent.offerId = match[1];
        }
      } else if (line.startsWith('DTSTART:')) {
        currentEvent.startTime = parseIcsDate(line.substring(8));
      } else if (line.startsWith('DTEND:')) {
        currentEvent.endTime = parseIcsDate(line.substring(6));
      } else if (line.startsWith('SUMMARY:')) {
        currentEvent.title = unescapeIcsText(line.substring(8));
      } else if (line.startsWith('DESCRIPTION:')) {
        currentEvent.description = unescapeIcsText(line.substring(12));
      } else if (line.startsWith('LOCATION:')) {
        currentEvent.room = unescapeIcsText(line.substring(9));
      } else if (line.startsWith('STATUS:')) {
        currentEvent.status = line.substring(7) as ProposalEvent['status'];
      } else if (line.startsWith('X-OSV-OFFER-ID:')) {
        currentEvent.offerId = line.substring(15);
      } else if (line.startsWith('X-OSV-MIN-RSVPS:')) {
        currentEvent.minRsvps = parseInt(line.substring(16), 10);
      } else if (line.startsWith('ATTENDEE;')) {
        const attendeeMatch = line.match(
          /ATTENDEE;PARTSTAT=ACCEPTED;CN=([^:]+):(.+)$/
        );
        if (attendeeMatch) {
          currentEvent.attendees = currentEvent.attendees || [];
          currentEvent.attendees.push({
            username: attendeeMatch[1],
            npub: attendeeMatch[2],
          });
        }
      }
    }
  }

  return events;
}

/**
 * Parse ICS date format (YYYYMMDDTHHMMSSZ) to Date
 */
function parseIcsDate(icsDate: string): Date {
  // Format: YYYYMMDDTHHMMSSZ
  const match = icsDate.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/
  );
  if (match) {
    return new Date(
      Date.UTC(
        parseInt(match[1]),
        parseInt(match[2]) - 1,
        parseInt(match[3]),
        parseInt(match[4]),
        parseInt(match[5]),
        parseInt(match[6])
      )
    );
  }
  return new Date(icsDate);
}

/**
 * Unescape ICS text
 */
function unescapeIcsText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Update RSVP count in an event (for quick lookup without counting attendees)
 */
export async function updateEventRsvpCount(
  roomSlug: string,
  offerId: string,
  count: number
): Promise<void> {
  // This is a convenience method - the actual count comes from attendees array
  // Useful for triggering ICS regeneration
  const events = await loadEvents(roomSlug);
  const eventIndex = events.findIndex((e) => e.offerId === offerId);

  if (eventIndex >= 0) {
    events[eventIndex].updatedAt = new Date();
    await saveEvents(roomSlug, events);
  }
}

/**
 * Get an event by offerId
 */
export async function getProposalEvent(
  roomSlug: string,
  offerId: string
): Promise<ProposalEvent | null> {
  const events = await loadEvents(roomSlug);
  return events.find((e) => e.offerId === offerId) || null;
}
