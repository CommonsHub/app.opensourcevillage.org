# Test Suite Summary

## Overview
- **Total Tests:** 456 tests across 17 files
- **Passing:** 397 (87%)
- **Failing:** 59 (13%)
- **Test Runner:** Jest with Bun
- **Total Runtime:** ~1000ms

---

## Tests Ordered by Priority (Fundamental → Granular)

### 1. ✅ **Storage Layer Tests** (`src/lib/__tests__/storage.test.ts`)
**Description:** Tests the core file-based storage system for profiles, usernames, blockchain queues, and NOSTR event logs.

**Pre-requirements:**
- None (uses isolated test data directory)

**Status:** ✅ **PASSING** (All tests passing)

**What it tests:**
- Profile creation with username/npub/serialNumber
- Username uniqueness validation
- Profile retrieval by serialNumber, username, and npub
- Profile updates
- Blockchain queue operations (add/retrieve)
- NOSTR event logging
- Symlink creation for username lookups

**Issues:** None

---

### 2. ⚠️ **NOSTR Events Tests** (`src/lib/__tests__/nostr-events.test.ts`)
**Description:** Tests NOSTR event creation, signing, and validation for profiles, offers, and RSVPs.

**Pre-requirements:**
- None (uses in-memory keypairs)

**Status:** ⚠️ **MOSTLY PASSING** (Minor issues with event parsing edge cases)

**What it tests:**
- Profile event creation (kind 0)
- Offer/workshop event creation (kind 1)
- RSVP event creation (kind 7)
- RSVP cancellation events
- Event signature verification
- nsec/npub encoding/decoding
- Offer event parsing

**Issues:**
- Some edge case parsing tests may fail
- Event validation corner cases

**How to fix:**
- Review parseOfferEvent function for edge cases
- Ensure all tag formats are handled correctly

---

### 3. ✅ **NOSTR Validation Tests** (`src/lib/__tests__/nostr-validation.test.ts`)
**Description:** Validates NOSTR event structure, signatures, and NIP compliance.

**Pre-requirements:**
- None

**Status:** ✅ **PASSING**

**What it tests:**
- Event signature validation
- Event structure validation
- NIP-01 compliance
- Invalid event rejection

**Issues:** None

---

### 4. ✅ **API Utils Tests** (`src/lib/__tests__/api-utils.test.ts`)
**Description:** Tests standardized API response formatting, error handling, and request validation utilities.

**Pre-requirements:**
- None

**Status:** ✅ **PASSING**

**What it tests:**
- Success response formatting
- Error response formatting
- Validation error helpers
- HTTP status code helpers (401, 403, 404, 409, etc.)
- Pagination response formatting
- Query parameter validation
- JSON body parsing
- HTTP method checking
- Error handling middleware

**Issues:** None

---

### 5. ❌ **Profile API Tests** (`src/app/api/profile/__tests__/route.test.ts`)
**Description:** Tests profile retrieval and update API endpoints.

**Pre-requirements:**
- Isolated test data directory

**Status:** ❌ **PARTIALLY FAILING**

**What it tests:**
- GET /api/profile/[identifier] by username
- GET /api/profile/[identifier] by npub
- PUT /api/profile/[identifier] with authorization
- 404 handling for non-existent profiles
- Sensitive data protection (serialNumber not exposed)

**Issues:**
- Test data directory collision between tests
- Profile creation conflicts due to shared test data
- Username availability checks returning incorrect results

**How to fix:**
- Ensure each test uses unique TEST_DATA_DIR
- Clear test data properly in beforeEach/afterEach
- Fix test isolation issues causing profile collisions

---

### 6. ❌ **Username API Tests** (`src/app/api/username/__tests__/route.test.ts`)
**Description:** Tests username availability checking API.

**Pre-requirements:**
- Isolated test data directory

**Status:** ❌ **4 TESTS FAILING**

**Failing tests:**
- "should return available=false when username exists" - Expected false, got true
- "should be case-insensitive when checking existing usernames" - Expected false, got true
- "should handle multiple existing users correctly" - Expected false, got true
- "should skip corrupted profile files and continue checking" - Expected false, got true

**Issues:**
- Username lookup not finding existing profiles
- Test data directory not properly initialized
- Symlink creation/lookup issues
- getProfileByUsername() not working correctly in test environment

**How to fix:**
```typescript
// Ensure test data directory is set BEFORE importing storage module
process.env.DATA_DIR = TEST_DATA_DIR;

// Verify symlink creation in beforeEach
await ensureDir(path.join(TEST_DATA_DIR, 'usernames'));

// Add debug logging to see if profiles are actually created
console.log('Created profile:', await getProfileByUsername('alice'));
```

---

### 7. ❌ **Offers API Tests** (`src/app/api/offers/__tests__/route.test.ts`)
**Description:** Tests offer/workshop creation, retrieval, and listing.

