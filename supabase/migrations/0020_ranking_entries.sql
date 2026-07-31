-- 0020 — rank OUTINGS, not shows
-- ==============================
-- Every layer of Melo already treats a festival as one night out: groupIntoOutings
-- collapses it, the Shows count counts it once, festivalKey excludes its stages
-- from the venue count. Every layer except ranking, which still sees N rows —
-- so a twelve-act Coachella floods the leaderboard with twelve entries and the
-- back-catalogue ranker wants ~50 questions for one weekend.
--
-- `rankings.show_id` is a PRIMARY KEY with an FK and `on delete cascade`, so it
-- can't be widened in place. This is a new table alongside it.
--
-- ROLLBACK: `rankings` is left populated and untouched. The client simply stops
-- reading it. If this goes wrong, revert the client and the old order is still
-- there. Drop `rankings` in a later migration once this has proven out.
--
-- See docs/initiatives/2026-07-30-rank-outings-not-shows.md

-- entity_key is a show uuid (standalone) OR a festival key ("coachella|2025").
-- Text, not uuid, precisely so it can be either.
--
-- scope: 'outing'            — festivals + standalone shows, ranked together
--        'festival:<key>'    — the sets inside one festival, ranked against
--                              each other only
-- The two never mix: a festival set competes with other sets from that
-- festival; the festival competes with other nights out.
create table if not exists public.ranking_entries (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  scope      text    not null,
  entity_key text    not null,
  position   integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope, entity_key)
);

-- Ranked order is always read for one user + one scope, best-first.
create index if not exists ranking_entries_lookup_idx
  on public.ranking_entries(user_id, scope, position);

-- Same shape as the "rankings self all" policy from 0001 (:164-168). Strictly
-- private to the owner — a user's ordering is never visible to anyone else,
-- which is why friend-facing surfaces keep showing the raw entered score.
-- Nothing here widens access.
alter table public.ranking_entries enable row level security;

drop policy if exists "ranking_entries self all" on public.ranking_entries;
create policy "ranking_entries self all" on public.ranking_entries
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists ranking_entries_touch on public.ranking_entries;
create trigger ranking_entries_touch before update on public.ranking_entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Backfill from rankings.position
-- ---------------------------------------------------------------------------
-- The entity_key expression below MUST match festivalKey() in src/web/store.js:
--     lower(trim(festival)) || '|' || first 4 chars of date
-- Verified against real row shapes before running; a silent mismatch here would
-- orphan every migrated ranking.
--
-- A festival whose rows were each ranked individually collapses to ONE entity,
-- so take the best (lowest) position per entity, then re-densify with
-- row_number() so the result has no gaps.
insert into public.ranking_entries (user_id, scope, entity_key, position)
select user_id,
       'outing',
       entity_key,
       row_number() over (partition by user_id order by best_pos, entity_key)
from (
  select r.user_id,
         coalesce(
           nullif(lower(trim(s.festival)), '') || '|' || left(s.date::text, 4),
           s.id::text
         ) as entity_key,
         min(r.position) as best_pos
  from public.rankings r
  join public.shows s on s.id = r.show_id
  where r.position is not null
  group by 1, 2
) collapsed
on conflict (user_id, scope, entity_key) do nothing;

-- ---------------------------------------------------------------------------
-- Orphan cleanup
-- ---------------------------------------------------------------------------
-- entity_key is text, so nothing cascades when a show is deleted. Three things
-- make that safe rather than merely tolerable:
--   1. readers ignore keys they can't resolve, so an orphan is inert
--   2. savePositions rewrites a whole scope, so orphans vanish on the next rank
--   3. this trigger covers the standalone case cheaply
-- Festival-key orphans (deleting the LAST show of a festival) survive until the
-- next re-rank. Inert, and not worth the bookkeeping.
create or replace function public.prune_ranking_entries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Matching on the key alone covers both cases a deleted show can appear in:
  -- its own 'outing' entry (standalone) and its 'festival:<key>' entry (a set).
  -- A festival's own outing key is a name, never a uuid, so it can't collide.
  delete from public.ranking_entries
   where user_id = old.user_id
     and entity_key = old.id::text;
  return old;
end;
$$;

drop trigger if exists shows_prune_rankings on public.shows;
create trigger shows_prune_rankings after delete on public.shows
  for each row execute function public.prune_ranking_entries();
