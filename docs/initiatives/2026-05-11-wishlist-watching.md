# Wishlist Watching — "Notify me when [artist] announces [city]"

- Started: 2026-05-11
- Status: planned (v1.2 headline feature, ~2 weeks — shifted from v1.1 to make room for Dark Mode as v1.1 headline)
- Last updated: 2026-05-11

## Context

Asked by user (2026-05-11):

> "Users should be able to add shows to their wishlist that aren't
> announced yet, and when they do get announced, then the user gets
> notified. So if I want to see Goose in Chicago, but there's no
> show scheduled, I should be able to put it in the wishlist and
> then the app will notify me when they announce it and where to
> get tickets."

This is the natural evolution of Wishlist. Today Wishlist requires
the user to pick from REAL announced shows in the LogShow autocomplete
(Ticketmaster Discovery API results). If the artist isn't currently
touring through their city, they can't add anything.

Adding "watches" (artist + optional city, no specific show required)
turns the app into a tour-tracker, not just a tracker for past shows.
And the moment a match lands, push notification fires → instant
re-engagement loop. Mature apps that nail this (StubHub, Bandsintown)
build their entire retention play around it.

This feature also extends infrastructure that's already live:
- `tour-alerts` Edge Function (daily cron) already polls Ticketmaster
  for tour announcements per the user's highly-rated artists
- Push notifications (APNs via .p8) already shipped in
  `2026-04-20-pre-launch-sprint.md`
- Wishlist UI already exists

We're extending, not building from scratch.

## Plan

Keep Watching as a SIBLING to Wishlist, not a merge. Different mental
models, different intents:

- **Wishlist** (today) = "I want tickets for this specific announced
  show."
- **Watching** (new) = "I want any show in this city for this artist,
  whenever it gets announced."

Same screen, two tabs at the top.

### Schema

Migration `0009_wishlist_watches.sql` (number subject to migration
order at ship time):

```sql
create table if not exists public.wishlist_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  artist text not null,
  city text,                          -- nullable; null = anywhere
  region text,                        -- optional, e.g. "Northeast US"
  radius_miles integer default 50,    -- fuzzy city match radius
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz,           -- when the cron found a match
  fulfilled_show_id uuid references public.shows on delete set null,
  notified_at timestamptz             -- prevents duplicate push
);

create index if not exists watches_user on public.wishlist_watches(user_id);
create index if not exists watches_artist on public.wishlist_watches(lower(artist));

alter table public.wishlist_watches enable row level security;
create policy "watches_select_own" on public.wishlist_watches
  for select using (user_id = auth.uid());
create policy "watches_insert_own" on public.wishlist_watches
  for insert with check (user_id = auth.uid());
create policy "watches_update_own" on public.wishlist_watches
  for update using (user_id = auth.uid());
create policy "watches_delete_own" on public.wishlist_watches
  for delete using (user_id = auth.uid());
```

Existing `shows` table stays untouched. Watches are not shows yet.

### UX

**Entry points** (two, both natural):

1. **From LogShow autocomplete miss state.** When the user is in the
   Wishlist tab and the autocomplete returns zero results for their
   "Goose Chicago" query, render a fallback button:
   `+ Watch for Goose in Chicago →`
   Converts "no results" from a dead end into a feature surface.

2. **From the Wishlist page itself.** Add a tab toggle at the top:
   `Wishlist | Watching`. On the Watching tab, a small `+ Add Watch`
   button in the header opens a sheet:
   - Artist (autocomplete against Deezer/MusicBrainz so the name is
     canonical)
   - City (optional; geocoded via the existing `geo.js` helpers)
   - Radius slider (25 / 50 / 100 mi, default 50)
   - "Anywhere" toggle (skip city/radius entirely, just watch the
     artist globally)

**Watch list view** (the Watching tab):

```
┌───────────────────────────────────────┐
│ Goose                                 │
│ Chicago · within 50 mi · watching     │
│ since Apr 14                          │
├───────────────────────────────────────┤
│ Phoebe Bridgers                       │
│ anywhere · watching since Mar 2       │
├───────────────────────────────────────┤
│ Dead & Company                        │
│ Las Vegas · within 25 mi · 🟢 last    │
│ match: 2 weeks ago                    │
└───────────────────────────────────────┘
```

Tap a watch → bottom sheet with edit/delete + history of past
matches.

**Fulfilled state** — when a match fires:
- Watch stays in the list with a fulfilled indicator + the matched
  show ID
- User can clear it (watch is gone) or keep watching (multi-match
  mode, e.g., user wants every Chicago show)

### Edge Function — `tour-alerts` enhancement

The existing `tour-alerts` cron (daily) already polls Ticketmaster
for new tour announcements per highly-rated artists. Extend it:

1. **Aggregate watches by artist** (not per watch). One Ticketmaster
   call per unique artist across all users — covers everyone watching
   that artist at once. Massive API cost saving.

2. **Diff against last run's seen-events set** (stored in a small
   `seen_events` table keyed by `event_id`). Anything new = candidate
   match.

3. **For each new event**, check which watches match:
   - Artist matches → candidate watch
   - If watch has a city + radius: compute haversine distance from
     watch.city → event.venue.city. Within radius = hit.
   - If watch has no city ("anywhere"): every announcement is a hit.

