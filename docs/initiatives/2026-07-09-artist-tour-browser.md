---
name: artist-tour-browser
description: Real user feedback — searching an artist should show their whole upcoming tour (any city), not just the top few near you. New "Full Tour" mode on Going/Wishlist, multi-select, reuses the Festival-picker plumbing.
type: project
---

# Artist Tour Browser (Full Tour mode)

- Started: 2026-07-09
- Status: shipped
- Last updated: 2026-07-09

## Context
Real user feedback: "when they search noah kahan they want to see the next
__ months of shows." Verified in code: today, typing an artist under Going/
Wishlist already fetches up to 50 upcoming shows via `fetchUpcomingEventsMulti`
(Ticketmaster + JamBase merged, small-venue-aware since
[[artist-tracking-anywhere]]), but the UI caps the dropdown at 8 results and
mixes it into a small inline autocomplete meant for "pick one show fast," not
"browse the whole tour."

Confirmed with the user (AskUserQuestion) before building:
- **Scope**: whole tour, any city (not just their home city) — a fan may
  travel, or just wants the full picture before picking a date.
- **Selection**: multi-select + add several at once, reusing the exact
  pattern already proven out for the Festival picker.
- **Placement**: a dedicated, richer browsing view — not just an expanded
  dropdown — since a real tour can have 20-30 dates.

## Plan
- New "Full Tour" mode on the Going/Wishlist tabs (mirrors Attended's
  Quick log / Festival / Past show mode-toggle) — Going/Wishlist gets
  Quick log / Full Tour.
- `runTourSearch(artist)` — one `fetchUpcomingEventsMulti(artist)` call, NO
  city filter (per the "whole tour" decision), any-city results sorted by
  date, feeding the SAME `finderResults`/`finderSelected`/`toggleResult`/
  `logSelected` state and multi-select UI already built for festivals — no
  new list/checkbox component needed.
- `finderResultsBlock` (shared render, used by Festival/Past-show/Tour) made
  source-aware for the 3 new copy branches: empty-state message, the
  '__individual__' group header ("Upcoming shows" for tour vs "Individual
  shows" for past-show), and the attribution line ("Powered by Ticketmaster +
  JamBase"). Also fixed a latent gap: the row date fell back to nothing for
  rows without Setlist.fm's `displayDate` field — now falls back to
  `formatDate(r.date)` for tour rows.
- **Generalized `logSelected`**: it hardcoded `status: SHOW_STATUS.ATTENDED`
  (harmless before, since only Attended's Festival/Past-show modes used it) —
  now uses the live `status`, since Tour mode calls the same function from
  Going/Wishlist. Submit button label + success toast now say "Add N to
  Wishlist/Going" vs "Log N shows" depending on which status tab is active.
- **Caught in review**: Attended's modes (`quick`/`festival`/`finder`) and
  Going/Wishlist's (`quick`/`tour`) share one `logMode` state but aren't
  valid across each other — leaving Attended in `festival` mode and
  switching to Wishlist would show NEITHER of Wishlist's own tabs as
  selected (though the correct Quick-log content still rendered, via the
  `showQuick` fallback-by-elimination). Fixed with a new `switchStatus()`
  helper that resets `logMode` to `'quick'` on every status change; the 3
  status-tab buttons now call it instead of raw `setStatus()`.

## Security spine
No new tables/endpoints — reuses `fetchUpcomingEventsMulti` (already
security-reviewed for [[artist-tracking-anywhere]]) and the existing
`addShows` batch path.

## Changes made
- 2026-07-09: Built and verified. `LogShow.jsx`: `tourArtist` state,
  `runTourSearch`, `showTour` gate, `switchStatus` helper (+ the 3 status
  buttons rewired to it), `logSelected` generalized to the live `status`,
  `finderResultsBlock`'s 3 copy branches + date fallback made source-aware.
  Production build clean, zero console/server errors on reload. Not
  click-tested on a signed-in device (preview is behind login) — worth a
  real test: Log Show → Going or Wishlist → Full Tour → search a touring
  artist → confirm dates load, multi-select works, and the toast/status
  reads correctly.

## Open questions / follow-ups
- No date-range cutoff — shows whatever Ticketmaster/JamBase return (TM's
  existing cap is ~50 events for a no-city query). Revisit if a heavy
  tourer's list feels too long to scroll.
- Tour-mode results aren't grouped by city/month — a flat chronological
  list. Could add lightweight grouping if a 20+ date list feels unwieldy in
  practice.
