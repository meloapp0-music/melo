# Wishlist Autocomplete + ShowDetail Layout Fixes

- Started: 2026-04-19
- Status: shipped
- Last updated: 2026-04-20

## Context

Two follow-up issues surfaced after shipping show autocomplete and playable
setlists:

1. **Wishlist autocomplete was broken** — typing an artist on the
   Wishlist tab of LogShow returned nothing. The Bandsintown REST endpoint
   was being hit directly without the CORS proxy that Setlist.fm uses, so
   browser CORS blocked every response.
2. **ShowDetail score circle overlapped the vibe pills** — the
   `.detail-score-row` flex layout put a 64px circle next to a wrapping
   row of vibes; on shows with several vibes the pills wrapped under
   the circle and looked broken.

User asks (verbatim):
> "lets do those next steps but first i want you to fix the wishlist
> part of the app. it is bugging out and wont auto populate shows when
> i type in an artist."
>
> "and fix the formatting here" *(screenshot of the overlap)*
>
> "with the ranking in the corner"

## Plan

Three small, focused edits — no new components.

- Route `fetchUpcomingEvents` through `${CORS_PROXY}` like every other
  third-party call in `api.js`. Normalise Bandsintown's `region` →
  `state` so the dropdown row template (shared with Setlist.fm) renders
  the right thing.
- Add an explicit empty-state row to the LogShow dropdown when the
  search returned nothing, instead of silently closing the picker. New
  `showsSearched` flag keeps the empty UI from flashing on first focus.
- Move the score circle out of the body and into the hero as an
  absolute-positioned badge in the bottom-right corner. Give vibes their
  own clean row directly under the hero.

## Changes made

- 2026-04-19: `src/web/api.js` — `fetchUpcomingEvents` now hits
  `https://corsproxy.io/?<encoded bandsintown url>`, returns up to 8
  results, and exposes a `state` field mapped from Bandsintown's
  `region` so the LogShow row template doesn't have to branch by source.
- 2026-04-19: `src/web/pages/LogShow.jsx` — added `showsSearched`
  state, set in `.finally()` of the autocomplete effect; dropdown now
  always opens after a search and shows a friendly empty-state message
  with a hint about exact-name matching when nothing comes back.
- 2026-04-19: `src/web/components/ShowDetail.jsx` — score circle moved
  into `<div className="detail-hero">` as `<div className="detail-hero-score">`;
  vibes now render as `<div className="detail-vibes-row">` directly in
  the body, no longer competing with the score for horizontal space.
- 2026-04-19: `src/web/App.css` — added `.detail-hero-score` (60px,
  bottom-right of hero, white border + drop shadow so it reads against
  any artist photo) and `.detail-vibes-row` (clean flex-wrap row,
  18px top margin). Left the old `.detail-score-row` /
  `.detail-score-circle` / `.detail-vibes` classes in as harmless
  unused styles for now.
- 2026-04-19: `npm run build` passes clean (87 modules, 0 warnings).

- 2026-04-19 (follow-up): Bandsintown is exact-match only, so partial
  typing like "Luke C" returned `[]` and triggered the empty-state too
  aggressively. Added `searchArtists()` in `src/web/api.js` (Deezer
  `/search/artist`) and rewired the LogShow wishlist autocomplete:
  Deezer first → top match's canonical name → Bandsintown lookup. When
  Bandsintown still has no events but Deezer recognised the artist,
  the dropdown now shows artist-picker rows (avatar + name + fan count)
  instead of "no results". Tapping a suggestion replaces the typed text
  with the canonical name and re-fetches. Also added a robust
  `bandsintownRaw()` helper that tries direct then proxy and warns on
  non-array responses (`{errors}`, `{warn}`, `{message}`) so future
  silent failures are visible in the console. Min query length dropped
  from 3 → 2 chars for wishlist mode (Deezer is fuzzy enough to handle
  short queries). Build passes clean.

