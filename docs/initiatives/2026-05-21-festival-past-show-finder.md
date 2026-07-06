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
- 2026-05-21: Built — `searchPastShows` API, `createShows`/`addShows`
  batch helpers, `mapSetlistRow` shared mapper, and the "Find a past
  show" mode in LogShow (city/year/venue search, festival grouping,
  multi-select, "Log N shows").
- 2026-05-21: Enhanced per user feedback — city+year alone was too
  broad ("Phoenix 2023" returns hundreds). Added an **Artist** field
  to the finder (Setlist.fm `artistName` param in `searchPastShows`),
  so any combination of artist / city / year / venue narrows results.
  Reframed the finder from festival-specific to **any past show**
  (copy + the artist field). Festival auto-fill confirmed working:
  results group by festival and each logged show carries its festival
  (both the finder payload and quick-log `pickShow` already set it).
- 2026-06-30: New user ask — **festival-NAME-first autofill**: type "Electric
  Forest" → the whole festival pops up (who played, what day) and auto-fills as
  the festival. Today the LogShow autocomplete is artist-first (`fetchSetlists` /
  `fetchUpcomingEvents`), and picking a show fires `fetchCoActs(venue,date,headliner)`
  → that's why typing "GriZ" surfaced the festival's openers. The finder is
  city/year/venue/artist — there is **no festival-name entry**.
  Feasibility (verified 2026-06-30): **no single API returns "festival name → daily
  lineup."** Setlist.fm has NO festival search (festivals "not part of the API";
  `isFestival`/`festivalName` are read-only result fields). Feasible path =
  **Ticketmaster Discovery keyword search** ("Electric Forest" → festival event +
  `attractions` = the lineup; we already extract this in `fetchFestivals` /
  `fetchUpcomingEvents`) → resolve the festival's venue + year → seed
  `searchPastShows({venue, year})` on Setlist.fm → group by date for per-day acts +
  setlists → reuse the existing multi-select "Log N shows" UI. Caveats: TM per-day
  splits are inconsistent; Setlist.fm day data is sparse for small acts and fills in
  over ~1-2 weeks after the fest; great for big fests (Electric Forest), thin for tiny
  ones (manual quick-log stays the fallback). Status: scoped, not built.
- 2026-06-30: **Built festival-name autofill** (`searchFestivalByName` in `api.js` +
  a "Festival" field at the top of the finder in `LogShow.jsx`, routed through the
  existing multi-select/batch-log UI). Key finding during testing: **Ticketmaster
  Discovery is the WRONG primary source** — it's upcoming-events-only and fuzzy
  (a live curl for "Electric Forest" returned "Electric Callboy" in Brussels, and no
  Electric Forest, since the fest just ended and dropped off TM). So the design changed:
  primary = a **curated `FESTIVAL_VENUES` map** (festival → venue/city Setlist.fm files
  it under; ~19 major fests seeded) → `searchPastShows(venue|city, year)` for the real
  per-day setlists; TM demoted to a **strict-name-match bonus** (never a fuzzy fallback)
  for upcoming/unmapped fests. Rows stamped with the festival label so the finder groups
  them. **Verification status:** code compiles, app boots clean (no runtime errors), and
  the TM limitation is proven. **NOT verified end-to-end:** the Setlist.fm half — the
  `setlistfm-proxy` Edge Function requires an authenticated session (`invalid session`
  on anon calls), so the "Electric Forest → Rothbury → acts" path needs a **signed-in
  device/TestFlight test**. The curated venue/city strings are best-effort and must be
  tuned against Setlist.fm's real naming during that test.
