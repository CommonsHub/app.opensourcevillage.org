# Room Booking Integration Test

This test verifies the complete room booking flow including balance checks, workshop proposals, RSVPs, conflict handling, and refunds.

## Prerequisites

- Local blockchain running (Anvil/Hardhat)
- Token contract deployed
- Nostr relay running (optional for full flow)

## Test Scenario

### Setup

1. **Verify Requirements**
   - Local chain is reachable at `http://127.0.0.1:8545`
   - Token contract is deployed and accessible
   - Settings.json has rooms with hourly costs configured

2. **Create Test Users**
   - Create `user1` with a wallet address (npub1...)
   - Create `user2` with a wallet address (npub2...)
   - Create `user3` with a wallet address (npub3...)
   - Create `user4` with a wallet address (npub4...)

### Test Cases

#### TC1: Insufficient Balance Check

**Given:** user1 has 0 tokens
**When:** user1 tries to propose a 1-hour workshop in Ostrom Room (3 tokens/hour)
**Then:** Request fails with error "Insufficient balance. You need at least 3 tokens to book this room."

#### TC2: Successful Workshop Proposal

**Given:** user1 has 51 tokens (after minting)
**When:** user1 proposes a 1-hour workshop in Ostrom Room at 14:00-15:00
**Then:**
- Workshop is created with status "pending"
- 3 tokens are burned from user1's balance
- user1's balance is now 48 tokens

#### TC3: Competing Workshop Proposal

**Given:** user2 has 52 tokens (after minting)
**When:** user2 proposes a 1-hour workshop in the same room at the same time (14:00-15:00)
**Then:**
- Workshop2 is created with status "pending" (tentative conflict warning shown)
- 3 tokens are burned from user2's balance
- user2's balance is now 49 tokens

#### TC4: RSVP Flow

**Given:** workshop1 (by user1) and workshop2 (by user2) both exist
**When:**
- user2 RSVPs to workshop1 (1 token)
- user3 RSVPs to workshop2 (1 token)
- user4 RSVPs to workshop2 (1 token)

**Then:**
- workshop1 has 1 RSVP (status: tentative)
- workshop2 has 2 RSVPs (status: tentative → confirmed when minRsvps reached)

#### TC5: Conflict Resolution

**Given:** workshop2 reaches minRsvps and becomes CONFIRMED
**When:** System detects workshop1 now has a confirmed conflict
**Then:**
- workshop1 status changes to "conflict"
- user1 receives a Nostr notification asking to change room/time or cancel

#### TC6: Workshop Cancellation and Refund

**Given:** workshop1 has status "conflict"
**When:** user1 cancels workshop1
**Then:**
- workshop1 status changes to "cancelled"
- user1 receives refund of 3 tokens (original cost)
- user2 receives refund of 1 token (their RSVP to workshop1)
- user1's final balance: 48 + 3 = 51 tokens
- user2's RSVP cost is refunded

## Room Costs Reference

| Room | Hourly Cost |
|------|-------------|
| Ostrom Room | 3 tokens |
| Satoshi Room | 2 tokens |
| Angel Room | 1 token |
| Mush Room | 1 token |
| Phone Booth | 1 token |

## Balance Calculation Example

For a 1-hour workshop in Ostrom Room:
- Cost = 3 tokens/hour × 1 hour = 3 tokens

For a 2-hour workshop in Satoshi Room:
- Cost = 2 tokens/hour × 2 hours = 4 tokens
