-- 0005_show_festival.sql
--
-- Adds an optional `festival` text field to shows so a logged concert
-- can carry context like "Jazz Fest" or "Coachella" alongside its
-- artist + venue. Free-form text — no FK to a festivals table — because
-- the source of festival names is heterogeneous (Setlist.fm `info`
-- field, Ticketmaster Discovery API, or the user typing it themselves).
--
-- Empty string by default = "no festival association," which renders
-- as a no-op in the UI.

alter table public.shows
  add column if not exists festival text not null default '';
