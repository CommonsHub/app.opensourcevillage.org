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
SCRIPT_GIT_SHA="36f1a62"
SCRIPT_BUILD_DATE="2026-01-27 21:34 UTC"

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

# Check if .env.local already exists
ENV_FILE="$APP_DIR/.env.local"
ENV_EXISTS=false
if [ -f "$ENV_FILE" ]; then
    ENV_EXISTS=true
    echo -e "${GREEN}✓ Found existing .env.local - will not override${NC}"
    # Read chain from existing .env.local
    EXISTING_CHAIN=$(grep "^CHAIN=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2)
    if [ -n "$EXISTING_CHAIN" ]; then
        CHAIN="$EXISTING_CHAIN"
    fi
fi

# Ask for blockchain only if .env.local doesn't exist and not set via environment variable
CHAIN="${CHAIN:-gnosis_chiado}"
if [ "$ENV_EXISTS" = false ] && [ -z "${CHAIN_SET:-}" ]; then
    echo ""
    echo -e "${YELLOW}Select blockchain for token operations:${NC}"
    echo -e "  1) ${BLUE}gnosis${NC}         - Gnosis Chain (mainnet, real money)"
    echo -e "  2) ${BLUE}gnosis_chiado${NC}  - Gnosis Chiado (testnet) ${GREEN}[recommended for testing]${NC}"
    echo -e "  3) ${BLUE}base${NC}           - Base (mainnet, real money)"
    echo -e "  4) ${BLUE}base_sepolia${NC}   - Base Sepolia (testnet)"
    echo ""
    echo -e "${YELLOW}Enter choice (1-4, default: 2):${NC}"
    read -r CHAIN_CHOICE </dev/tty || CHAIN_CHOICE=""
    case "$CHAIN_CHOICE" in
        1) CHAIN="gnosis" ;;
        2|"") CHAIN="gnosis_chiado" ;;
        3) CHAIN="base" ;;
        4) CHAIN="base_sepolia" ;;
        *) CHAIN="gnosis_chiado" ;;
    esac
fi
echo -e "${GREEN}Using blockchain: $CHAIN${NC}"

# Set faucet URL based on chain
case "$CHAIN" in
    gnosis) FAUCET_URL="N/A (mainnet - use real xDAI)" ;;
    gnosis_chiado) FAUCET_URL="https://faucet.chiadochain.net" ;;
    base) FAUCET_URL="N/A (mainnet - use real ETH)" ;;
    base_sepolia) FAUCET_URL="https://www.alchemy.com/faucets/base-sepolia" ;;
esac

# ============================================================================
# Install nvm and Node.js
# ============================================================================
echo -e "${YELLOW}Checking Node.js installation...${NC}"

# Check if node is installed and get version
NODE_VERSION=$(node --version 2>/dev/null || echo "")
if [ -z "$NODE_VERSION" ]; then
    echo -e "${YELLOW}Node.js not found. Installing nvm and Node.js...${NC}"

    # Install nvm
    export NVM_DIR="$HOME/.nvm"
    if [ ! -d "$NVM_DIR" ]; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    fi

    # Load nvm
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    # Install latest LTS version of Node.js
    nvm install --lts
    nvm use --lts
    nvm alias default 'lts/*'

    # Verify installation
    NODE_VERSION=$(node --version 2>/dev/null || echo "")
    if [ -z "$NODE_VERSION" ]; then
        echo -e "${RED}Error: Failed to install Node.js${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Node.js $NODE_VERSION installed successfully${NC}"
else
    echo -e "${GREEN}✓ Found Node.js $NODE_VERSION${NC}"
fi

# Show npm version
NPM_VERSION=$(npm --version 2>/dev/null || echo "unknown")
echo -e "${GREEN}✓ Found npm $NPM_VERSION${NC}"

