# Invitation system

Open Source Village runs on top of the
**[Pyramid](https://github.com/fiatjaf/pyramid)** Nostr relay. Pyramid is an
**invite-only** relay: **non-members can read**, but **only members can
publish** (until they join via an invite).

This doc describes the invite flow as exercised by `tests/nostr.connect.test.ts`
(WebSocket + NIP-42 auth + Pyramid invite/join event kinds), plus how the web
app uses it today.

## How Pyramid invitations work (wire protocol)

### Key concepts

- **Member**: a pubkey that Pyramid currently allows to publish to the relay.
- **Invite code**: a single string a member can generate and share with someone
  else (static, so same invite code for a given member — but it is *issued by
  the relay*, not signed by the inviter)
- **Join request**: a Nostr event signed by the new user that redeems an invite
  code.

### Event kinds used

- **Invite code**: **kind `28935`**
  - Produced by the relay for a member.
  - The invite code is carried in a tag: `["claim", "<inviteCode>"]`.
- **Join request / redeem invite code**: **kind `28934`**
  - Created and signed by the **invitee** (the new user).
  - Must include tag: `["claim", "<inviteCode>"]`.
- **NIP-42 authentication** (when required by the relay): **kind `22242`**
  - Sent as an `["AUTH", <event>]` message after the relay sends
    `["AUTH", "<challenge>"]`.
  - The auth event includes tags:
    - `["challenge", "<challenge>"]`
    - `["relay", "<relayBaseUrl>"]` (must match the relay’s expected base URL)

### Invite code format

Pyramid’s invite codes are **192 hex chars**:

- **first 64**: inviter pubkey hex
- **next 128**: signature (hex) made by the relay

Important: this signature is **not** made with the inviter’s private key. Pyramid
reconstructs a “virtual” event (kind `28937`, `created_at=0`, `content=""`,
`tags=[["P", "<inviterHex>"]]`, `pubkey=<relayInternalPubkey>`) and then verifies
that the signature in the invite code is a valid signature for that event under
the relay’s internal key. Therefore, **an inviter cannot generate their own
invite codes unless they control the relay’s internal secret key**.

This is asserted in the integration test (`/^[0-9a-f]{192}$/i`).

### Step-by-step flow

1. **Inviter requests an invite code (kind `28935`)**
   - Client sends `["REQ", <subId>, { kinds: [28935], limit: 1 }]`.
   - If the relay requires auth, it responds with:
     - `["CLOSED", <subId>, "auth-required: ..."]`
     - and also sends `["AUTH", "<challenge>"]`.
   - Client then completes NIP-42 auth (kind `22242`) and repeats the `REQ`.
   - The relay returns an `EVENT` of kind `28935` containing a `claim` tag:
     - `["EVENT", <subId>, { kind: 28935, tags: [["claim", "<inviteCode>"], ...], ... }]`

2. **Invitee redeems the invite code (join request, kind `28934`)**
   - Invitee constructs and signs a Nostr event:
     - `kind: 28934`
     - `tags: [["claim", "<inviteCode>"]]`
     - `content: ""`
   - Client sends it via `["EVENT", <joinEvent>]`.
   - Relay replies `["OK", <eventId>, true, ...]` on success.

3. **Invitee becomes a member**
   - After the join request is accepted, Pyramid treats the invitee pubkey as a
     member.
   - The test verifies this by publishing a regular replaceable event (profile
     metadata **kind `0`**) and expecting it to be accepted.

## How the Open Source Village app uses this

### Generating an invite code (inviter UI)

- The inviter uses the “Invite a Villager” section on their profile page.
- The frontend calls `POST /api/invite` with `{ npub }`.
- The server attempts to fetch a kind `28935` event from the relay and returns
  `inviteCode`.

Implementation: `src/app/api/invite/route.ts`.

### Redeeming an invite code (invitee onboarding)

- New users go through `/badge` onboarding.
- Step 2 asks the user to paste the invite code (validated as 192 hex chars).
- The app calls `POST /api/claim` with
  `{ username, displayName, serialNumber, npub, inviteCode }`.

Important note: `src/app/api/claim/route.ts` currently **does not publish the
kind `28934` join request** (because that must be signed by the invitee’s secret
key). It:

- Extracts the inviter from the invite code (first 64 hex chars) and stores it
  as `invitedBy`
- Enforces a local invite limit (4) and tracks `invitees` in file-based storage
- Kicks off additional “welcome” actions (NIP-29 group membership, NIP-86
  allow-listing, token mint request, etc.)

The authoritative “member can publish to Pyramid” step is the **kind `28934`
join request** described above.

## Setting the Pyramid root admin (root user) via command line

Pyramid is “bootstrapped” by creating the **first root user**. Until at least
one root user exists, Pyramid exposes a setup endpoint and redirects the UI to
it.

### One-time bootstrap (fresh Pyramid install)

If your Pyramid instance has **no root users yet**, you can set the root admin
pubkey by POSTing to the setup endpoint:

```bash
# Replace host/port and npub as appropriate.
# This endpoint accepts either npub (bech32) or hex pubkey.
curl -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "pubkey=npub1yourrootadminhere" \
  "http://localhost:3334/setup/root"
```

Notes:

- The handler only exists when `pyramid.HasRootUsers()` is false (it’s meant for
  **one-time setup**).
- The WebSocket relay URL in local dev is often `ws://localhost:3334`, and the
  HTTP UI shares the same host/port as `http://localhost:3334`.
- If you’re running Pyramid behind a reverse proxy, use your public base URL
  (for example `https://yourdomain.tld/setup/root`).

### After bootstrap

Once a root user exists, use Pyramid’s UI and/or its “standard relay management
tools” to manage membership and moderation (Pyramid supports management
operations and checks `IsRoot` for privileged actions).
