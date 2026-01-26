/**
 * Tests for Date and Time Utilities
 * Verifies consistent date/time formatting and manipulation
 */

import {
  formatEventTime,
  formatDateRange,
  formatDateForInput,
  formatTimeForInput,
  parseEventDateTime,
  isEventInFuture,
  isEventHappeningNow,
  getEventDuration,
  getRelativeTime,
  groupEventsByDate,
  sortEventsByTime,
  filterEventsByDateRange,
  getDayOfWeek,
  isSameDay,
  validateTimeRange,
  getDateHeader,
} from '../date-utils';

describe('Date Utils - Formatting', () => {
  describe('formatEventTime', () => {
    it('should format timestamp to human-readable string', () => {
      const date = new Date('2026-01-20T14:30:00');
      const formatted = formatEventTime(date.getTime());

      expect(formatted).toContain('Jan');
      expect(formatted).toContain('20');
      expect(formatted).toContain('2026');
      expect(formatted).toMatch(/\d{1,2}:\d{2}\s[AP]M/);
    });

    it('should accept Date object', () => {
      const date = new Date('2026-01-20T14:30:00');
      const formatted = formatEventTime(date);

      expect(formatted).toBeTruthy();
      expect(formatted).toContain('2026');
    });

    it('should handle midnight correctly', () => {
      const date = new Date('2026-01-20T00:00:00');
      const formatted = formatEventTime(date);

      expect(formatted).toContain('12:00 AM');
    });

    it('should handle noon correctly', () => {
      const date = new Date('2026-01-20T12:00:00');
      const formatted = formatEventTime(date);

      expect(formatted).toContain('12:00 PM');
    });
  });

  describe('formatDateRange', () => {
    it('should format same-day range', () => {
      const start = new Date('2026-01-20T14:30:00');
      const end = new Date('2026-01-20T16:00:00');
      const formatted = formatDateRange(start, end);

      expect(formatted).toContain('Jan 20');
      expect(formatted).toContain('2:30 PM');
      expect(formatted).toContain('4:00 PM');
      expect(formatted).toContain('-');
    });

    it('should format multi-day range', () => {
      const start = new Date('2026-01-20T14:30:00');
      const end = new Date('2026-01-21T16:00:00');
      const formatted = formatDateRange(start, end);

      expect(formatted).toContain('Jan 20');
      expect(formatted).toContain('Jan 21');
      expect(formatted).toContain('-');
    });

    it('should handle timestamps', () => {
      const start = new Date('2026-01-20T14:30:00').getTime();
      const end = new Date('2026-01-20T16:00:00').getTime();
      const formatted = formatDateRange(start, end);

      expect(formatted).toBeTruthy();
      expect(formatted).toContain('-');
    });
  });

  describe('formatDateForInput', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date('2026-01-20T14:30:00');
      const formatted = formatDateForInput(date);

      expect(formatted).toBe('2026-01-20');
    });

    it('should handle timestamps', () => {
      const timestamp = new Date('2026-01-20T14:30:00').getTime();
      const formatted = formatDateForInput(timestamp);

      expect(formatted).toBe('2026-01-20');
    });

    it('should pad single-digit months and days', () => {
      const date = new Date('2026-03-05T14:30:00');
      const formatted = formatDateForInput(date);

      expect(formatted).toBe('2026-03-05');
    });
  });

  describe('formatTimeForInput', () => {
    it('should format time as HH:MM in 24-hour format', () => {
      const date = new Date('2026-01-20T14:30:00');
      const formatted = formatTimeForInput(date);

      expect(formatted).toBe('14:30');
    });

    it('should handle morning times', () => {
      const date = new Date('2026-01-20T09:15:00');
      const formatted = formatTimeForInput(date);

      expect(formatted).toBe('09:15');
    });

    it('should handle midnight', () => {
      const date = new Date('2026-01-20T00:00:00');
      const formatted = formatTimeForInput(date);

      expect(formatted).toBe('00:00');
    });

    it('should pad single digits', () => {
      const date = new Date('2026-01-20T03:05:00');
      const formatted = formatTimeForInput(date);

      expect(formatted).toBe('03:05');
    });
  });

  describe('parseEventDateTime', () => {
    it('should parse date and time to timestamp', () => {
      const timestamp = parseEventDateTime('2026-01-20', '14:30');
      const date = new Date(timestamp);

      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(0); // January is 0
      expect(date.getDate()).toBe(20);
      expect(date.getHours()).toBe(14);
      expect(date.getMinutes()).toBe(30);
    });

    it('should handle midnight', () => {
      const timestamp = parseEventDateTime('2026-01-20', '00:00');
      const date = new Date(timestamp);

      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
    });

    it('should handle end of day', () => {
      const timestamp = parseEventDateTime('2026-01-20', '23:59');
      const date = new Date(timestamp);

      expect(date.getHours()).toBe(23);
      expect(date.getMinutes()).toBe(59);
    });
  });
});

