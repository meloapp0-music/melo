# Real venue photos on "Your Rooms"

- Started: 2026-07-13
- Status: in-progress
- Last updated: 2026-07-13

## Context
The redesigned Venues page ("Your Rooms") renders each venue as a gradient
card. Aidan wants real photographs of the venues, tied to the venue data, for
"any venue" — asking which public source we can use.

A parallel research pass (workflow `venue-image-research`, 5 agents, live-tested
against MSG / United Center / Empire Polo Club / Red Rocks / Schubas) settled the
approach:

- **Wikimedia Commons via the Wikipedia pageimages API is the source.** Keyless,
  CORS-enabled (`origin=*`), unmetered, real building photos. Same infra the app
  already calls in `lookupVenueUrl`. ~90%+ coverage for arenas / amphitheatres /
  stadiums / festival grounds.
- **Ticketmaster was rejected** — its venue "images" are 205×115 generic stock,
  its ToS forbids the durable caching this needs, and the shared key was already
  429'd. No value as even a fallback.
- **Small independent clubs mostly have no Wikipedia article** (Schubas, Empty
  Bottle) → they degrade to today's gradient. Coverage is best where a photo
  matters most.
- A **Mapbox static-map tier** was considered and deferred (needs a public token
  in the bundle, shows rooftops not facades). Left as a future flag.

## Plan
Source waterfall, first hit wins, per venue:
1. **Wikipedia pageimages** — one `generator=search` call returns lead thumbnail +
   coordinates + `wikibase_item` for up to 6 candidates. Pick the first candidate
   that passes the false-match guard (§ guardrails).
2. **Wikidata P18** — only when the matched article had no lead thumbnail; resolve
   its QID → `Special:FilePath` Commons URL.
3. **Gradient** — today's `getArtistGradient(name)`. Never fails.

Resolver mirrors the existing artist-image pattern exactly: sync getter
(`getVenueImage`) + async fill (`prefetchVenueImages`) exposed on `AppContext`,
backed by a 90-day localStorage cache that negative-caches misses.

False-match guards (an unverified fuzzy hit would confidently show the wrong
building / a person / an album cover):
- **Coordinate check** — when the venue's city resolves to a point (`resolveCity`
  in `lib/geo.js`), the candidate must carry coordinates within ~25 mi. People,
  albums, and tours carry no coordinates → auto-rejected.
- **Name-token overlap** — the matched page title must share a significant token
  with the venue name (venue-type filler stripped).
- **Fail closed** — no candidate passes → cache the miss, show the gradient.

Licensing: Commons lead images are mostly CC BY / CC BY-SA. Credit (author +
license + link) is fetched once at resolve time (`imageinfo` extmetadata), stored
in the cache record, and shown as an unobtrusive caption on the full VenueDetail
page. Grid thumbnails carry no caption but link through to VenueDetail (CC's
"reasonable to the medium" allowance).

## Changes made
- 2026-07-13: Research workflow (`venue-image-research`) → verified plan; wrote
  this initiative note.
- 2026-07-13: Built the resolver in `api.js` — `getCachedVenueImage` (sync),
  `fetchVenueImage` (Tier 1 pageimages → Tier 2 Wikidata P18, coord + name-token
  guard), `prefetchVenueImages` (serial, 300ms stagger, negative-cached, 90-day
  TTL). Imports `resolveCity`/`haversineMiles` from `lib/geo`.
- 2026-07-13: Exposed `getVenueImage` + `prefetchVenueImages` on `AppContext`
  (`App.jsx`), mirroring the artist-image getter/prefetch pattern.
- 2026-07-13: Wired photos into `Venues.jsx` (cards + home-venue hero, layered
  over the gradient) and `VenueDetail.jsx` (hero prioritises venue photo over a
  headliner photo; added a Wikimedia credit caption + `.venue-photo-credit` CSS).
- 2026-07-13: Candidate selection prefers an exact-name page that has a photo
  (canonical shot + clean credit) over the top search hit.
- 2026-07-13: Live-verified against real Wikipedia data — MSG, United Center,
  Empire Polo Club, Red Rocks, The Fillmore all resolve to real building photos
  within ~3 mi of the correct city; Schubas Tavern (no article) correctly falls
  through to the gradient. Build clean, dev server error-free.
- 2026-07-13: **Concert-bias pass** (Aidan: "not a sport game"). Instead of the
  article's lead image, we now score the venue article's whole image set by
  filename — reject sports (`game|NBA|hockey|basketball|playoffs|rink|...`),
  boost concert (`concert|stage|crowd|performance|tour|...`), allow neutral
  exteriors — and pick the best. MSG now returns a Lady Gaga concert shot;
  arenas return exteriors instead of games. Extra requests only fire when an
  article photo can beat the lead's score.
- 2026-07-13: **Non-venue guard.** Generic corporate venue names ("Wells Fargo
  Center") can match a same-named office tower / company / disambiguation page in
  the same city (the coordinate guard can't separate two buildings in one city).
  For non-exact-name matches only, we now verify the Wikidata `instance of`
  (P31) isn't a company/skyscraper/disambig type (`VP_NON_VENUE_QIDS`) and fall
  to the gradient if it is. Exact-name matches skip the check (no extra request).
  Verified: Wells Fargo Center → gradient (rejected the office tower) while
  Capital One / Chase / Crypto.com / Ball arenas still resolve via exact match.

- 2026-07-13: **Show photos as the top tier.** A venue's picture now prefers the
  user's OWN most-recent uploaded show photo at that venue (`latestShowPhoto` in
  store.js) over the Wikimedia photo — a real shot of the room from a night they
  were there. Fills the exact gap Wikimedia can't (new/indie venues like The Salt
  Shed) and reads as a personal diary. Priority everywhere: your show photo →
  Wikimedia → gradient. Wired into Venues cards/hero (`cardBg`) and VenueDetail
  hero; the Wikimedia credit caption only renders when the Wikimedia photo is the
  one actually shown.
- 2026-07-13: **Logo rejection.** Article images with no concert/exterior signal
  (score 0) are now rejected — they're often a brand logo or product shot (The
  Salt Shed's only article image is the Morton Salt logo). Better a clean gradient
  than a wrong picture. The editorial lead image is exempt.

## Open questions / follow-ups
- Ship the Mapbox static-map fallback for club-tier venues? (Needs a public token;
  shows rooftops not facades. Deferred behind a flag for now.)
- Consider a shared Supabase `venue_images` table so a photo is resolved once
  across all users instead of per-device (currently per-device localStorage).
