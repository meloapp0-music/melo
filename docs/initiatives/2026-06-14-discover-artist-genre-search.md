# Discover: search by artist & genre (not just city)

- Started: 2026-06-14
- Status: shipped (next build)
- Last updated: 2026-06-14

## Context

The Discover "Shows" tab only searched by city. User request: "you
should be able to search by artist band or genre. not just type in the
city." Same session re-confirmed the friend-shows stats leak was still
visible on-device (see Verification — it's an unshipped-build issue, not
a code bug).

## Changes made

- 2026-06-14: `api.js` — added `searchEvents({ city, keyword, genre,
  stateCode, startDateTime, endDateTime, size })` (general TM Discovery
  search) + shared `mapTmDiscoveryEvent` mapper. `fetchEventsByCity` is
  now a thin back-compat wrapper over it. Genre maps to TM
  `classificationName` (verified live: Rock, Pop, Hip-Hop/Rap, Country,
  Dance/Electronic, R&B, Metal, Latin, Folk all return results);
  artist maps to `keyword` with `classificationName=music`.
- 2026-06-14: `Festivals.jsx` (Discover) — the Shows view gained a
  City / Artist / Genre mode toggle. City + Artist are text inputs;
  Genre is a row of preset chips that search on tap. Genre defaults to
  the user's inferred home city (national if unknown). Taste-first sort
  + add-to-wishlist + ticket links unchanged across all three modes.
  Empty-state copy is mode-aware (`searchedLabel`).
- 2026-06-14: Request-sequencing (`searchSeq` ref) so a slow response
  from a previous search or a since-abandoned tab can't land under the
  wrong mode; `switchSearchType` invalidates in-flight requests. (From
  the adversarial review — the one real bug it found.)
- 2026-06-14: `App.css` — `.discover-type-tabs`, `.discover-genre-chips`
  on house tokens.

## Verification

- TM params verified live (curl) before building.
- 2-lens adversarial review: Discover lens found the stale-tab race
  (fixed); leak lens returned a clear verdict — **the friend-shows
  stats fix (c729184, listMyShows scoped to user_id) is complete and
  correct, with no second leak path.** Every stat surface derives from
  the scoped `shows` array; the only cross-user reads (FriendsFeed,
  UserProfileView) keep results in their own component state. The
  on-device "still leaking" report is explained by phones running a
  build cut before 2026-06-12 — it resolves when 1.2.2 (build 17)
  ships. No data-layer change warranted.
- Build clean, web boots with no console errors, iOS synced.

## Open questions / follow-ups

- Genre + typed-city combo: genre currently scopes to home city only;
  could let users type a city in genre mode too (deferred — current
  behavior is honest and simple).
- Artist search shows raw TM keyword results (no name-match filter) —
  fine for user-initiated search; revisit if junk results appear.
