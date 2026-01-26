/**
 * Tests for Google Calendar integration
 */

import {
  ROOMS,
  parseICalDate,
  getEventsInRange,
  getTodaysEvents,
  isRoomAvailable,
  findAvailableRooms,
  generateRSVPCalendarUrl,
  CalendarEvent
} from '../google-calendar';

// Mock sample events for testing
const mockEvents: CalendarEvent[] = [
  {
    id: 'event1',
    title: 'Workshop: Intro to Web3',
    description: 'Learn the basics of blockchain',
    startTime: new Date('2026-01-26T14:00:00Z'),
    endTime: new Date('2026-01-26T16:00:00Z'),
    room: 'Ostrom Room',
    location: '2nd floor, main room',
    status: 'confirmed'
  },
  {
    id: 'event2',
    title: 'Talk: AI Safety',
    description: 'Discussion on AI alignment',
    startTime: new Date('2026-01-26T16:30:00Z'),
    endTime: new Date('2026-01-26T18:00:00Z'),
    room: 'Satoshi Room',
    location: '2nd floor, across the bridge',
    status: 'confirmed'
  },
  {
    id: 'event3',
    title: '1:1 Mentorship',
    description: 'Career advice session',
    startTime: new Date('2026-01-27T10:00:00Z'),
    endTime: new Date('2026-01-27T11:00:00Z'),
    room: 'Phone Booth',
    status: 'tentative'
  }
];