# ============================================================================
# Install Bun
# ============================================================================

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
    echo -e "${YELLOW}Bun not found. Installing dependencies and bun...${NC}"
    apt-get update -qq
    apt-get install -y -qq unzip > /dev/null
    curl -fsSL https://bun.sh/install | bash

    # Source the updated PATH
    export BUN_INSTALL="/root/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    # Find bun again after installation
    BUN_PATH=$(find_bun)
    if [ -z "$BUN_PATH" ]; then
        echo -e "${RED}Error: Failed to install bun.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Bun installed successfully${NC}"
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

# Ensure swap space exists (needed for build on low-memory servers)
if [ ! -f /swapfile ]; then
    echo -e "${YELLOW}Creating swap space for build process...${NC}"
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo -e "${GREEN}✓ Created 2GB swap space${NC}"
else
    # Ensure swap is enabled
    swapon /swapfile 2>/dev/null || true
    echo -e "${GREEN}✓ Swap space already exists${NC}"
fi

# Pull latest code
echo -e "${YELLOW}Pulling latest code...${NC}"
cd "$APP_DIR"
sudo -u $APP_USER git pull origin main
echo -e "${GREEN}✓ Code updated${NC}"

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
sudo -u $APP_USER "$BUN_PATH" install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Generate .env.local if it doesn't exist
if [ "$ENV_EXISTS" = false ]; then
    echo -e "${YELLOW}Generating cryptographic keys and .env.local...${NC}"

    # Generate keys using the TypeScript script
    KEYS_JSON=$(cd "$APP_DIR" && sudo -u $APP_USER "$BUN_PATH" run scripts/generate-keys.ts)

    # Parse JSON output
    NOSTR_NSEC=$(echo "$KEYS_JSON" | grep -o '"nsec": "[^"]*"' | cut -d'"' -f4)
    NOSTR_NPUB=$(echo "$KEYS_JSON" | grep -o '"npub": "[^"]*"' | cut -d'"' -f4)
    PRIVATE_KEY=$(echo "$KEYS_JSON" | grep -o '"privateKey": "0x[^"]*"' | head -1 | cut -d'"' -f4)
    ETH_ADDRESS=$(echo "$KEYS_JSON" | grep -o '"address": "0x[^"]*"' | head -1 | cut -d'"' -f4)
    BACKUP_PRIVATE_KEY=$(echo "$KEYS_JSON" | grep -o '"privateKey": "0x[^"]*"' | tail -1 | cut -d'"' -f4)
    BACKUP_ADDRESS=$(echo "$KEYS_JSON" | grep -o '"address": "0x[^"]*"' | tail -1 | cut -d'"' -f4)
    WEBHOOK_SECRET=$(echo "$KEYS_JSON" | grep -o '"webhookSecret": "[^"]*"' | cut -d'"' -f4)

    # Create .env.local
    cat > "$ENV_FILE" << ENVEOF
# Open Source Village - Environment Variables
# Generated by setup script on $(date -u +"%Y-%m-%d %H:%M UTC")

# Data directory
DATA_DIR=./data

# Node environment
NODE_ENV=production

# ===========================================
# NOSTR Configuration
# ===========================================
NOSTR_RELAYS=wss://relay.${DOMAIN}
NOSTR_NSEC=${NOSTR_NSEC}

# ===========================================
# Token Factory Configuration
# ===========================================
CHAIN=${CHAIN}
TOKEN_ADDRESS=
PRIVATE_KEY=${PRIVATE_KEY}
BACKUP_PRIVATE_KEY=${BACKUP_PRIVATE_KEY}

# ===========================================
# Deployment Configuration
# ===========================================
WEBHOOK_SECRET=${WEBHOOK_SECRET}
SERVICE_NAME=${SERVICE_PREFIX}
ENVEOF

    chown $APP_USER:$APP_GROUP "$ENV_FILE"
    chmod 600 "$ENV_FILE"

    # Save public info for display at end
    echo "$NOSTR_NPUB" > /tmp/osv_npub
    echo "$ETH_ADDRESS" > /tmp/osv_address
    echo "$BACKUP_ADDRESS" > /tmp/osv_backup_address
    echo "$WEBHOOK_SECRET" > /tmp/osv_webhook_secret

    echo -e "${GREEN}✓ Generated .env.local with new keys${NC}"
