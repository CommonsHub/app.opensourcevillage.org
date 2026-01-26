#!/bin/bash
#
# Open Source Village - Production Services Setup Script
#
# This script sets up systemd services and cron jobs for running
# the Open Source Village application in production.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/commonshub/app.opensourcevillage.org/main/scripts/setup-services.sh | sudo bash
#
# Or download and run:
#   wget https://raw.githubusercontent.com/commonshub/app.opensourcevillage.org/main/scripts/setup-services.sh
#   chmod +x setup-services.sh
#   sudo ./setup-services.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="${APP_DIR:-/var/www/app.opensourcevillage.org}"
APP_USER="${APP_USER:-www-data}"
APP_GROUP="${APP_GROUP:-www-data}"
SERVICE_PREFIX="${SERVICE_PREFIX:-osv}"
MIN_BUN_VERSION="1.1.0"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Open Source Village - Service Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    exit 1
fi

# Find bun - check common locations since sudo resets PATH
find_bun() {
    # If BUN_PATH is set, use it
    if [ -n "$BUN_PATH" ] && [ -x "$BUN_PATH" ]; then
        echo "$BUN_PATH"
        return
    fi

    # Check PATH first
    local bun_in_path=$(which bun 2>/dev/null || echo "")
    if [ -n "$bun_in_path" ]; then
        echo "$bun_in_path"
        return
    fi

    # Check common installation locations
    local locations=(
        "/root/.bun/bin/bun"
        "/home/*/.bun/bin/bun"
        "/usr/local/bin/bun"
        "/usr/bin/bun"
        "$HOME/.bun/bin/bun"
    )

    for pattern in "${locations[@]}"; do
        for path in $pattern; do
            if [ -x "$path" ]; then
                echo "$path"
                return
            fi
        done
    done

    echo ""
}

BUN_PATH=$(find_bun)
if [ -z "$BUN_PATH" ]; then
    echo -e "${RED}Error: Bun is not installed or not found.${NC}"
    echo -e "${RED}Please install bun first:${NC}"
    echo -e "${RED}  curl -fsSL https://bun.sh/install | bash${NC}"
    echo -e "${YELLOW}Or specify the path manually:${NC}"
    echo -e "${YELLOW}  sudo BUN_PATH=/path/to/bun ./setup-services.sh${NC}"
    exit 1
fi

# Check bun version
BUN_VERSION=$("$BUN_PATH" --version 2>/dev/null || echo "0.0.0")
echo -e "${GREEN}Found bun version $BUN_VERSION at $BUN_PATH${NC}"

