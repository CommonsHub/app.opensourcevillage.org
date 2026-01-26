A user receives an NFC tag with a unique serial number.

NFC tags are configured (via `/setup`) to open: `https://app.opensourcevillage.org/badge#{serialNumber}`

**IMPORTANT:** The serialNumber is in the URL fragment (after #) so it stays client-side and is never sent to the server.

## Claiming Flow

When they first scan their badge, they see:

```
Welcome to Open Source Village

This badge hasn't been claimed yet.

To claim it:
1. Set a username
2. Set a password or PIN code

[Username: _______]
[Password: _______] (browser will suggest strong password)
[or set a simple PIN code]

[Claim Badge]
```

When user clicks "Claim Badge":
1. Client-side JS extracts serialNumber from URL fragment and removes it
2. Client derives NOSTR keypair: `serialNumber + password → npub/nsec`
3. Client calls `/api/claim` with: `{ serialNumber, username, npub }`
4. Backend creates:
   - `$DATA_DIR/badges/{serialNumber}/profile.json` (maps serial → npub)
   - Symlink: `$DATA_DIR/usernames/{username} → $DATA_DIR/badges/{serialNumber}`
5. Client stores in localStorage: `{ serialNumber, npub, nsec }`
6. Mint 50 tokens (queued, background)
7. Create NOSTR kind 0 (profile) event

**Backend never sees serialNumber again after claiming. Backend uses npub as identifier.**

# Public profile
Accessed via: `app.opensourcevillage.org/{username}`
or via: `app.opensourcevillage.org/badges#{serialNumber}`

When viewing someone else's profile, show:

Hi, I'm [name].

[shortbio]

I'd love to talk about:
[truncated text with "Read more" link to expand inline]

I could use help with:
[truncated text with "Read more" link to expand inline]

Balance: 47 tokens (2 pending)

Main actions:
- Send me tokens (opens modal/bottom sheet with amount input, +/- buttons, optional description)


More about me:
[linktree]

Also show the list of offers and workshops attended / organised (see screens.md and screen/*)

# Personal profile
When loading the profile page as the owner of the NFC tag, show an "edit profile" button" where you can edit in place the content (+ set a username). For the link tree, just offer an input text with a + to add more urls. Automatically detect most common urls for linkedin, twitter/x, mastodon, bluesky, generic website (use favicon or fallback).