else
    echo -e "${GREEN}✓ .env.local already exists, skipping key generation${NC}"
fi

# Build the application
echo -e "${YELLOW}Building application...${NC}"
# Limit Node.js memory to prevent OOM on low-memory servers
export NODE_OPTIONS="--max-old-space-size=1024"
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
echo -e "${BLUE}Step 4: Creating systemd service for NOSTR listener...${NC}"
cat > /etc/systemd/system/${SERVICE_PREFIX}-nostr-listener.service << EOF
[Unit]
Description=OSV NOSTR Listener (Event Recorder + Receipt Processor)
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
ExecStart=$BUN_PATH run scripts/nostr-listener.ts
Restart=on-failure
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
echo -e "${GREEN}✓ Created /etc/systemd/system/${SERVICE_PREFIX}-nostr-listener.service${NC}"

echo ""
echo -e "${BLUE}Step 5: Setting up sudoers for webhook deployment and log access...${NC}"
cat > /etc/sudoers.d/${SERVICE_PREFIX}-deploy << EOF
# Allow $APP_USER to restart OSV services without password
# This is used by the GitHub webhook for auto-deployment
$APP_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart ${SERVICE_PREFIX}
$APP_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart ${SERVICE_PREFIX}-payment-processor
$APP_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart ${SERVICE_PREFIX}-nostr-listener
$APP_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart ${SERVICE_PREFIX}*

# Allow $APP_USER to read service logs (for status page)
$APP_USER ALL=(ALL) NOPASSWD: /bin/journalctl -u ${SERVICE_PREFIX} *
$APP_USER ALL=(ALL) NOPASSWD: /bin/journalctl -u ${SERVICE_PREFIX}-payment-processor *
$APP_USER ALL=(ALL) NOPASSWD: /bin/journalctl -u ${SERVICE_PREFIX}-nostr-listener *
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
systemctl enable ${SERVICE_PREFIX}-nostr-listener
echo -e "${GREEN}✓ Services enabled to start on boot${NC}"

echo ""
echo -e "${BLUE}Step 9: Configuring Nginx...${NC}"

# Check if nginx config already exists with SSL
NGINX_CONFIG="/etc/nginx/sites-available/${DOMAIN}"
if [ -f "$NGINX_CONFIG" ] && grep -q "ssl_certificate" "$NGINX_CONFIG"; then
    echo -e "${GREEN}✓ Nginx config with SSL already exists, preserving it${NC}"
else
    # Create new HTTP config (certbot will add SSL)
    cat > "$NGINX_CONFIG" << EOF
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
    echo -e "${GREEN}✓ Created nginx config${NC}"
fi

# Enable the site
ln -sf "$NGINX_CONFIG" /etc/nginx/sites-enabled/
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
systemctl start ${SERVICE_PREFIX}-nostr-listener
echo -e "${GREEN}✓ Services started${NC}"

echo ""
echo -e "${BLUE}Step 11: Obtaining SSL certificate with Certbot...${NC}"
# Check if SSL cert already exists
if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    echo -e "${GREEN}✓ SSL certificate already exists${NC}"
    # Make sure nginx config has SSL (in case it was reset)
    if ! grep -q "ssl_certificate" "$NGINX_CONFIG"; then
        echo -e "${YELLOW}Re-running certbot to restore SSL config...${NC}"
        certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email || {
            echo -e "${YELLOW}⚠ Certbot failed. Run manually: sudo certbot --nginx -d ${DOMAIN}${NC}"
        }
    fi
else
    certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email || {
        echo -e "${YELLOW}⚠ Certbot failed. You may need to run it manually:${NC}"
        echo -e "${YELLOW}  sudo certbot --nginx -d ${DOMAIN}${NC}"
    }
fi
echo -e "${GREEN}✓ SSL certificate configured${NC}"

