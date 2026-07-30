-- 0019 — explicit ranked position per show
-- ========================================
-- The rankings table has held an ELO score since 0001, fed by voting on random
-- pairs. That converges slowly and only ever to an estimate, and it lives on a
-- page the user has to go find — so most libraries have no meaningful order.
--
-- `position` is the real thing: a 1-based dense rank produced by binary-search
-- inserting each newly logged show into the existing list (2–5 questions, asked
-- at the moment the user is still thinking about the show). See
-- src/web/lib/ranking.js and docs/initiatives/2026-07-28-ia-simplification.md.
--
-- `elo` is KEPT, not dropped: Battle Mode still writes it, existing rows still
-- carry it, and nothing is gained by discarding data mid-migration. Readers
-- prefer `position` and fall back to score when it's null.

alter table public.rankings
  add column if not exists position integer;

-- Ranked order is always read for one user at a time, best-first.
create index if not exists rankings_user_position_idx
  on public.rankings(user_id, position)
  where position is not null;

comment on column public.rankings.position is
  '1-based rank within the user''s library, best = 1. Written wholesale on each
   insertion (see lib/ranking.js toPositions). Null = never placed.';

-- RLS is unchanged: the "rankings self all" policy from 0001 already scopes
-- every operation to auth.uid(), and a new column inherits it. Nothing here
-- widens access.
