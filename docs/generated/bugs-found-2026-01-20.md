# Bugs and Issues Found - 2026-01-20

This document catalogs all bugs, incomplete implementations, and code quality issues discovered during codebase analysis.

## 🔴 CRITICAL BUGS (Must Fix Immediately)

### 1. **CRITICAL: getStoredSecretKey() Bug in nostr-events.ts**

**File:** `src/lib/nostr-events.ts:247`

**Severity:** CRITICAL - Breaks all NOSTR key retrieval

**Description:**
The `getStoredSecretKey()` function calls `localStorage.setItem()` instead of `localStorage.getItem()`. The `setItem()` method returns `undefined`, so this function will never successfully retrieve stored keys.

**Current Code (Line 247):**
```typescript
export function getStoredSecretKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.setItem('osv_nsec');  // BUG: setItem returns undefined!
}
```

**Fixed Code:**
```typescript
export function getStoredSecretKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('osv_nsec');  // FIXED: getItem returns the value
}
```

**Impact:**
- Users cannot retrieve their stored NOSTR keys
- All NOSTR event signing will fail
- Profile and offer creation will not work
- This completely breaks NOSTR integration

**Fix Required:**
Change `localStorage.setItem('osv_nsec')` to `localStorage.getItem('osv_nsec')` on line 247.

---

### 2. **CRITICAL: Import Bug in nostr-validation.ts**

**File:** `src/lib/nostr-validation.ts:277, 283`

**Severity:** HIGH - Code quality issue, potential runtime errors

**Description:**
Two functions use `require()` instead of ES6 imports, which is inconsistent with the rest of the codebase and can cause issues with tree-shaking and bundling.

**Current Code (Lines 277, 286):**
```typescript
export function pubkeyToNpub(pubkey: string): string {
  const { nip19 } = require('nostr-tools');  // Should use import
  return nip19.npubEncode(pubkey);
}

export function npubToPubkey(npub: string): string {
  const { nip19 } = require('nostr-tools');  // Should use import
  const decoded = nip19.decode(npub);
  if (decoded.type !== 'npub') {
    throw new Error('Invalid npub format');
  }
  return decoded.data;
}
```

**Fixed Code:**
Add to top of file (after line 6):
```typescript
import { nip19 } from 'nostr-tools';
```

Then update functions:
```typescript
export function pubkeyToNpub(pubkey: string): string {
  return nip19.npubEncode(pubkey);
}

export function npubToPubkey(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== 'npub') {
    throw new Error('Invalid npub format');
  }
  return decoded.data;
}
```

**Impact:**
- Inconsistent import style
- Potential bundling issues
- May cause problems in production builds

---

## 🟡 HIGH PRIORITY BUGS

### 3. **Missing JSON Error Handling in Offers Route**

**File:** `src/app/api/offers/route.ts:178-186`

**Severity:** HIGH - Can crash API endpoint

**Description:**
The GET endpoint for offers reads JSON files without error handling. If an offer JSON file is corrupted, `JSON.parse()` will throw and crash the endpoint.

**Current Code:**
```typescript
for (const file of files) {
  if (!file.endsWith('.json')) continue;

  const offerPath = path.join(offersDir, file);
  const content = await fs.readFile(offerPath, 'utf-8');
  const offer = JSON.parse(content);  // No error handling!
```

**Fixed Code:**
```typescript
for (const file of files) {
  if (!file.endsWith('.json')) continue;

  const offerPath = path.join(offersDir, file);
  try {
    const content = await fs.readFile(offerPath, 'utf-8');
    const offer = JSON.parse(content);
    // ... continue processing
  } catch (error) {
    console.error(`Error reading offer file ${file}:`, error);
    continue; // Skip corrupted files
  }
}
```

**Impact:**
- Single corrupted offer file breaks entire marketplace
- API returns 500 error instead of valid offers
- Poor user experience

---

### 4. **Field Naming Confusion: maxAttendees vs minAttendees**

**Files:**
- `src/app/api/offers/route.ts:105`
- `src/app/api/rsvp/route.ts:151`

**Severity:** HIGH - Logic bug, confusing code

**Description:**
The code uses `maxAttendees` field to store minimum attendees, which is confusing and error-prone. The RSVP route even has a comment acknowledging this confusion.

**Current Code (offers/route.ts:105):**
```typescript
// Set minimum attendees (default 5 for workshops, 1 for 1:1)
offer.maxAttendees = type === '1:1' ? 1 : (minAttendees || 5);
```

