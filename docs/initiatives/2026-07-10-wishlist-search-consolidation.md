---
name: wishlist-search-consolidation
description: Collapsed Going/Wishlist logging from 3 mode tabs (Quick log / Festival / Full Tour) to 2 (Search / Festival). Search = artist lookup with full tour + a manual fallback; genre autofills from the event. Attended untouched.
type: project
---

# Wishlist/Going: Search consolidation + genre autofill

- Started: 2026-07-10
- Status: shipped
- Last updated: 2026-07-10

## Context
After [[artist-tour-browser]] (Full Tour) and
[[festival-search-and-notification-deeplink]] (Festival on Wishlist/Going)
both landed, the Going/Wishlist tab had grown to THREE mode tabs: Quick log /
Festival / Full Tour. The user flagged this as too much: "instead of 3
separate tabs … it should be as simple as … 2 tabs. one being a general
search/artist look up … and the other a festival look up … in the search …
it can have the tour info." Plus two constraints in the follow-up: "dont
change it for the attended tab. only for going/wishlist. and if someone
chooses an artist in the search tab, it should autofill the genre."

Verified before building: for Going/Wishlist the old Quick-log form exposed
almost no unique fields — Score/Vibes/Setlist/Went-With/Notes/Videos are all
Attended-only. Its ONLY unique capability was manual entry of a show in no
database (the "Use what I typed" escape hatch). So Quick log and Full Tour
were near-duplicate "search an artist" surfaces — safe to merge, as long as
the manual escape hatch is preserved.

## Plan
1. Going/Wishlist mode toggle: 3 buttons -> 2 ("Search", "Festival").
   Internal logMode for Search stays the string 'tour' (avoids churn in
   prefill / the mount auto-search / showTour; users never see the value).
2. Search mode (the old Full Tour block, relabeled): artist search ->
   multi-select upcoming dates -> "Add N". PLUS a "Can't find it? Add a show
   manually" fallback that reveals a compact artist/date/city/venue form and
   reuses handleSubmit — so ANY show can still be added.
3. Genre autofill from real data: Ticketmaster events already carry
   classifications[0].genre.name (used in fetchFestivals); fetchUpcomingEvents
   just dropped it. Added tmGenreToMelo() (contains-based, ordered
   specific->broad, every return an exact GENRES member, '' when unsure) plus a
   'genre' field on TM and JamBase event maps. fetchUpcomingEventsMulti passes
   it through the merge; logSelected sets genre: r.genre || ''.
4. Attended untouched: showQuick scoped to isAttendedTab; switchStatus resets
   Attended->'quick', Going/Wishlist->'tour'; logSelected's genre change is
   inert for Attended finder rows (they carry no .genre).

## Security spine
No new tables/endpoints/secrets. tmGenreToMelo is a pure client-side string
map; all data flows reuse already-reviewed fetch paths.

## Changes made
- 2026-07-10: Built. api.js: tmGenreToMelo + TM_GENRE_RULES, genre on
  fetchUpcomingEvents (classifications genre/subGenre) and fetchJamBaseEvents
  (defensive). LogShow.jsx: 2-tab future toggle, Search block relabel + hint,
  manual-entry fallback (manualEntry state, reuses handleSubmit), logMode
  init/switchMode/switchStatus/showQuick updates, logSelected genre passthrough.
  App.css: .log-manual-section / .log-manual-toggle. App.jsx + LogShow comments
  de-"Full Tour"-ified. Production build clean, zero console/server errors on
  reload. Ran a 4-lens adversarial verification workflow (Attended-regression,
  dead-state, manual-flow, genre-mapping) — see below.

## Verification
Ran a 4-lens adversarial workflow (Attended-regression, dead-state, manual-
flow, genre-mapping). It surfaced 6 findings (5 CONFIRMED, 1 PLAUSIBLE) —
all now fixed:
- **MAJOR (regression I introduced):** editing a Wishlist/Going show rendered
  the empty Search screen instead of the pre-filled edit form, because
  showQuick had been scoped to Attended-only and logMode defaulted to 'tour'
  for a future edit. Fixed: editing forces logMode 'quick'; showQuick =
  `(isAttendedTab || editingShow) && !showFinder && !showFestival && !showTour`;
  the future mode-toggle is hidden while editing.
- **Stale-field bleed (manual add):** the Search-mode manual fallback reuses
  handleSubmit, which serialized score/vibes/setlist/notes/genre/festival/
  photos/etc. — these could hold stale values from an Attended interaction
  earlier in the same open sheet. Fixed with `keepAll = isAttendedTab ||
  !!editingShow`; a NEW future show zeroes the Attended-only fields (matching
  logSelected), while a future EDIT keeps its real loaded values.
- **Wasted fetch + result-flash:** the manual artist input shares `artist`
  state with the Attended autocomplete effect, which fired Deezer/TM calls
  whose results never render on a future tab. Both that effect and the
  artist-image effect now early-return unless `isAttendedTab || editingShow`.
- **"Dancehall" → Electronic:** the /dance/ rule shadowed the reggae rule.
  Fixed by moving the reggae rule ABOVE the electronic rule.
- **tmGenreToMelo TypeError on non-string input** (e.g. a JamBase object-shaped
  genre) would collapse a whole fetch batch to []. Hardened with a
  `typeof name === 'string'` coercion. Unit-tested all adversarial inputs
  (Rhythm & Blues→R&B, Dancehall→Reggae, object/array/null → '' no throw).
- **Latent blank state** (flagged in a focused re-review): a future-status new
  show with an unknown logMode would render nothing. Made structurally
  impossible: showTour = `isFutureTab && !editingShow && logMode !== 'festival'`
  (Search is the fallback for anything not Festival).
- Not-a-defect: switchStatus resetting Attended's mode/finder on tab-switch is
  intentional (documented), and the Attended edit-mode toggle is intentionally
  left as-is (honoring "don't change Attended").

A second focused reviewer re-traced all 7 render cases post-fix: exactly one
body renders in every case, no blank/double, edit form appears for both
Attended and Wishlist edits. Production build clean, zero preview errors.

## Also (same session, user request)
Removed the inline "Festival" field/section from the quick-log form: now that
Festival is its own dedicated mode/tab on both Attended and Going/Wishlist,
tagging a festival inside the quick-log form was redundant and confusing.
Removed the now-dead `pullFestivalLineup` helper and `inlineFestival` state.

## Open questions / follow-ups
- Manual fallback intentionally KEPT to avoid regressing "wishlist a show in
  no DB." If the user finds it clutters the happy path, it can be gated to
  only appear after a search returns nothing.
- Genre autofill is TM-classification-based; JamBase-only (small-venue) shows
  usually add with no genre (degrades to ''), which the user can set later.
- tmGenreToMelo is a heuristic; TM's genre taxonomy is stable but if a new
  top genre appears it just returns '' (safe) until a rule is added.