echo ""
echo -e "${BLUE}Step 12: Creating login message (MOTD)...${NC}"
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
echo "  osv-nostr-listener       - NOSTR listener (events + receipts)"
echo ""
echo "Useful commands:"
echo "  Status:   sudo systemctl status osv"
echo "  Start:    sudo systemctl start osv"
echo "  Stop:     sudo systemctl stop osv"
echo "  Restart:  sudo systemctl restart osv"
echo "  Logs:     sudo journalctl -u osv -f"
echo ""
echo "Start/restart all OSV services:"
echo "  sudo systemctl restart osv osv-payment-processor osv-nostr-listener"
echo ""
echo "View all logs:"
echo "  sudo journalctl -u osv -u osv-payment-processor -u osv-nostr-listener -f"
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
echo -e "  • ${BLUE}${SERVICE_PREFIX}-nostr-listener${NC} - NOSTR listener (events + receipts)"
echo ""
echo -e "Cron job:"
echo -e "  • Calendar sync runs every 5 minutes"
echo ""

# Display generated keys info if available
if [ -f /tmp/osv_npub ]; then
    NOSTR_NPUB=$(cat /tmp/osv_npub)
    ETH_ADDRESS=$(cat /tmp/osv_address)
    BACKUP_ADDRESS=$(cat /tmp/osv_backup_address)
    WEBHOOK_SECRET=$(cat /tmp/osv_webhook_secret)

    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  Server Identity${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo -e "${GREEN}NOSTR Identity:${NC}"
    echo -e "  npub: ${BLUE}${NOSTR_NPUB}${NC}"
    echo ""
    echo -e "${GREEN}Blockchain Addresses (Gnosis Chain):${NC}"
    echo -e "  Main:   ${BLUE}${ETH_ADDRESS}${NC}"
    echo -e "  Backup: ${BLUE}${BACKUP_ADDRESS}${NC}"
    echo ""
    echo -e "${YELLOW}⚠ IMPORTANT: Fund these addresses before deploying tokens!${NC}"
    echo -e "  Chain:  ${BLUE}${CHAIN}${NC}"
    echo -e "  Faucet: ${BLUE}${FAUCET_URL}${NC}"
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  GitHub Auto-Deploy Webhook${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo -e "To enable automatic deployment on git push:"
    echo ""
    echo -e "1. Go to your GitHub repository settings:"
    echo -e "   ${BLUE}https://github.com/commonshub/app.opensourcevillage.org/settings/hooks/new${NC}"
    echo ""
    echo -e "2. Configure the webhook:"
    echo -e "   Payload URL: ${BLUE}https://${DOMAIN}/api/webhook/github${NC}"
    echo -e "   Content type: ${BLUE}application/json${NC}"
    echo -e "   Secret: ${BLUE}${WEBHOOK_SECRET}${NC}"
    echo -e "   Events: ${BLUE}Just the push event${NC}"
    echo ""
    echo -e "3. Click 'Add webhook'"
    echo ""

    # Clean up temp files
    rm -f /tmp/osv_npub /tmp/osv_address /tmp/osv_backup_address /tmp/osv_webhook_secret

fi

# ============================================================================
# Token Configuration
# ============================================================================

# Check if token is already configured in .env.local
EXISTING_TOKEN=""
if [ -f "$ENV_FILE" ]; then
    EXISTING_TOKEN=$(grep "^TOKEN_ADDRESS=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2)
fi

if [ -n "$EXISTING_TOKEN" ] && [ "$EXISTING_TOKEN" != "" ]; then
    echo -e "${GREEN}✓ Token already configured: ${BLUE}${EXISTING_TOKEN}${NC}"
    TOKEN_CHOICE="skip"
else
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  Token Configuration${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Do you want to configure a token now?${NC}"
    echo -e "  1) ${BLUE}Enter existing token address${NC}"
    echo -e "  2) ${BLUE}Deploy a new token${NC} (requires funded wallet)"
    echo -e "  3) ${BLUE}Skip for now${NC}"
    echo ""
    echo -e "${YELLOW}Enter choice (1-3, default: 3):${NC}"
    read -r TOKEN_CHOICE </dev/tty || TOKEN_CHOICE=""
fi

case "$TOKEN_CHOICE" in
    1)
        # Enter existing token address
        echo ""
        echo -e "${YELLOW}Enter token contract address (0x...):${NC}"
        read -r TOKEN_ADDRESS </dev/tty || TOKEN_ADDRESS=""
        if [[ "$TOKEN_ADDRESS" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
            # Load existing settings or create new
            SETTINGS_FILE="$APP_DIR/settings.json"
            if [ -f "$SETTINGS_FILE" ]; then
                # Update existing settings.json with token address
                cd "$APP_DIR"
                sudo -u $APP_USER "$BUN_PATH" -e "
                    const fs = require('fs');
                    const settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
                    settings.token = settings.token || {};
                    settings.token.address = '$TOKEN_ADDRESS';
                    settings.token.chain = '$CHAIN';
                    fs.writeFileSync('settings.json', JSON.stringify(settings, null, 2));
                    console.log('Updated settings.json');
                "
            else
                # Create new settings.json
                cat > "$SETTINGS_FILE" << SETTINGSEOF
{
  "eventName": "Open Source Village",
  "timezone": "Europe/Brussels",
  "token": {
    "address": "$TOKEN_ADDRESS",
    "chain": "$CHAIN"
  }
}
SETTINGSEOF
                chown $APP_USER:$APP_GROUP "$SETTINGS_FILE"
            fi
            echo -e "${GREEN}✓ Token address saved to settings.json${NC}"
            echo ""
            echo -e "${YELLOW}Restarting payment processor...${NC}"
            systemctl restart ${SERVICE_PREFIX}-payment-processor
            echo -e "${GREEN}✓ Payment processor restarted${NC}"
        else
            echo -e "${RED}Invalid token address format. Skipping.${NC}"
        fi
        ;;
    2)
        # Deploy new token
        echo ""
        echo -e "${YELLOW}Enter token name [Open Source Village Token]:${NC}"
        read -r TOKEN_NAME </dev/tty || TOKEN_NAME=""
        TOKEN_NAME="${TOKEN_NAME:-Open Source Village Token}"

        echo -e "${YELLOW}Enter token symbol [OSV]:${NC}"
        read -r TOKEN_SYMBOL </dev/tty || TOKEN_SYMBOL=""
        TOKEN_SYMBOL="${TOKEN_SYMBOL:-OSV}"

        echo ""
        echo -e "${YELLOW}Deploying token: ${TOKEN_NAME} (${TOKEN_SYMBOL})...${NC}"
        echo ""

        cd "$APP_DIR"
        export SERVICE_NAME="${SERVICE_PREFIX}"
        if sudo -u $APP_USER -E "$BUN_PATH" run deploy-token "$TOKEN_NAME" "$TOKEN_SYMBOL"; then
            echo ""
            echo -e "${GREEN}✓ Token deployed successfully${NC}"
        else
            echo ""
            echo -e "${RED}Token deployment failed.${NC}"
            echo -e "${YELLOW}Make sure the wallet is funded with native tokens for gas.${NC}"
            echo -e "${YELLOW}You can deploy later with:${NC}"
            echo -e "   ${BLUE}cd $APP_DIR && bun run deploy-token${NC}"
        fi
        ;;
    3|"")
        echo ""
        echo -e "${YELLOW}Skipping token configuration.${NC}"
        echo -e "You can configure a token later by:"
        echo ""
        echo -e "  1. Fund the wallet address shown above"
        echo -e "  2. Deploy a token:"
        echo -e "     ${BLUE}cd $APP_DIR && bun run deploy-token${NC}"
        ;;
    skip)
        # Token already configured, nothing to do
        ;;
esac

echo ""

echo -e "${GREEN}Useful commands:${NC}"
echo -e "  Check status:  sudo systemctl status ${SERVICE_PREFIX}"
echo -e "  View logs:     sudo journalctl -u ${SERVICE_PREFIX} -f"
echo -e "  Restart:       sudo systemctl restart ${SERVICE_PREFIX}"
echo -e "  View .env:     sudo cat $APP_DIR/.env.local"
echo ""
