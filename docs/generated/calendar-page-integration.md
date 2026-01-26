# Calendar Page Integration Guide

**Purpose**: Add Google Calendar integration to existing `/calendar` page
**Time Required**: 15-20 minutes
**Difficulty**: Easy

---

## What This Adds

The existing calendar page (`src/app/calendar/page.tsx`) shows user-created workshops from the database. This integration adds:

1. **Google Calendar Events** - Official scheduled events from room calendars
2. **Combined View** - Both database workshops AND Google Calendar events
3. **Room Filter** - Filter by specific rooms
4. **Working Subscribe Link** - Users can subscribe to their RSVP calendar

---

## Step 1: Import Functions

Add these imports to the top of `src/app/calendar/page.tsx` (around line 8):

```typescript
import { fetchAllRoomEvents, generateRSVPCalendarUrl, ROOMS, CalendarEvent } from '@/lib/google-calendar';
```

---

## Step 2: Add State for Google Calendar Events

Add this state after the existing state declarations (around line 26):

```typescript
const [googleCalendarEvents, setGoogleCalendarEvents] = useState<CalendarEvent[]>([]);
const [showGoogleEvents, setShowGoogleEvents] = useState(true);
const [activeRooms, setActiveRooms] = useState<Set<string>>(new Set());
```

---

## Step 3: Load Google Calendar Events

Modify the `loadWorkshops` function to also load Google Calendar events (around line 38):

```typescript
const loadWorkshops = async () => {
  try {
    // Load database workshops (existing code)
    const response = await fetch('/api/offers');
    const data = await response.json();

    if (data.success) {
      const allWorkshops = data.offers.filter(
        (o: Offer) => o.type === 'workshop' || o.type === '1:1'
      );
      setWorkshops(allWorkshops);

      // Load user's RSVPs (existing code)
      const creds = getStoredCredentials();
      if (creds) {
        const rsvpSet = new Set<string>();
        for (const workshop of allWorkshops) {
          const rsvpResponse = await fetch(`/api/rsvp?offerId=${workshop.id}`);
          const rsvpData = await rsvpResponse.json();
          if (rsvpData.success) {
            const hasRSVP = rsvpData.rsvps.some((r: any) => r.npub === creds.npub);
            if (hasRSVP) {
              rsvpSet.add(workshop.id);
            }
          }
        }
        setUserRSVPs(rsvpSet);
      }
    }

    // NEW: Load Google Calendar events
    const eventRange = new Date();
    eventRange.setDate(eventRange.getDate() + 14); // Next 14 days
    const gcalEvents = await fetchAllRoomEvents(undefined, new Date(), eventRange);
    setGoogleCalendarEvents(gcalEvents);

    setIsLoading(false);
  } catch (err) {
    console.error('Failed to load workshops:', err);
    setIsLoading(false);
  }
};
```

---

## Step 4: Update Filter Logic

Modify the `applyFilters` function to include Google Calendar events (around line 75):

```typescript
const applyFilters = () => {
  // Filter database workshops (existing code)
  let filteredDbWorkshops = [...workshops];

  if (showOnlyRSVPs) {
    filteredDbWorkshops = filteredDbWorkshops.filter((w) => userRSVPs.has(w.id));
  }

  if (activeTags.size > 0) {
    filteredDbWorkshops = filteredDbWorkshops.filter((w) =>
      w.tags.some((tag) => activeTags.has(tag))
    );
  }

  // NEW: Filter Google Calendar events
  let filteredGoogleEvents = showGoogleEvents ? [...googleCalendarEvents] : [];

  if (activeRooms.size > 0) {
    filteredGoogleEvents = filteredGoogleEvents.filter((e) =>
      e.room && activeRooms.has(e.room)
    );
  }

  // Combine and sort by start time
  const combined = [
    ...filteredDbWorkshops,
    ...filteredGoogleEvents.map(e => ({
      id: e.id,
      title: e.title,
      description: e.description,
      type: 'workshop' as const,
      authors: e.organizer ? [e.organizer] : [],
      tags: [],
      status: e.status,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime?.toISOString(),
      room: e.room,
      location: e.location,
      _isGoogleEvent: true // Flag to identify Google events
    }))
  ].sort((a, b) => {
    const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
    const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
    return aTime - bTime;
  });

  setFilteredWorkshops(combined);
};
```

---

## Step 5: Add Room Filter UI

Add this room filter UI after the tag filter section (around line 207, before the View Switcher):

```typescript
{/* Room Filter - NEW */}
<div className="mb-3">
  <p className="text-xs font-medium text-gray-600 mb-2">Filter by room:</p>
  <div className="flex flex-wrap gap-2">
    {ROOMS.map((room) => (
      <button
        key={room.name}
        onClick={() => {
          const newRooms = new Set(activeRooms);
          if (newRooms.has(room.name)) {
            newRooms.delete(room.name);
          } else {
            newRooms.add(room.name);
          }
          setActiveRooms(newRooms);
        }}
        className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition ${
          activeRooms.has(room.name)
            ? 'bg-purple-100 text-purple-800 border-purple-500'
            : 'bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200'
        }`}
      >
        {room.name} {activeRooms.has(room.name) && '✓'}
      </button>
    ))}
  </div>
  {activeRooms.size > 0 && (
    <div className="flex items-center justify-between mt-2">
      <p className="text-xs text-gray-500">
        {activeRooms.size} room{activeRooms.size !== 1 ? 's' : ''} selected
      </p>
      <button
        onClick={() => setActiveRooms(new Set())}
        className="text-xs text-purple-600 hover:text-purple-700 font-medium"
      >
        Clear room filter
      </button>
    </div>
  )}