# Compare versions (simple comparison - works for semver)
version_ge() {
    [ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

if ! version_ge "$BUN_VERSION" "$MIN_BUN_VERSION"; then
    echo -e "${RED}Error: Bun version $BUN_VERSION is too old. Minimum required: $MIN_BUN_VERSION${NC}"
    echo -e "${RED}Please update bun: bun upgrade${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Bun version $BUN_VERSION meets minimum requirement ($MIN_BUN_VERSION)${NC}"

# Check if app directory exists
if [ ! -d "$APP_DIR" ]; then
    echo -e "${YELLOW}Warning: App directory not found at $APP_DIR${NC}"
    echo -e "${YELLOW}Please set APP_DIR environment variable to your app location${NC}"
    echo -e "${YELLOW}Example: APP_DIR=/home/user/app.opensourcevillage.org sudo ./setup-services.sh${NC}"
    read -p "Enter app directory path: " APP_DIR
    if [ ! -d "$APP_DIR" ]; then
        echo -e "${RED}Error: Directory $APP_DIR does not exist${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}Configuration:${NC}"
echo -e "  App Directory: ${BLUE}$APP_DIR${NC}"
echo -e "  App User:      ${BLUE}$APP_USER${NC}"
echo -e "  Bun:           ${BLUE}$BUN_PATH (v$BUN_VERSION)${NC}"
echo -e "  Service Name:  ${BLUE}$SERVICE_PREFIX${NC}"
echo ""

# Confirm before proceeding
read -p "Continue with setup? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Setup cancelled."
    exit 0
fi

echo ""
echo -e "${BLUE}Step 1: Creating log directory...${NC}"
mkdir -p /var/log/osv
chown $APP_USER:$APP_GROUP /var/log/osv
echo -e "${GREEN}✓ Log directory created at /var/log/osv${NC}"

echo ""
echo -e "${BLUE}Step 2: Creating systemd service for main app...${NC}"
cat > /etc/systemd/system/${SERVICE_PREFIX}.service << EOF
[Unit]
Description=Open Source Village App
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
ExecStart=$BUN_PATH run start
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
echo -e "${GREEN}✓ Created /etc/systemd/system/${SERVICE_PREFIX}.service${NC}"

echo ""
echo -e "${BLUE}Step 3: Creating systemd service for payment processor...${NC}"
cat > /etc/systemd/system/${SERVICE_PREFIX}-payment-processor.service << EOF
[Unit]
Description=OSV Payment Processor
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
ExecStart=$BUN_PATH run scripts/payment-processor.ts
Restart=on-failure
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
echo -e "${GREEN}✓ Created /etc/systemd/system/${SERVICE_PREFIX}-payment-processor.service${NC}"

echo ""
echo -e "${BLUE}Step 4: Creating systemd service for NOSTR event recorder...${NC}"
cat > /etc/systemd/system/${SERVICE_PREFIX}-nostr-recorder.service << EOF
[Unit]
Description=OSV NOSTR Event Recorder
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
ExecStart=$BUN_PATH run scripts/record-nostr-events.ts
Restart=on-failure
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
echo -e "${GREEN}✓ Created /etc/systemd/system/${SERVICE_PREFIX}-nostr-recorder.service${NC}"

echo ""
echo -e "${BLUE}Step 5: Setting up sudoers for webhook deployment...${NC}"
cat > /etc/sudoers.d/${SERVICE_PREFIX}-deploy << EOF
# Allow $APP_USER to restart OSV services without password
# This is used by the GitHub webhook for auto-deployment
$APP_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart ${SERVICE_PREFIX}
$APP_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart ${SERVICE_PREFIX}-payment-processor
$APP_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart ${SERVICE_PREFIX}-nostr-recorder
$APP_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart ${SERVICE_PREFIX}*
EOF
chmod 440 /etc/sudoers.d/${SERVICE_PREFIX}-deploy
echo -e "${GREEN}✓ Created /etc/sudoers.d/${SERVICE_PREFIX}-deploy${NC}"

echo ""
echo -e "${BLUE}Step 6: Setting up cron job for calendar sync...${NC}"
# Create cron job for calendar sync (every 5 minutes)
CRON_CMD="*/5 * * * * cd $APP_DIR && $BUN_PATH run scripts/sync-calendars.ts >> /var/log/osv/calendar-sync.log 2>&1"
# Check if cron job already exists
(crontab -u $APP_USER -l 2>/dev/null | grep -v "sync-calendars.ts"; echo "$CRON_CMD") | crontab -u $APP_USER -
echo -e "${GREEN}✓ Added cron job for calendar sync (every 5 minutes)${NC}"

echo ""
echo -e "${BLUE}Step 7: Reloading systemd daemon...${NC}"
systemctl daemon-reload
echo -e "${GREEN}✓ Systemd daemon reloaded${NC}"

echo ""
echo -e "${BLUE}Step 8: Enabling services...${NC}"
systemctl enable ${SERVICE_PREFIX}
systemctl enable ${SERVICE_PREFIX}-payment-processor
systemctl enable ${SERVICE_PREFIX}-nostr-recorder
echo -e "${GREEN}✓ Services enabled to start on boot${NC}"

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  Setup Complete!${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo -e "Services created:"
echo -e "  • ${BLUE}${SERVICE_PREFIX}${NC} - Main Next.js application"
echo -e "  • ${BLUE}${SERVICE_PREFIX}-payment-processor${NC} - Payment processor"
echo -e "  • ${BLUE}${SERVICE_PREFIX}-nostr-recorder${NC} - NOSTR event recorder"
echo ""
echo -e "Cron job added:"
echo -e "  • Calendar sync runs every 5 minutes"
echo ""
echo -e "${GREEN}To start services now:${NC}"
echo -e "  sudo systemctl start ${SERVICE_PREFIX}"
echo -e "  sudo systemctl start ${SERVICE_PREFIX}-payment-processor"
echo -e "  sudo systemctl start ${SERVICE_PREFIX}-nostr-recorder"
echo ""
echo -e "${GREEN}Or start all at once:${NC}"
echo -e "  sudo systemctl start ${SERVICE_PREFIX} ${SERVICE_PREFIX}-payment-processor ${SERVICE_PREFIX}-nostr-recorder"
echo ""
echo -e "${GREEN}To check status:${NC}"
echo -e "  sudo systemctl status ${SERVICE_PREFIX}"
echo -e "  sudo systemctl status ${SERVICE_PREFIX}-payment-processor"
echo -e "  sudo systemctl status ${SERVICE_PREFIX}-nostr-recorder"
echo ""
echo -e "${GREEN}To view logs:${NC}"
echo -e "  sudo journalctl -u ${SERVICE_PREFIX} -f"
echo -e "  sudo journalctl -u ${SERVICE_PREFIX}-payment-processor -f"
echo -e "  sudo journalctl -u ${SERVICE_PREFIX}-nostr-recorder -f"
echo ""
echo -e "${YELLOW}Don't forget to:${NC}"
echo -e "  1. Configure your .env.local file in $APP_DIR"
echo -e "  2. Set up the GitHub webhook with your WEBHOOK_SECRET"
echo -e "  3. Run 'bun run build' before starting services"
echo ""
