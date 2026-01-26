# CRITICAL FIXES NEEDED - Action Required

## ⚠️ URGENT: Two Critical Bugs Must Be Fixed Before Testing

This document provides the EXACT changes needed to fix critical bugs discovered during codebase analysis.

---

## 🔴 FIX #1: getStoredSecretKey() Bug (BREAKS NOSTR)

**File:** `src/lib/nostr-events.ts`
**Line:** 247
**Severity:** CRITICAL - Breaks all NOSTR functionality

### Current Code (BROKEN):
```typescript
export function getStoredSecretKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.setItem('osv_nsec');
}
```

### Fixed Code:
```typescript
export function getStoredSecretKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('osv_nsec');
}
```

### What Changed:
- **Line 247:** `localStorage.setItem` → `localStorage.getItem`

### Why This Is Critical:
- `setItem()` returns `undefined`, not the stored value
- This breaks **all** NOSTR key retrieval
- Users cannot sign events, create offers, or use NOSTR features
- 100% failure rate on NOSTR operations

### How to Fix:
```bash
# Open the file
vim src/lib/nostr-events.ts

# Go to line 247
:247

# Change setItem to getItem
# Save and exit
:wq
```

---

## 🔴 FIX #2: Import Statements (CODE QUALITY)

**File:** `src/lib/nostr-validation.ts`
**Lines:** 6 (add import), 277, 286 (remove require)
**Severity:** HIGH - Potential bundling issues

### Step 1: Add Import at Top of File

**After line 6, add:**
```typescript
import { nip19 } from 'nostr-tools';
```

**Result should look like:**
```typescript
import { verifyNostrEvent, NOSTR_KINDS, type NostrEvent } from './nostr-events';
import { nip19 } from 'nostr-tools';  // ADD THIS LINE
```

### Step 2: Fix pubkeyToNpub() Function

**Current Code (Line 276-279):**
```typescript
export function pubkeyToNpub(pubkey: string): string {
  const { nip19 } = require('nostr-tools');
  return nip19.npubEncode(pubkey);
}
```

**Fixed Code:**
```typescript
export function pubkeyToNpub(pubkey: string): string {
  return nip19.npubEncode(pubkey);
}
```

### Step 3: Fix npubToPubkey() Function

**Current Code (Line 285-292):**
```typescript
export function npubToPubkey(npub: string): string {
  const { nip19 } = require('nostr-tools');
  const decoded = nip19.decode(npub);
  if (decoded.type !== 'npub') {
    throw new Error('Invalid npub format');
  }
  return decoded.data;
}
```

**Fixed Code:**
```typescript
export function npubToPubkey(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== 'npub') {
    throw new Error('Invalid npub format');
  }
  return decoded.data;
}
```

### What Changed:
- **Line 6:** Add ES6 import for `nip19`
- **Line 277:** Remove `const { nip19 } = require('nostr-tools');`
- **Line 286:** Remove `const { nip19 } = require('nostr-tools');`

### Why This Matters:
- Inconsistent with codebase (rest uses ES6 imports)
- `require()` can cause bundling issues in production
- May not tree-shake properly
- Could fail in strict ESM environments

### How to Fix:
```bash
# Open the file
vim src/lib/nostr-validation.ts

# Add import after line 6
:6
o
import { nip19 } from 'nostr-tools';
<Esc>

# Delete line 277
:277
dd

# Delete line 286 (now 285 after previous deletion)
:285
dd

# Save and exit
:wq
```

---

## ✅ Verification Steps

After making these fixes, verify they work:

### 1. Check TypeScript Compilation
```bash
bun run build
# Should compile without errors
```

### 2. Run Tests
```bash
bun test src/lib/__tests__/nostr-events.test.ts
bun test src/lib/__tests__/nostr-validation.test.ts
# All tests should pass
```

### 3. Test in Browser
```javascript
// In browser console on the app
const testKey = 'nsec1test123...';
localStorage.setItem('osv_nsec', testKey);

// This should now work (previously returned undefined)
const retrieved = getStoredSecretKey();
console.log(retrieved === testKey); // Should be true
```

---

## 📝 Complete Fix Script

If you want to apply all fixes at once, use this script:

```bash
#!/bin/bash
# fix-critical-bugs.sh

echo "Fixing critical bugs..."

# Fix #1: getStoredSecretKey
sed -i '' 's/localStorage.setItem/localStorage.getItem/' src/lib/nostr-events.ts

# Fix #2: Add import
sed -i '' "6a\\
import { nip19 } from 'nostr-tools';
" src/lib/nostr-validation.ts

# Fix #2: Remove require statements
sed -i '' '/const { nip19 } = require/d' src/lib/nostr-validation.ts

echo "Fixes applied! Run 'bun test' to verify."
```

**To use:**
```bash
chmod +x fix-critical-bugs.sh
./fix-critical-bugs.sh
```

---

## 🎯 Impact Analysis

### Before Fixes:
- ❌ NOSTR key retrieval: **0% success rate**
- ❌ Event signing: **Completely broken**
- ⚠️ Production builds: **Potential issues**

### After Fixes:
- ✅ NOSTR key retrieval: **100% working**
- ✅ Event signing: **Fully functional**
- ✅ Production builds: **Clean**

---

## 📊 Testing Checklist

After applying fixes, test these user flows:

- [ ] Badge claim flow (stores NOSTR key)
- [ ] Profile creation (uses stored key)
- [ ] Create workshop offer (signs NOSTR event)
- [ ] RSVP to workshop (signs NOSTR event)
- [ ] View marketplace (displays offers)
- [ ] View calendar (displays schedule)
- [ ] Build production bundle (`bun run build`)
- [ ] Run all tests (`bun test`)

---

## 🚀 Ready to Deploy?

Once these critical fixes are applied:

1. ✅ All critical bugs fixed
2. ✅ Tests passing
3. ✅ Build successful
4. ✅ NOSTR integration functional

**Then you can:**
- Run the development server
- Test all user flows
- Deploy to staging/production
- Consider the MVP feature-complete

---

## 📞 Questions?

See full bug report at: `docs/bugs-found-2026-01-20.md`

This includes:
- 11 additional non-critical issues
- Detailed impact analysis
- Priority ordering
- Complete fix recommendations