**Current Code (rsvp/route.ts:151):**
```typescript
const minAttendees = offer.maxAttendees || 5; // Use maxAttendees field which stores minAttendees
```

**Fixed Code:**
Should rename field to `minAttendees` throughout and add separate `maxAttendees` if needed:

```typescript
// In types/index.ts
export interface Offer {
  // ... existing fields
  minAttendees: number;  // Minimum required for workshop to happen
  maxAttendees?: number; // Optional maximum capacity
}

// In offers/route.ts
offer.minAttendees = type === '1:1' ? 1 : (minAttendees || 5);

// In rsvp/route.ts
const minAttendees = offer.minAttendees || 5;
```

**Impact:**
- Confusing code that's hard to maintain
- Potential for logic errors
- Misleading field name

---

### 5. **Race Condition in RSVP Creation**

**File:** `src/app/api/rsvp/route.ts:134-156`

**Severity:** MEDIUM-HIGH - Can cause double-booking

**Description:**
Multiple users can RSVP simultaneously, and there's no locking mechanism to prevent exceeding capacity. The file is read after writing, creating a race condition window.

**Current Code:**
```typescript
// Append RSVP to file
const rsvpLine = JSON.stringify(rsvp) + '\n';
await fs.appendFile(rsvpsPath, rsvpLine);

// Count total active RSVPs
const rsvpsContent = await fs.readFile(rsvpsPath, 'utf-8');
const lines = rsvpsContent.trim().split('\n');
```

**Impact:**
- Workshops can exceed capacity
- Token transfers may be unfair
- Poor user experience with overbooking

**Recommended Fix:**
Implement file-based locking or move to a database with transactions.

---

## 🟠 MEDIUM PRIORITY ISSUES

### 6. **Incomplete Implementation: readNostrEventsByNpub()**

**File:** `src/lib/nostr-logger.ts:68-72`

**Severity:** MEDIUM - Feature incomplete

**Description:**
Function is a placeholder that always returns `null`.

**Current Code:**
```typescript
export async function readNostrEventsByNpub(npub: string): Promise<NostrEvent[] | null> {
  // This would require importing getProfileByNpub from storage
  // For now, this is a placeholder that shows the intended API
  // Will be implemented when integrated with the storage layer
  return null;
}
```

**Required Implementation:**
```typescript
import { getProfileByNpub } from './storage';

export async function readNostrEventsByNpub(npub: string): Promise<NostrEvent[] | null> {
  const profile = await getProfileByNpub(npub);
  if (!profile) return null;

  return readNostrEvents(profile.serialNumber);
}
```

**Impact:**
- Cannot query NOSTR events by npub
- Limits federation capabilities
- Feature gap in NOSTR integration

---

### 7. **Missing Error Handling in Calendar Page**

**File:** `src/app/calendar/page.tsx:54-65`

**Severity:** MEDIUM - Poor error handling

**Description:**
Fetch calls have no error handling. Failed requests will cause unhandled exceptions.

**Current Code:**
```typescript
for (const workshop of allWorkshops) {
  const rsvpResponse = await fetch(`/api/rsvp?offerId=${workshop.id}`);
  const rsvpData = await rsvpResponse.json();
  // No error handling!
```

**Fixed Code:**
```typescript
for (const workshop of allWorkshops) {
  try {
    const rsvpResponse = await fetch(`/api/rsvp?offerId=${workshop.id}`);
    if (!rsvpResponse.ok) {
      console.error(`Failed to fetch RSVPs for ${workshop.id}`);
      continue;
    }
    const rsvpData = await rsvpResponse.json();
    // ... process data
  } catch (error) {
    console.error(`Error fetching RSVPs for ${workshop.id}:`, error);
    continue;
  }
}
```

---

### 8. **Hardcoded Token Balance Display**

**Files:**
- `src/app/calendar/page.tsx:162`
- `src/app/marketplace/page.tsx:107`
- `src/app/offers/create/page.tsx:166`

**Severity:** MEDIUM - Incorrect data display

**Description:**
Token balance is hardcoded as "47" instead of fetching actual balance from profile.

**Current Code:**
```typescript
<span className="text-base">47 CHT</span>
```

