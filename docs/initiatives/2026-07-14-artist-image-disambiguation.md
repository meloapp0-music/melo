---
name: artist-image-disambiguation
description: Fix wrong artist photos for names shared by multiple bands (Goose showed the Belgian dance band, not the CT jam band). Deezer resolver now disambiguates by matching each same-name candidate's catalog against the user's own logged setlist.
type: project
---

# Artist image disambiguation (the "wrong Goose" fix)

- Started: 2026-07-14
- Status: shipped (dev) — needs an on-device/logged-in eyeball
- Last updated: 2026-07-14

## Context
Aidan, live-testing, spotted that "Goose" showed the wrong band's photo. Deezer
search for `Goose` returns the Belgian dance-rock band GOOSE (id 15718, ~21k
fans) ahead of the Connecticut jam band he actually saw (id 139786222, ~1k
fans), and `fetchArtistImage` blindly took `data.data[0]` — the most popular
hit, ranked by fans, with zero verification. Same class of bug as the venue
false-match: a bare top-result with no guard. Fan count is exactly the wrong
signal here.

## Plan
Disambiguate using data the app already has: **the user's own setlist**. The
right "Goose" is the one whose catalog contains the songs they heard. When
resolving an image, if the name has more than one exact-name Deezer candidate
AND the caller supplies the logged setlist, fetch each candidate's top tracks
and pick the one with the best song overlap. Unambiguous names (a single
exact-name hit) skip all of this — no extra requests, no behavior change.

Validated against live Deezer before writing code, and again after: a real
Goose jam-band setlist scored **10 catalog matches for the jam band vs 0 for the
Belgian band**. End-to-end, the resolver flips from id 15718 (old) to id
139786222 `verified=true` (new).

## Changes made
- 2026-07-14: `api.js` — `fetchArtistImage(name, { songs })` now filters to
  exact-name candidates, and when there's more than one, scores each (top 4) by
  `artistTrackOverlap` against the normalized setlist, choosing the best;
  falls back to Deezer's top hit when there's no setlist / no overlap. New
  `normSong` (strips "(Live)"/"(feat…)"/"- Live at…"/punctuation) + async
  `artistTrackOverlap` (Deezer `/artist/{id}/top`, fails soft to 0).
- 2026-07-14: **Image cache → v2** (`melo_image_cache.v2`). Stores a record
  `{ url, id, verified }` instead of a bare URL string; `verified` = confirmed
  against a setlist. Bumping the key also discards v1's unverified guesses in
  one shot, so the already-poisoned on-device "goose" entry re-resolves cleanly.
  `getCachedImage` still returns a plain URL string (all call sites unchanged);
  a new internal `getImageRecord` exposes the record.
- 2026-07-14: `prefetchArtistImages(names, onUpdate, songsByArtist)` — takes a
  per-artist songs map; re-resolves a cached-but-**unverified** entry once a
  setlist becomes available (not just missing ones), so an earlier wrong guess
  gets corrected. `App.jsx` boot prefetch builds `songsByArtist` from every
  show's setlist and passes it in. Lazy `prefetchImages` (Home's Ticketmaster
  upcoming artists, no setlist) omits it → unchanged top-hit behavior.

## Open questions / follow-ups
- The correction happens at the next boot prefetch (which has setlists). A
  logged-in device check is the remaining verification — the resolver logic was
  proven against live Deezer, but not exercised through the real app UI.
- Artists with NO logged setlist (electronic/DJ acts logged with empty setlists,
  or upcoming-only) can't be disambiguated this way and still take the top hit.
  A future option: capture the Deezer artist id at log time from the autocomplete
  the user already picks, so the image is pinned regardless of name collisions.
- Consider the same setlist-overlap trick for the Setlist.fm / playback matching
  where an ambiguous artist could pull the wrong catalog.
