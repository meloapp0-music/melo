-- 0006_venue_url.sql
--
-- Per the venue-and-merch-links initiative
-- (docs/initiatives/2026-05-05-venue-and-merch-links.md), Phase 1.
--
-- Adds an optional `venue_url` text field to `shows` so a logged
-- concert can carry the official venue page URL alongside its
-- name + city. Resolution paths (in priority order):
--   1. Ticketmaster Discovery API — `venue.url` on the events.json
--      response, captured at log-time when the user picks a Future
--      tab autofill suggestion
--   2. Ticketmaster `venues.json` keyword lookup — used both at
--      log-time for Past tab autofill (Setlist.fm doesn't always
--      surface venue URLs) and on-demand for older shows logged
--      before this column existed
--   3. Future fallback: Setlist.fm venue endpoint when we cache
--      it in the proxy
--
-- Empty string by default = "no venue URL captured yet," which renders
-- as a "Find venue page" lookup button on ShowDetail rather than a
-- live link. Once resolved, the column flips to the real URL and the
-- pill becomes a tappable external link.
--
-- No FK to a `venues` table — same heterogeneous-source rationale as
-- `festival` in 0005. We can normalize later if/when a venues table
-- earns its keep.

alter table public.shows
  add column if not exists venue_url text not null default '';