**Fixed Code:**
```typescript
// Add to component:
const [tokenBalance, setTokenBalance] = useState<number>(0);

useEffect(() => {
  const fetchBalance = async () => {
    const serialNumber = localStorage.getItem('osv_serial_number');
    if (!serialNumber) return;

    const response = await fetch(`/api/profile/${serialNumber}`);
    if (response.ok) {
      const profile = await response.json();
      setTokenBalance(profile.tokenBalance || 0);
    }
  };
  fetchBalance();
}, []);

// Then use:
<span className="text-base">{tokenBalance} CHT</span>
```

**Impact:**
- Users see incorrect token balance
- Cannot track actual token holdings
- Confusing UX

---

## 🔵 LOW PRIORITY / ENHANCEMENTS

### 9. **TODO: Username Availability Check**

**File:** `src/app/badge/page.tsx:58`

**Status:** ✅ **RESOLVED** - API endpoint created

**Description:**
Frontend had TODO comment for username availability check.

**Resolution:**
Created new API endpoint at `src/app/api/username/route.ts` with comprehensive tests. Frontend can now integrate with:

```typescript
// In badge/page.tsx useEffect:
const checkAvailability = async () => {
  const response = await fetch(`/api/username?username=${encodeURIComponent(username)}`);
  const data = await response.json();

  if (!data.available) {
    setUsernameError(data.message || 'Username is not available');
    setUsernameValid(false);
  } else {
    setUsernameError('');
    setUsernameValid(true);
  }
};
```

---

### 10. **Placeholder: Calendar Subscription Link**

**File:** `src/app/calendar/page.tsx:237-245`

**Severity:** LOW - Feature not implemented

**Description:**
"Subscribe to my RSVP calendar" link is placeholder (`href="#"`).

**Implementation Needed:**
Generate iCal/ICS feed for user's RSVPs:
- Create `/api/calendar/[npub].ics` endpoint
- Generate iCal format from user's RSVPs
- Include workshop details and timing

---

### 11. **Missing Rate Limiting**

**Files:** All API endpoints

**Severity:** LOW - Security enhancement

**Description:**
No rate limiting on API endpoints. Could be abused for enumeration or DoS.

**Recommendation:**
Implement rate limiting middleware using IP address or authentication token.

---

### 12. **Magic String: "system" Address**

**File:** `src/app/api/offers/route.ts:129`

**Severity:** LOW - Code quality

**Description:**
Hardcoded string `'system'` should be a configuration constant.

**Current Code:**
```typescript
to: 'system', // System address for offer creation cost
```

**Fixed Code:**
```typescript
// In a new src/lib/constants.ts:
export const SYSTEM_ADDRESS = 'system';

// Then use:
to: SYSTEM_ADDRESS,
```

---

### 13. **No JSONL Data Validation**

**Files:** `nostr-logger.ts`, `storage.ts`

**Severity:** LOW - Defense in depth

**Description:**
JSONL files are parsed without validation. If files are compromised, could cause issues.

**Recommendation:**
Add validation utilities that check structure before parsing:

```typescript
function parseValidatedJSONL<T>(line: string, validator: (obj: any) => obj is T): T | null {
  try {
    const obj = JSON.parse(line);
    if (validator(obj)) {
      return obj;
    }
    console.warn('Invalid JSONL data structure');
    return null;
  } catch (error) {
    console.error('Failed to parse JSONL:', error);
    return null;
  }
}
```

---

## Summary Statistics

- **Critical Bugs:** 2
- **High Priority:** 3
- **Medium Priority:** 4
- **Low Priority:** 4
- **Total Issues:** 13
- **Resolved:** 1 (Username availability API)

## Action Items

### Immediate (Critical)
1. ✅ Fix `getStoredSecretKey()` localStorage bug (line 247 in nostr-events.ts)
2. ✅ Fix import statements in nostr-validation.ts (lines 277, 283)

### High Priority
3. Add error handling to offers GET endpoint
4. Refactor maxAttendees/minAttendees field naming
5. Implement RSVP race condition protection

### Medium Priority
6. Implement `readNostrEventsByNpub()` function
7. Add error handling to calendar page fetches
8. Replace hardcoded token balances with real data

### Low Priority
9. ✅ Create username availability API (DONE)
10. Implement calendar subscription feature
11. Add rate limiting to API endpoints
12. Extract magic strings to constants
13. Add JSONL validation utilities

---

**Note:** Items marked with ✅ require file edit permissions to fix. The username availability API (item 9) has been implemented as a new file and is ready to use.
