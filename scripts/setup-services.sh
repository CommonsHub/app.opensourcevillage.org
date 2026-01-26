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

# Script metadata (updated on each commit)
SCRIPT_VERSION="1.0.0"
SCRIPT_GIT_SHA="877f918"
SCRIPT_BUILD_DATE="2026-01-26 01:58 UTC"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="${APP_DIR:-/var/www/app.opensourcevillage.org}"
APP_USER="${APP_USER:-www-data}"
APP_GROUP="${APP_GROUP:-www-data}"
SERVICE_PREFIX="${SERVICE_PREFIX:-osv}"
REPO_URL="${REPO_URL:-https://github.com/commonshub/app.opensourcevillage.org.git}"
DOMAIN="${DOMAIN:-app.opensourcevillage.org}"
MIN_BUN_VERSION="1.1.0"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Open Source Village - Service Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${CYAN}  Version: ${SCRIPT_VERSION}${NC}"
echo -e "${CYAN}  Commit:  ${SCRIPT_GIT_SHA}${NC}"
echo -e "${CYAN}  Date:    ${SCRIPT_BUILD_DATE}${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    exit 1
fi

# Ask for domain if not set via environment variable
if [ -z "${DOMAIN_SET:-}" ]; then
    echo -e "${YELLOW}Enter your domain (default: $DOMAIN):${NC}"
    read -r INPUT_DOMAIN </dev/tty || INPUT_DOMAIN=""
    if [ -n "$INPUT_DOMAIN" ]; then
        DOMAIN="$INPUT_DOMAIN"
    fi
fi
echo -e "${GREEN}Using domain: $DOMAIN${NC}"

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

