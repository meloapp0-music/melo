---
name: know-before-you-go
description: Show-day "Know Before You Go" card — deep-links to artist/venue Instagram + the venue's official info, and surfaces real Ticketmaster show-day fields (rules, parking, box office, start time). Cannot fetch the actual IG post (no API); lands the user on the venue's IG instead.
type: project
---

# Know Before You Go (show-day info card)

- Started: 2026-07-15
- Status: built + reviewed (5 findings fixed) + live-verified (dev) — awaiting logged-in device eyeball
- Last updated: 2026-07-15

## Decisions (Aidan, 2026-07-15)
Both placements (pop-up + detail section, shared component); web-link
deep-linking for v1 (no new deps / no Info.plist); paste-the-post-URL deferred.

## Changes made
- 2026-07-15: **api.js** — `fetchShowDayInfo(artist,venue,date)` generalizes the
  old start-time lookup (same TM query + date/venue match) into the full KBYG
  blob (startTime, status, notes, venueRules, agePolicy, parking, boxOffice[],
  accessibility, ticketLimit, seatmapUrl, tmEventUrl), session-cached incl. a
  null-miss; `fetchEventStartTime` kept as a thin wrapper. `fetchVenueSocials`
  reads Wikidata P2003 (IG) / P2002 (X) via the same Wikipedia→QID path as
  `lookupVenueUrl` (never guesses a handle). `igHandleFromUrl` / `igProfileUrl` /
  `igSearchUrl` / `artistSocials` helpers. **Widened `fetchArtistBio` url-rels
  cap 3→10** — MusicBrainz orders rels alphabetically, so Instagram sits behind
  Facebook/Twitter and a cap of 3 dropped it (caught live: Noah Kahan's IG is at
  index 13). No other consumer of `bio.urls`, so safe.
- 2026-07-15: **components/ShowDayInfo.jsx** (new) — the shared, self-contained
  panel. Floor rows (Directions/Venue info/Bag policy/Find-on-Instagram) build
  from the show alone; TM rows + artist/venue IG layer in when resolved. Renders
  all venue free-text as TEXT. Verified-handle → "Venue on Instagram"; no handle
  → "Find on Instagram" (site:instagram.com search).
- 2026-07-15: **components/KnowBeforeYouGo.jsx** (new) — the day-of pop-up: the
  HypeCard shell (hero + "TONIGHT" pill) wrapping a scrollable ShowDayInfo.
- 2026-07-15: **App.jsx** — split the hype memo (`daysUntil===0` → KBYG with a
  `melo_kbyg_<id>_<dayStamp>` gate; 1–2 → HypeCard). Render priority
  ratePrompt > kbyg > hype, same one-card-per-day + guard chain.
- 2026-07-15: **ShowDetail.jsx** — replaced the inline show-day card with
  `<ShowDayInfo show={show}/>` (removed the now-redundant weather/startTime
  state + effect + 4 unused imports).
- 2026-07-15: **App.css** — `.showday-info` / `.showday-status` / seatmap / TM
  link / `.kbyg-*` modal styles; `.showday-links` wraps (up to 5 actions).
- 2026-07-15: **Live-verified** against real data (throwaway harness rendering
  the actual components, deleted after): Noah Kahan @ Wrigley today → 6:30 PM
  showtime + 92°/75° weather + Cubs ballpark site (Wikidata P856) + IG SEARCH
  fallback (Wrigley has no Wikidata handle) + Noah's real IG + TM event URL;
  Goose @ Red Rocks → VERIFIED "Venue on Instagram" (redrocksco). Pop-up modal
  renders + scrolls. Build clean, no console errors.
- 2026-07-15: **Adversarial review pass (8-agent workflow, every finding
  re-verified against the code) — 5 confirmed defects, all fixed:**
  1. **[HIGH] KBYG pop-up inner scroll never engaged** → rich TM content clipped
     the "View show details" / "Not now" buttons off-screen with no way to
     dismiss but the backdrop. `.hype-body` was a plain block, so `.kbyg-scroll`'s
     `overflow-y:auto` never activated and the card's `overflow:hidden` clipped
     the bottom. Fix (App.css, scoped to `.kbyg-card` so the plain HypeCard is
     untouched): make the body a bounded flex column (`min-height:0`) and give
     `.kbyg-scroll` `flex:1 1 auto; min-height:0`. **Re-verified live** against a
     6-field Soldier Field event: 2217px of info scrolls inside a 302px window
     while both buttons stay pinned in-viewport.
  2. **[MED] Dropping the `localTime` candidate filter** (needed so timeless
     events still contribute rules/parking) let the venue matcher pick a
     timeless — or cancelled — duplicate listing over the real on-sale one on a
     busy date, dropping the showtime chip. Fix (api.js): among venue matches,
     prefer an event that has a showtime AND isn't cancelled, then any with a
     showtime, then any live one, then anything.
  3. **[MED] ShowDayInfo leaked the previous show's data** when its ShowDetail
     instance was re-targeted without unmounting (the push deep-link path swaps
     the open show directly). The fetchers skip falsy results, so a null miss
     kept stale showtime/rules/status/IG on screen. Fix: reset all state at the
     top of the effect on `show.id` change.
  4. **[LOW] False "cancelled/postponed" badge** from a cancelled duplicate
     listing winning the match — subsumed by fix #2 (live events now preferred).
  5. **[LOW] Broken seat-map image** when TM's `staticUrl` 404s → added an
     `onError` that hides the frame instead of showing a broken-image glyph.

