# v1.0.7 — Festival & Past-Show Finder

- Started: 2026-05-21
- Status: in-progress (v1.0.7 — pulled ahead of Wrapped Depth)
- Last updated: 2026-05-21

## Context

A user churned over this exact friction: logging a **past show,
especially from a festival, is too hard.** His example — "I saw Noah
Kahan at Extra Innings Festival in Tempe AZ a couple years ago" — he
couldn't find it, got annoyed, and quit the app.

Root cause (confirmed in code): the LogShow autocomplete is
**100% artist-driven**. `fetchSetlists()` returns `[]` without an
`artistName`, and the search effect only fires once you type 2-3 chars
of an artist; city/year are secondary filters only. So if you remember
the festival/city/year but not each act — or you saw 10 acts and don't
want to type each one individually — there's no path.

The unlock: Setlist.fm's `/search/setlists` accepts
`cityName` + `year` + `venueName` with **no artist at all**, and we
already extract festival names (`extractFestivalFromSetlist`). We just
never exposed a location-first search. This also delivers the user's
second ask ("log a past festival show and it auto-fills") for free —
the festival auto-fills on every logged show.

Confirmed decisions (2026-05-21): **multi-select** (log many acts at
once), **dedicated "Find a past show" mode** on the Attended tab,
**priority = v1.0.7** (Wrapped Depth bumped to v1.0.8).

## Plan

### API — `searchPastShows({ city, year, venue })` (`src/web/api.js`)
- `setlistfm-proxy` → `search/setlists` with `cityName`/`year`/
  `venueName`, no `artistName`. At least one param required.
- Fetch up to 3 pages (festivals span many acts; 20/page).
- Map with the same setlist mapper as `fetchSetlists` +
  `festival: extractFestivalFromSetlist(s)`. Dedupe by
  `artist+date+venue`.

### Batch create
- `createShows(shows, userId)` in `shows.js` — single
  `insert(rows).select()`, returns `fromRow`-mapped. Mirrors
  `createShow`.
- `addShows(showsArray)` ctx helper in `App.jsx` — mirrors `addShow`
  but batch; prepends all to state.

### LogShow — "Find a past show" mode
- Attended-tab toggle: **[ Quick log ] [ Find a past show ]**.
- Finder inputs: City (reuse `CITIES` autocomplete), Year, optional
  Venue + Festival filter; a deliberate Search button.
- Results grouped by festival → date; festival headers with "Select
  all"; rows are tappable checkboxes (artist · venue · date · songs).
- Sticky "Log N shows" → builds attended payloads (festival + setlist
  auto-filled, score/vibes blank) → `addShows` → toast → close.

### Schema
None — reuses existing `shows.festival`.

## Changes made

- 2026-05-21: Initiative created. Pulled ahead of Wrapped Depth per
  user (retention fix > polish).

## Open questions / follow-ups

- City-vs-metro mismatch (Tempe vs Phoenix) — mitigate with venue
  search; note as known edge.
- 3-page depth (~60 results) covers most festivals; add "load more"
  if users hit the ceiling.
- Small/DIY festivals sparse on Setlist.fm → manual quick-log remains
  the fallback.
- Cross-link `2026-05-21-trip-discovery.md` (shares city+date search
  plumbing) and `2026-04-20-festivals.md`.
