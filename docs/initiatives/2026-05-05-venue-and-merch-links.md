# Venue & Merch Links on Show Detail

- Started: 2026-05-05
- Status: in-progress (Phase 1 = venue links, shipping in v1.0.3)
- Last updated: 2026-05-06

## Context

Asked by user (2026-05-05):

> "i also want to add a venue piece to it and how theres a link on each
> show that will take you to the official venue page and then where to
> get merchandise or a link to the official merchandise page for the
> artist or tour."

Today, ShowDetail shows the venue name as plain text. There's no path
out of Melo to:

- The venue's official page (calendar, parking, map, food, dress code)
- The artist's official merch store
- Tour-specific merch (which is often a separate Shopify storefront from
  the artist's main merch — Taylor Swift Eras Tour merch ≠ Taylor Swift
  store)

This is a low-effort, high-value addition. It also opens an obvious
revenue surface later (affiliate links via Shop Apps / Shopify Collabs /
Bandcamp affiliate / Ticketmaster's existing partner program).

## Plan

Three lookup paths, each with its own data source. They're independent —
ship them in any order.

### A. Venue links

**Goal:** Tap "Brooklyn Steel" on a show → opens the venue's official page.

- Add `venue_url` to `shows` table (nullable text)
- Resolution at log-time: when LogShow autofills a show from Setlist.fm or
  Ticketmaster, we already have venue name + city. Try in order:
  1. **Ticketmaster Discovery API** — `/venues.json?keyword=...&city=...`
     → returns `url` field with official venue page
  2. **Setlist.fm venue endpoint** — `venueId` we already store → returns
     `url`
  3. **Heuristic fallback** — Google search "{venue} {city} official
     site" via SerpAPI or just an outbound `?q=` link
- New `venue_links` cache table keyed by `(venue_name, city)` so we don't
  hit upstream for the same venue twice
- UI: venue name on ShowDetail becomes a tappable pill with an external-
  link icon. Long-press → "Open in browser / Copy link"

### B. Artist merch links

**Goal:** Tap "Get merch" on a show → opens the artist's official store.

- Add `merch_url` to `artists` table (or to `profiles`-style separate
  `artist_meta` table — no schema for that yet, so just denormalize on
  shows for now)
- Resolution: Spotify Artist API exposes `external_urls` but not merch.
  Best sources:
  1. **Bandcamp lookup** — many artists link Bandcamp on their socials
  2. **Shopify Storefront detection** — check for `merchbar.com/artist/X`
     redirect (Merchbar aggregates official artist stores)
  3. **Manual override** — admin tool for top artists where automated
     lookups fail; over time this becomes the primary source
- UI: "Get merch" button on ShowDetail, hidden when `merch_url` is null

### C. Tour merch links (the harder one)

**Goal:** Tap "Tour merch" → opens the merch store for *this specific
tour*, not the artist's catalog store.

- Tour data is messy. Setlist.fm has a `tour.name` field on some setlists
  but it's user-edited and inconsistent.
- Approach:
  1. Extract `tour_name` from Setlist.fm autofill where available
  2. Cache `tour_merch_url` against `(artist_id, tour_name)`
  3. Manual override is the primary input — there's no clean API for
     "Eras Tour merch URL." Surface a "Suggest a link" button so users can
     contribute.
- UI: "Tour merch" button appears alongside "Get merch" only when both
  exist and they're different URLs

## Phasing

- **Phase 1 (cheap):** Venue links via Ticketmaster API. Ships in v1.1.
- **Phase 2:** Manual merch override admin tool + top-100 artists
  pre-seeded. Ships in v1.2.
- **Phase 3:** Tour-specific merch + community submission. v1.3+.
- **Phase 4 (revenue):** Replace direct links with affiliate-tagged links
  for any partners we can sign (Bandcamp, Merchbar, Shopify Collabs).
  Disclose affiliation in Privacy/Terms. Tracked in
  `2026-04-20-make-it-legal.md` follow-up.

## UI placement

ShowDetail card stack already has: Hero → Score → Vibe → Setlist → Buddies
→ Comparison. Insert a new "Links" card between Vibe and Setlist:

```
[Venue page →]   [Get merch →]   [Tour merch →]
```

3 pill buttons. Hide any pill where the URL is null. If all 3 null, hide
the entire card.

## Changes made

- 2026-05-06: Re-prioritized in response to user feedback. Pulled
  Phase 1 (venue links via Ticketmaster) forward into v1.0.3 — the
  cheapest user-facing win in the whole roadmap. Implementation
  starting today.
- 2026-05-06: Migration `0006_venue_url.sql` adds `venue_url text not
  null default ''` to `shows`. `db/shows.js` mapping adds `venueUrl`
  ↔ `venue_url`. New `lookupVenueUrl(name, city)` helper in `api.js`
  uses Ticketmaster Discovery `venues.json` endpoint. LogShow autofill
  captures it from the picked event. ShowDetail renders a "Venue
  page ↗" pill above the vibes row when `venueUrl` is non-empty, and
  surfaces a "Find venue page" lookup button for older shows where
  the field is empty.
- 2026-05-06 (later): UX rework after dev test surfaced two real
  problems with the first cut: (a) Ticketmaster's `venue.url` points
  to its own listing page, not the venue's official website, so the
  pill linked users to Ticketmaster instead of brooklynsteel.com / etc;
  (b) the pill text used `var(--cream)` against the cream-colored body,
  rendering the label invisible — only the pin emoji showed. Fixes:
  - Rewrote `lookupVenueUrl` to use Wikipedia OpenSearch → Wikidata
    QID → property P856 ("official website"). Anonymous CORS-enabled
    APIs, no key required. Coverage is great for venues with Wikipedia
    entries (most major + mid-size venues).
  - Stopped capturing `venueUrl` from `fetchUpcomingEvents` and
    `fetchSetlists` — both return their respective platforms' internal
    venue pages, not official sites. Field stays empty at log-time.
  - ShowDetail auto-resolves on open instead of waiting for a tap.
    State machine: idle / loading / not_found. Pill always shows the
    venue name as label (`{show.venue}`), not "Venue page" — users
    know what they're tapping. Pin emoji becomes a small leading icon.
  - Stale-URL detection: any saved `venueUrl` containing
    `ticketmaster.com` or `setlist.fm` is treated as stale and
    re-resolved automatically. Heals dev installs that saved bad URLs
    during the first cut without requiring a wipe.
  - CSS uses `var(--brown-muted)` for text color — visible against the
    cream body. Pill background is a soft orange tint, hover deepens.
    `.detail-link-pill-name` truncates with ellipsis at 220px so a
    long venue name doesn't break the row.

## Open questions / follow-ups

- **External link warning?** iOS won't warn but App Store reviewers care
  about "leaving the app to commerce." Probably fine since we're not
  taking payment in-app. Confirm with `2026-04-20-make-it-legal.md`.
- **Affiliate disclosure timing.** If we go affiliate at any point, the
  Privacy/Terms page needs an FTC-compliant disclosure block. Don't
  retrofit — write it in from Phase 4 day one.
- **Stale URLs.** Venue redirects 5 years from now. Need a
  user-reported-broken flow. "This link doesn't work" → flags the row
  for re-resolution.
- **Cache TTL.** Venue URLs probably stable for years. Tour merch URLs
  go dead the day the tour ends. Different TTLs per cache table.
- **Cross-link with `2026-05-05-recommendations.md`** — once we have
  venue URLs, the recommendation engine can recommend "shows at venues
  you've loved before" with a tap-through to the venue calendar.
