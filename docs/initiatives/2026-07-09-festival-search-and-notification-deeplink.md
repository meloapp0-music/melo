---
name: festival-search-and-notification-deeplink
description: Two real user reports — (1) can't search an upcoming festival (e.g. Windy City Smokeout) from Wishlist to see its day-by-day lineup, and (2) tour/genre notifications didn't take them anywhere useful, just Home.
type: project
---

# Festival search on Wishlist/Going + notification deep-linking

- Started: 2026-07-09
- Status: shipped
- Last updated: 2026-07-09

## Context
Two pieces of real user feedback in one message:
1. "I should also be able to search festivals [in Wishlist] — e.g. Windy City
   Smokeout — and it'll show me the day by day lineup."
2. "My notifications that I just got didn't take me anywhere. Just to the
   home page, not to the notification artist page to get tickets."

## Part 1 — Festival search on Wishlist/Going
`searchFestivalByName` (built in [[artist-tracking-anywhere]]/the festival
finder work) was already general enough to handle UPCOMING festivals — its
Ticketmaster branch pulls real future events, not just past Setlist.fm data —
but the UI only exposed "Festival" mode on the Attended tab. Verified live
against Ticketmaster: **Windy City Smokeout resolves correctly** (real
2026-07-08 through 07-12 dates at United Center, Chicago, with full daily
lineups — Hootie & the Blowfish, Lainey Wilson, Jordan Davis, Blake Shelton,
etc.) — confirming the underlying search already works for this exact
example without new data-source work.

One real bug found during that live check: Ticketmaster lists a "thin"
duplicate event per day (a GA/VIP ticket listing) whose ONLY attraction is
the festival's own name — without a filter, "Windy City Smokeout" would
appear as a fake headliner alongside the real acts. Fixed in
`searchFestivalByName` by excluding any attraction whose (normalized) name
matches the festival label itself.

Shipped:
- `showFestival` now available on `isAttendedTab || isFutureTab` (was
  Attended-only).
- Going/Wishlist mode-toggle gains a "Festival" button (now: Quick log /
  Festival / Full Tour), matching Attended's Quick log / Festival / Past show.
- Festival-mode hint copy is tense-aware ("acts you want to catch" /
  "add them all at once" vs "acts you saw" / "log them all at once").
- The Quick-log inline "🎪 Find this festival's lineup" convenience (typing a
  festival name in the Festival field without switching tabs) now works on
  Going/Wishlist too, not just Attended.

## Part 2 — Notification deep-linking
Found the actual bug: `App.jsx`'s push-tap handler already had SOME
deep-linking for `tour_alert`/`city_match` (a tappable "get tickets" toast),
but **`genre_alert`** — the notification kind added this session in
[[genre-based-notifications]] — was never added to that check. A genre-alert
tap fell through every condition and hit a bare no-op, landing the user on
whatever tab was already showing (Home) with literally nothing else
happening. This is almost certainly what the user hit, since genre alerts
just started firing.

Beyond the missing kind, a toast alone doesn't really satisfy "take me
somewhere" — it can be missed and vanishes in 8s. Upgraded the destination:
tapping a tour/city/genre alert now opens a NEW `logPrefill` mechanism that
launches LogShow straight into Wishlist's Full Tour view (the mode built in
[[artist-tour-browser]]), pre-searched for that artist — a real screen
showing every upcoming date, not a toast — while the tappable "get tickets"
toast still layers on top as the fast direct-purchase path.

- `LogShow` accepts a new `prefill` prop (`{ status, mode, tourArtist }`),
  applied to its initial `status`/`logMode`/`tourArtist` state and auto-runs
  the tour search once on mount — ignored while `editingShow` is set.
- `App.jsx`: new `logPrefill` state, passed through to `<LogShow>`; the
  push-tap handler now covers `genre_alert` too, and constructs the prefill
  from `pushNav.artist` before (or instead of, if no ticket URL) falling back
  to the old Festivals-tab landing.

## Security spine
No new tables/endpoints — reuses `searchFestivalByName` (already reviewed)
and the existing push-notification data payload; `logPrefill` is pure
client-side UI state.

## Changes made
- 2026-07-09: Built and verified both parts. `api.js`: festival-self-name
  filter in `searchFestivalByName`'s lineup collection, verified live against
  Ticketmaster's real Windy City Smokeout listing (confirmed the duplicate
  thin-event issue and the fix). `LogShow.jsx`: Festival mode extended to
  Going/Wishlist, tense-aware copy, `prefill` prop + mount-time auto-search.
  `App.jsx`: `logPrefill` state + render wiring, `genre_alert` added to the
  push-tap kind check, real-screen landing via `logPrefill` alongside the
  existing tickets toast. Production build clean, zero console/server errors
  on reload. Not click-tested on a signed-in device (preview is behind
  login) — worth testing for real: search "Windy City Smokeout" from
  Wishlist → Festival mode, and (harder to test without a live push) confirm
  a genre/tour-alert tap opens the Full Tour view pre-searched.

