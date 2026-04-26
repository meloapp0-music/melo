# Clickable Home stats — drill-down into Shows / Artists / Cities

- Started: 2026-04-20
- Status: shipped
- Last updated: 2026-04-20

## Context

User's ask (verbatim):

> "now can you find a way to add a map feature to the app. maybe where
> people can click on the top part of the home page where they see how
> many cities theyve gone to and it will take you to a map that shows
> you where you've been? also make that a thing for all 3 home page
> buttons. you should be able to click on shows and itll take you to
> just a list of all the shows you've seen ever. same with artists,
> and with cities you hsould be bale to click on it and go to a map
> to see where youve been around the country or world"

The home hero already shows Shows / Artists / Cities / Avg Score /
Streak as pure stats. Making the three counting stats (Shows, Artists,
Cities) tap-into drill-downs turns the hero from a static readout into
an app-wide navigation surface — the user's own stats become the
entry points.

Good news: two of the three drill-downs already exist. MyShows'
Attended tab is a list of all attended shows (Shows), and ConcertMap
is a city-pin globe already built (Cities) — it just wasn't reachable
from anywhere in the UI since the bottom nav was reorganized.
Artists is the new thing to build.

## Plan

1. **Shows stat** → `navigate('shows')` — the existing MyShows tab
   defaults to the Attended filter and already renders a grid/list of
   every attended show.
2. **Cities stat** → `navigate('map')` — the existing `<ConcertMap />`
   renders pin markers per city on a Leaflet globe. Wire up via the
   app's tab routing (the `'map'` branch in `App.jsx::navigate` was
   already live from when the bottom nav had a Map tab; re-activating
   it via a stat-tap doesn't need any new routing plumbing).
3. **Artists stat** → `navigate('artists')` — NEW `pages/Artists.jsx`
   subpage. Collapsible-list UI modeled after the existing Songs
   page: each attended artist gets a card with their image, show
   count, and avg score; tap to expand → inline list of that
   artist's shows, each tappable to open `<ShowDetail>`.
4. Add a **Back button** to `ConcertMap` so the Cities drill-down is
   escapable without hunting for a bottom-nav tab (the Map tab no
   longer exists in the bottom nav).
5. Convert the three target stat blocks on Home from `<div>`s to
   `<button>`s with a `.home-stat-btn` reset class — preserves the
   existing visual but adds cursor, press animation, keyboard focus,
   and a proper `aria-label`.

### Why not also make Avg Score / Streak clickable?

Neither has a natural drill-down right now. Streak already has its
own nudge; Avg Score is a readout of the same data the Shows list
shows. If we add a "score history" chart later it's a nice place to
put it, but not today.

## Changes made

- 2026-04-20: `src/web/pages/Artists.jsx` — NEW page. Per-artist
  summary (image, name, count, avg score), sorted by show count then
  recency. Search box filters by artist name. Collapsible cards that
  expand to reveal that artist's shows inline; each row taps through
  to `<ShowDetail>`. Empty state + no-match state.
- 2026-04-20: `src/web/App.jsx` — imported `Artists`, added
  `if (subPage === 'artists') return <Artists />;` to `renderPage`.
- 2026-04-20: `src/web/pages/Home.jsx` — wrapped the Shows / Artists
  / Cities stat blocks in `<button className="home-stat home-stat-btn">`
  with `navigate('shows')`, `navigate('artists')`, `navigate('map')`
  handlers respectively. Avg Score + Streak stay as plain `<div>`s.
- 2026-04-20: `src/web/pages/ConcertMap.jsx` — added a standard
  `.back-btn` at the top of `.map-title` that routes back to Home.
  Also pulled `navigate` out of `useApp()`.
- 2026-04-20: `src/web/App.css` — added `.home-stat-btn` (native
  button style reset + press animation). Added `.artist-card` family
  (`-head`, `-thumb`, `-info`, `-name`, `-meta`, `-chevron`,
  `-shows`) + `.artist-show-row` (`-info`, `-venue`, `-date`,
  `-score`) modeled after the existing `.songs-artist-card` pattern
  but keyed independently. Bumped `.map-wrap` height calc from
  `100dvh - 180px` to `100dvh - 210px` to make room for the new
  back button in the map title.
- 2026-04-20: `npm run build` passes clean (89 modules, 0 warnings).

## Open questions / follow-ups

- Tapping an artist card could also link to "all shows by this
  artist" in MyShows with the artist as a filter — today we just
  expand inline. If users start using Artists as a navigation surface
  more than a readout, consider adding that filter route.
- Avg Score and Streak stats could become clickable drill-downs if
  we build a score-history or streak-calendar view later.
- The in-memory `CITY_COORDS` map in ConcertMap is hardcoded and
  limited. Any show logged in a city not in that map won't appear on
  the globe. When this bites a user, switch to a geocoding service
  (e.g. Nominatim via CORS proxy) and cache to localStorage.
