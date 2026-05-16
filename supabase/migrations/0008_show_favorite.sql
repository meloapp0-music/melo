-- 0008_show_favorite.sql
--
-- Adds an `is_favorite` flag to `shows`. The user can star any show
-- from ShowDetail; the My Shows page gains a "★ Favorites" filter.
-- Per docs/initiatives/2026-05-15-v1-0-5-favorite-and-vibes.md.
--
-- Default false — existing rows are simply un-favorited, which is
-- correct. No backfill needed. RLS already covers the column: the
-- shows-table policies are row-level (owner-only), so no new policy
-- is required for an added column.

alter table public.shows
  add column if not exists is_favorite boolean not null default false;