# If bun is in a user's home directory, copy it to /usr/local/bin for shared access
if [[ "$BUN_PATH" == /root/* ]] || [[ "$BUN_PATH" == /home/* ]]; then
    echo -e "${YELLOW}Copying bun to /usr/local/bin for shared access...${NC}"
    cp "$BUN_PATH" /usr/local/bin/bun
    chmod +x /usr/local/bin/bun
    BUN_PATH="/usr/local/bin/bun"
    echo -e "${GREEN}✓ Bun copied to $BUN_PATH${NC}"
fi

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

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo -e "${RED}Error: Git is not installed. Please install git first.${NC}"
    exit 1
fi

# Create app directory and clone repo if needed
if [ ! -d "$APP_DIR" ]; then
    echo -e "${YELLOW}App directory not found at $APP_DIR, creating it...${NC}"
    mkdir -p "$APP_DIR"
    echo -e "${GREEN}✓ Created app directory: $APP_DIR${NC}"
fi

# Clone repository if not already cloned
if [ ! -f "$APP_DIR/package.json" ]; then
    echo -e "${YELLOW}Cloning repository from $REPO_URL...${NC}"
    git clone "$REPO_URL" "$APP_DIR.tmp"
    mv "$APP_DIR.tmp"/* "$APP_DIR.tmp"/.[!.]* "$APP_DIR/" 2>/dev/null || true
    rm -rf "$APP_DIR.tmp"
    echo -e "${GREEN}✓ Repository cloned to $APP_DIR${NC}"
fi

# Set ownership
chown -R $APP_USER:$APP_GROUP "$APP_DIR"

# Create data directory
DATA_DIR="$APP_DIR/data"
if [ ! -d "$DATA_DIR" ]; then
    echo -e "${YELLOW}Creating data directories...${NC}"
    mkdir -p "$DATA_DIR/badges" "$DATA_DIR/usernames" "$DATA_DIR/offers" "$DATA_DIR/calendars" "$DATA_DIR/logs"
    chown -R $APP_USER:$APP_GROUP "$DATA_DIR"
    echo -e "${GREEN}✓ Created data directories in $DATA_DIR${NC}"
fi

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
cd "$APP_DIR"
sudo -u $APP_USER "$BUN_PATH" install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Build the application
echo -e "${YELLOW}Building application...${NC}"
sudo -u $APP_USER "$BUN_PATH" run build
echo -e "${GREEN}✓ Application built${NC}"

echo ""
echo -e "${GREEN}Configuration:${NC}"
echo -e "  Domain:        ${BLUE}$DOMAIN${NC}"
echo -e "  Repository:    ${BLUE}$REPO_URL${NC}"
echo -e "  App Directory: ${BLUE}$APP_DIR${NC}"
echo -e "  App User:      ${BLUE}$APP_USER${NC}"
echo -e "  Bun:           ${BLUE}$BUN_PATH (v$BUN_VERSION)${NC}"
echo -e "  Service Name:  ${BLUE}$SERVICE_PREFIX${NC}"
echo ""

echo -e "${BLUE}Step 0: Installing system dependencies...${NC}"
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx > /dev/null
echo -e "${GREEN}✓ Installed nginx and certbot${NC}"

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
echo -e "${BLUE}Step 9: Configuring Nginx...${NC}"
cat > /etc/nginx/sites-available/${DOMAIN} << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/
# Remove default site if exists
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
nginx -t
systemctl reload nginx
echo -e "${GREEN}✓ Nginx configured for ${DOMAIN}${NC}"

echo ""
echo -e "${BLUE}Step 10: Starting services...${NC}"
systemctl start ${SERVICE_PREFIX}
systemctl start ${SERVICE_PREFIX}-payment-processor
systemctl start ${SERVICE_PREFIX}-nostr-recorder
echo -e "${GREEN}✓ Services started${NC}"

echo ""
echo -e "${BLUE}Step 11: Obtaining SSL certificate with Certbot...${NC}"
certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email || {
    echo -e "${YELLOW}⚠ Certbot failed. You may need to run it manually:${NC}"
    echo -e "${YELLOW}  sudo certbot --nginx -d ${DOMAIN}${NC}"
}
echo -e "${GREEN}✓ SSL certificate configured${NC}"

echo ""
echo -e "${BLUE}Step 12: Installing Pyramid NOSTR relay...${NC}"
if systemctl list-unit-files | grep -q "pyramid.service"; then
    echo -e "${GREEN}✓ Pyramid is already installed${NC}"
else
    echo -e "${YELLOW}Installing Pyramid NOSTR relay...${NC}"
    curl -s https://raw.githubusercontent.com/fiatjaf/pyramid/refs/heads/master/easy.sh | bash
    echo -e "${GREEN}✓ Pyramid NOSTR relay installed${NC}"
fi

echo ""
echo -e "${BLUE}Step 13: Creating login message (MOTD)...${NC}"
cat > /etc/update-motd.d/99-osv << 'MOTD_EOF'
#!/bin/bash
echo ""
echo "=========================================="
echo "  Open Source Village Server"
echo "=========================================="
echo ""
echo "Services:"
echo "  osv                      - Main Next.js app (port 3000)"
echo "  osv-payment-processor    - Payment processor"
echo "  osv-nostr-recorder       - NOSTR event recorder"
echo "  pyramid                  - NOSTR relay"
echo ""
echo "Useful commands:"
echo "  Status:   sudo systemctl status osv"
echo "  Start:    sudo systemctl start osv"
echo "  Stop:     sudo systemctl stop osv"
echo "  Restart:  sudo systemctl restart osv"
echo "  Logs:     sudo journalctl -u osv -f"
echo ""
echo "Start/restart all OSV services:"
echo "  sudo systemctl restart osv osv-payment-processor osv-nostr-recorder"
echo ""
echo "View all logs:"
echo "  sudo journalctl -u osv -u osv-payment-processor -u osv-nostr-recorder -f"
echo ""
MOTD_EOF
chmod +x /etc/update-motd.d/99-osv
echo -e "${GREEN}✓ Login message configured${NC}"

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  Setup Complete!${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo -e "Your app is now running at: ${GREEN}https://${DOMAIN}${NC}"
echo ""
echo -e "Services running:"
echo -e "  • ${BLUE}${SERVICE_PREFIX}${NC} - Main Next.js application"
echo -e "  • ${BLUE}${SERVICE_PREFIX}-payment-processor${NC} - Payment processor"
echo -e "  • ${BLUE}${SERVICE_PREFIX}-nostr-recorder${NC} - NOSTR event recorder"
echo ""
echo -e "Cron job:"
echo -e "  • Calendar sync runs every 5 minutes"
echo ""
echo -e "${GREEN}Useful commands:${NC}"
echo -e "  Check status:  sudo systemctl status ${SERVICE_PREFIX}"
echo -e "  View logs:     sudo journalctl -u ${SERVICE_PREFIX} -f"
echo -e "  Restart:       sudo systemctl restart ${SERVICE_PREFIX}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Configure your .env.local file: ${BLUE}nano $APP_DIR/.env.local${NC}"
echo -e "  2. Set up GitHub webhook with your WEBHOOK_SECRET"
echo -e "  3. Restart services after configuring: ${BLUE}sudo systemctl restart ${SERVICE_PREFIX}${NC}"
echo ""
