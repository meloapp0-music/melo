-- 0009_show_openers.sql
--
-- Adds an `openers` text[] column to `shows`. Mirrors the existing
-- `buddies` array pattern. Each show can have 0+ opening acts.
-- LogShow surfaces these as chip input + auto-suggests them from
-- Ticketmaster's lineup data (upcoming shows) and a Setlist.fm
-- co-act lookup at the same venue+date (past shows).
--
-- Per docs/initiatives/2026-05-21-v1-0-6-photos-and-openers.md.
--
-- Default empty array — existing rows simply have no openers, which
-- is correct. RLS already covers shows row-level (owner-only); a
-- new column inherits that protection without a policy change.

alter table public.shows
  add column if not exists openers text[] not null default '{}';
