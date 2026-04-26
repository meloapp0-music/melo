# Festivals — discovery page powered by Ticketmaster + Going tier

- Started: 2026-04-20
- Status: shipped
- Last updated: 2026-04-20

## Context

User's ask (verbatim):

> "how do we feel about creating a festival section to the app? A place
> where you can see upcoming festivals, where it will recommend
> specific festivals and artists in that festival, best ticket options
> based on price and location, and then a link to tickets. this would
> be a good way for people to be able to keep track of festivals and
> when artists they ranked high or even saw, are playing and where
> they can see them outside or inside of their home state/city."

Melo's core loop is already _track concerts → see what's next_. Festivals
are a natural extension: multi-artist events where a user's top artists
often play together, and the discovery signal ("3 of your artists are
playing Primavera!") is high-leverage because we already know their
taste from the attended-show graph.

Two scope decisions the user approved up front:

1. **V1 = MVP that reuses the Going tier.** Ticketmaster-only. No
   cross-vendor (StubHub / SeatGeek / Vivid) price comparison — that's
   a multi-week initiative of its own with partner-program gating per
   marketplace.
2. **Home city = auto-detect from the most-common city across attended
   shows.** Zero user setup; works out of the box for anyone with a few
   shows logged. A Settings override can come later if auto-detect
   proves insufficient.

## Plan

No schema changes. No new external APIs. Thin, MVP-focused ship that
leans on existing Ticketmaster + Going tier infrastructure.

1. `api.js::fetchFestivals(opts)` — new TM Discovery query
   (`classificationName=Festival`), returns events normalized the same
   way `fetchUpcomingEvents` does with a `lineup: string[]` field
   (already populated from TM's `attractions` array in the existing
   mapper).
2. `store.js` — two new pure helpers: `topArtists(shows, limit)`
   (weighted by score + attendance + Going signal) and
   `inferHomeCity(shows)` (most-common city across attended shows).
3. `pages/Festivals.jsx` — new page. `Near Me | Anywhere` toggle,
   festival cards with a "N of your artists playing" badge when the
   intersection of festival lineup × user's topArtists is non-empty,
   two action buttons per card (`+ Going` → `addShow` with
   `status: 'going'`; `Tickets →` → external link).
4. `App.jsx` — route the new `festivals` subpage (accessed via Home
   CTA; bottom nav is already full).
5. `pages/Home.jsx` — new "Explore Festivals" CTA card between the
   "You're Going" countdown and "Recent Shows". Styled in the
   language of `.wrapped-banner` but with a distinct gradient so the
   two don't compete visually.
6. `App.css` — additive only (`.home-festival-cta`, `.festival-card`
   family, `.festival-mode-tabs` reusing `.log-status-tabs` pattern).

### Out of scope for v1

- Cross-vendor price comparison (StubHub, SeatGeek, Vivid).
- Day-by-day lineup browsing (multi-day festivals are sometimes
  multiple TM events; unifying them is non-trivial).
- Dedicated festival detail route (tap opens external ticket link).
- Notifications ("a loved artist got added to Festival X").
- Manual home city override.
- Persisting festival lineup on "+ Going" (the show row just has
  `artist: festival.name`; no lineup column today).

## Changes made

- 2026-04-20: scaffolded initiative log. Step 1 shipped as part of
  `2026-04-19-wishlist-and-detail-fixes.md`; Going tier landed in
  `2026-04-20-going-tier.md`. This initiative builds on both.
- 2026-04-20: `src/web/api.js` — added `fetchFestivals(opts)` next to
  `fetchAllUpcomingEvents`. Uses the TM Discovery endpoint with
  `classificationName=Festival`, `sort=date,asc`, `size=50` by
  default. Accepts `{ city, stateCode, size }`. Returns a normalized
  shape: `{ id, name, venue, city, state, country, date, endDate,
  ticketUrl, image, priceMin, priceMax, priceCurrency, lineup[] }`.
  Shares the same `_tmNoKeyWarned` flag as `fetchUpcomingEvents` so
  we warn once on missing `VITE_TICKETMASTER_KEY`, then silently
  return `[]`.
- 2026-04-20: `src/web/store.js` — added `topArtists(shows, limit=25)`
  and `inferHomeCity(shows)` helpers below `getWrappedYears`.
  `topArtists` weights attended shows by `score + 2` and Going shows
  by `+5` (clear "I like this artist enough to buy a ticket" signal,
  slightly weaker than an actual attended show). `inferHomeCity`
  returns the most-common `city` value across attended shows, or `''`
  if no signal.
- 2026-04-20: `src/web/pages/Festivals.jsx` — NEW page. Header with
  back button, subtitle, 2-tab segmented control (`Near <city>` /
  `Anywhere` — the Near tab is disabled if `inferHomeCity` returns
  empty). Loads via `fetchFestivals` on mode-switch. Each festival
  renders as a full-width landscape card with:
  hero image (16:9 from TM), name, city·state·date-range (with
  multi-day `May 15 – May 17, 2026` formatting), price range,
  "🎤 N of your artists playing" badge + up to 6 matched-artist chips
  (+more chip beyond that), and a 2-button action row: `+ Going`
  (calls `addShow` with `status: 'going'`, persists `artist:
  festival.name` — MVP doesn't store the lineup) and `Tickets →`
  (external link). Locally tracks `addedIds` so the `+ Going` button
  flips to a disabled `✓ Going` chip after tap.
- 2026-04-20: `src/web/App.jsx` — imported `Festivals`, added
  `if (subPage === 'festivals') return <Festivals />;` to `renderPage`
  above Settings. No bottom-nav change (nav is full — Festivals is a
  subpage accessed via Home CTA).
- 2026-04-20: `src/web/pages/Home.jsx` — added the "Explore
  Festivals" CTA card between the "You're Going" section and
  "Recent Shows". Teal→deep-blue gradient distinguishes it from the
  amber→orange Wrapped banner when both render.
- 2026-04-20: `src/web/App.css` — added `.home-festival-cta` (mirrors
  `.wrapped-banner` shape with the teal/blue gradient),
  `.festival-mode-tabs` (flex-1 children reusing `.shows-tab`
  styling), and the `.festival-card` family (`-img`, `-body`,
  `-title`, `-meta`, `-price`, `-badge`, `-matched-artists`,
  `.festival-artist-chip`, `.festival-actions`). Additive only.
- 2026-04-20: `npm run build` passes clean (88 modules, 0 warnings).

## Open questions / follow-ups

- If users start asking to see "who I saw at Coachella" in their
  history, add a `lineup text[]` column to `shows` and persist it on
  the `+ Going` tap.
- Consider refactoring Home's existing Discovery feed to use
  `topArtists()` next time that file changes (currently inlines
  similar genre+city logic).
- Festival classification in TM has been spotty in the past — if
  `classificationName=Festival` returns thin results in some regions,
  fall back to `genreName=Festival` or hand-curated festival keyword
  queries.
