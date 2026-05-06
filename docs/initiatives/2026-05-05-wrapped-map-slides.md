---
name: Wrapped Map Slides
description: New "You traveled for music" Wrapped slide section — venue + city + state/country counts, total miles traveled, animated map showing every concert location chronologically
type: project
---

# Wrapped Map Slides

- Started: 2026-05-05
- Status: planned (v1.1)
- Last updated: 2026-05-05

## Context

Wrapped today shows top artist, top venue, total shows, songs heard
live — but it doesn't acknowledge the *physical journey* of going to
all those shows. For users who travel for music (festival hoppers,
tour-followers, expats who fly home for a specific run), the
geography of their year is part of the story. And for casual users,
seeing a map glow with all their venues is the kind of "oh damn"
moment Spotify Wrapped is famous for.

The infrastructure is mostly already there:
- `pages/ConcertMap.jsx` already renders every venue on a Leaflet
  map with the `CITY_COORDS` lookup table (currently 30 hardcoded
  cities)
- `pages/Wrapped.jsx` already has the swipe-through story-slide
  format with photo backgrounds, gradient overlays, staggered
  reveals, Ken-Burns zoom

What's missing is a map-themed slide section that pulls geography +
travel stats into the Wrapped narrative.

## Plan

### Slide sequence (proposed)

Inserted after the existing artist/venue/song slides, before the
final shareable summary:

1. **"You traveled for music."** — intro slide, simple typography
   over a softly-rotating map preview in the background
2. **"X venues."** — huge number with venue thumbnails fanning out
   below
3. **"Y new this year. Z return visits."** — repeat-vs-new venue
   split (computed against shows logged in prior years)
4. **"Across A cities."** — city names cycling on screen
5. **"In B states / C countries."** — geographic spread
6. **"Animated map."** — full-bleed map. Camera flies between cities
   in chronological order. Dots pulse on each city as the visit
   "happens." Thin trailing lines drawn between consecutive shows.
   Mileage counter ticks up at the bottom: *"27,400 miles for live
   music."* Auto-plays through to completion before the user can tap
   to advance.
7. **"Most-visited venue."** — call out the venue you went to most
   this year with a hero photo

### Technical approach

**Stats math (easy, ~half day):**
- `venuesCount` = unique venues attended this year
- `repeatVenues` / `newVenues` = compared against shows in prior years
- `citiesCount`, `statesCount`, `countriesCount` = derived from city
  + a city → state/country lookup (extend `CITY_COORDS` or add a
  `CITY_META` table mapping city → `{lat, lng, state, country}`)
- `mostVisitedVenue` = mode of `(venue, city)` tuples
- `totalMiles` = sum of haversine distances between consecutive
  attended shows ordered by date (only counts shows where both
  prior and current have known coords)

**Map rendering — two options:**

**Option A (recommended for v1.1): reuse existing Leaflet stack.**
- `react-leaflet` or raw Leaflet (already in use on ConcertMap)
- Animated dots: simple `L.divIcon` with CSS `@keyframes` for the
  pulse
- Trailing lines: `L.polyline` between consecutive cities, drawn
  with a `setInterval` or `requestAnimationFrame` that adds points
  one at a time
- Camera animation: `map.flyTo()` between cities with
  `duration` chained via Promise
- Pros: zero new dependencies, matches ConcertMap aesthetic, works
  on iOS Capacitor without new native modules
- Cons: 2D map is less "wow" than a 3D globe

**Option B (stretch goal): add a 3D globe via `react-globe.gl`.**
- Beautiful rotating globe with arcs between cities
- Looks more like Spotify Wrapped's signature visual treatment
- Pros: stunning visuals, "global" feel matches the slide copy
- Cons: new dependency (~200 KB minified), Three.js under the hood
  (perf risk on older iPhones), different aesthetic from ConcertMap
- Defer to v1.1.5 or v1.2 if Option A ships first

**Geography resolution:**
- Current `CITY_COORDS` is 30 cities. Real users will have venues
  in cities not in the table.
- Solution: add a city-resolution Edge Function that calls a free
  geocoding service (Nominatim / OpenStreetMap, free for low volume)
  and caches results in a `city_geocode` Supabase table
- Pre-resolve all unique cities on first Wrapped open of the year
  so the slide doesn't flicker while waiting on lookups

### Edge cases

- **New users with <5 shows** — "27,400 miles" stat falls flat at
  3 shows. Need fallback copy + zoom level: show only their region
  (e.g., "You explored 3 cities in the Midwest"), skip the country
  count slide entirely, smaller mileage number
- **Single-city users** — if all shows are in one city, skip the
  travel slides and lean into "Your home base: X" as the angle
  instead. Don't fake-travel them
- **Performance** — users with 50+ shows in one year shouldn't
  freeze the slide. Cap visible animation to ~20 cities
  (chronological "highlights"); render the rest as static dots
- **Missing data** — if a show has no city or no resolved coords,
  it gets included in venue/city counts but skipped from the map
  animation. Don't break the experience for one bad row

### Where it lives in the Wrapped flow

Insert the new map-section slides **after** the song/artist slides
(which are the emotional core) and **before** the final shareable
summary card. Order roughly:
- Intro
- Top artists
- Top venues
- Top songs
- **NEW: travel/map section (slides 1–7 above)**
- Most-played song / standout shows
- Final shareable summary

This keeps the artist-focused emotional moments at the front and
treats the geography section as a "second act" before the closing.

## Changes made

- 2026-05-05: Initiative created. No code yet. Targeting v1.1
  (1–2 weeks after v1.0.2 ships and stabilizes).

## Open questions / follow-ups

- **Globe vs map:** ship with Option A (2D Leaflet, recommended) for
  v1.1, or invest the extra time in Option B (3D globe) for the
  stronger visual? Lean toward A for v1.1, B as a v1.1.5 upgrade
  if the slide is well-received.
- **Mileage units:** show miles by default, but for users in
  metric-default locales (UK, Australia, EU), use km. Detect via
  `Intl.NumberFormat`'s region or an explicit Settings toggle.
- **Privacy:** the map slide is private to the user by default. If
  shared (export to social), should venue addresses be obscured?
  Probably city-level only on shared cards, not exact venue
  coordinates.
- **Geocoding cost:** Nominatim is free but has a 1 req/sec rate
  limit and asks for a User-Agent. At scale we may need to switch
  to a paid service (Mapbox, Google Geocoding, ~$5/mo for our
  volume) or pre-populate `CITY_COORDS` from a static dataset like
  GeoNames (free, ~3 MB JSON).
- **Sharing the map slide as an image** — the slide is dynamic. For
  the share-out moment, render a static PNG version (Edge Function
  + Satori or sharp) so the OG share card has the user's actual map
  baked in. Lots of viral potential here.
- **Tie-in with Commemorative Tickets initiative:** if a user has
  a Coachella ticket in their collection, the map slide could
  highlight the festival visit with a special pin treatment. Cross-
  reference both initiatives during v1.2 build.
- **Tie-in with Concert Genealogy idea:** the map could double as
  a "places you might love" surface — venues your friends have
  visited that you haven't. Defer to a separate initiative.
