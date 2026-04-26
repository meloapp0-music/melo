-- =============================================================
-- 0002_show_status.sql — add `status` to shows for the Going tier
-- =============================================================
-- Adds a third state between attended and wishlist: 'going' (user has
-- a ticket / is planning to attend). The legacy `wishlist` boolean is
-- retained as a compat shadow, kept in sync by the app data layer.
--
-- See docs/initiatives/2026-04-20-going-tier.md.

alter table public.shows
  add column if not exists status text;

-- Backfill existing rows. wishlist=true → 'wishlist'. wishlist=false →
-- 'attended'. There are no Going rows yet (this migration introduces
-- the concept), so the binary mapping is exhaustive.
update public.shows
  set status = case when wishlist then 'wishlist' else 'attended' end
  where status is null;

alter table public.shows
  alter column status set not null;

alter table public.shows
  alter column status set default 'attended';

alter table public.shows
  add constraint shows_status_check
  check (status in ('attended', 'going', 'wishlist'));

create index if not exists shows_user_status_idx
  on public.shows(user_id, status);
