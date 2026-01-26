# Open Source Village - HTML Prototypes

Static HTML/Tailwind prototypes for all screens in the Open Source Village app.

## Overview

These prototypes demonstrate the UI and interactions for each screen using Tailwind CSS (via CDN). They include dummy data and basic JavaScript for interactive elements.

## Quick Start

Open any HTML file directly in your browser. All files are standalone with no build step required.

**Recommended starting point:** `index.html` (Badge Claiming Screen)

## Screen List

### Authentication & Onboarding
- **`index.html`** - Badge Claiming Screen
  - First-time NFC badge scan
  - Username and password/PIN setup
  - Links to: `profile-edit.html`

### Profile Screens
- **`profile-public.html`** - Public Profile View
  - Viewing another user's profile
  - Send tokens button
  - Links to: `send-tokens.html`

- **`profile-edit.html`** - Personal Profile (Edit Mode)
  - Edit your own profile
  - Avatar upload
  - Social links management
  - Links to: `transactions.html`, `calendar.html`

- **`send-tokens.html`** - Send Tokens Modal
  - Bottom sheet modal for token transfer
  - Amount selector with +/- buttons
  - Optional message
  - Links back to: `profile-public.html`

### Schedule & Workshops
- **`calendar.html`** - Schedule View (Main Screen)
  - Combined official events + user workshops
  - Filter by room and tags
  - Floating action button to create offer
  - Hamburger menu navigation
  - Links to: `create-offer.html`, `workshop-detail.html`, `marketplace.html`, `notifications.html`, `settings.html`, `profile-edit.html`

- **`create-offer.html`** - Create Offer Form
  - Smart form (changes based on type)
  - Workshop, 1:1, or generic offer
  - Schedule section (collapsible)
  - Co-authors, attendance limits, pricing
  - Links back to: `calendar.html`

- **`workshop-detail.html`** - Workshop Detail View
  - Full workshop information
  - Attendee list
  - RSVP button
  - Links to: `calendar.html`, `profile-public.html`

### Marketplace
- **`marketplace.html`** - Marketplace View
  - Generic offers feed
  - Tag-based search
  - Claim offer buttons
  - Links to: `create-offer.html`, `notifications.html`, `settings.html`, `profile-edit.html`, `calendar.html`

### Notifications & Transactions
- **`notifications.html`** - Notifications Center
  - Token receipts, workshop updates, RSVP notifications
  - Tabs: All, Tokens, Workshops
  - Links to: `transactions.html`, `calendar.html`, `workshop-detail.html`

- **`transactions.html`** - Pending Transactions
  - Blockchain queue management
  - Pending, Failed, Confirmed sections
  - Manual retry for failed transactions
  - Links to: `notifications.html`

### Settings & Admin
- **`settings.html`** - Settings Page
  - Account info (username, npub)
  - Theme preferences
  - Notification toggles
  - Export data
  - Logout
  - Links to: `calendar.html`, `index.html`

- **`setup.html`** - NFC Setup Tool
  - Generate URLs for NFC badges
  - QR code display
  - For organizers/admin use
  - Links to: `index.html`, `calendar.html`

## Navigation Flow

```
Badge Claim (index.html)
    ↓
Profile Edit (profile-edit.html)
    ↓
Main App (calendar.html)
    ├─→ Create Offer (create-offer.html)
    ├─→ Workshop Detail (workshop-detail.html)
    ├─→ Marketplace (marketplace.html)
    ├─→ Notifications (notifications.html)
    │   └─→ Transactions (transactions.html)
    └─→ Settings (settings.html)

Public Profile (profile-public.html)
    └─→ Send Tokens (send-tokens.html)

Setup Tool (setup.html) - Standalone admin tool
```

## Features Demonstrated

### Interactive Elements
- Form validation (visual only, no actual validation)
- Toggle between password and PIN input
- Collapsible sections (details/summary)
- Modal/bottom sheet animations
- Hamburger menu (slide-in navigation)
- Tabs for filtering content
- Dynamic amount increment/decrement
- Copy to clipboard (simulated with alerts)
- Toast notifications (simulated with alerts)

### Design Patterns
- Mobile-first responsive design (portrait-only)
- Tailwind utility classes for styling
- Avatar generation with gradients
- Status badges (Pending, Confirmed, Failed)
- Card layouts for events/offers/notifications
- Sticky headers
- Floating action buttons (FAB)
- Loading states (mentioned in comments)
- Empty states (shown in transactions/notifications)

### Dummy Data
All screens use realistic dummy data:
- Users: @alice, @bob, @charlie, @diana, @eve, @frank
- Workshops: "Intro to NOSTR", "Smart Contract Security", "Advanced React"
- Tokens: 47 balance, 2 pending, various transactions
- Tags: web3, ai, workshop, talk, 1:1, review, mentorship, design, ux

## Limitations

These are static prototypes with limited functionality:
- No real backend API calls
- No NOSTR integration
- No blockchain operations
- Form submissions use `alert()` and `confirm()` for demonstration
- Navigation uses `window.location.href` for page transitions
- No state persistence (localStorage not implemented)
- No real avatar upload (file picker shown but not functional)
- QR codes shown as placeholders

## Customization

To customize the prototypes:

1. **Colors**: Update Tailwind classes (e.g., `bg-blue-600` → `bg-purple-600`)
2. **Dummy Data**: Edit text content directly in HTML
3. **Add Screens**: Copy an existing file and modify
4. **Interactions**: Update JavaScript functions at bottom of each file

## Browser Compatibility

Tested in modern browsers:
- Chrome/Edge (recommended)
- Firefox
- Safari

Requires JavaScript enabled.

## Next Steps

To convert these to a real application:

1. Replace Tailwind CDN with proper build setup
2. Implement Next.js routing
3. Add React components for reusable UI elements
4. Connect to backend API endpoints
5. Integrate NOSTR client (nostr-tools)
6. Implement blockchain operations (token-factory)
7. Add state management (React Context)
8. Implement offline queue (localStorage + sync)
9. Add proper form validation
10. Implement Progressive Web App (PWA) features

## File Size

All files are self-contained and small:
- Each HTML file: ~4-10 KB
- Total prototype size: ~70 KB (excluding Tailwind CDN)

## License

Part of the Open Source Village project.