- 2026-04-19 (BLOCKER discovered): User shared browser console output
  showing **`Bandsintown 403 Forbidden`** on both the direct call AND
  the proxy fallback for "Luke Combs". This is not a CORS issue and
  not an "artist not found" issue — Bandsintown's public REST endpoint
  has been locked down to require registered partner `app_id`s.
  `app_id=melo` is silently rejected. The Deezer artist autocomplete
  worked perfectly in the same screenshot (Luke Combs, 346,731 fans;
  Lee Combs; Luke Coulson all rendered), so the upstream pipeline is
  solid — only the Bandsintown leg is broken.

  **Decision pending from user**: which upcoming-events backend to
  swap to. Options proposed:
  1. Apply for Bandsintown partner app_id (slow, may be rejected)
  2. **Ticketmaster Discovery API** (recommended — free key, instant
     signup at https://developer-acct.ticketmaster.com/, CORS works,
     covers nearly every US venue). Drop-in replacement for
     `fetchUpcomingEvents`. Endpoint shape:
     `https://app.ticketmaster.com/discovery/v2/events.json?keyword=<artist>&apikey=<key>&classificationName=music&sort=date,asc`
     Store key in `.env.local` as `VITE_TICKETMASTER_KEY`.
  3. Drop the wishlist autocomplete; manual entry only

  User went to bed before deciding. Resume here next session.

- 2026-04-20: **Shipped Ticketmaster Discovery API swap.** Clarified
  with user that no website is required — Ticketmaster's Consumer
  Key is a simple API key (no OAuth, no redirect URL, no domain
  verification). User approved. Changes:
  - `src/web/api.js` — removed `bandsintownRaw()` helper entirely;
    rewrote `fetchUpcomingEvents()` to hit
    `https://app.ticketmaster.com/discovery/v2/events.json` with
    `keyword`, `classificationName=music`, `sort=date,asc`,
    `size=10`. Reads key from `import.meta.env.VITE_TICKETMASTER_KEY`.
    Degrades gracefully when key is missing (logs a one-time warning
    pointing at the signup URL, returns `[]` so the Deezer
    artist-picker fallback still renders). Filters results by
    artist-name match against the attractions array so generic
    keyword matches don't pollute the dropdown. Response shape
    normalised to the same `{ artist, venue, city, state, country,
    date, ticketUrl, lineup }` the Bandsintown path used, so
    LogShow's `pickShow()` autofill works with zero component changes.
  - `.env.example` — added `VITE_TICKETMASTER_KEY=...` with a comment
    pointing to the signup URL and noting the 5k req/day free tier.
  - `src/web/pages/LogShow.jsx` — attribution string updated from
    "Powered by Deezer + Bandsintown" to "Powered by Deezer +
    Ticketmaster".
  - `npm run build` passes clean (87 modules, 0 warnings).

  **Requires user action**: add `VITE_TICKETMASTER_KEY=<key>` to
  `.env.local` and restart `npm run dev` for it to pick up. Without
  the key, wishlist falls back to Deezer artist-picker only (no
  crashes).

- 2026-04-20: **Broadened wishlist search.** User reported a Mt Joy
  at Red Rocks (August) show wasn't appearing — root cause was the
  Ticketmaster call capping at `size=10` sorted ascending by date,
  so heavy-touring artists with 10+ near-dated shows had later dates
  silently truncated. Changes:
  - `src/web/api.js::fetchUpcomingEvents` — now takes an optional
    `opts = {}` bag accepting `{ city }`. Bumped Ticketmaster `size`
    from `10` → `50` (still well within 5k/day free tier). When
    `opts.city` is present, passes it as Ticketmaster's `city` query
    param (TM does fuzzy metro matching — "Denver" surfaces Red
    Rocks shows in Morrison, CO).
  - `src/web/pages/LogShow.jsx` — wishlist branch of the autocomplete
    useEffect now passes `{ city: city.trim() || undefined }` into
    `fetchUpcomingEvents`. The dep array already included `city`
    (added during the Setlist.fm city/year fix), so no dep-array
    change was needed — the wishlist search now refires live as the
    user fills in the City field.
  - Backward compatible: callers that pass only `(artistName)`
    continue to work; `opts` defaults to `{}`.
  - `npm run build` passes clean.

  Step 2 (separate "Going" tier between Wishlist and Attended) is
  user-approved but deferred to its own initiative pending feedback
  on this fix.

## Open questions / follow-ups

- The legacy `.detail-score-row`, `.detail-score-circle`, `.detail-vibes`
  CSS classes are now unused. Prune in a future cleanup pass alongside
  the unused `.detail-setlist*` classes (already noted in the playable
  setlists initiative).
- Empty-state copy assumes English; revisit when we add i18n.
- Bandsintown still requires the corsproxy.io public proxy. If that
  service ever rate-limits us we'll want to stand up our own proxy via
  a Supabase Edge Function (good Phase 4/5 task).