## Follow-up fix (same day)
User reported the Windy City Smokeout search itself was returning "a bunch of
past shows and artists/bands that aren't even remotely close to being a part
of" the festival, and asked for Wishlist/Going to only ever show future
shows. Root-caused precisely (not guessed) by re-reading the actual function:

1. **The real bug**: `searchFestivalByName`'s venue-based Setlist.fm branch
   had NO filter against the Ticketmaster-confirmed lineup — only the
   city-fallback branch did. Windy City Smokeout resolves to venue = "United
   Center," a massive shared arena hosting hundreds of unrelated concerts a
   year, so the unfiltered venue search pulled in every unrelated artist
   Setlist.fm has ever logged there. Fixed by applying the same
   lineup-confirmed filter to the venue branch too — whenever we have a
   Ticketmaster-verified lineup, ALWAYS restrict Setlist.fm rows to just
   those artists, regardless of which branch (venue or city) found them.
2. **The future-only ask**: added a `futureOnly` option to
   `searchFestivalByName` — when set, drops any row without a real date >=
   today (covers both stale Setlist.fm rows from a prior year's edition and
   any dateless edge case). `LogShow.jsx`'s `runFinder` now passes
   `futureOnly: isFutureTab`, so Festival search on Wishlist/Going is
   future-only while Attended's festival search is untouched (still wants
   past editions, since you're logging what you saw).

Note: Quick-log's artist search and the Full Tour mode were NOT part of this
bug — their data sources (Ticketmaster Discovery, JamBase) are inherently
upcoming-only by construction. Only `searchFestivalByName`'s Setlist.fm
fallback could leak past/unrelated data, since Setlist.fm is a past-shows-only
database with no concept of "upcoming."

Verified: production build clean, zero console/server errors. Could not
re-run the live Windy City Smokeout check end-to-end from here (the
Setlist.fm half goes through `setlistfm-proxy`, which requires an
authenticated session) — the fix is grounded in directly reading and
correcting an objective asymmetry in the code (one branch filtered, the
sibling branch didn't), not a guess. Worth a real re-test on device.

## Follow-up (2026-07-10): live festival autocomplete + Select/Deselect all
User: "I want Windy City Smokeout to autofill when I type it in Festivals …
how can we make it so … every single festival autofills. Also if I select all,
I should be able to deselect all."

- **Live festival-name autocomplete.** The `FestivalAutocomplete` only filtered
  the curated ~19-name `FESTIVAL_NAMES` list, so anything off that list (Windy
  City Smokeout and the long tail) never suggested. Added
  `searchFestivalNames(query)` in api.js — a keyword search against TM's
  Festival classification (Music segment) that dedupes multi-day/ticket-type
  events into clean base names. The autocomplete now shows curated matches
  instantly (they also cover big fests TM doesn't list as on-sale, e.g.
  Coachella) then merges debounced live TM matches. Verified live: "windy" →
  "Windy City Smokeout". **Important:** TM keyword search is fuzzy (a search
  for "riot" returned Nocturnal Wonderland / Bass Canyon — no "riot" in them),
  so `searchFestivalNames` filters live results to only names that actually
  contain the query, preventing wrong suggestions. Selecting a name still
  resolves through the (already-fixed) `searchFestivalByName`, which handles
  any TM-listed festival.
- **Select all → Deselect all.** The group header button was add-only. Now
  `toggleAllInGroup` + `groupAllSelected`: when every row in a group is
  selected the button reads "Deselect all" and clears them; otherwise "Select
  all". Applies to festival lineups AND tour results (shared finder block).

## Open questions / follow-ups
- Live festival autocomplete inherits substring matching — an abbreviation like
  "ACL" won't surface "Austin City Limits" (pre-existing; curated list is also
  substring-based). Fine for now.
- Notification-triggered `logPrefill` always targets Wishlist, never Going —
  reasonable default (you're being told about something new, not confirming
  you already have tickets), but worth revisiting if it feels wrong in practice.
- The festival-self-name filter is a normalized-string match — if a real act
  is ever named identically to a festival (unlikely), it'd be incorrectly
  filtered. Acceptable tradeoff given the alternative (fake headliner rows).