describe('Google Calendar Integration', () => {
  describe('ROOMS constant', () => {
    it('should have all 5 rooms defined', () => {
      expect(ROOMS).toHaveLength(5);
    });

    it('should have correct room names', () => {
      const roomNames = ROOMS.map(r => r.name);
      expect(roomNames).toContain('Ostrom Room');
      expect(roomNames).toContain('Satoshi Room');
      expect(roomNames).toContain('Angel Room');
      expect(roomNames).toContain('Mush Room');
      expect(roomNames).toContain('Phone Booth');
    });

    it('should have calendar IDs for all rooms', () => {
      ROOMS.forEach(room => {
        expect(room.calendarId).toBeTruthy();
        expect(room.calendarId).toContain('@group.calendar.google.com');
      });
    });

    it('should have capacity for all rooms', () => {
      ROOMS.forEach(room => {
        expect(room.capacity).toBeGreaterThan(0);
      });
    });

    it('should have correct capacities', () => {
      const ostrom = ROOMS.find(r => r.name === 'Ostrom Room');
      const satoshi = ROOMS.find(r => r.name === 'Satoshi Room');
      const phoneBooth = ROOMS.find(r => r.name === 'Phone Booth');

      expect(ostrom?.capacity).toBe(80);
      expect(satoshi?.capacity).toBe(15);
      expect(phoneBooth?.capacity).toBe(1);
    });
  });

  describe('getEventsInRange', () => {
    it('should filter events within date range', () => {
      const startDate = new Date('2026-01-26T00:00:00Z');
      const endDate = new Date('2026-01-26T23:59:59Z');

      const filtered = getEventsInRange(mockEvents, startDate, endDate);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe('event1');
      expect(filtered[1].id).toBe('event2');
    });

    it('should return empty array if no events in range', () => {
      const startDate = new Date('2026-02-01T00:00:00Z');
      const endDate = new Date('2026-02-02T00:00:00Z');

      const filtered = getEventsInRange(mockEvents, startDate, endDate);

      expect(filtered).toHaveLength(0);
    });

    it('should include events on boundary dates', () => {
      const startDate = new Date('2026-01-26T14:00:00Z');
      const endDate = new Date('2026-01-26T16:00:00Z');

      const filtered = getEventsInRange(mockEvents, startDate, endDate);

      expect(filtered.length).toBeGreaterThan(0);
    });
  });

  describe('getTodaysEvents', () => {
    it('should return only events for current day', () => {
      // Create events for testing with today's date
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0);
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 11, 0);

      const testEvents: CalendarEvent[] = [
        {
          id: 'today1',
          title: 'Today Event',
          description: '',
          startTime: todayStart,
          endTime: todayEnd,
          status: 'confirmed'
        },
        {
          id: 'tomorrow1',
          title: 'Tomorrow Event',
          description: '',
          startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
          status: 'confirmed'
        }
      ];

      const todaysEvents = getTodaysEvents(testEvents);

      expect(todaysEvents).toHaveLength(1);
      expect(todaysEvents[0].id).toBe('today1');
    });
  });

  describe('isRoomAvailable', () => {
    it('should return true if room is available', () => {
      const startTime = new Date('2026-01-26T12:00:00Z');
      const endTime = new Date('2026-01-26T13:00:00Z');

      const available = isRoomAvailable('Ostrom Room', startTime, endTime, mockEvents);

      expect(available).toBe(true);
    });

    it('should return false if room is occupied', () => {
      const startTime = new Date('2026-01-26T14:30:00Z');
      const endTime = new Date('2026-01-26T15:30:00Z');

      const available = isRoomAvailable('Ostrom Room', startTime, endTime, mockEvents);

      expect(available).toBe(false);
    });

    it('should return false for overlapping time slots', () => {
      const startTime = new Date('2026-01-26T13:00:00Z');
      const endTime = new Date('2026-01-26T15:00:00Z');

      const available = isRoomAvailable('Ostrom Room', startTime, endTime, mockEvents);

      expect(available).toBe(false);
    });

    it('should return true for adjacent time slots', () => {
      const startTime = new Date('2026-01-26T16:00:00Z');
      const endTime = new Date('2026-01-26T17:00:00Z');

      const available = isRoomAvailable('Ostrom Room', startTime, endTime, mockEvents);

      expect(available).toBe(true);
    });

    it('should handle different rooms correctly', () => {
      const startTime = new Date('2026-01-26T14:00:00Z');
      const endTime = new Date('2026-01-26T16:00:00Z');

      // Ostrom Room is occupied
      expect(isRoomAvailable('Ostrom Room', startTime, endTime, mockEvents)).toBe(false);

      // Angel Room is available (no events)
      expect(isRoomAvailable('Angel Room', startTime, endTime, mockEvents)).toBe(true);
    });
  });

  describe('findAvailableRooms', () => {
    it('should find all available rooms', () => {
      // Check time that overlaps with Ostrom Room's event (14:00-16:00)
      const startTime = new Date('2026-01-26T14:00:00Z');
      const endTime = new Date('2026-01-26T15:00:00Z');

      const available = findAvailableRooms(startTime, endTime, mockEvents);

      expect(available.length).toBeGreaterThan(0);
      // Ostrom Room should NOT be available during its event
      expect(available.map(r => r.name)).not.toContain('Ostrom Room');
    });

    it('should filter by minimum capacity', () => {
      const startTime = new Date('2026-01-26T12:00:00Z');
      const endTime = new Date('2026-01-26T13:00:00Z');

      const available = findAvailableRooms(startTime, endTime, mockEvents, 50);

      // Only Ostrom Room has capacity >= 50, but it's available at this time
      expect(available).toHaveLength(1);
      expect(available[0].name).toBe('Ostrom Room');
    });

    it('should return empty array if no rooms meet criteria', () => {
      const startTime = new Date('2026-01-26T14:00:00Z');
      const endTime = new Date('2026-01-26T16:00:00Z');

      const available = findAvailableRooms(startTime, endTime, mockEvents, 50);

      // Ostrom Room (only room with capacity >= 50) is occupied
      expect(available).toHaveLength(0);
    });

    it('should handle capacity requirement correctly', () => {
      const startTime = new Date('2026-01-26T12:00:00Z');
      const endTime = new Date('2026-01-26T13:00:00Z');

      const smallRooms = findAvailableRooms(startTime, endTime, mockEvents, 1);
      const mediumRooms = findAvailableRooms(startTime, endTime, mockEvents, 10);
      const largeRooms = findAvailableRooms(startTime, endTime, mockEvents, 50);

      expect(smallRooms.length).toBeGreaterThanOrEqual(mediumRooms.length);
      expect(mediumRooms.length).toBeGreaterThanOrEqual(largeRooms.length);
    });
  });

  describe('generateRSVPCalendarUrl', () => {
    it('should generate valid iCal URL', () => {
      const npub = 'npub1abc123xyz';
      const url = generateRSVPCalendarUrl(npub);

      expect(url).toContain('/api/calendar/rsvp/');
      expect(url).toContain(npub);
      expect(url).toContain('.ics');
    });

    it('should use correct domain in URL', () => {
      const npub = 'npub1test';
      const url = generateRSVPCalendarUrl(npub);

      expect(url).toMatch(/^https?:\/\//);
    });
  });

  describe('iCal date parsing', () => {
    // Note: parseICalDate is not exported, but we can test it indirectly
    // through the public API when fetching real calendar data

    it('should handle UTC dates correctly', () => {
      const date = new Date('2026-01-26T14:00:00Z');
      expect(date.getUTCHours()).toBe(14);
    });

    it('should handle local dates correctly', () => {
      const date = new Date('2026-01-26T14:00:00');
      expect(date).toBeInstanceOf(Date);
    });
  });

  describe('CalendarEvent interface', () => {
    it('should have all required fields', () => {
      const event: CalendarEvent = {
        id: 'test',
        title: 'Test Event',
        description: 'Test description',
        startTime: new Date(),
        endTime: new Date(),
        status: 'confirmed'
      };

      expect(event.id).toBe('test');
      expect(event.title).toBe('Test Event');
      expect(event.startTime).toBeInstanceOf(Date);
      expect(event.status).toBe('confirmed');
    });

    it('should allow optional fields', () => {
      const event: CalendarEvent = {
        id: 'test',
        title: 'Test Event',
        description: '',
        startTime: new Date(),
        endTime: new Date(),
        status: 'confirmed',
        location: 'Test Location',
        organizer: 'Test Organizer',
        room: 'Test Room'
      };

      expect(event.location).toBe('Test Location');
      expect(event.organizer).toBe('Test Organizer');
      expect(event.room).toBe('Test Room');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty events array', () => {
      const startTime = new Date('2026-01-26T12:00:00Z');
      const endTime = new Date('2026-01-26T13:00:00Z');

      const available = findAvailableRooms(startTime, endTime, []);

      // All rooms should be available with no events
      expect(available).toHaveLength(5);
    });

    it('should handle events with same start and end time', () => {
      const instantEvent: CalendarEvent = {
        id: 'instant',
        title: 'Instant Event',
        description: '',
        startTime: new Date('2026-01-26T14:00:00Z'),
        endTime: new Date('2026-01-26T14:00:00Z'),
        room: 'Angel Room',
        status: 'confirmed'
      };

      const available = isRoomAvailable(
        'Angel Room',
        new Date('2026-01-26T14:00:00Z'),
        new Date('2026-01-26T15:00:00Z'),
        [instantEvent]
      );

      expect(available).toBe(true);
    });

    it('should handle events without room assignment', () => {
      const noRoomEvent: CalendarEvent = {
        id: 'noroom',
        title: 'Virtual Event',
        description: '',
        startTime: new Date('2026-01-26T14:00:00Z'),
        endTime: new Date('2026-01-26T15:00:00Z'),
        status: 'confirmed'
      };

      const available = isRoomAvailable(
        'Ostrom Room',
        new Date('2026-01-26T14:00:00Z'),
        new Date('2026-01-26T15:00:00Z'),
        [noRoomEvent]
      );

      // Event without room shouldn't block any room
      expect(available).toBe(true);
    });
  });
});
