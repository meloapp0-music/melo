# v1.0.6 — "Your Year in Photos" Slide + Openers

- Started: 2026-05-21
- Status: in-progress (v1.0.6)
- Last updated: 2026-05-21

## Context

Two user-requested features for v1.0.6:

1. **Photos in Wrapped.** Wrapped already picks the FIRST user photo
   per top artist / top venue / highest-rated show and uses it as a
   Ken-Burns background (per the v1.0.4 wrapped-juice work). But no
   slide surfaces the user's full year of show photos. The user wants
   to see all their photos, or at least more of them.
2. **Openers.** Shows have a headliner (`artist` field) but no field
   for **opening acts**. User's example (2026-05-21): a friend saw
   Twin Peaks; Finn Wolfhard opened; the app has nowhere to record
   that. We're also throwing away upstream data —
   `fetchUpcomingEvents` already parses Ticketmaster's
   `_embedded.attractions` into a `lineup` array per event, and
   nothing downstream consumes it.

User-confirmed choices (2026-05-21):
- Photos: a **single "Your Year in Photos" closing slide** with an
  animated mosaic of all photos (over per-slide cycling).
- Openers: **manual field + auto-suggest from BOTH** Ticketmaster
  (upcoming events, lineup already fetched) and Setlist.fm (past
  events, a second venue+date query surfaces co-acts).

## Plan

### Feature 1 — "Your Year in Photos" slide (Wrapped)

- New slide in `src/web/pages/Wrapped.jsx`, slotted **before Summary**.
  Photo slide = index 11; Summary = index 12 when photos exist.
- When `photoWall.length === 0` → skip the slide entirely; Summary
  stays at index 11. `totalSlides` becomes dynamic
  (`12` or `13` depending on `hasPhotos`); Summary's slide-active
  check uses a `summarySlide` constant.
- **Data**: `[...new Set(yearShows.flatMap((s) => s.photos || []))]`
  deduped, capped at **20**, computed inside the existing data
  `useMemo` and exposed as `data.photoWall`.
- **Visual**: a 4×5 grid (`.wrapped-photo-wall`) of 1:1 tiles,
  rounded 8px, slight saturation+darken filter so the headline reads
  on top. Per-tile staggered fade-in/scale animation.
- **Overlay**: dark vertical gradient over the wall, centered
  headline `Your year, in photos`, subtitle stat
  `{photoCount} photos · {showsWithPhotos} shows · {year}`.

### Feature 2 — Openers (schema + auto-suggest + manual UI)

- **Migration `0009_show_openers.sql`**:
  ```sql
  alter table public.shows
    add column if not exists openers text[] not null default '{}';
  ```
- **`src/web/lib/db/shows.js`** — mirror the `buddies` array
  pattern at `fromRow`, `toRow` (defensively gated), and the
  `updateShow` field map.
- **`src/web/api.js`** — new `fetchCoActs(venueName, date, headliner)`:
  - Goes through `setlistfm-proxy` with `search/setlists?venueName=...&date=dd-MM-yyyy`
  - Returns artists from results whose name doesn't match the
    headliner (case-insensitive), deduped
  - One extra API call per dropdown pick — acceptable since it's a
    deliberate user action, not on every keystroke
- **`src/web/pages/LogShow.jsx`** — new **Openers** section
  between Festival and Genre:
  - State: `openers`, `openerSuggestions`, `newOpenerName`
  - In `pickShow(show)`: if `show.lineup?.length > 1` → use
    `lineup.slice(1)` as suggestions; else (past show)
    `fetchCoActs(show.venue, show.date, show.artist)` then set
    suggestions
  - UI: a "Also on the bill — tap to add" suggestion row (with a
    "+ Add all") above a chip input that mirrors the existing Buddies
    pattern. Selected openers render as removable gradient chips.
  - In `handleSubmit`: `openers` included in the payload
- **`src/web/components/ShowDetail.jsx`** — opener line below the
  venue+date in `.detail-meta`: `with Finn Wolfhard` (italic, muted),
  hidden when array is empty.
- **CSS** — `.wrapped-photo-wall` + tile family, `.log-opener-*`,
  `.opener-suggest-chip`, `.opener-chip`, `.detail-openers`.

### Deferred to v1.0.7+
- An "openers you saw" stat or dedicated slide in Wrapped — surfaces
  the openers data once meaningful data exists in the wild.

## Changes made

- 2026-05-21: Initiative created.
- 2026-05-21: Both features implemented for v1.0.6.
  - **Photos**: `Wrapped.jsx` — `photoWall` / `photoCount` /
    `showsWithPhotos` computed in the data `useMemo`; new conditional
    slide rendering when `hasPhotoWall`; `totalSlides` + new
    `summarySlide` constants make Summary index dynamic (11 or 12).
    `App.css` — `.wrapped-photo-wall` 4-col grid + `.wrapped-photo-tile`
    staggered-in animation + `.wrapped-photo-overlay` darken gradient
    + `.wrapped-photo-meta` caption.
  - **Openers — schema**: migration `0009_show_openers.sql` adds
    `openers text[] not null default '{}'`.
  - **Openers — data layer**: `shows.js` `fromRow`/`toRow` (gated)/
    `updateShow` field map all handle `openers`.
  - **Openers — API**: `api.js` adds `fetchCoActs(venueName, date,
    headliner)` — goes through `setlistfm-proxy` with venueName+date
    (dd-MM-yyyy), returns deduped artist names other than the
    headliner.
  - **Openers — LogShow UI**: new Openers section between Festival
    and Genre. State: `openers`, `openerSuggestions`,
    `newOpenerName`. `pickShow` populates suggestions from
    `show.lineup.slice(1)` (Ticketmaster) or `fetchCoActs(...)`
    (Setlist.fm). Suggestion chips with "+ Add all", manual chip
    input mirroring the Buddies pattern, removable gradient chips
    for selected openers. `openers` flows through `handleSubmit`.
  - **Openers — display**: `ShowDetail.jsx` adds italic
    `with {names}` line below the venue+date when the array is
    non-empty. `.detail-openers` CSS.
  - `App.css`: `.detail-openers`, `.log-opener-suggestions`,
    `.opener-suggest-chip`, `.opener-chip` family.
  - `npm run build` passes clean.
  - Pending: **apply migration 0009 in the Supabase dashboard**
    before the openers feature persists against the live DB.

## Open questions / follow-ups

- **Performance** — capping the photo wall at 20 tiles. If real users
  have >20, the curation is "first 20 in iteration order" (which is
  `date DESC` from `listMyShows`). Consider weighting by top-shows
  later.
- **Privacy on photos** — user photos are theirs alone; the photo
  wall just renders their own URLs. No new exposure.
- **Setlist.fm co-act false positives** — multiple bands sometimes
  play a venue on the same date (festivals, multi-act bills with
  separate setlist.fm entries). The query returns all of them. The
  user-selectable chip pattern means the user accepts/rejects each
  one — no auto-write of wrong data.