## Context
User request: on the DAY of a show, pop something up that links to the venue's
or artist's Instagram "know before you go" post (example: Wrigley Field's IG
post for Noah Kahan) or the equivalent info on the venue website.

## Feasibility verdict (honest)
A 3-lane research workflow (IG deep-linking · Ticketmaster fields · social/info
source coverage) + synthesis settled it:

- **CANNOT** fetch/embed the actual Instagram post. Meta killed the Basic
  Display API (Dec 2024); the Graph API only serves accounts you own. No
  keyless/ToS-clean way to fetch a public account's posts OR resolve a handle
  from a name. Scraping breaks ToS. This ~10% is off the table.
- **CAN** deliver ~90% of the felt value from code Melo mostly already has:
  land the user on the venue's IG in one tap + surface the official show-day
  info. Verified live: Wrigley's Wikidata has official website (P856) but no IG
  handle (P2003 empty) — so venue-IG is a ~40% marquee-only bonus tier, and the
  reliable degrade is a `site:instagram.com "venue"` search (one tap to their IG,
  where the real KBYG post lives).

## Data sources (all keyless/ToS-clean except TM, already used)
- **Show-day info** — one Ticketmaster call, a strict superset of what
  `fetchEventStartTime` already fetches (ZERO extra requests): `startTime`
  (label "Show starts", there is NO doors field), `dates.status.code`,
  `pleaseNote`/`info`, venue `generalRule`/`childRule`, `parkingDetail`,
  `boxOfficeInfo`, `accessibility`, `ticketLimit`, `seatmap.staticUrl`,
  `event.url`. Each ~40–48% populated → render only when present.
- **Artist IG + website** — already fetched. `fetchArtistBio().urls` carries the
  MusicBrainz `social network` + `official homepage` rels (currently unused for
  socials). Extract the handle from the instagram.com URL. ~100% coverage.
- **Venue official website** — existing `venue_url` → `lookupVenueUrl` →
  `venueSearchUrl` waterfall (already wired on ShowDetail).
- **Venue IG (bonus, ~40%)** — new `fetchVenueSocials(venue,city)` reading
  Wikidata P2003 (IG) / P2002 (X). Reuse the QID `lookupVenueUrl` already
  resolves for the photo feature (refactor it to expose the QID → no second
  Wikipedia round-trip). NEVER guess/slugify a handle (MSG's is "thegarden";
  slug-guessing surfaces impersonators). No handle → the site-scoped search.

## Plan (tiered so the card is never empty)
- **Component** `components/KnowBeforeYouGo.jsx` cloned from `HypeCard.jsx`
  (frosted shell, hero, "TONIGHT" pill). Always-shown floor rows (build from
  show.venue/city alone): Directions (`appleMapsUrl`), Venue website, "Find on
  Instagram", Bag policy (`venuePolicySearchUrl`). Conditional TM rows
  (rules/parking/box office/accessibility/ticket limit/seatmap/notes/status
  badge) each render only when populated. Artist IG + official-site chips.
  Footer "Full details on Ticketmaster" (attribution + escape hatch).
- **Trigger** — split App.jsx's existing `hype` memo: `daysUntil === 0` →
  KnowBeforeYouGo (new `melo_kbyg_<id>_<dayStamp>` gate), `daysUntil 1–2` →
  existing HypeCard. Reuse the one-card-per-day `momentSnoozedDay` gate + the
  render-guard chain; RatePrompt keeps priority.
- **Also** expand ShowDetail's existing `showday-card` into the full layout so
  the pop-up and the detail section share one `fetchShowDayInfo` call (the
  day-of push already deep-links here).
- **Deep-linking v1** — https universal links for everything
  (`https://instagram.com/{handle}` opens the IG app if installed, else Safari;
  same for X, the search, website, seatmap, TM). ZERO new deps, no Info.plist,
  no App Store review change. App-first (`@capacitor/app-launcher` +
  `instagram://user?username=` + `LSApplicationQueriesSchemes`) is a v1.1 polish.

## Copy honesty (from the research)
Label the showtime "Show starts" not "Doors". Label the venue-IG fallback "Find
on Instagram" (it's a search) not "Venue's Instagram" (implies verified). Render
all free-text venue fields as TEXT, never HTML.

## Open questions (need Aidan's call before building)
1. **Placement** — day-of pop-up modal, or just expand the ShowDetail show-day
   section, or both? (Recommend both, shared component.)
2. **v1 deep-linking** — https universal links only (no deps/native changes)
   vs invest in app-launcher app-first now? (Recommend https v1.)
3. **"Paste the venue's KBYG post URL once, store per-venue"** — the ONLY way to
   auto-reach the exact Wrigley post on repeat. Adds a per-venue store + input
   UI, manual. Defer? (Recommend defer.)
4. Confirm venue-IG is framed as a bonus row (~40%, marquee-only), not a headline.
5. Persist resolved venue IG/X handles (a `venue_ig` sibling to `venue_url`, or a
   local cache) so we don't re-query Wikidata every show day.
