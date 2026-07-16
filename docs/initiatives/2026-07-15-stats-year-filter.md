---
name: stats-year-filter
description: Year filter on the Stats page — All Time · every logged year (descending). Scopes every stat. Streak drops "current" for a specific year; all-time-list tiles go inert in year scope.
type: project
---

# Stats year filter (This Year / any past year / All Time)

- Started: 2026-07-15
- Status: built + verified (dev) — awaiting logged-in device eyeball
- Last updated: 2026-07-15

## Context
User asked for the Stats page to filter by "just this year, or any previous
year and an all time." "Any previous year" rules out a fixed 2–3-way toggle —
it needs a per-year control, however many years exist.

## Plan (settled by a 3-lens design panel)
A design workflow ran 3 independent proposals (minimal / engagement /
correctness lenses) → judged synthesis. Ranking: correctness > minimal >
engagement. The panel resolved the two non-obvious calls:

- **Control:** a horizontal scrollable chip row reusing `.shows-filters` +
  `.filter-chip` verbatim — `[All Time] [2026] [2025] …` descending. Rendered
  ONLY when `getWrappedYears(shows).length >= 2` (nothing to filter otherwise;
  page is byte-for-byte unchanged). Default = **All Time** (no regression, and
  avoids a sparse early-January view).
- **Streak (the crux):** `calculateStreak.current` is anchored to *today*, so
  it's meaningless for a past year and leaks prior-year months into the current
  year. Rule: All Time → the existing two-card block (current + longest); a
  specific year (past OR current, no distinction) → DROP the current card, show
  a single "⚡ Longest Streak" for that year, and only when `longest >= 2` (a
  lone "1" isn't a streak — render no block).
- **Navigation:** tiles that jump to all-time lists (Shows/Artists/Cities/
  Songs/Avg) go **inert** in year scope (a scoped "3 Shows" must not link to an
  87-row all-time list) via a new `.stats-tile-static` class that kills the base
  tile's `cursor:pointer` + `:active` scale. Entity rows that open a single
  entity's own page stay live: Top Venues rows keep `setSelectedVenue`, and
  Most Seen rows were **rerouted from `navigate('artists')` to
  `setSelectedArtist({name})` → ArtistDetail** (the follow-up already logged in
  the stat-collection initiative). "See all"/"Map" secondary links + city-chip
  navigation are hidden/static in year scope.
- **Framing:** dynamic subtitle — All Time keeps today's copy; past year →
  "Your {year} in live music."; current year → "Your {year} so far." (reuses
  the app's own `wrappedLabel` So Far/Wrapped voice).

## Changes made
- 2026-07-15: Rewrote `pages/Stats.jsx`. One `scoped` memo (filter `attended` by
  `getYear`) feeds every downstream memo (`outings`, `s`, `genreCounts`), so the
  grid, streak, most-seen, venues, cities, genres, and avg all re-scope from a
  single filter. Added the chip row, `activeYear` stale-selection fallback, the
  `Tile` sub-component (button when all-time+navigable, else inert div), the
  streak rule above, dynamic subtitle, and the Most-Seen → ArtistDetail reroute.
- 2026-07-15: `App.css` — added `.stats-tile-static` and
  `.stats-city-chip-static` (cursor:default + no active transform).
- 2026-07-15: **Verified** against the real stylesheet via a throwaway harness
  that renders the actual `Stats` component with mock 3-year data (deleted after).
  Confirmed: All-Time (Shows 11 = Lolla's 2 acts fold to 1 outing, Venues 9 =
  Grant Park stage excluded, longest streak 5 = Dec'25→Apr'26 run); 2024 (all
  shows one month → NO streak card, inert `div` tiles with cursor:default and no
  navigate, hidden See-all/Map, static city spans, Top Venues rows still fire);
  2026 ("Your 2026 so far.", single ⚡4 Longest Streak). Build clean, no console
  errors.

## Open questions / follow-ups
- Tiles going inert in year scope is a deliberate capability loss (you can't tap
  through to a list from a year view). The alternative — linking a scoped number
  to an all-time list — is worse. All-time (the default) keeps full navigation.
- A festival straddling New Year's Eve would split its per-day stage rows across
  two year buckets (each row filters by its own date). Vanishingly rare.
- Not exercised through a real logged-in account (sign-in wall) — verified via
  the component harness + build only.

## Year-scoped destinations (2026-07-16) — supersedes the "inert tiles" call

Aidan: *"when i go into specific years, i should be able to click into artists,
cities, venues, shows and songs and see each year of those."*

He's right, and this **replaces the panel's `navigation_verdict`**. The panel made
the tiles inert in year scope because a year-scoped "3 Shows" must not open an
87-row all-time list — correct diagnosis, but it treated the destinations as
fixed. The real fix was to make them year-aware, which removes the reason to go
inert at all. **All tiles are live again**, including Venues (which never had a
destination) and the Cities/Map chips + "See all" links.

- **`navigate(page, { year })`** (App.jsx) carries the scope, and — the important
  half — **every navigate WITHOUT a year clears it**. So the scope is
  self-managing and cannot leak into a page opened from the nav bar later. That
  stale-filter trap is the main risk of this feature and it's closed by
  construction, not by discipline.
- **`components/YearScope.jsx`** — `useYearScope(shows)` (one line per page) +
  `<YearScopeBanner />`. The banner is not decoration: a silently filtered page is
  worse than no filter, because someone seeing 3 artists when they own 80 assumes
  data loss. It always states the scope and always offers "Show all time".
- Scoped: **Artists (Your Lineup), ConcertMap, Songs, Venues (Your Rooms),
  MyShows**. Each filters its own attended set, so festival grouping, tab counts
  and taste sorts all keep working untouched.
- **Verified** by driving the real Stats + Artists with 3 years of data: All Time
  = 6 artists → 2024 = 2; tapping "2 Artists" lands on Your Lineup scoped to 2024
  showing exactly Wilco + Spoon; banner reads "Showing 2024 · Show all time";
  clearing widens in place to all 6; 2025 → Goose + The National; and navigating
  without a year clears the scope every time.
