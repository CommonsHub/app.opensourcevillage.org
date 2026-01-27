This is a mobile friendly webapp for attendees of an IRL event over multiple days.
The idea is to facilitate networking and an open space for workshops with a market of offers and needs.

People receive an NFC tag that anyone can scan to view their profile and send them tokens.

NFC tags contain URL: `app.opensourcevillage.org/badge#{serialNumber}` (serialNumber is hashed)

When they first scan their own NFC tag, they are invited to claim it:
- Set a username (3-20 chars, alphanumeric + hyphens/underscores, unique)
- Set a password (browser suggested) OR simple PIN (4-8 digits)
- Client derives NOSTR keypair from hashed serialNumber + password
- Backend uses npub as identifier

Then they receive automatically 50 ERC20 tokens on Gnosis Chain (using github.com/opencollective/token-factory with SAFE wallets)

All actions are communicated via NOSTR protocol (offline-first with local queue). Blockchain is settlement layer.

The event takes places between Janaury 26 2026 and February 6 2026.

In the settings.json file, different google calendar ids are defined. Each for a dedicated room.

They can see the aggregated schedule and filter per room or per tag.
They can make 2 types of offers:
- Offer for an event / workshop 
- Generic offer (not linked to a place or time)

They can make 2 types of bookings:
- private booking (no details needed, cannot RSVP)
- public booking for a workshop (people can RSVP)

Making an offer costs 1 token (but the organizer will receive a token per participant or per person claiming the offer)

RSVP to an event costs 1 token (refunded if cancelled)
Claiming an offer costs 1 token

There can be more than one author of an offer, in which case tokens are equally splits.

