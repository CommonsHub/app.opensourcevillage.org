/**
 * GET /api/calendar/rsvp/[npub].ics - Generate iCal feed for user's RSVPs
 *
 * This endpoint generates an iCal feed that users can subscribe to in their
 * calendar applications (Apple Calendar, Google Calendar, Outlook, etc.)
 *
 * The feed includes all workshops/events the user has RSVPed to.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFile, exists } from '@/lib/storage';
import { Offer } from '@/types';

interface RSVP {
  id: string;
  offerId: string;
  npub: string;
  username: string;
  createdAt: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ npub: string }> }
) {
  try {
    const { npub: npubParam } = await params;
    const npub = npubParam.replace('.ics', ''); // Remove .ics extension if present

    // Validate npub format (basic check)
    if (!npub.startsWith('npub1')) {
      return new NextResponse('Invalid npub format', { status: 400 });
    }

    // Load all offers
    const offersExist = await exists('offers.json');
    if (!offersExist) {
      return generateEmptyCalendar(npub);
    }

    const offersData = await readFile('offers.json');
    const offers: Offer[] = offersData ? JSON.parse(offersData) : [];

    // Find user's RSVPs
    const userEvents: Array<Offer & { rsvpDate: string }> = [];

    for (const offer of offers) {
      if (offer.type !== 'workshop' && offer.type !== '1:1') continue;
      if (!offer.startTime) continue;

      // Check if user has RSVP for this offer
      const rsvpFile = `rsvps/${offer.id}.jsonl`;
      const rsvpExists = await exists(rsvpFile);

      if (rsvpExists) {
        const rsvpData = await readFile(rsvpFile);
        if (rsvpData) {
          const rsvps: RSVP[] = rsvpData
            .split('\n')
            .filter(Boolean)
            .map(line => JSON.parse(line));

          const userRsvp = rsvps.find(r => r.npub === npub);
          if (userRsvp) {
            userEvents.push({
              ...offer,
              rsvpDate: userRsvp.createdAt
            });
          }
        }
      }
    }

    // Generate iCal content
    const icalContent = generateICalFeed(npub, userEvents);

    return new NextResponse(icalContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="osv-rsvps-${npub.substring(0, 12)}.ics"`,
        'Cache-Control': 'no-cache, must-revalidate'
      }
    });
  } catch (error) {
    console.error('Error generating RSVP calendar:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}

/**
 * Generate iCal feed content
 */
function generateICalFeed(
  npub: string,
  events: Array<Offer & { rsvpDate: string }>
): string {
  const lines: string[] = [];

  // Calendar header
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Open Source Village//RSVP Calendar//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(`X-WR-CALNAME:My OSV RSVPs`);
  lines.push(`X-WR-CALDESC:Workshops and events I'm attending at Open Source Village`);
  lines.push(`X-WR-TIMEZONE:UTC`);

  // Add events
  for (const event of events) {
    lines.push('BEGIN:VEVENT');

    // Event ID (stable identifier)
    lines.push(`UID:osv-${event.id}@app.opensourcevillage.org`);

    // Timestamps
    const startTime = new Date(event.startTime!);
    const endTime = event.endTime
      ? new Date(event.endTime)
      : new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour duration

    lines.push(`DTSTART:${formatICalDate(startTime)}`);
    lines.push(`DTEND:${formatICalDate(endTime)}`);
    lines.push(`DTSTAMP:${formatICalDate(new Date(event.rsvpDate))}`);

    // Event details
    lines.push(`SUMMARY:${escapeICalText(event.title)}`);

    if (event.description) {
      lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
    }

    // Location (room)
    if (event.room) {
      lines.push(`LOCATION:${escapeICalText(event.room)}`);
    }

    // Organizer (authors)
    if (event.authors && event.authors.length > 0) {
      const primaryAuthor = event.authors[0];
      lines.push(`ORGANIZER;CN=${escapeICalText(primaryAuthor)}:mailto:noreply@opensourcevillage.org`);
    }

    // Categories (tags)
    if (event.tags && event.tags.length > 0) {
      lines.push(`CATEGORIES:${event.tags.map(escapeICalText).join(',')}`);
    }

    // Status
    const status = event.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE';
    lines.push(`STATUS:${status}`);

    // URL to event details
    lines.push(`URL:https://app.opensourcevillage.org/offers/${event.id}`);

    // Alarm (30 minutes before)
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${escapeICalText(event.title)} starts in 30 minutes`);
    lines.push('TRIGGER:-PT30M');
    lines.push('END:VALARM');

    lines.push('END:VEVENT');
  }

  // Calendar footer
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

/**
 * Generate empty calendar (no RSVPs)
 */
function generateEmptyCalendar(npub: string): NextResponse {
  const lines: string[] = [];

  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Open Source Village//RSVP Calendar//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(`X-WR-CALNAME:My OSV RSVPs`);
  lines.push(`X-WR-CALDESC:Workshops and events I'm attending at Open Source Village`);
  lines.push('END:VCALENDAR');

  const icalContent = lines.join('\r\n');

  return new NextResponse(icalContent, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="osv-rsvps-${npub.substring(0, 12)}.ics"`,
      'Cache-Control': 'no-cache, must-revalidate'
    }
  });
}

/**
 * Format date for iCal (UTC format: YYYYMMDDTHHmmssZ)
 */
function formatICalDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

/**
 * Escape special characters for iCal text fields
 */
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}
