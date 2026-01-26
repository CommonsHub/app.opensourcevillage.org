#!/bin/bash
# Integration Script for Ralph's Completed Features
# This script integrates 4 production-ready features delivered in loops 57-59
# Run this script to complete the integration in ~30 minutes

set -e  # Exit on error

echo "🚀 Open Source Village - Feature Integration Script"
echo "=================================================="
echo ""
echo "This script will:"
echo "  1. Fix 2 critical NOSTR bugs"
echo "  2. Install dependencies"
echo "  3. Run tests"
echo "  4. Integrate 4 completed features"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted"
    exit 1
fi

# Step 1: Fix Critical Bugs
echo ""
echo "📝 Step 1: Fixing 2 Critical NOSTR Bugs..."
echo "=========================================="

# Bug #1: Fix localStorage.setItem -> getItem
echo "  🐛 Fixing src/lib/nostr-events.ts:247..."
sed -i '' 's/localStorage.setItem('\''osv_nsec'\'')/localStorage.getItem('\''osv_nsec'\'')/' src/lib/nostr-events.ts

# Bug #2: Fix require() -> ES6 import
echo "  🐛 Fixing src/lib/nostr-validation.ts..."
# Check if import already exists
if ! grep -q "import { nip19 } from 'nostr-tools'" src/lib/nostr-validation.ts; then
    # Add import at line 6 (after existing imports)
    sed -i '' '6i\
import { nip19 } from '\''nostr-tools'\'';
' src/lib/nostr-validation.ts
fi

# Remove require() calls
sed -i '' '/const { nip19 } = require('\''nostr-tools'\'')/d' src/lib/nostr-validation.ts

echo "  ✅ Bugs fixed!"

# Step 2: Install Dependencies
echo ""
echo "📦 Step 2: Installing Dependencies..."
echo "======================================"
bun install
echo "  ✅ Dependencies installed!"

# Step 3: Run Tests
echo ""
echo "🧪 Step 3: Running Tests..."
echo "==========================="
bun test
echo "  ✅ Tests passed!"

# Step 4: Integrate Features
echo ""
echo "🔧 Step 4: Integrating Features..."
echo "=================================="

# 4.1: Add ErrorBoundary to layout
echo "  📝 Adding ErrorBoundary to layout..."
if ! grep -q "ErrorBoundary" src/app/layout.tsx; then
    # Add import
    sed -i '' '/import.*from.*react/a\
import { ErrorBoundary } from '\''@/components/ErrorBoundary'\'';
' src/app/layout.tsx

    # Wrap children in ErrorBoundary (this is a simplified approach)
    echo "    ⚠️  Manual step required: Wrap {children} in <ErrorBoundary> in src/app/layout.tsx"
fi

# 4.2: Add PWA components to layout
echo "  📝 Adding PWA components to layout..."
if ! grep -q "PWAInstallPrompt" src/app/layout.tsx; then
    sed -i '' '/import.*from.*react/a\
import { PWAInstallPrompt } from '\''@/components/PWAInstallPrompt'\'';\
import { OfflineIndicator } from '\''@/components/OfflineIndicator'\'';
' src/app/layout.tsx

    echo "    ⚠️  Manual step required: Add <PWAInstallPrompt /> and <OfflineIndicator /> to layout"
fi

# 4.3: Register service worker
echo "  📝 Adding service worker registration..."
if ! grep -q "registerServiceWorker" src/app/layout.tsx; then
    echo "    ⚠️  Manual step required: Add service worker registration to layout"
    echo "    See docs/INTEGRATION_GUIDE.md section 'PWA Features Integration'"
fi

# 4.4: Add manifest link to layout
echo "  📝 Adding manifest link to HTML head..."
if ! grep -q "manifest.json" src/app/layout.tsx; then
    echo "    ⚠️  Manual step required: Add manifest link to <head>"
    echo "    <link rel=\"manifest\" href=\"/manifest.json\" />"
fi

# 4.5: Create placeholder PWA icons
echo "  🎨 Creating placeholder PWA icons..."
mkdir -p public/icons
if [ ! -f public/icons/icon-192x192.png ]; then
    echo "    ⚠️  Manual step required: Create public/icons/icon-192x192.png (192x192)"
fi
if [ ! -f public/icons/icon-512x512.png ]; then
    echo "    ⚠️  Manual step required: Create public/icons/icon-512x512.png (512x512)"
fi

# 4.6: Add Settings link to navigation
echo "  📝 Adding Settings link to navigation..."
echo "    ⚠️  Manual step required: Add Settings link to navigation in src/app/page.tsx"
echo "    See docs/settings-page-implementation.md for example"

# 4.7: Apply rate limiting to API routes
echo "  📝 Applying rate limiting to API routes..."
echo "    ⚠️  Manual step required: Add rate limiting to API routes"
echo "    See docs/INTEGRATION_GUIDE.md section 'Rate Limiting Integration'"

echo ""
echo "✅ Automated integration steps complete!"
echo ""
echo "⚠️  Manual Steps Required:"
echo "=========================="
echo "1. Wrap {children} in <ErrorBoundary> in src/app/layout.tsx"
echo "2. Add <PWAInstallPrompt /> and <OfflineIndicator /> to layout"
echo "3. Add service worker registration (see docs/INTEGRATION_GUIDE.md)"
echo "4. Add manifest link to <head> in layout"
echo "5. Create PWA icons (192x192 and 512x512)"
echo "6. Add Settings link to navigation"
echo "7. Apply rate limiting to API routes"
echo ""
echo "📖 See docs/INTEGRATION_GUIDE.md for detailed step-by-step instructions"
echo ""
echo "🧪 After manual steps, run: bun test && bun run build"
echo ""
echo "🎉 Integration 60% complete!"
