/**
 * Discord Logger Tests
 *
 * Tests for Discord webhook logging functionality.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { NostrEvent } from '../nostr-logger';

// Mock fetch globally
global.fetch = jest.fn();

// Import after mocking
import {
  logToDiscord,
  logToDiscordRateLimited,
  logBatchToDiscord,
  getDiscordConfig,
} from '../discord-logger';

// Sample NOSTR event for testing
const sampleEvent: NostrEvent = {
  id: 'abc123def456',
  pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  created_at: Math.floor(Date.now() / 1000),
  kind: 1,
  tags: [['t', 'test']],
  content: 'Test event content',
  sig: 'signature123',
};

beforeEach(() => {
  // Clear mock before each test
  (global.fetch as jest.Mock).mockClear();

  // Set webhook URL for tests
  process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/test/webhook';
});

// ============================================================================
// Discord Config Tests
// ============================================================================

describe('getDiscordConfig', () => {
  it('should return correct guild and channel IDs', () => {
    const config = getDiscordConfig();

    expect(config.guildId).toBe('1418496180643696782');
    expect(config.channelId).toBe('1429134429066100816');
  });

  it('should indicate when webhook is configured', () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/webhook';
    const config = getDiscordConfig();

    expect(config.isConfigured).toBe(true);
    expect(config.webhookUrl).toBe('[CONFIGURED]');
  });

  it('should indicate when webhook is not configured', () => {
    delete process.env.DISCORD_WEBHOOK_URL;
    const config = getDiscordConfig();

    expect(config.isConfigured).toBe(false);
    expect(config.webhookUrl).toBe('[NOT SET]');
  });
});

// ============================================================================
// Log to Discord Tests
// ============================================================================

describe('logToDiscord', () => {
  it('should send event to Discord webhook', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const result = await logToDiscord(sampleEvent);

    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/test/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('should include event details in Discord message', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    await logToDiscord(sampleEvent);

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.embeds).toBeDefined();
    expect(body.embeds[0].title).toContain('NOSTR Event');
    expect(body.embeds[0].fields).toBeDefined();
  });

  it('should include njump.me link', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    await logToDiscord(sampleEvent);

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    const viewField = body.embeds[0].fields.find((f: any) => f.name === 'View Raw Event');
    expect(viewField.value).toContain('njump.me');
    expect(viewField.value).toContain(sampleEvent.id);
  });

  it('should return false if webhook URL not configured', async () => {
    delete process.env.DISCORD_WEBHOOK_URL;

    const result = await logToDiscord(sampleEvent);

    expect(result).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should return false on webhook failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const result = await logToDiscord(sampleEvent);

    expect(result).toBe(false);
  });

  it('should handle network errors gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const result = await logToDiscord(sampleEvent);

    expect(result).toBe(false);
  });
});

// ============================================================================
// Rate Limited Logging Tests
// ============================================================================

describe('logToDiscordRateLimited', () => {
  it('should log event when under rate limit', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const result = await logToDiscordRateLimited(sampleEvent);

    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should enforce rate limit (25 per minute)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    // Send 25 events (should succeed)
    for (let i = 0; i < 25; i++) {
      const result = await logToDiscordRateLimited(sampleEvent);
      expect(result).toBe(true);
    }

    // 26th event should be rate limited
    const result = await logToDiscordRateLimited(sampleEvent);
    expect(result).toBe(false);
  });
});

// ============================================================================
// Batch Logging Tests
// ============================================================================

describe('logBatchToDiscord', () => {
  it('should send multiple events in batch', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const events = [sampleEvent, { ...sampleEvent, id: 'event2' }];
    const result = await logBatchToDiscord(events);

    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should include event count in batch message', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const events = [
      sampleEvent,
      { ...sampleEvent, id: 'event2' },
      { ...sampleEvent, id: 'event3' },
    ];
    await logBatchToDiscord(events);

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.embeds[0].title).toContain('3 NOSTR Events');
  });

  it('should return true for empty batch', async () => {
    const result = await logBatchToDiscord([]);

    expect(result).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should return false if webhook not configured', async () => {
    delete process.env.DISCORD_WEBHOOK_URL;

    const result = await logBatchToDiscord([sampleEvent]);

    expect(result).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Event Kind Handling Tests
// ============================================================================

describe('Event kind formatting', () => {
  it('should format profile event (kind 0)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const profileEvent = { ...sampleEvent, kind: 0 };
    await logToDiscord(profileEvent);

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.embeds[0].title).toContain('Metadata (Profile)');
  });

  it('should format text note (kind 1)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    await logToDiscord(sampleEvent); // kind 1

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.embeds[0].title).toContain('Text Note');
  });

  it('should format reaction (kind 7)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const reactionEvent = { ...sampleEvent, kind: 7 };
    await logToDiscord(reactionEvent);

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.embeds[0].title).toContain('Reaction');
  });

  it('should handle unknown event kinds', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const unknownEvent = { ...sampleEvent, kind: 99999 };
    await logToDiscord(unknownEvent);

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.embeds[0].title).toContain('Unknown');
  });
});
