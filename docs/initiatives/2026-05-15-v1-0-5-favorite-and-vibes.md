# v1.0.5 — ★ Favorite Shows + Trimmed Vibes

- Started: 2026-05-15
- Status: in-progress (v1.0.5)
- Last updated: 2026-05-15

## Context

Two "quick polish" items the user flagged for v1.0.5:

1. **★ Favorite a show.** There is no way to mark a show as a
   favorite. Power users log many shows; they want a one-tap way to
   flag the ones that mattered and find them again fast. (The
   `2026-05-13-data-export.md` CSV schema already anticipates an
   `is_favorite` column.)

2. **Trim the vibes list 15 → 9.** The vibe picker in LogShow offers
   15 options, several of which overlap so heavily they add friction
   without adding signal — Euphoric / Transcendent / Mind-Blowing /
   Legendary all mean "peak amazing"; High Energy / Rowdy / Chaotic
   all mean "intense". Fewer, sharper options = faster logging.

Both are small, self-contained, and ship together in v1.0.5 alongside
data-export and pre-show-toolkit P1.

## Plan

### Favorite — schema

Migration `0008_show_favorite.sql`:

```sql
alter table public.shows
  add column if not exists is_favorite boolean not null default false;
```

Default false — existing rows are un-favorited, which is correct. No
backfill.

### Favorite — data layer

`src/web/lib/db/shows.js`:
- `fromRow`: `isFavorite: row.is_favorite ?? false`
- `toRow`: include `is_favorite` only when truthy (same defensive gate
  as `venue_url` / `battle_wins` — avoids INSERT failures on a DB
  where 0008 hasn't been applied yet)
- `updateShow` field map: `isFavorite → is_favorite`

### Favorite — UI

- **ShowDetail** — a ★ toggle button. Tapping flips `isFavorite` via
  `updateShow(show.id, { isFavorite: !show.isFavorite })`. Filled gold
  star when on, outline when off.
- **My Shows** — a "★ Favorites" toggle chip in the existing filter
  row. When active, the list filters to favorited shows within the
  current status tab. A small ★ badge renders on favorited show cards.

### Vibes — the trim

Decision (user, 2026-05-15): keep the **Balanced 9** —
Euphoric, Intimate, High Energy, Chill, Emotional, Rowdy,
Transcendent, Nostalgic, Groovy. Dropped: Mind-Blowing, Raw, Dreamy,
Chaotic, Spiritual, Legendary.

`src/web/store.js`:
- `VIBES` becomes the 9-entry picker list.
- A full 15-name `VIBE_STYLES` map is retained internally + exposed
  via a `vibeStyle(name)` helper, so shows logged with a now-retired
  vibe still render with their original colour. Data is untouched —
  the `vibes` string array on existing shows keeps whatever was saved;
  only the picker shrinks.
- `ShowDetail` switches its `getVibeStyle` to the `vibeStyle` helper.

No data migration — retired vibes simply stop being offered for new
logs.

## Changes made

- 2026-05-15: Initiative created. User chose Balanced 9 + "Star +
  Favorites filter" scope.
- 2026-05-15: Both features implemented.
  - **Vibes trim** — `store.js`: `VIBES` is now the 9-entry picker
    list; internal `VIBE_STYLES` map keeps all 15 names; new
    `vibeStyle(name)` export resolves any vibe, current or retired.
    `ShowDetail` switched to `vibeStyle`. LogShow picker unchanged
    (still maps `VIBES`). No data migration — retired vibes on old
    shows keep their string + colour.
  - **Favorite — schema**: migration `0008_show_favorite.sql` adds
    `is_favorite boolean not null default false`.
  - **Favorite — data layer**: `shows.js` `fromRow`/`toRow` (gated)/
    `updateShow` map all handle `isFavorite ↔ is_favorite`.
  - **Favorite — UI**: ShowDetail gains a ★ button in the hero
    (local-mirror state, optimistic `updateShow`). My Shows gains a
    "★ Favorites" filter chip + ★ badges on favorited grid posters
    and list rows.
  - `App.css`: `.detail-fav`, `.show-poster-fav`, `.show-list-fav`,
    `.filter-chip-fav.active` (gold `#FFC75F`).
  - `npm run build` passes clean.
  - Pending: apply migration 0008 in the Supabase dashboard before
    the favorite feature works against the live DB.

## Open questions / follow-ups

- **Favorites in Wrapped.** A "your favorite shows of the year" slide
  is a natural future addition — out of scope for v1.0.5.
- **Sort by favorite.** Could add "favorites first" sorting later;
  the filter is enough for v1.0.5.
- **Retired-vibe cleanup.** If a user wants to re-map an old
  "Chaotic" show to a current vibe, that is a manual edit today. A
  bulk re-map tool is not worth building.