4. **Fire push notification** to user with the event's deep link to
   ticket purchase. Mark watch.fulfilled_at + watch.notified_at.

5. **Dedupe across tours.** If Goose announces a 10-city Midwest run
   on the same day and 8 of those cities match a single user's
   watches: send ONE push that lists the 8 cities in the body, not 8
   pushes. Group by `(user_id, artist, announced_today)`.

### API rate limit math

Ticketmaster free tier: 5,000 req/day.

- Per artist polled once daily = 1 req
- 1,000 active users × avg 5 unique artists each = 5,000 unique
  artists at the worst case
- BUT artists are shared across users (Goose is watched by many) so
  unique artists across the fleet is closer to ~500-800 at any scale
- → ~500-800 req/day for the watch cron, leaves ~4,000 req/day for
  Discovery API + Festivals + LogShow autocomplete

This sustains us up to ~10k MAU. Beyond that, switch to bulk
endpoints (Bandsintown's "events for artist list" if they bring
back partner access) or pay for Ticketmaster's higher tier (~$300/mo
for 50k req/day).

### Notification copy

Headline:
`Goose just announced Chicago — Aug 14, 2026`

Body (single match):
`Tickets on sale Friday at 10am · United Center`

Body (multi-city match):
`8 new shows including Chicago, Detroit, Minneapolis. Tap to see all.`

Tap → deep link to the show on Melo (which has the venue page link +
ticket purchase URL).

## Gotchas

1. **Ticketmaster rate limit at scale.** Mitigated by per-artist
   aggregation (above). Monitor in production; switch to bulk
   endpoint or paid tier if we approach 80% of cap.

2. **Fuzzy city matching.** "Chicago" should match Aurora, Schaumburg,
   etc. Use haversine within the user-selected radius (default 50mi).
   Tunable per watch.

3. **Notification fatigue.** Big tour announcements = 20+ cities at
   once. Dedupe by `(user_id, artist, announce_date)` so one push
   covers the whole tour, not 20.

4. **Stale watches.** Watches with no match for 6+ months feel like
   dead entries. Add a passive `since X months ago` indicator. After
   12 months, optional nudge: "still want this? expand radius?" No
   auto-deletion — watches should persist as long as the user wants.

5. **Festival false-matches.** When Goose plays Bonnaroo and a user
   has a "Goose Nashville" watch (Bonnaroo is in Manchester TN, 1hr
   from Nashville). With 50mi radius default this doesn't match. With
   100mi it might. The user can tighten radius per watch. Document
   this in the +Add Watch UX so it's not a surprise.

6. **Artist name disambiguation.** "John Williams" (composer) vs
   "John Williams" (guitarist). Solve via the canonical artist
   autocomplete (Deezer / MusicBrainz) at watch creation — store the
   canonical artist ID, not free text.

7. **Privacy.** Watches are private to the user. RLS enforces it.
   Don't surface "watched by N users" anywhere — that's a leak.

## Phases within v1.1

Build order:

1. **Phase 1 — Schema + manual creation flow.** Migration, RLS, the
   `+ Add Watch` sheet UI. Users can create watches but nothing
   notifies yet.

2. **Phase 2 — Watching tab UI.** Tab toggle on Wishlist page, watch
   list with state, edit/delete sheet.

3. **Phase 3 — `tour-alerts` extension.** Per-artist aggregation,
   diff vs `seen_events` table, push notification fire path. Test
   on the user's own watches end-to-end before production rollout.

4. **Phase 4 — LogShow integration.** When autocomplete returns zero
   results, show the `+ Watch for [artist] in [city]` fallback.

5. **Phase 5 — Polish.** Notification copy refinement, multi-match
   dedupe, "still watching" indicator after 6 months.

## Changes made

_Pending — work starts after v1.0.4 ships and v1.0.5 (favorites +
trimmed vibes) is in flight._

## Open questions / follow-ups

- **Pricing data in the push.** Currently the notification copy
  doesn't include price ("Tickets on sale Friday at 10am" implies
  not yet on sale). When tickets ARE on sale, should we surface the
  current price floor? Risk: prices change fast, push becomes stale.
  Lean: just say "Tickets available — tap for current prices."
- **Multi-artist watches.** "Notify me when ANY of [Goose, Phish,
  Disco Biscuits] play Chicago." Not in P1 — single artist per
  watch ships first. Multi-artist would need a different schema.
- **Sharing watches.** "My friend wants Goose in Boston too" — could
  build a "share watch" feature once buddies-phase-2 lands. Not in
  P1.
- **Cross-link with `2026-05-05-notifications-system.md`** — that
  initiative covers the broader notification inbox + non-watch
  notification types. This file is just the Watching feature.
- **Cross-link with `2026-05-05-recommendations.md`** — the
  Recommendations engine's Tier 1 taste profile could auto-suggest
  watches based on user listening data ("you've rated Goose 9.5
  twice — want to watch for them in your city?"). Defer to v1.2.
- **Cross-link with `2026-04-20-pre-launch-sprint.md`** — the APNs
  + Edge Function infrastructure built there is what this initiative
  builds on. No new push setup required.