**Pre-requirements:**
- Isolated test data directory
- Valid NOSTR events

**Status:** ❌ **FAILING**

**Issues:**
- Similar to Profile API tests - test data isolation
- Offer retrieval not working
- NOSTR event storage/retrieval issues

**How to fix:**
- Fix storage layer test isolation
- Ensure offer NOSTR events are properly logged
- Verify offer retrieval by event ID

---

### 8. ❌ **RSVP API Tests** (`src/app/api/rsvp/__tests__/route.test.ts`)
**Description:** Tests RSVP creation, cancellation, and counting.

**Pre-requirements:**
- Isolated test data directory
- Existing offers and profiles

**Status:** ❌ **ALL TESTS FAILING**

**Failing error:**
```
error: Username already taken
  at createProfile (/src/lib/storage.ts:126:15)
```

**Issues:**
- Tests are not properly isolated
- Profile creation happening in beforeEach is colliding
- Shared usernames across tests
- Test data directory not being cleaned between tests

**How to fix:**
```typescript
// Use unique usernames per test
const testUsername = `alice_${Date.now()}`;

// Ensure cleanup in afterEach
afterEach(async () => {
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
});

// Wait for filesystem operations to complete
await new Promise(resolve => setTimeout(resolve, 100));
```

---

### 9. ❌ **NOSTR Logger Tests** (`src/lib/__tests__/nostr-logger.test.ts`)
**Description:** Tests NOSTR event logging to JSONL files.

**Pre-requirements:**
- Isolated test data directory

**Status:** ❌ **ALL TESTS FAILING**

**Issues:**
- Reading stale data from previous test runs
- JSONL file not being cleared between tests
- Expected 1 event, received 25+ events
- File not being created in correct location

**Example failure:**
```
expect(events).toHaveLength(1)
Expected length: 1
Received length: 25
```

**How to fix:**
```typescript
// In beforeEach, ensure complete cleanup
beforeEach(async () => {
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });

  // Reset DATA_DIR environment variable
  process.env.DATA_DIR = TEST_DATA_DIR;
});

// Fix the logNostrEvent function to use process.env.DATA_DIR correctly
// Check that nostr-logger.ts reads DATA_DIR at call time, not import time
```

---

### 10. ✅ **Notification Tests** (`src/lib/__tests__/notifications.test.ts`)
**Description:** Tests notification generation, storage, and retrieval.

**Pre-requirements:**
- Isolated test data directory

**Status:** ⚠️ **MOSTLY PASSING**

**What it tests:**
- RSVP notifications
- Offer creation notifications
- Profile update notifications
- Notification persistence
- Notification retrieval by user

**Issues:** Minor edge cases

---

### 11. ✅ **Rate Limiting Tests** (`src/lib/__tests__/rate-limit.test.ts`)
**Description:** Tests API rate limiting implementation.

**Pre-requirements:**
- None (uses in-memory tracking)

**Status:** ✅ **PASSING**

**What it tests:**
- Request rate limiting
- Window-based rate limiting
- Rate limit reset
- Multiple IP tracking

**Issues:** None

---

### 12. ❌ **Google Calendar Tests** (`src/lib/__tests__/google-calendar.test.ts`)
**Description:** Tests Google Calendar integration for room scheduling.

**Pre-requirements:**
- None (uses mocked calendar data)

**Status:** ❌ **2 TESTS FAILING**

**Failing tests:**
1. "should find all available rooms" - Ostrom Room showing as available when it should be occupied
2. "should handle events with same start and end time" - Not correctly handling instant events

**Issues:**
- Room availability logic not correctly detecting conflicts
- Edge case for events with identical start/end times (instant events)

**How to fix:**
```typescript
// In isRoomAvailable function (google-calendar.ts)
// Fix overlap detection for instant events
if (event.startTime.getTime() === event.endTime.getTime()) {
  // Instant event - check if query time matches exactly
  if (startTime.getTime() === event.startTime.getTime()) {
    return false;
  }
}

// Fix overlap logic to be inclusive of boundaries
if (
  (startTime >= event.startTime && startTime < event.endTime) ||
  (endTime > event.startTime && endTime <= event.endTime) ||
  (startTime < event.startTime && endTime > event.endTime) // <-- Add this case
) {
  return false;
}
```

---

### 13. ✅ **Token Balance Tests** (`src/lib/__tests__/token-balance.test.ts`)
**Description:** Tests blockchain token balance tracking (pending vs confirmed).

**Pre-requirements:**
- None (uses mocked blockchain data)

**Status:** ✅ **PASSING**

**What it tests:**
- Balance calculation
- Pending balance tracking
- Confirmed balance tracking
- Balance updates after transactions

**Issues:** None

---

### 14. ✅ **Date Utils Tests** (`src/lib/__tests__/date-utils.test.ts`)
**Description:** Tests date formatting and manipulation utilities.