describe('Date Utils - Validation', () => {
  describe('isEventInFuture', () => {
    it('should return true for future events', () => {
      const futureTime = Date.now() + 86400000; // Tomorrow
      expect(isEventInFuture(futureTime)).toBe(true);
    });

    it('should return false for past events', () => {
      const pastTime = Date.now() - 86400000; // Yesterday
      expect(isEventInFuture(pastTime)).toBe(false);
    });

    it('should accept Date objects', () => {
      const future = new Date(Date.now() + 86400000);
      expect(isEventInFuture(future)).toBe(true);
    });

    it('should handle edge case of current time', () => {
      const now = Date.now();
      // This might be true or false depending on millisecond timing
      const result = isEventInFuture(now);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isEventHappeningNow', () => {
    it('should return true for current events', () => {
      const start = Date.now() - 3600000; // 1 hour ago
      const end = Date.now() + 3600000; // 1 hour from now

      expect(isEventHappeningNow(start, end)).toBe(true);
    });

    it('should return false for future events', () => {
      const start = Date.now() + 3600000;
      const end = Date.now() + 7200000;

      expect(isEventHappeningNow(start, end)).toBe(false);
    });

    it('should return false for past events', () => {
      const start = Date.now() - 7200000;
      const end = Date.now() - 3600000;

      expect(isEventHappeningNow(start, end)).toBe(false);
    });

    it('should handle edge case at start time', () => {
      const now = Date.now();
      const end = now + 3600000;

      expect(isEventHappeningNow(now, end)).toBe(true);
    });

    it('should handle edge case at end time', () => {
      const start = Date.now() - 3600000;
      const now = Date.now();

      expect(isEventHappeningNow(start, now)).toBe(true);
    });
  });

  describe('validateTimeRange', () => {
    it('should return true for valid ranges (end > start)', () => {
      const start = Date.now();
      const end = start + 3600000;

      expect(validateTimeRange(start, end)).toBe(true);
    });

    it('should return false for invalid ranges (end <= start)', () => {
      const start = Date.now();
      const end = start - 3600000;

      expect(validateTimeRange(start, end)).toBe(false);
    });

    it('should return false for equal times', () => {
      const time = Date.now();

      expect(validateTimeRange(time, time)).toBe(false);
    });
  });

  describe('isSameDay', () => {
    it('should return true for same calendar day', () => {
      const morning = new Date('2026-01-20T09:00:00').getTime();
      const evening = new Date('2026-01-20T18:00:00').getTime();

      expect(isSameDay(morning, evening)).toBe(true);
    });

    it('should return false for different days', () => {
      const today = new Date('2026-01-20T23:59:00').getTime();
      const tomorrow = new Date('2026-01-21T00:01:00').getTime();

      expect(isSameDay(today, tomorrow)).toBe(false);
    });

    it('should handle edge case at midnight', () => {
      const beforeMidnight = new Date('2026-01-20T23:59:59').getTime();
      const afterMidnight = new Date('2026-01-21T00:00:01').getTime();

      expect(isSameDay(beforeMidnight, afterMidnight)).toBe(false);
    });
  });
});

describe('Date Utils - Calculations', () => {
  describe('getEventDuration', () => {
    it('should format duration in minutes for < 1 hour', () => {
      const start = Date.now();
      const end = start + 45 * 60 * 1000; // 45 minutes

      const duration = getEventDuration(start, end);
      expect(duration).toBe('45 minutes');
    });

    it('should format duration in hours for >= 1 hour', () => {
      const start = Date.now();
      const end = start + 2 * 60 * 60 * 1000; // 2 hours

      const duration = getEventDuration(start, end);
      expect(duration).toBe('2 hours');
    });

    it('should handle 1 hour specially', () => {
      const start = Date.now();
      const end = start + 60 * 60 * 1000; // 1 hour

      const duration = getEventDuration(start, end);
      expect(duration).toBe('1 hour');
    });

    it('should handle fractional hours', () => {
      const start = Date.now();
      const end = start + 90 * 60 * 1000; // 1.5 hours

      const duration = getEventDuration(start, end);
      expect(duration).toBe('1.5 hours');
    });

    it('should handle very short durations', () => {
      const start = Date.now();
      const end = start + 5 * 60 * 1000; // 5 minutes

      const duration = getEventDuration(start, end);
      expect(duration).toBe('5 minutes');
    });
  });

  describe('getRelativeTime', () => {
    it('should return "just now" for current time', () => {
      const now = Date.now();
      const relative = getRelativeTime(now);

      expect(relative).toBe('just now');
    });

    it('should format future time in minutes', () => {
      const future = Date.now() + 30 * 60 * 1000; // 30 minutes
      const relative = getRelativeTime(future);

      expect(relative).toContain('30 minutes');
      expect(relative).toContain('in');
    });

    it('should format past time in minutes', () => {
      const past = Date.now() - 30 * 60 * 1000; // 30 minutes ago
      const relative = getRelativeTime(past);

      expect(relative).toContain('30 minutes');
      expect(relative).toContain('ago');
    });

    it('should format future time in hours', () => {
      const future = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
      const relative = getRelativeTime(future);

      expect(relative).toContain('2 hours');
      expect(relative).toContain('in');
    });

    it('should return "tomorrow" for next day', () => {
      const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
      const relative = getRelativeTime(tomorrow);

      expect(relative).toBe('tomorrow');
    });

    it('should return "yesterday" for previous day', () => {
      const yesterday = Date.now() - 24 * 60 * 60 * 1000;
      const relative = getRelativeTime(yesterday);

      expect(relative).toBe('yesterday');
    });

    it('should format days for 2-6 days', () => {
      const future = Date.now() + 3 * 24 * 60 * 60 * 1000; // 3 days
      const relative = getRelativeTime(future);

      expect(relative).toContain('3 days');
    });

    it('should use full date for >= 7 days', () => {
      const future = Date.now() + 8 * 24 * 60 * 60 * 1000; // 8 days
      const relative = getRelativeTime(future);

      // Should be a full formatted date, not relative
      expect(relative).not.toContain('days');
    });
  });

  describe('getDayOfWeek', () => {
    it('should return day name for timestamp', () => {
      const monday = new Date('2026-01-19T12:00:00'); // Known Monday
      const dayName = getDayOfWeek(monday);

      expect(dayName).toBe('Monday');
    });

    it('should handle Date objects', () => {
      const friday = new Date('2026-01-23T12:00:00'); // Known Friday
      const dayName = getDayOfWeek(friday);

      expect(dayName).toBe('Friday');
    });
  });

  describe('getDateHeader', () => {
    it('should return "Today" for current date', () => {
      const now = Date.now();
      const header = getDateHeader(now);

      expect(header).toBe('Today');
    });

    it('should return "Tomorrow" for next day', () => {
      const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
      const header = getDateHeader(tomorrow);

      expect(header).toBe('Tomorrow');
    });

    it('should return formatted date for other days', () => {
      const future = Date.now() + 3 * 24 * 60 * 60 * 1000;
      const header = getDateHeader(future);

      expect(header).not.toBe('Today');
      expect(header).not.toBe('Tomorrow');
      // Should contain day name and date
      expect(header.length).toBeGreaterThan(5);
    });
  });
});

describe('Date Utils - Array Operations', () => {
  const createMockEvent = (startTime: number) => ({
    id: String(startTime),
    startTime,
    title: 'Test Event',
  });

  describe('sortEventsByTime', () => {
    it('should sort events ascending by default', () => {
      const events = [
        createMockEvent(3000),
        createMockEvent(1000),
        createMockEvent(2000),
      ];

      const sorted = sortEventsByTime(events);

      expect(sorted[0].startTime).toBe(1000);
      expect(sorted[1].startTime).toBe(2000);
      expect(sorted[2].startTime).toBe(3000);
    });

    it('should sort events descending when specified', () => {
      const events = [
        createMockEvent(1000),
        createMockEvent(3000),
        createMockEvent(2000),
      ];

      const sorted = sortEventsByTime(events, false);

      expect(sorted[0].startTime).toBe(3000);
      expect(sorted[1].startTime).toBe(2000);
      expect(sorted[2].startTime).toBe(1000);
    });

    it('should not modify original array', () => {
      const events = [
        createMockEvent(3000),
        createMockEvent(1000),
      ];

      const sorted = sortEventsByTime(events);

      expect(events[0].startTime).toBe(3000); // Original unchanged
      expect(sorted[0].startTime).toBe(1000); // Sorted array
    });

    it('should handle empty array', () => {
      const sorted = sortEventsByTime([]);
      expect(sorted).toEqual([]);
    });

    it('should handle single event', () => {
      const events = [createMockEvent(1000)];
      const sorted = sortEventsByTime(events);

      expect(sorted).toEqual(events);
    });
  });

  describe('filterEventsByDateRange', () => {
    it('should filter events within date range', () => {
      const start = new Date('2026-01-20T00:00:00');
      const end = new Date('2026-01-22T00:00:00');

      const events = [
        createMockEvent(new Date('2026-01-19T12:00:00').getTime()),
        createMockEvent(new Date('2026-01-20T12:00:00').getTime()),
        createMockEvent(new Date('2026-01-21T12:00:00').getTime()),
        createMockEvent(new Date('2026-01-23T12:00:00').getTime()),
      ];

      const filtered = filterEventsByDateRange(events, start, end);

      expect(filtered.length).toBe(2);
      expect(filtered[0].id).toBe(String(new Date('2026-01-20T12:00:00').getTime()));
      expect(filtered[1].id).toBe(String(new Date('2026-01-21T12:00:00').getTime()));
    });

    it('should include full end date', () => {
      const start = new Date('2026-01-20T00:00:00');
      const end = new Date('2026-01-20T00:00:00'); // Same day

      const events = [
        createMockEvent(new Date('2026-01-20T23:59:00').getTime()), // Late on end date
      ];

      const filtered = filterEventsByDateRange(events, start, end);
      expect(filtered.length).toBe(1);
    });

    it('should handle empty array', () => {
      const start = new Date('2026-01-20T00:00:00');
      const end = new Date('2026-01-22T00:00:00');

      const filtered = filterEventsByDateRange([], start, end);
      expect(filtered).toEqual([]);
    });
  });

  describe('groupEventsByDate', () => {
    it('should group events by calendar date', () => {
      const events = [
        createMockEvent(new Date('2026-01-20T09:00:00').getTime()),
        createMockEvent(new Date('2026-01-20T14:00:00').getTime()),
        createMockEvent(new Date('2026-01-21T10:00:00').getTime()),
      ];

      const grouped = groupEventsByDate(events);

      expect(grouped.size).toBe(2);
      expect(grouped.get('2026-01-20')?.length).toBe(2);
      expect(grouped.get('2026-01-21')?.length).toBe(1);
    });

    it('should handle empty array', () => {
      const grouped = groupEventsByDate([]);
      expect(grouped.size).toBe(0);
    });

    it('should handle single event', () => {
      const events = [createMockEvent(new Date('2026-01-20T12:00:00').getTime())];
      const grouped = groupEventsByDate(events);

      expect(grouped.size).toBe(1);
      expect(grouped.get('2026-01-20')).toEqual(events);
    });
  });
});
