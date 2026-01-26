# Application Settings (settings.json)

The `settings.json` file contains the application configuration, including NOSTR relay URLs, event details, and token economics.

## NOSTR Relays

The app uses multiple NOSTR relays for redundancy and better network coverage. Relays are configured in the `nostrRelays` array:

```json
{
  "nostrRelays": [
    "wss://nostr.commonshub.brussels",
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.nostr.band"
  ]
}
```

### Current Relays

1. **wss://nostr.commonshub.brussels** - Primary relay hosted by Commons Hub
2. **wss://relay.damus.io** - Popular public relay by Damus
3. **wss://nos.lol** - Community relay with good uptime
4. **wss://relay.nostr.band** - Well-maintained public relay

### How Relays are Used

**Frontend (`src/lib/nostr-relay.ts`)**:
- Reads from `settings.json` by default
- Can be overridden by localStorage: `osv_relay_urls`
- Publishes events to all configured relays in parallel
- Shows connection status in dev mode (bottom-right corner)

**Backend (`src/lib/nostr-subscriber.ts`)**:
- Reads from `settings.json` by default
- Can be overridden by environment variables:
  - `NOSTR_RELAY_URL` - Primary relay
  - `NOSTR_RELAY_FALLBACK` - Fallback relay
- Subscribes to all profile npubs across all relays
- Logs received events to `DATA_DIR/badges/:serial/nostr_log.jsonl`

### Priority Order

**Backend**:
1. Environment variables (`NOSTR_RELAY_URL`, `NOSTR_RELAY_FALLBACK`)
2. `settings.json` relays

**Frontend**:
1. localStorage (`osv_relay_urls`)
2. `settings.json` relays

### Adding/Removing Relays

To modify the relay list, edit `settings.json`:

```json
{
  "nostrRelays": [
    "wss://your.relay.com",
    "wss://another.relay.org"
  ]
}
```

Changes take effect immediately:
- **Frontend**: Next page load or component mount
- **Backend**: Restart required (or reinitialize subscriber via `/api/nostr-subscriber/init`)

### Testing Relays

Check relay health at: https://nostr.watch

Test connection in browser console:
```javascript
import { getRelayUrls, initializeRelayConnections } from '@/lib/nostr-relay';
console.log(getRelayUrls()); // Show current relays
await initializeRelayConnections(); // Connect to all
```

## Other Settings

### Event Configuration
```json
{
  "eventName": "Open Source Village 2026",
  "eventDates": {
    "start": "2026-01-26",
    "end": "2026-02-06"
  }
}
```

### Token Economics
```json
{
  "tokenEconomics": {
    "initialBalance": 50,
    "offerCreationCost": 1,
    "rsvpCost": 1,
    "claimCost": 1
  }
}
```

### Suggested Tags
```json
{
  "suggestedTags": [
    "web3",
    "ai",
    "open-source",
    "community",
    "workshop",
    "talk",
    "1:1"
  ]
}
```

## Development vs Production

The same `settings.json` is used for all environments. To use different relays per environment:

1. **Use environment variables** (backend only):
   ```bash
   NOSTR_RELAY_URL=wss://dev.relay.com
   NOSTR_RELAY_FALLBACK=wss://dev2.relay.com
   ```

2. **Use localStorage** (frontend only):
   ```javascript
   localStorage.setItem('osv_relay_urls', JSON.stringify([
     'wss://dev.relay.com',
     'wss://dev2.relay.com'
   ]));
   ```

3. **Different settings.json per deployment** (recommended):
   - Keep dev/prod settings in separate files
   - Copy appropriate file to `settings.json` during deployment
