# Playable Setlists in ShowDetail

- Started: 2026-04-19
- Status: shipped
- Last updated: 2026-04-19

## Context

Opening a logged show showed the setlist as a plain numbered list of song
titles in `src/web/components/ShowDetail.jsx` — no way to actually hear
the music without manually copy/pasting song titles into Spotify or Apple
Music.

The Songs page (`src/web/pages/Songs.jsx`) had already solved this exact
pattern: tap a play button → 30-sec iTunes preview plays inline → tap
again to stop, with a Spotify search deep-link as a sibling icon. This
initiative ports the same UX into ShowDetail so opening a show becomes
an interactive listening experience.

User ask: "can we integrate with spotify and apple music so when i go
into a show and i want to play a song i can go to the show and play it
when i enter the show and it shows me the setlist?"

## Plan

Built a new shared `<PlayableSetlist>` component in
`src/web/components/PlayableSetlist.jsx` and dropped it into ShowDetail.
Reused the existing `fetchSongPreview` utility (iTunes Search API,
localStorage-cached, falls back to Spotify search if no preview exists).
Added an Apple Music search deep-link as a sibling to the Spotify icon
— `https://music.apple.com/us/search?term=<artist song>` opens the
Apple Music app on iOS via universal link, or the web player on desktop.

Out of scope: refactoring `Songs.jsx` to use the new shared component
(works fine as-is, no user-facing benefit). Out of scope: "play whole
setlist on Spotify" — requires Spotify OAuth + Web API to create a
playlist server-side, deferred to the auth phase.

## Changes made

- 2026-04-19: Created `src/web/components/PlayableSetlist.jsx`. Props:
  `{ artist, songs, numbered=false }`. Single shared `audioRef` so only
  one preview plays at a time. Cleanup on unmount. Per row: numbered
  index (optional), play/stop button with loading spinner, song title,
  Spotify search icon, Apple Music search icon. Graceful fallback when
  iTunes has no preview — opens Spotify search in a new tab.
- 2026-04-19: Updated `src/web/components/ShowDetail.jsx` to import
  `PlayableSetlist` and replace the `<ol className="detail-setlist">`
  block (lines 81-93 of the old version) with
  `<PlayableSetlist artist={show.artist} songs={show.setlist} numbered />`.
- 2026-04-19: Appended ~55 lines of CSS to `src/web/App.css`:
  `.playable-setlist`, `.playable-setlist-row` (with `.playing` highlight),
  `.playable-setlist-num` (right-aligned tabular-nums in muted brown,
  flips to orange when its row is playing), `.playable-setlist-name`,
  `.playable-setlist-applemusic` (hover/active flips link color from
  the default Spotify green to Apple Music's brand pink #FA243C).
  Reused `.songs-play-btn`, `.songs-play-spinner`, and `.songs-track-link`
  for the play button + Spotify icon styling.
- 2026-04-19: `npm run build` passes clean (87 modules, 0 warnings —
  one new module for `PlayableSetlist.jsx`).

## Open questions / follow-ups

- Refactor `src/web/pages/Songs.jsx` to use `<PlayableSetlist>` once
  that page needs another row-shape change. The current duplication is
  intentional — refactoring carries no user value today.
- "Play whole setlist on Spotify" — needs Spotify OAuth. Add to the
  auth-integrations phase (likely Phase 5 of the backend initiative).
- The old `.detail-setlist` and `.detail-setlist-num` CSS classes are
  now unused. Could be pruned in a future cleanup pass; left in place
  for now since they're tiny and harmless.
- iTunes preview cache (`melo_preview_cache` in localStorage) grows
  monotonically. If users log many shows with deep-cut songs, this
  could get large. Consider a max-entries cap in a future pass.
