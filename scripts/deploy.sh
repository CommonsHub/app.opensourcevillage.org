#!/bin/bash
#
# Deploy Script for Open Source Village
#
# This script handles deployment:
# 1. git pull origin main
# 2. bun install (or npm install)
# 3. bun run build (or npm run build)
# 4. Restart all systemd services
#
# Usage:
#   npm run deploy
#   # or directly:
#   ./scripts/deploy.sh
#
# Environment Variables:
#   SERVICE_NAME - Service name prefix (default: osv)
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
SERVICE_NAME="${SERVICE_NAME:-osv}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Open Source Village - Deploy${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

cd "$APP_DIR"

# Detect package manager (prefer bun if available)
if command -v bun &> /dev/null; then
    PKG_MGR="bun"
    PKG_RUN="bun run"
elif command -v npm &> /dev/null; then
    PKG_MGR="npm"
    PKG_RUN="npm run"
else
    echo -e "${RED}Error: Neither bun nor npm found${NC}"
    exit 1
fi

echo -e "${GREEN}Using: $PKG_MGR${NC}"
echo -e "${GREEN}Directory: $APP_DIR${NC}"
echo ""

# Step 1: Git pull
echo -e "${YELLOW}[1/4] Pulling latest code...${NC}"
git pull origin main
echo -e "${GREEN}✓ Code updated${NC}"
echo ""

# Step 2: Install dependencies
echo -e "${YELLOW}[2/4] Installing dependencies...${NC}"
$PKG_MGR install
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 3: Build
echo -e "${YELLOW}[3/4] Building application...${NC}"
# Increase Node.js memory limit to prevent OOM on low-memory servers
# Next.js spawns node processes even when using bun
export NODE_OPTIONS="--max-old-space-size=2048"
$PKG_RUN build
echo -e "${GREEN}✓ Build completed${NC}"
echo ""

# Step 4: Restart services
echo -e "${YELLOW}[4/4] Restarting services...${NC}"

# Check if we can use systemctl
if command -v systemctl &> /dev/null; then
    SERVICES=(
        "${SERVICE_NAME}"
        "${SERVICE_NAME}-payment-processor"
        "${SERVICE_NAME}-nostr-listener"
    )

    for service in "${SERVICES[@]}"; do
        # Check if service exists
        if systemctl list-unit-files | grep -q "^${service}.service"; then
            echo -e "  Restarting ${BLUE}$service${NC}..."
            if sudo systemctl restart "$service" 2>/dev/null; then
                echo -e "  ${GREEN}✓ $service restarted${NC}"
            else
                echo -e "  ${YELLOW}⚠ Failed to restart $service (may need sudo)${NC}"
            fi
        else
            echo -e "  ${YELLOW}⚠ Service $service not found, skipping${NC}"
        fi
    done
else
    echo -e "${YELLOW}⚠ systemctl not found - services not restarted${NC}"
    echo -e "${YELLOW}  You may need to restart services manually${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Check service status:"
echo -e "  ${BLUE}sudo systemctl status ${SERVICE_NAME}${NC}"
echo ""
echo -e "View logs:"
echo -e "  ${BLUE}sudo journalctl -u ${SERVICE_NAME} -f${NC}"
echo ""
