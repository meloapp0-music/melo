# Songs Page: Group by Artist + Inline Previews

- Started: 2026-04-19
- Status: shipped
- Last updated: 2026-04-19

## Context

The original Songs page was a flat list of every song the user had ever heard
live, sorted by frequency. Two problems:

1. With even a modest concert history the list became hundreds of rows long
   with no grouping — hard to scan for "what songs have I heard from
   Phoebe Bridgers?"
2. There was no way to **hear** the song. Users could remember the title but
   not the melody — defeats the point of a live-music memory app.

User asked: "I want the songs page to be organized by artist" and "I want
people to click on a song they have heard live and the song should play
(spotify or apple music integration)."

## Plan

Group songs into collapsible artist cards. Each track row gets a play button
that streams a 30-second preview inline + a Spotify icon for full-track
playback in the user's preferred service.

**API choice — iTunes Search**: free, no auth, CORS-enabled, returns
`previewUrl` (m4a, ~30 sec) plus an Apple Music deep link. **Spotify deep
link** as the "open in app" fallback (requires no API key — just
`open.spotify.com/search/<query>`). Apple Music *full* playback via MusicKit
JS would require a paid subscription per listener; deferred.

## Changes made

- 2026-04-19: `src/web/api.js` — added `fetchSongPreview(artist, song)`.
  Picks the best result by artist-name similarity, returns
  `{ previewUrl, appleMusicUrl, artwork, trackName, artistName,
  spotifySearchUrl }`. Caches results (including `null` for "no preview
  exists") in `localStorage` under `melo_preview_cache` to avoid repeat
  iTunes hits.
- 2026-04-19: `src/web/pages/Songs.jsx` rewritten. Builds an `artistGroups`
  map keyed by artist with secondary `songs` map per artist; sorted by
  song count desc, then show count desc. Stats header shows total songs,
  artist count, songs heard 2x+. "Most Seen" spotlight card preserved.
  Collapsible `.songs-artist-card` per artist with chevron rotation.
- 2026-04-19: HTML5 Audio playback — single `audioRef.current` ensures
  only one preview plays at a time; `useEffect` cleanup pauses on unmount;
  loading spinner during fetch; "playing" state highlights the row in
  Melo orange. Falls back to opening Spotify search in a new tab when no
  preview exists.
- 2026-04-19: `src/web/App.css` — appended ~150 lines of Songs styles:
  `.songs-artist-list`, `.songs-artist-card.open`, `.songs-artist-header`,
  `.songs-artist-thumb`, `.songs-artist-tracks` with reveal animation,
  `.songs-track-row.playing` with orange highlight, `.songs-play-btn`
  (gradient + shadow), `.songs-play-spinner` keyframe, `.songs-track-link`
  with Spotify-green hover.

## Open questions / follow-ups

- Apple Music full-track playback via MusicKit JS — deferred. Requires
  per-user OAuth and an active subscription. v1 trade-off accepted.
- Audio preview autoplay policy on iOS Safari (and Capacitor's WKWebView)
  may require a user gesture; currently every play is gesture-initiated
  so should be fine, but verify on device.
- Cache invalidation: preview cache currently never expires. Songs/artists
  rarely change, but a "refresh preview" affordance might help if the
  iTunes match is wrong.
