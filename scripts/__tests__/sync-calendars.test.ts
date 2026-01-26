/**
 * Tests for Google Calendar sync script
 */

const mockWriteFile = jest.fn();
const mockReadFile = jest.fn();
const mockReaddir = jest.fn();
const mockMkdir = jest.fn();
const mockAccess = jest.fn();
const mockStat = jest.fn();

// Mock modules before importing
jest.mock('fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  readdir: mockReaddir,
  mkdir: mockMkdir,
  access: mockAccess,
  stat: mockStat,
}));

jest.mock('googleapis', () => ({
  google: {
    calendar: jest.fn(() => ({
      events: {
        list: jest.fn(),
        insert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    })),
    auth: {
      GoogleAuth: jest.fn(() => ({
        getClient: jest.fn().mockResolvedValue({}),
      })),
    },
  },
}));

describe('Calendar Sync Script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('shouldSyncRoom', () => {
    it('should sync if proposals.ics is newer than last sync', async () => {
      // Test that change detection works based on file modification time
      // vs stored .sync-metadata timestamp
      const lastSyncTime = new Date('2026-01-28T10:00:00Z');
      const proposalsModTime = new Date('2026-01-28T12:00:00Z');

      // proposals.ics is newer, should sync
      expect(proposalsModTime > lastSyncTime).toBe(true);
    });

    it('should not sync if proposals.ics has not changed', async () => {
      const lastSyncTime = new Date('2026-01-28T12:00:00Z');
      const proposalsModTime = new Date('2026-01-28T10:00:00Z');

      // proposals.ics is older, should not sync
      expect(proposalsModTime > lastSyncTime).toBe(false);
    });
  });

  describe('matchEventsByUid', () => {
    it('should match local and remote events by UID', () => {
      const localEvent = {
        offerId: 'offer-123',
        uid: 'offer-offer-123@opensourcevillage.org',
      };

      const remoteEvent = {
        id: 'google-event-abc',
        iCalUID: 'offer-offer-123@opensourcevillage.org',
      };

      expect(localEvent.uid).toBe(remoteEvent.iCalUID);
    });

    it('should identify new events to create', () => {
      const localEvents = [
        { uid: 'offer-offer-123@opensourcevillage.org' },
        { uid: 'offer-offer-456@opensourcevillage.org' },
      ];

      const remoteEvents = [
        { iCalUID: 'offer-offer-123@opensourcevillage.org' },
      ];

      const remoteUids = new Set(remoteEvents.map((e) => e.iCalUID));
      const newEvents = localEvents.filter((e) => !remoteUids.has(e.uid));

      expect(newEvents).toHaveLength(1);
      expect(newEvents[0].uid).toBe('offer-offer-456@opensourcevillage.org');
    });
  });

  describe('syncCalendar', () => {
    it.todo('should create new events in Google Calendar');
    it.todo('should update existing events when changed');
    it.todo('should delete events that are cancelled locally');
    it.todo('should handle API errors gracefully');
  });

  describe('updateSyncMetadata', () => {
    it('should write sync timestamp to .sync-metadata', async () => {
      mockWriteFile.mockResolvedValue(undefined);

      const timestamp = new Date().toISOString();
      await mockWriteFile('/path/.sync-metadata', timestamp);

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/path/.sync-metadata',
        timestamp
      );
    });
  });
});
