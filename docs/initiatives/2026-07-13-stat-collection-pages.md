# Stat pages as "collections" (Your Rooms / Your Lineup / Map)

- Started: 2026-07-13
- Status: in-progress
- Last updated: 2026-07-13

## Context
The Stats tab's tiles link to detail pages. "Venues" was already reborn as **Your
Rooms** — a personality-driven, photo/gradient collection. The user felt the other
linked pages (Artists, Songs) were "boring by comparison" and wanted the same
treatment or a better direction, and that the Concert Map "looks good but something's
missing" (suggested an interactive rail under the map).

Agreed direction (with pushback where warranted):
- **Artists → "Your Lineup"** — the clear win. Plain accordion → collection wall of
  artist photos (Deezer images already prefetched at boot). Biggest payoff.
- **Songs → light touch, NOT a redo.** Songs is ALREADY the most alive page: photo-
  collage hero, stat cards, "Most Seen" spotlight, and a working 30s-preview jukebox.
  A full Rooms-clone would be lateral. Plan: add a "Your Anthems" quick-play strip
  (top 5 most-heard-live songs) up top. Small, high-delight.
- **Map → travel story + interactive rail.** Add a stat band using the existing
  `totalMilesTraveled` ("N cities · N states · N miles for live music") + a city rail
  under the map that cross-highlights with the pins (tap a city → fly + open shows).

## Plan
Reuse the Your Rooms collection CSS (`.venue-personality`, `.venue-hero*`,
`.venue-seg*`, `.venue-search`, `.venue-grid`, `.venue-card*`, `.venues-year-*`) so
the collections read as siblings. Each collection item opens a detail modal in the
house `.detail-*` pattern (ShowDetail / VenueDetail / FestivalDetail / ArtistDetail).

## Changes made
- 2026-07-13: **Your Lineup** shipped. Rewrote `pages/Artists.jsx` from a gray
  accordion into a collection: personality line ("You're an indie devotee",
  + "N seen 3+ times"), a #1-most-seen **hero**, Most seen / By genre / Recently
  toggles, search + Show-all cap, and a grid of artist-photo cards with a loyalty
  count badge (shown at 2×+). Reuses the venue-collection CSS.
- 2026-07-13: New `components/ArtistDetail.jsx` — an artist's page ("Every time you
  saw {name}"): photo hero, "Seen N× · since YYYY · N cities" + avg score, and the
  list of shows (each → ShowDetail). Mirrors VenueDetail. Wired `selectedArtist` /
  `setSelectedArtist` into `App.jsx` (context + render, stacked before ShowDetail).

- 2026-07-13: **Festival consolidation in Your Lineup.** Logging many acts at one
  festival used to flood the lineup with individual artist cards. Now a festival
  where you logged **≥ 4 acts** (`FEST_CARD_MIN`) collapses into ONE tappable 🎪
  festival tile (→ FestivalDetail); a couple of acts stay as individual cards. An
  artist seen ANYWHERE outside a big festival (standalone / small festival) keeps
  their own card, so a headliner you also caught on tour never vanishes into a
  tile. Search bypasses folding (any artist is always findable). Festivals get
  their own group in "By genre" and sort by act-count / date in the other views.
- 2026-07-13: **Tag a festival from the quick-log form.** Re-added an optional
  "Festival" field (FestivalAutocomplete) to the Attended quick-log — the field
  that was removed as "redundant" is exactly what you want when you only caught a
  few acts and don't want to dig through a whole lineup in Festival mode. The show
  gets grouped into that festival's outing via `festivalKey`, same as Festival
  mode. (`pages/LogShow.jsx` — `festival` was already saved, just no UI for it.)

- 2026-07-13: **Festival-level media shipped** (user chose full uploads). New
  `festival_media` table (migration `0015_festival_media.sql`) — one row per
  (user, festival_key), self-only RLS, `photos[]`/`videos[]`. Reuses the existing
  `show-photos`/`show-videos` Storage buckets under `{user}/fest-<key>/…` (their
  folder RLS already gates writes), so NO new bucket. New `lib/db/festivalMedia.js`
  (get/upsert). FestivalDetail now has editable **Festival photos** + **Festival
  videos** (reusing PhotoPicker/VideoPicker) that persist to festival_media, plus
  the aggregated per-act photos relabelled "From your sets". Per-act media still
  lives on the show rows. **⚠️ Requires applying migration 0015 to Supabase before
  it persists** (uploads hit storage but URLs won't save until the table exists).

## Open questions / follow-ups
- Widen `festival_media` read to friends later (mirror `can_view_shows`) so a
  festival gallery can be shared, not just self-only.
- **Map** travel-stat band + interactive city rail (next).
- **Songs** "Your Anthems" quick-play strip (after Map).
- Consider routing Stats' "Most Seen" artist rows through `setSelectedArtist` (open
  ArtistDetail) instead of `navigate('artists')`.
