# Environment Setup

## Overview

The app now includes automatic environment variable verification and setup on first run.

## How It Works

1. **First Run Detection**: When the app starts, it checks for required environment variables
2. **Interactive Form**: If any are missing, a modal form appears to collect them
3. **Automatic Save**: Values are saved to `.env` file in the project root
4. **Auto-reload**: After saving, the app reloads to pick up the new environment variables

## Required Environment Variables

### NOSTR_RELAY_URL (Required)
- **Description**: WebSocket URL of the primary NOSTR relay for publishing events
- **Example**: `wss://relay.damus.io`
- **Why needed**: All NOSTR events (profiles, offers, RSVPs) are published to this relay

### NOSTR_RELAY_FALLBACK (Optional)
- **Description**: WebSocket URL of a backup relay if the primary is unavailable
- **Example**: `wss://nos.lol`
- **Why needed**: Improves reliability by having a backup relay

### DISCORD_WEBHOOK_URL (Optional)
- **Description**: Discord webhook URL for logging NOSTR events
- **Example**: `https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN`
- **Why needed**: Enables monitoring of NOSTR events in Discord
- **How to get**: Discord Server Settings → Integrations → Webhooks → Create Webhook

### DATA_DIR (Optional)
- **Description**: Directory path for storing user data and profiles
- **Default**: `./data`
- **Why needed**: Local file storage for user profiles and data

## Manual Setup

If you prefer to set up environment variables manually:

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in the values:
   ```bash
   NOSTR_RELAY_URL=wss://relay.damus.io
   NOSTR_RELAY_FALLBACK=wss://nos.lol
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
   DATA_DIR=./data
   ```

3. Restart the development server:
   ```bash
   npm run dev
   ```

## Troubleshooting

### Form keeps appearing
- Check that `.env` file was created in the project root
- Verify the file contains `NOSTR_RELAY_URL=...`
- Restart the development server after creating `.env`

### Environment variables not loading
- Make sure `.env` is in the project root (same directory as `package.json`)
- Restart the development server (env vars are loaded at startup)
- Check file permissions on `.env` (should be readable)

### Can't save environment variables
- Check file permissions in project directory
- Make sure you have write access to the project root
- Check browser console for error messages

## Security Notes

1. **Never commit `.env` to git**: It's already in `.gitignore`
2. **Never share your Discord webhook URL**: It allows anyone to post to your Discord channel
3. **Use HTTPS/WSS URLs only**: Never use insecure HTTP/WS connections

## Debug Logging

All environment setup operations are logged to the console with the `[EnvSetup]` and `[API /env/*]` prefixes. See [debug-logging.md](./debug-logging.md) for details.