**Pre-requirements:**
- None

**Status:** ✅ **PASSING**

**What it tests:**
- Date formatting
- Relative time display
- Time zone handling
- Date parsing

**Issues:** None

---

### 15. ✅ **Tag Utils Tests** (`src/lib/__tests__/tag-utils.test.ts`)
**Description:** Tests tag parsing and manipulation for offers/workshops.

**Pre-requirements:**
- None

**Status:** ✅ **PASSING**

**What it tests:**
- Tag parsing from strings
- Tag normalization
- Tag deduplication
- Tag validation

**Issues:** None

---

### 16. ✅ **Avatar Utils Tests** (`src/lib/__tests__/avatar-utils.test.ts`)
**Description:** Tests avatar upload, resizing, and validation.

**Pre-requirements:**
- None (uses mocked image data)

**Status:** ✅ **PASSING**

**What it tests:**
- Image validation
- Image resizing
- File size limits
- Format conversion

**Issues:** None

---

### 17. ⚠️ **Discord Logger Tests** (`src/lib/__tests__/discord-logger.test.ts`)
**Description:** Tests Discord webhook logging for NOSTR events.

**Pre-requirements:**
- Discord webhook URL (optional, can be mocked)

**Status:** ⚠️ **MOSTLY PASSING** (requires webhook URL for integration tests)

**What it tests:**
- Discord message formatting
- Webhook API calls
- Rate limiting for Discord API
- Batch logging
- Error handling

**Issues:** Integration tests skipped without DISCORD_WEBHOOK_URL

---

## Critical Fixes Needed (Priority Order)

### 🔥 Priority 1: Test Data Isolation
**Issue:** Multiple test files share test data directories causing conflicts.

**Fix:**
1. Use unique test data directories per test file
2. Ensure complete cleanup in beforeEach/afterEach
3. Add delays for filesystem operations to complete

```typescript
// In each test file
const TEST_DATA_DIR = path.join(process.cwd(), `data-test-${Date.now()}`);
process.env.DATA_DIR = TEST_DATA_DIR;

beforeEach(async () => {
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });
});

afterEach(async () => {
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  await new Promise(resolve => setTimeout(resolve, 50)); // Wait for cleanup
});
```

### 🔥 Priority 2: NOSTR Logger File Persistence
**Issue:** JSONL log files accumulating data across test runs.

**Fix:**
- Ensure DATA_DIR is read at runtime, not import time
- Clear all log files in beforeEach
- Verify file paths are correct

### 🔥 Priority 3: Username Lookup in Tests
**Issue:** getProfileByUsername() not finding profiles in test environment.

**Fix:**
- Debug symlink creation in test environment
- Add logging to storage.ts during tests
- Verify filesystem permissions

### 🔴 Priority 4: Google Calendar Room Availability
**Issue:** Logic error in overlap detection for room booking.

**Fix:** Improve overlap detection logic to handle all edge cases (see detailed fix above).

---

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/lib/__tests__/storage.test.ts

# Run tests in watch mode
bun test --watch

# Run tests with coverage
bun test --coverage
```

---

## Manual E2E Tests (from specs/tests.md)

### Pre-requirements:
1. Start local Hardhat blockchain node
2. Deploy test ERC20 token contract
3. Mint native tokens to PRIVATE_KEY
4. Create test data (dummy author Xavier with nsec/npub/serial-number)
5. Create test workshop `/workshops/nostr` (author: Xavier)

### Test 1: Badge Claiming
1. Navigate to `BASE_URL/badges#123-32112-4324`
2. Set username
3. Set password
4. Click "claim"
5. Verify `BASE_URL/username.json` returns 0x address and npub
6. Verify blockchain balance of 0x address is 50 tokens

### Test 2: RSVP Flow
1. Navigate to `BASE_URL/workshops/nostr`
2. Click "RSVP"
3. Verify user balance is 49 tokens (1 spent)
4. Verify Xavier's balance is 1 token (received)

**Status:** ❌ Not yet implemented (requires blockchain integration)

---

## Summary

**Strong Foundation:**
- Core storage layer working well ✅
- NOSTR event creation/signing solid ✅
- API utilities comprehensive ✅
- Utility libraries (dates, tags, avatars) complete ✅

**Needs Attention:**
- Test isolation issues causing cascading failures ⚠️
- File-based test data cleanup ⚠️
- Google Calendar edge cases ⚠️
- E2E blockchain integration tests not yet implemented ❌

**Recommended Next Steps:**
1. Fix test data isolation (will fix ~40 failing tests)
2. Fix NOSTR logger file persistence (will fix ~10 failing tests)
3. Fix Google Calendar overlap detection (will fix 2 failing tests)
4. Implement E2E blockchain tests with Hardhat
5. Add integration tests for NOSTR relay connections
