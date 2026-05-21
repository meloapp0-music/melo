# v1.0.7 — Wrapped Depth (Quotes, Songs, YoY)

- Started: 2026-05-21
- Status: planned (v1.0.7)
- Last updated: 2026-05-21

## Context

After v1.0.6 ("Your Year in Photos" + openers), Wrapped already lands —
but a brainstorm with the user surfaced three additions that **triple
the emotional density without new schema or new data sources**. They
all read existing fields. The user picked these three as the next
Wrapped bundle:

1. **Quotes from your notes** — surface a memorable line from the
   user's own `notes` field on a past show. The single most emotional
   slide possible: reading words you wrote in the moment, months later.
2. **Songs you heard live the most** — aggregate every setlist into a
   "top 5 songs you witnessed live" — a stat Spotify Wrapped literally
   cannot give you because it only knows what you *streamed*, not what
   you saw performed.
3. **Year-over-year delta** — Spotify Wrapped's biggest emotional
   weapon. "47 shows · 32% more than 2025." Requires only that
   `priorYearsShows` exist (it does).

All three slides are **conditional**: if the data isn't there, they
skip rather than show empty content.

## Plan

### Slide A — "Quotes from your notes"

- **Data**: `yearShows.filter((s) => (s.notes || '').trim())`. From the
  matches, pick the note attached to the **highest-rated show** (best
  emotional payoff). Truncate to ~140 chars if longer; add ellipsis.
- **Position**: between Personality (10) and Songs (new 11). Emotional
  cluster: Vibes → Personality → Quotes → Songs.
- **Visual**: photo from that show (or artist image fallback) as
  background with heavy darkening; centered large serif-ish italic
  quote in cream; attribution below: `— after {Artist} at {Venue},
  {date}`.
- **Conditional**: skip slide entirely when no notes exist on any
  yearShow.

### Slide B — "Songs you heard live the most"

- **Data**: aggregate `yearShows.flatMap((s) => s.setlist.map((song) =>
  ({artist: s.artist, song})))`. Count occurrences per
  `(artist, song)` key (case-insensitive). Sort desc by count. Top 5.
- **Position**: directly after Quotes (new index ~12). Pairs musically
  with the kinetic vibes/personality cluster before the photo wall.
- **Visual**: dark stage-lights gradient overlay; label "SONGS YOU
  HEARD MOST"; vertical numbered list of top 5 with song title (large),
  artist + count (small): *"1. Wake Up · Arcade Fire · 7 plays".*
  Optional Phase 2: tap a song → plays 30s preview (reuses
  `PlayableSetlist` mechanics).
- **Always shown** unless `topSongs.length === 0` (no setlists at all).

### Slide C — "Year-over-year delta"

- **Data**: compare `yearShows` against `priorYearsShows.filter(
  (s) => year(s.date) === year - 1)`. Compute deltas for: shows, cities,
  miles (from `mapData`), total songs. Express as
  `delta = current - previous` and `pct = (delta / max(previous, 1)) *
  100`.
- **Position**: right before Summary — the "look how far you came"
  moment that bridges into the recap.
- **Visual**: label "VS {prevYear}"; three big stat blocks stacked or
  in a grid, each showing `current` big + delta small underneath
  (`+12 shows`, `+3 cities`, `+2,400 miles`). Positive deltas use the
  amber gradient; negative deltas use muted brown (still positive
  framing — "you took a quieter year").
- **Conditional**: skip when no `priorYearsShows` exist (first-year
  users).

### Refactor — dynamic slide indexing

Currently every slide is a hard-coded `slide === N` literal. v1.0.6
already required a `summarySlide` constant for the conditional Photos
slide. Adding 3 more conditional slides without refactoring would
multiply that pattern.

Refactor approach:
- Build a `slideOrder` array at the top of the render — pushing slide
  IDs (`'yearIntro'`, `'topArtist'`, ..., `'photoWall'`, `'summary'`)
  in order, skipping ones whose `hasX` flag is false.
- Each slide's JSX uses `slide === slideOrder.indexOf('myId')` instead
  of a literal number.
- `totalSlides = slideOrder.length`.
- Cleaner, easier to extend going forward.

### Schema / data layer

- **No schema changes.** Reads existing `notes`, `setlist`, and
  cross-year `shows` data only.
- **No new API calls.** All client-side aggregation.

## Critical files

**Edit:**
- `src/web/pages/Wrapped.jsx` — three new slide JSX blocks +
  `topSongs` / `yearQuote` / `yoyDeltas` in the data `useMemo` +
  slide-indexing refactor to a dynamic `slideOrder` array.
- `src/web/App.css` — new families: `.wrapped-quote-*`,
  `.wrapped-songs-*`, `.wrapped-yoy-*`.

**Reference:**
- `src/web/components/PlayableSetlist.jsx` — for the optional Phase-2
  tap-to-preview on the Songs slide (Apple Music + Spotify already
  wired up).
- Existing slide patterns in `Wrapped.jsx` (esp. the v1.0.6 photo wall
  conditional pattern) — same approach extended.

## Verification

1. Log a few shows in one year with **notes** on at least the
   highest-rated one → open Wrapped → Quotes slide appears with your
   actual text + attribution.
2. Log shows with **non-empty setlists** → Wrapped Songs slide shows a
   top-5 list with counts. Songs sung at multiple shows climb the
   list.
3. Log shows in **two consecutive years** → YoY slide appears between
   Personality and Summary with positive/negative deltas.
4. **First-year user** (no priorYearsShows) → YoY slide skipped
   entirely; Summary still last.
5. **User with no notes** → Quotes slide skipped; flow uninterrupted.
6. **User with no setlists** → Songs slide skipped.
7. `npm run build` passes; slide dots in the navigator count matches
   `slideOrder.length`.

## Open questions / follow-ups

- **Quote picking heuristic.** Highest-rated show's note is the safe
  default. Future: a small ML/keyword-based pick that prefers
  emotional/evocative words. Out of scope for v1.0.7.
- **Songs tap-to-preview** — Phase 1 ships read-only (just list + count).
  Phase 2 wires `PlayableSetlist` per row. Slot into v1.0.7 if time
  allows, otherwise v1.0.8.
- **YoY visualization beyond deltas** — a sparkline/line chart of
  shows per month for both years would be gorgeous but adds chart
  infrastructure. Defer.
- **Cross-link with `2026-05-13-time-capsule-notifications.md`** —
  the Quotes slide is essentially a Wrapped-version of the time-capsule
  push ("you wrote this 1 year ago"). Consider using the same copy
  voice + similar visual treatment so the two features read as a
  consistent emotional thread.
- **Marketing leverage** — the Quotes slide is the new
  most-screenshottable Wrapped moment. The share-to-IG-Stories button
  (deferred v1.0.8) should bias toward this slide when previewing.
