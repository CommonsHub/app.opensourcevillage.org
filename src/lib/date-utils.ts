/**
 * Date and Time Formatting Utilities
 *
 * Provides consistent date/time formatting, parsing, and validation
 * for workshops, offers, and calendar events.
 */

/**
 * Format a date/time for event display
 * Shows human-readable format with time
 *
 * @param timestamp - Unix timestamp (ms) or Date object
 * @returns Formatted string like "Jan 15, 2026 at 2:30 PM"
 *
 * @example
 * formatEventTime(Date.now())
 * // Returns: "Jan 20, 2026 at 3:45 PM"
 */
export function formatEventTime(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;

  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a date range for event display
 * Shows start and end times intelligently
 *
 * @param startTime - Start timestamp (ms) or Date
 * @param endTime - End timestamp (ms) or Date
 * @returns Formatted range like "Jan 15, 2:30 PM - 4:00 PM"
 *
 * @example
 * const start = new Date('2026-01-20T14:30:00');
 * const end = new Date('2026-01-20T16:00:00');
 * formatDateRange(start, end)
 * // Returns: "Jan 20, 2:30 PM - 4:00 PM"
 */
export function formatDateRange(
  startTime: number | Date,
  endTime: number | Date
): string {
  const start = typeof startTime === 'number' ? new Date(startTime) : startTime;
  const end = typeof endTime === 'number' ? new Date(endTime) : endTime;

  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  if (sameDay) {
    // Same day: "Jan 15, 2:30 PM - 4:00 PM"
    const dateStr = start.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const startTimeStr = start.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const endTimeStr = end.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${dateStr}, ${startTimeStr} - ${endTimeStr}`;
  } else {
    // Different days: "Jan 15, 2:30 PM - Jan 16, 4:00 PM"
    return `${formatEventTime(start)} - ${formatEventTime(end)}`;
  }
}

/**
 * Format date for input fields (YYYY-MM-DD)
 *
 * @param timestamp - Unix timestamp (ms) or Date object
 * @returns ISO date string for input fields
 *
 * @example
 * formatDateForInput(Date.now())
 * // Returns: "2026-01-20"
 */
export function formatDateForInput(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  return date.toISOString().split('T')[0];
}

/**
 * Format time for input fields (HH:MM)
 *
 * @param timestamp - Unix timestamp (ms) or Date object
 * @returns Time string for input fields (24-hour format)
 *
 * @example
 * formatTimeForInput(new Date('2026-01-20T14:30:00'))
 * // Returns: "14:30"
 */
export function formatTimeForInput(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Parse date and time from input fields to timestamp
 *
 * @param dateStr - Date string (YYYY-MM-DD)
 * @param timeStr - Time string (HH:MM)
 * @returns Unix timestamp in milliseconds
 *
 * @example
 * parseEventDateTime('2026-01-20', '14:30')
 * // Returns: 1737383400000
 */
export function parseEventDateTime(dateStr: string, timeStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);

  const date = new Date(year, month - 1, day, hours, minutes);
  return date.getTime();
}

/**
 * Check if an event is in the future
 *
 * @param timestamp - Event timestamp (ms) or Date
 * @returns True if event is in the future
 *
 * @example
 * isEventInFuture(Date.now() + 86400000)
 * // Returns: true (tomorrow)
 */
export function isEventInFuture(timestamp: number | Date): boolean {
  const eventTime = typeof timestamp === 'number' ? timestamp : timestamp.getTime();
  return eventTime > Date.now();
}

/**
 * Check if an event is happening now
 * Event is "now" if current time is between start and end
 *
 * @param startTime - Event start timestamp (ms)
 * @param endTime - Event end timestamp (ms)
 * @returns True if event is currently happening
 *
 * @example
 * const start = Date.now() - 3600000; // 1 hour ago
 * const end = Date.now() + 3600000;   // 1 hour from now
 * isEventHappeningNow(start, end)
 * // Returns: true
 */
export function isEventHappeningNow(
  startTime: number,
  endTime: number
): boolean {
  const now = Date.now();
  return now >= startTime && now <= endTime;
}

/**
 * Get event duration in a human-readable format
 *
 * @param startTime - Start timestamp (ms)
 * @param endTime - End timestamp (ms)
 * @returns Duration string like "2 hours" or "90 minutes"
 *
 * @example
 * const start = Date.now();
 * const end = start + (90 * 60 * 1000);
 * getEventDuration(start, end)
 * // Returns: "1.5 hours"
 */
export function getEventDuration(startTime: number, endTime: number): string {
  const durationMs = endTime - startTime;
  const durationMinutes = Math.floor(durationMs / 60000);
  const durationHours = durationMinutes / 60;

  if (durationMinutes < 60) {
    return `${durationMinutes} minutes`;
  } else if (durationHours === 1) {
    return '1 hour';
  } else if (durationHours % 1 === 0) {
    return `${durationHours} hours`;
  } else {
    return `${durationHours.toFixed(1)} hours`;
  }
}

/**
 * Get relative time string
 * Shows "in X hours/days" or "X hours/days ago"
 *
 * @param timestamp - Target timestamp (ms) or Date
 * @returns Relative time string
 *
 * @example
 * getRelativeTime(Date.now() + 7200000)
 * // Returns: "in 2 hours"
 *
 * getRelativeTime(Date.now() - 86400000)
 * // Returns: "1 day ago"
 */
export function getRelativeTime(timestamp: number | Date): string {
  const targetTime = typeof timestamp === 'number' ? timestamp : timestamp.getTime();
  const now = Date.now();
  const diffMs = targetTime - now;
  const diffMinutes = Math.abs(Math.floor(diffMs / 60000));
  const diffHours = Math.abs(Math.floor(diffMs / 3600000));
  const diffDays = Math.abs(Math.floor(diffMs / 86400000));

  const isFuture = diffMs > 0;
  const prefix = isFuture ? 'in ' : '';
  const suffix = isFuture ? '' : ' ago';

  if (diffMinutes < 60) {
    if (diffMinutes === 0) return 'just now';
    if (diffMinutes === 1) return isFuture ? 'in 1 minute' : '1 minute ago';
    return `${prefix}${diffMinutes} minutes${suffix}`;
  } else if (diffHours < 24) {
    if (diffHours === 1) return isFuture ? 'in 1 hour' : '1 hour ago';
    return `${prefix}${diffHours} hours${suffix}`;
  } else if (diffDays < 7) {
    if (diffDays === 1) return isFuture ? 'tomorrow' : 'yesterday';
    return `${prefix}${diffDays} days${suffix}`;
  } else {
    return formatEventTime(targetTime);
  }
}

/**
 * Group events by date
 * Returns a map of date strings to events
 *
 * @param events - Array of events with startTime property
 * @returns Map of date strings to event arrays
 *
 * @example
 * const events = [
 *   { id: '1', startTime: Date.now(), title: 'Workshop 1' },
 *   { id: '2', startTime: Date.now() + 86400000, title: 'Workshop 2' }
 * ];
 * const grouped = groupEventsByDate(events);
 * // Returns: Map {
 * //   "2026-01-20" => [{ id: '1', ... }],
 * //   "2026-01-21" => [{ id: '2', ... }]
 * // }
 */
export function groupEventsByDate<T extends { startTime: number }>(
  events: T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const event of events) {
    const dateKey = formatDateForInput(event.startTime);
    const existing = grouped.get(dateKey) || [];
    existing.push(event);
    grouped.set(dateKey, existing);
  }

  return grouped;
}

/**
 * Sort events by start time
 *
 * @param events - Array of events with startTime
 * @param ascending - Sort order (default: true)
 * @returns Sorted array of events
 *
 * @example
 * const sorted = sortEventsByTime(workshops, true);
 * // Returns workshops sorted from earliest to latest
 */
export function sortEventsByTime<T extends { startTime: number }>(
  events: T[],
  ascending: boolean = true
): T[] {
  return [...events].sort((a, b) => {
    return ascending
      ? a.startTime - b.startTime
      : b.startTime - a.startTime;
  });
}

/**
 * Filter events by date range
 *
 * @param events - Array of events with startTime
 * @param startDate - Filter start date (inclusive)
 * @param endDate - Filter end date (inclusive)
 * @returns Filtered array of events
 *
 * @example
 * const today = new Date();
 * const nextWeek = new Date(Date.now() + 7 * 86400000);
 * const thisWeek = filterEventsByDateRange(events, today, nextWeek);
 */
export function filterEventsByDateRange<T extends { startTime: number }>(
  events: T[],
  startDate: Date,
  endDate: Date
): T[] {
  const startTime = startDate.getTime();
  const endTime = endDate.getTime() + 86400000; // Include full end day

  return events.filter(
    (event) => event.startTime >= startTime && event.startTime < endTime
  );
}

/**
 * Get the day of week for a timestamp
 *
 * @param timestamp - Unix timestamp (ms) or Date
 * @returns Day name like "Monday"
 *
 * @example
 * getDayOfWeek(Date.now())
 * // Returns: "Monday" (or whatever today is)
 */
export function getDayOfWeek(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  return date.toLocaleString('en-US', { weekday: 'long' });
}

/**
 * Check if two timestamps are on the same day
 *
 * @param time1 - First timestamp
 * @param time2 - Second timestamp
 * @returns True if both are on the same calendar day
 *
 * @example
 * const morning = new Date('2026-01-20T09:00:00').getTime();
 * const evening = new Date('2026-01-20T18:00:00').getTime();
 * isSameDay(morning, evening)
 * // Returns: true
 */
export function isSameDay(time1: number, time2: number): boolean {
  const date1 = new Date(time1);
  const date2 = new Date(time2);

  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Validate that end time is after start time
 *
 * @param startTime - Start timestamp
 * @param endTime - End timestamp
 * @returns True if valid (end > start)
 *
 * @example
 * validateTimeRange(Date.now(), Date.now() + 3600000)
 * // Returns: true (end is 1 hour after start)
 */
export function validateTimeRange(startTime: number, endTime: number): boolean {
  return endTime > startTime;
}

/**
 * Get formatted date header for event lists
 * Shows different formats based on how far in future
 *
 * @param timestamp - Date timestamp
 * @returns Header string like "Today", "Tomorrow", or "Friday, Jan 20"
 *
 * @example
 * getDateHeader(Date.now())
 * // Returns: "Today"
 *
 * getDateHeader(Date.now() + 86400000)
 * // Returns: "Tomorrow"
 *
 * getDateHeader(Date.now() + 86400000 * 3)
 * // Returns: "Friday, Jan 22"
 */
export function getDateHeader(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);

  if (isSameDay(timestamp, today.getTime())) {
    return 'Today';
  } else if (isSameDay(timestamp, tomorrow.getTime())) {
    return 'Tomorrow';
  } else {
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  }
}