</div>
```

---

## Step 6: Add Event Source Toggle

Add this toggle after the "All Events" / "My RSVPs" buttons (around line 233):

```typescript
{/* Event Source Toggle - NEW */}
<div className="flex gap-2 mb-3">
  <button
    onClick={() => setShowGoogleEvents(!showGoogleEvents)}
    className={`flex-1 px-4 py-2 text-xs font-medium rounded-lg ${
      showGoogleEvents
        ? 'bg-purple-600 text-white'
        : 'bg-gray-100 text-gray-600'
    }`}
  >
    Official Schedule ({googleCalendarEvents.length})
  </button>
</div>
```

---

## Step 7: Fix Subscribe Link

Replace the placeholder subscribe link (around line 236) with the working implementation:

```typescript
{/* Subscribe Link */}
<div className="text-center">
  <a
    href={generateRSVPCalendarUrl(credentials.npub)}
    download
    className="text-xs text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
    Subscribe to my RSVP calendar
  </a>
</div>
```

---

## Step 8: Add Visual Distinction for Google Events

Modify the workshop card rendering to show different styles for Google Calendar events (around line 290):

```typescript
<a
  key={workshop.id}
  href={workshop._isGoogleEvent ? '#' : `/offers/${workshop.id}`}
  className={`block bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition border-l-4 ${
    workshop._isGoogleEvent ? 'border-purple-500' : 'border-green-500'
  }`}
>
  <div className="flex items-start justify-between mb-2">
    <div className="flex-1">
      {workshop.startTime && (
        <div className="text-sm text-gray-600 mb-1 flex items-center gap-2">
          {new Date(workshop.startTime).toLocaleString()}
          {workshop.room && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-800">
              {workshop.room}
            </span>
          )}
        </div>
      )}
      <h3 className="font-semibold text-gray-900">
        {workshop.title}
        {workshop._isGoogleEvent && (
          <span className="ml-2 text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
            Official
          </span>
        )}
      </h3>
    </div>
    {!workshop._isGoogleEvent && getStatusBadge(workshop, workshop.id)}
  </div>

  {workshop.tags && workshop.tags.length > 0 && (
    <div className="flex flex-wrap gap-2 mt-3">
      {workshop.tags.map((tag) => (
        <span
          key={tag}
          className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded"
        >
          {tag}
        </span>
      ))}
    </div>
  )}
</a>
```

---

## Complete Changes Summary

**Lines Modified**: ~100 lines
**Lines Added**: ~150 lines
**Total Changes**: 1 file modified

**Changes**:
1. ✅ Import Google Calendar functions
2. ✅ Add state for Google events, rooms filter
3. ✅ Load Google Calendar events on mount
4. ✅ Combine database + Google events in filtering
5. ✅ Add room filter UI
6. ✅ Add official schedule toggle
7. ✅ Fix subscribe link with working URL
8. ✅ Visual distinction for Google events (purple border vs green)

---

## Testing Checklist

After integration:

- [ ] Calendar page loads without errors
- [ ] Both database workshops and Google events appear
- [ ] Room filter works correctly
- [ ] Tag filter still works for database workshops
- [ ] "Official Schedule" toggle shows/hides Google events
- [ ] Subscribe link downloads .ics file
- [ ] Google events have purple border, database events have green
- [ ] Google events show room badges
- [ ] Events are sorted by start time
- [ ] "My RSVPs" filter works (shows only database workshops with RSVPs)

---

## Visual Design

**Database Workshops** (existing):
- Green left border
- Tags displayed
- RSVP status badge
- Clickable → workshop detail page

**Google Calendar Events** (new):
- Purple left border
- "Official" badge
- Room name in badge
- Not clickable (no detail page yet)

---

## Alternative: Simpler Integration

If you want a faster integration without all the filters:

**Minimal Changes** (5 minutes):

1. Import: `import { fetchAllRoomEvents } from '@/lib/google-calendar';`
2. Add state: `const [gcalEvents, setGcalEvents] = useState([]);`
3. Load events in useEffect:
   ```typescript
   const events = await fetchAllRoomEvents();
   setGcalEvents(events);
   ```
4. Display below workshops:
   ```typescript
   <div className="mt-6">
     <h3>Official Schedule</h3>
     {gcalEvents.map(e => (
       <div key={e.id}>
         <h4>{e.title}</h4>
         <p>{e.room} - {e.startTime.toLocaleString()}</p>
       </div>
     ))}
   </div>
   ```

---

## Next Steps

After integrating the calendar page:

1. **Test in production** - Verify calendars are publicly accessible
2. **User feedback** - See if combined view is useful
3. **Possible enhancements**:
   - Add detail page for Google events
   - Allow RSVPing to Google events (creates local RSVP)
   - Show room capacity warnings
   - Add timezone selector

---

**Integration Status**: Ready to implement
**Estimated Time**: 15-20 minutes
**Difficulty**: Easy (mostly copy/paste with small adjustments)
