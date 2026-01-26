/**
 * Discord Webhook Logger
 *
 * Logs NOSTR events to Discord channel for monitoring and debugging.
 * As specified in specs/logging.md
 *
 * Discord Guild ID: 1418496180643696782
 * Discord Channel ID: 1429134429066100816
 *
 * @see specs/logging.md
 */

import { NostrEvent } from './nostr-logger';

// Discord webhook configuration
const DISCORD_GUILD_ID = '1418496180643696782';
const DISCORD_CHANNEL_ID = '1429134429066100816';

// Environment variable for webhook URL
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

/**
 * Format NOSTR event for Discord message
 *
 * Creates a rich embed with event details and njump.me link
 *
 * @param event - NOSTR event to format
 * @returns Discord webhook payload
 */
function formatDiscordMessage(event: NostrEvent): Record<string, unknown> {
  // Create nevent (note + event) bech32 identifier
  // For production, use proper nip19 encoding
  // For now, use simplified approach with event ID
  const njumpUrl = `https://njump.me/${event.id}`;

  // Get event kind name
  const kindName = getEventKindName(event.kind);

  // Format timestamp
  const timestamp = new Date(event.created_at * 1000).toISOString();

  // Create Discord embed
  const embed = {
    title: `New NOSTR Event: ${kindName}`,
    description: event.content.slice(0, 200) || '(no content)',
    color: getColorForKind(event.kind),
    fields: [
      {
        name: 'Event ID',
        value: `\`${event.id}\``,
        inline: true,
      },
      {
        name: 'Kind',
        value: `${event.kind} (${kindName})`,
        inline: true,
      },
      {
        name: 'Author',
        value: `\`${event.pubkey.slice(0, 16)}...\``,
        inline: false,
      },
      {
        name: 'Timestamp',
        value: timestamp,
        inline: true,
      },
      {
        name: 'View Raw Event',
        value: `[njump.me](${njumpUrl})`,
        inline: true,
      },
    ],
    footer: {
      text: 'Open Source Village • NOSTR Event Logger',
    },
    timestamp: new Date(event.created_at * 1000).toISOString(),
  };

  // Add tags if present
  if (event.tags && event.tags.length > 0) {
    const tagsSummary = event.tags.map(t => t[0]).join(', ');
    embed.fields.push({
      name: 'Tags',
      value: tagsSummary.slice(0, 100) || 'none',
      inline: false,
    });
  }

  return {
    embeds: [embed],
  };
}

/**
 * Get human-readable name for event kind
 */
function getEventKindName(kind: number): string {
  const kindNames: Record<number, string> = {
    0: 'Metadata (Profile)',
    1: 'Text Note',
    2: 'Recommend Relay',
    3: 'Contacts',
    4: 'Encrypted DM',
    5: 'Event Deletion',
    7: 'Reaction',
    40: 'Channel Creation',
    41: 'Channel Metadata',
    42: 'Channel Message',
    43: 'Channel Hide Message',
    44: 'Channel Mute User',
    1984: 'Reporting',
    9734: 'Zap Request',
    9735: 'Zap',
    10002: 'Relay List',
    30000: 'Categorized People',
    30001: 'Categorized Bookmarks',
    30023: 'Long-form Content',
  };

  return kindNames[kind] || `Unknown (${kind})`;
}

/**
 * Get color for Discord embed based on event kind
 */
function getColorForKind(kind: number): number {
  // Discord colors in decimal
  if (kind === 0) return 0x5865f2; // Blue for profiles
  if (kind === 1) return 0x57f287; // Green for notes
  if (kind === 7) return 0xfee75c; // Yellow for reactions
  if (kind >= 30000 && kind < 40000) return 0xeb459e; // Pink for replaceable events
  return 0x99aab5; // Gray for others
}

/**
 * Log NOSTR event to Discord webhook
 *
 * Sends event details to Discord channel for monitoring.
 * Includes link to njump.me for viewing raw event data.
 *
 * @param event - NOSTR event to log
 * @returns Promise resolving to true if successful
 */
export async function logToDiscord(event: NostrEvent): Promise<boolean> {
  // Check if webhook URL is configured
  if (!DISCORD_WEBHOOK_URL) {
    console.warn('Discord webhook URL not configured. Set DISCORD_WEBHOOK_URL env var.');
    return false;
  }

  try {
    // Format message
    const payload = formatDiscordMessage(event);

    // Send to Discord
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('Discord webhook failed:', response.status, response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to log to Discord:', error);
    return false;
  }
}

/**
 * Log NOSTR event to Discord with rate limiting
 *
 * Uses a simple in-memory rate limiter to avoid hitting Discord rate limits.
 * Discord allows 30 requests per minute per webhook.
 *
 * @param event - NOSTR event to log
 * @returns Promise resolving to true if logged
 */
export async function logToDiscordRateLimited(event: NostrEvent): Promise<boolean> {
  // Check rate limit
  const now = Date.now();
  const windowStart = now - 60000; // 1 minute window

  // Remove old timestamps
  logTimestamps = logTimestamps.filter(ts => ts > windowStart);

  // Check if under limit (25/min to leave buffer)
  if (logTimestamps.length >= 25) {
    console.warn('Discord rate limit reached, skipping log');
    return false;
  }

  // Log and record timestamp
  const success = await logToDiscord(event);
  if (success) {
    logTimestamps.push(now);
  }

  return success;
}

// In-memory rate limit tracker
let logTimestamps: number[] = [];

/**
 * Batch log multiple events to Discord
 *
 * Combines multiple events into a single message to reduce API calls.
 *
 * @param events - Array of NOSTR events
 * @returns Promise resolving to true if successful
 */
export async function logBatchToDiscord(events: NostrEvent[]): Promise<boolean> {
  if (!DISCORD_WEBHOOK_URL) {
    console.warn('Discord webhook URL not configured. Set DISCORD_WEBHOOK_URL env var.');
    return false;
  }

  if (events.length === 0) {
    return true;
  }

  try {
    // Create summary message
    const summary = events.map((e, i) => {
      const kind = getEventKindName(e.kind);
      const njumpUrl = `https://njump.me/${e.id}`;
      return `${i + 1}. **${kind}** - [View](${njumpUrl})`;
    }).join('\n');

    const payload = {
      embeds: [
        {
          title: `Batch: ${events.length} NOSTR Events`,
          description: summary,
          color: 0x5865f2,
          footer: {
            text: 'Open Source Village • Batch Log',
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to batch log to Discord:', error);
    return false;
  }
}

/**
 * Get Discord logging configuration
 *
 * @returns Configuration object
 */
export function getDiscordConfig(): {
  guildId: string;
  channelId: string;
  webhookUrl: string;
  isConfigured: boolean;
} {
  return {
    guildId: DISCORD_GUILD_ID,
    channelId: DISCORD_CHANNEL_ID,
    webhookUrl: DISCORD_WEBHOOK_URL ? '[CONFIGURED]' : '[NOT SET]',
    isConfigured: !!DISCORD_WEBHOOK_URL,
  };
}
