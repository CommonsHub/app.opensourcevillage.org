# Open Source Village

A mobile-first web application for Open Source Village event (Jan 26 - Feb 6, 2026) that facilitates networking through NFC badges, token economy, and open space workshop coordination.

## Features

- **NFC Badge System**: Attendees scan badges to claim profiles and send tokens
- **Token Economy**: ERC20 tokens on Gnosis Chain for workshop RSVPs and offers
- **Workshop Coordination**: Create and RSVP to community-led workshops
- **Marketplace**: Browse and claim generic offers from other attendees
- **Offline-First**: NOSTR protocol for event propagation with blockchain settlement
- **Calendar Integration**: Google Calendar sync for official event schedule

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes (Node.js)
- **Package Manager**: Bun
- **Storage**: File-based (JSON/JSONL)
- **Blockchain**: Gnosis Chain (ERC20 tokens via token-factory)
- **Protocol**: NOSTR for offline-first event propagation

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed
- Node.js 18+ (for Next.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/commonshub/app.opensourcevillage.org.git
cd app.opensourcevillage.org

# Install dependencies
bun install

# Create data directories
mkdir -p data/badges data/usernames data/logs

# Start development server
bun dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
├── src/
│   ├── app/              # Next.js App Router pages and API routes
│   │   ├── api/          # API endpoints
│   │   ├── page.tsx      # Home page
│   │   └── layout.tsx    # Root layout
│   ├── lib/              # Utility functions
│   │   └── storage.ts    # File-based storage layer
│   └── types/            # TypeScript type definitions
├── specs/                # Project specifications
│   ├── TECHNICAL_SPEC.md
│   └── screens/prototype/ # HTML prototypes (UI reference)
├── data/                 # Runtime data (gitignored)
│   ├── badges/           # User profiles and queues
│   ├── usernames/        # Username -> badge symlinks
│   └── logs/             # Application logs
└── @AGENT.md             # Build and development instructions
```

## Development

```bash
# Run development server
bun dev

# Build for production
bun run build

# Start production server
bun start

# Run tests
bun test

# Run tests with coverage
bun run test:coverage
```

## API Endpoints

### POST /api/claim
Claim an NFC badge and create user profile.

**Request:**
```json
{
  "username": "alice",
  "serialNumber": "ABC123",
  "npub": "npub1..."
}
```

**Response:**
```json
{
  "success": true,
  "profile": {
    "npub": "npub1...",
    "username": "alice",
    "createdAt": "2026-01-20T...",
    "updatedAt": "2026-01-20T..."
  }
}
```

## Architecture

### NFC Badge Flow
1. User scans NFC tag: `app.opensourcevillage.org/badge#{serialNumber}`
2. Serial number extracted from URL fragment (client-side only)
3. User sets username and password/PIN
4. Client derives NOSTR keypair from serialNumber + password
5. Profile created, 50 tokens minted automatically

### Token Economics
- Creating an offer: 1 token
- RSVP to workshop: 1 token (refunded if cancelled)
- Claiming an offer: 1 token
- Workshop organizer receives: 1 token per attendee

### Storage
File-based storage with eventual consistency:
- `data/badges/{serialNumber}/profile.json` - User profile
- `data/badges/{serialNumber}/queue.jsonl` - Blockchain operations
- `data/badges/{serialNumber}/nostr_log.jsonl` - NOSTR events
- `data/usernames/{username}` - Symlink to badge directory

## Production Deployment

### Quick Setup

Run the automated setup script to configure all systemd services and cron jobs:

```bash
# Set your app directory and run the setup script
curl -sSL https://raw.githubusercontent.com/commonshub/app.opensourcevillage.org/main/scripts/setup-services.sh | sudo APP_DIR=/var/www/app.opensourcevillage.org bash
```

Or with custom configuration:

```bash
# Download the script first
wget https://raw.githubusercontent.com/commonshub/app.opensourcevillage.org/main/scripts/setup-services.sh
chmod +x setup-services.sh

# Run with custom settings
sudo APP_DIR=/path/to/app APP_USER=myuser SERVICE_PREFIX=osv ./setup-services.sh
```

The script will:
- Create systemd services for the main app, payment processor, and NOSTR recorder
- Set up a cron job for calendar sync (every 5 minutes)
- Configure sudoers for passwordless service restarts (for webhook deployments)
- Create log directories

### Prerequisites

- A Linux server with systemd
- Bun installed globally (`curl -fsSL https://bun.sh/install | bash`)
- Git configured with SSH access to the repository
- Sudo access for the deployment user (for systemctl restart)

### Environment Setup

1. Copy `.env.example` to `.env.local` and configure all required variables:

```bash
cp .env.example .env.local
nano .env.local
```

2. Generate a webhook secret:

```bash
openssl rand -hex 32
```

Add this to both your `.env.local` (as `WEBHOOK_SECRET`) and your GitHub repository webhook settings.

### Systemd Service (Manual Setup)

> **Note:** If you used the quick setup script above, these services are already configured. This section is for reference or manual setup.

Create a systemd service to run the Next.js app and background processes.

1. Create the service file `/etc/systemd/system/osv.service`:

```ini
[Unit]
Description=Open Source Village App
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/app.opensourcevillage.org
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/bun run start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

2. Create a service for the payment processor `/etc/systemd/system/osv-payment-processor.service`:

```ini
[Unit]
Description=OSV Payment Processor
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/app.opensourcevillage.org
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/bun run scripts/payment-processor.ts
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

3. Create a service for the NOSTR event recorder `/etc/systemd/system/osv-nostr-recorder.service`:

```ini
[Unit]
Description=OSV NOSTR Event Recorder
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/app.opensourcevillage.org
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/bun run scripts/record-nostr-events.ts
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

4. Enable and start all services:

```bash
sudo systemctl daemon-reload
sudo systemctl enable osv osv-payment-processor osv-nostr-recorder
sudo systemctl start osv osv-payment-processor osv-nostr-recorder
```

5. Check service status:

```bash
sudo systemctl status osv
sudo systemctl status osv-payment-processor
sudo systemctl status osv-nostr-recorder
```

6. View logs:

```bash
sudo journalctl -u osv -f
sudo journalctl -u osv-payment-processor -f
sudo journalctl -u osv-nostr-recorder -f
```

### Cron Job for Calendar Sync

Set up a cron job to sync local calendar proposals to Google Calendar.

1. Edit the crontab for the www-data user:

```bash
sudo crontab -u www-data -e
```

2. Add the following line to sync every 5 minutes:

```cron
*/5 * * * * cd /var/www/app.opensourcevillage.org && /usr/local/bin/bun run scripts/sync-calendars.ts >> /var/log/osv/calendar-sync.log 2>&1
```

3. Create the log directory:

```bash
sudo mkdir -p /var/log/osv
sudo chown www-data:www-data /var/log/osv
```

### GitHub Webhook for Auto-Deployment

1. In your GitHub repository, go to Settings → Webhooks → Add webhook

2. Configure the webhook:
   - **Payload URL**: `https://app.opensourcevillage.org/api/webhook/github`
   - **Content type**: `application/json`
   - **Secret**: Use the same value as `WEBHOOK_SECRET` in your `.env.local`
   - **Events**: Select "Just the push event"

3. Allow the deployment user to restart services without password:

```bash
sudo visudo -f /etc/sudoers.d/osv-deploy
```

Add:

```
www-data ALL=(ALL) NOPASSWD: /bin/systemctl restart osv
www-data ALL=(ALL) NOPASSWD: /bin/systemctl restart osv-payment-processor
www-data ALL=(ALL) NOPASSWD: /bin/systemctl restart osv-nostr-recorder
```

4. Test the webhook by pushing a commit to the main branch.

### Nginx Configuration (Optional)

If using Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name app.opensourcevillage.org;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.opensourcevillage.org;

    ssl_certificate /etc/letsencrypt/live/app.opensourcevillage.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.opensourcevillage.org/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Contributing

See [@AGENT.md](./@AGENT.md) for build instructions and development standards.

## License

MIT
