# Onboarding

When you scan your badge, you go to /badge#:serialNumber.

If this is the first time (no localStorage), you are showns a page like:

Welcome to the Open Source Village

How should we call you around here?

[ ]

[next]

Welcome $name!

Your first mission is to find a buddy that can welcome you properly to the
village.

Go find a villager and ask to show you their QR code (they will find it by
scanning their own badge).

note: a villager can only onboard up to 4 villagers. So we count on you to
onboard other villagers!

[ activate camera ] (or paste the invitation code) [ ]

Once scanned, you are now added as a member of the nostr relay (see
tests/nostr.connect.test.ts) and you are redirected to /onboarding with a few
checkboxes to respect the values of the community:

- [ ] **Common space** Take care of this space like this is your home, unless
      you are messy, then take care of this space like this is somebody else's
      home.
- [ ] **As a guest, be a host** Actively welcome other people to the village.
      Engage in conversations. Make people feel at home.
- [ ] **Contribute** This space is alive when everybody contributes their piece.
      Propose a workshop, help clean the space, volunteer, send a pull request,
      the surface of contributions is wide!
- [ ] **Make this space a safe and brave space** Noticing misbehaviors? Report
      it to ones of the stewards

Then you are redirected to the homepage where you can see the calendar with
upcoming events.