- 2026-07-01: **Verified working end-to-end** — user tested on a signed-in build:
  "Electric Forest" resolved to Double JJ Ranch / Rothbury and pulled the real 2026
  lineup (Bob Moses, Chris Lake, LSDREAM, Qrion…); "Select all" logged 60. So the
  Setlist.fm half is confirmed; the curated `Rothbury` city entry matched.
  User feedback → **festival-as-one-outing** work (new): (1) logging 60 acts tanked the
  Home **avg score to 2.8** (60 unrated shows counted as zeros); (2) My Shows showed 60
  separate cards; (3) wants ONE festival rating, not to rate 60 acts.
  Built (2026-07-01): a shared `groupIntoOutings()` helper in `store.js` — collapses
  shows sharing a `festival` into one "outing" whose score is the AVERAGE OF THE RATED
  ACTS (unrated acts contribute nothing). Wired into `Home.jsx` (Shows stat now counts a
  festival as 1; avg averages only rated OUTINGS → fixes the 2.8) and `MyShows.jsx` (a
  festival renders as ONE card — "🎪 N acts" — that taps to expand its acts inline; grid +
  list). Compiles clean, boots with no errors; **UI not click-tested (behind auth)** —
  needs the user's signed-in verification. Rating model = derive from the standout acts
  you rate (so you rate a few, not 60); an explicit single "rate the whole festival"
  control is the offered next step. Still open: user's "it should be in Attended too"
  (ambiguous — festival search is under Attended→Find a past show; awaiting clarify).
- 2026-07-01: User confirmed the grouping + avg fix work ("test is good"), and clarified
  "in Attended too" = be able to type a festival in **Quick log** and pull its lineup.
  Built the bridge: a "🎪 Find this festival's lineup →" button under the Quick-log
  Festival field (Attended tab only) that jumps into the finder with that festival — and
  the quick-log date's year — pre-searched. `runFinder(override)` now accepts an override
  so the search fires without waiting on async state; the finder Search button calls
  `runFinder()` (no event arg). Compiles clean, boots with no errors.
- 2026-07-01: User pushed back — didn't want the button to *switch screens* to the
  finder. Reworked to render the lineup **inline inside Quick log**: extracted the
  finder's results UI into a shared `finderResultsBlock` used by both the "Find a past
  show" finder and, now, inline under the Quick-log Festival field (`inlineFestival`
  state; `pullFestivalLineup` runs the search without changing `logMode`). No screen
  switch — type a festival in Quick log, tap the button, results appear in place to
  multi-select + "Log N shows". Compiles clean, boots with no errors.
- 2026-07-01: Festival entry point was still buried in the Quick-log "Festival" field.
  User chose (AskUserQuestion) **"both — a dedicated Festival tab AND a smart field."**
  Built: (1) the Attended mode toggle is now **3 tabs — Quick log · Festival · Past show**
  (`switchMode()` clears stale results between modes); (2) a **Festival tab** (festival-
  first: `FestivalAutocomplete` + year → pull lineup → the shared `finderResultsBlock`);
  (3) a **`FestivalAutocomplete` dropdown** (suggests from a new `FESTIVAL_NAMES` export in
  `api.js`, mirrors the city/venue autocomplete) used both in the Festival tab AND as the
  Quick-log Festival field — picking a suggestion pulls the lineup inline. Cleaned the
  "Past show" finder back to a general artist/city/year/venue search (removed its festival
  field; its Search calls `runFinder({festival:''})` to force the general path). Compiles
  clean, boots with no errors. **Not click-tested (auth)** — flag: the 3-button mode
  toggle's fit/wrap should be eyeballed on device.

## Open questions / follow-ups

- City-vs-metro mismatch (Tempe vs Phoenix) — mitigate with venue
  search; note as known edge.
- 3-page depth (~60 results) covers most festivals; add "load more"
  if users hit the ceiling.
- Small/DIY festivals sparse on Setlist.fm → manual quick-log remains
  the fallback.
- Cross-link `2026-05-21-trip-discovery.md` (shares city+date search
  plumbing) and `2026-04-20-festivals.md`.
- Festival-name resolution (the new ask): a TM keyword search can return multiple/
  ambiguous events (which year, which region) → needs a disambiguation step (pick the
  right festival instance). Consider a small curated festival→venue map for the top US
  festivals so the Setlist.fm day-grouping is reliable for the big ones.
