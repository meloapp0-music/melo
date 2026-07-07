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

## Open questions / follow-ups
- Notification-triggered `logPrefill` always targets Wishlist, never Going —
  reasonable default (you're being told about something new, not confirming
  you already have tickets), but worth revisiting if it feels wrong in practice.
- The festival-self-name filter is a normalized-string match — if a real act
  is ever named identically to a festival (unlikely), it'd be incorrectly
  filtered. Acceptable tradeoff given the alternative (fake headliner rows).
