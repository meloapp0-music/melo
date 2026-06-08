# Trip Discovery — "Who's playing where I'm going?"

- Started: 2026-05-21
- Status: in-progress — Phase 1 narrowed to **instant city search** and built
- Last updated: 2026-05-22

## Changes made

- 2026-05-22: **Phase 1 shipped as instant city search** (no `trips`
  table, no geolocation — the fastest slice that solves the Austin
  moment). User confirmed: instant search only, manual city entry
  first, expand the Festivals page → "Discover".
  - `src/web/api.js` — new `fetchEventsByCity(city, opts)`: all music
    events in a city via Ticketmaster Discovery, sorted by date, with
    price ranges (`priceMin/Max/Currency`) + ticket URL + lineup.
    Mirrors `fetchFestivals` minus the festival filter, plus an
    `artist` field from `attractions[0]`.
  - `src/web/pages/Festivals.jsx` → **Discover page**: top-level
    **Shows | Festivals** toggle. Shows = a city search box (prefilled
    with `inferHomeCity`) → results sorted **taste-first** (artists in
    `topArtists(shows,25)` rise to the top with a "🎤 An artist you
    love" badge), each card showing artist · venue · date · price +
    **+ Wishlist** and **Tickets →**. Festivals tab = the prior
    near/anywhere behavior, unchanged.
  - `src/web/pages/Home.jsx` — the CTA relabeled "Discover shows / See
    who's playing in any city". Route key `festivals` unchanged.
  - `src/web/App.css` — `.discover-search` row.
  - No migration, no native dependency, no App Store privacy change.
  - **Deferred** (still planned below): GPS "use my location"
    (`@capacitor/geolocation`), saved `trips` table for advance
    planning (migration 0010), calendar auto-trips, trip notifications.

## Context

User idea (2026-05-21), straight from a real moment:
> "My girlfriend and I are in Austin and we both asked — who's playing
> in Austin this weekend? Melo should do that. People should be able to
> open Melo to see who's playing where, based on the trips they have
> planned or input into the app."

No concert tracker does **"tell me what to see where I'm going."**
That's a genuine wedge — it turns Melo from a *backward-looking* logbook
into a *forward-looking* trip companion. The Austin moment is the
canonical use case: you're somewhere (or going somewhere), you want to
know what live music is happening while you're there, ideally filtered
to artists you'd actually like.

**Most of the infrastructure already exists:**
- `2026-04-20-festivals.md` — the Festivals page already does
  Ticketmaster Discovery by city with a Near Me / Anywhere toggle and a
  "N of your artists playing" taste badge.
- `src/web/api.js` — Ticketmaster Discovery integration; queries support
  `city`, date windows, `classificationName=music`.
- `src/web/lib/geo.js` — Nominatim reverse-geocode already used for
  city resolution.
- A `topArtists` weighting helper already powers the festival taste badge.

User-confirmed scope (2026-05-21):
- **Inputs**: manual trip entry **+** current location ("near me now").
  Calendar sync deferred to a later phase.
- **Filter**: taste-matched shows first, then everything else playing.
- **Placement**: extend the Festivals page into a "Discover" page (no
  new top-level tab).

## Plan

### Schema — `trips`

Migration `0010_trips.sql`:
```sql
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  city text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);
alter table public.trips enable row level security;
create policy "trips_owner_rw" on public.trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists trips_user on public.trips(user_id, start_date);
```

### Data layer — `src/web/lib/db/trips.js`
- `listTrips()`, `createTrip({ city, startDate, endDate })`, `deleteTrip(id)`
- Standard Supabase CRUD, owner-scoped by RLS (mirrors `shows.js`).

### API — `src/web/api.js`
- New `fetchEventsByCity(city, startDate, endDate)`:
  - Ticketmaster Discovery `events.json?city=...&startDateTime=...&endDateTime=...&classificationName=music&sort=date,asc&size=...`
  - Returns the same event shape as `fetchUpcomingEvents` (artist, venue,
    city, date, ticketUrl, lineup)
- **Taste ranking**: reuse the existing `topArtists`/weighting helper —
  partition results into "features an artist you've logged or rated 7+"
  vs "everything else", surface matches first.

### Geolocation — "near me now"
- Add **`@capacitor/geolocation`** (not currently a dependency) for
  native location on iOS; falls back to `navigator.geolocation` on web.
- Flow: get coords → Nominatim reverse-geocode to a city (reuse
  `geo.js`) → `fetchEventsByCity(city, today, +3 days)` for "this
  weekend".
- Requires the iOS location-permission key in `Info.plist` +
  `npx cap sync`.

### UI — Festivals → "Discover" page (`src/web/pages/Festivals.jsx`)
Expand the existing page into three stacked sections:
1. **Near you** — current-location events for the next few days
   (location-permission prompt the first time).
2. **Your trips** — list of saved trips; tapping one shows concerts
   during its date range. "+ Add trip" opens a city + date-range
   picker (reuse the existing date input + `CITIES` autocomplete from
   LogShow).
3. Each event row: artist · venue · date, a taste badge when it
   matches, **"+ Wishlist" / "+ Going"** actions (reuse the existing
   Going-tier one-tap add), and a Ticketmaster ticket link.
- Taste-matched events render first under each section; "Everything
  else playing" collapsible below.

### Phasing
1. **Phase 1 (this initiative)**: trips table + manual trip entry +
   near-me-now geolocation + `fetchEventsByCity` + taste-first display
   in the Discover page.
2. **Phase 2 (deferred)**: **calendar sync** — auto-detect trips from
   phone-calendar events that have a city/location, using the already-
   installed `@ebarooni/capacitor-calendar` plugin + `ImportFromCalendar.jsx`.
3. **Phase 3 (deferred)**: **trip notifications** — "Your Austin trip
   is in 2 weeks — 3 of your artists are playing." Ties into
   `2026-05-05-notifications-system.md`.

## Changes made

_Pending — planning only._

## Open questions / follow-ups

- **Roadmap slot.** Headline-worthy and pairs thematically with
  Wishlist Watching (v1.2) — both are forward-looking discovery. Could
  ship together as a "Discover" release or be its own. User to slot.
- **Geolocation dependency.** Adding `@capacitor/geolocation` means a
  native rebuild + a new App Store privacy declaration ("Location →
  used to find nearby events, not linked to identity, not tracking").
- **User-requested "near a venue → who's playing" (2026-05-22).** A user
  suggested location pushes. Take the **foreground** version — open the
  app → use current location → show who's playing nearby (this is the
  GPS "near me now" phase already planned above). Do NOT pursue the
  **background-geofence** version ("ping me when I walk near a venue"):
  background/Always location is the most privacy-sensitive iOS
  permission, drains battery, and draws heavy App Store scrutiny for a
  concert tracker. Foreground = ~80% of the value at ~10% of the cost.
  Background geofencing is a someday-maybe, not near-term.
- **Ticketmaster coverage.** Discovery API is strong for ticketed
  venues but misses small DIY/club shows and some festivals. Acceptable
  for v1; note as a known gap. Bandsintown would fill it but they
  locked their public API (see `2026-04-19-wishlist-and-detail-fixes.md`).
- **Trip date-range vs "weekend" shorthand.** "This weekend" = today →
  next Sunday. Confirm the exact window for the near-me default.
- **Cross-links**: `2026-04-20-festivals.md` (the page being extended),
  `2026-05-05-recommendations.md` (taste matching deepens this over
  time), `2026-05-11-wishlist-watching.md` (sibling discovery feature),
  `2026-05-05-notifications-system.md` (Phase 3 trip alerts).
