-- 0007_battle_wins.sql
--
-- Adds a `battle_wins` counter to `shows`. Every time the user opens
-- ShowComparison and picks a second show, the auto-computed winner
-- gets `battle_wins` incremented by 1. Used by Wrapped as a tiebreaker
-- when multiple shows have the same numeric score:
--
--   Highest-rated show: score DESC, battle_wins DESC, date ASC
--   Top artist:         shows DESC, sum(battle_wins) DESC, name ASC
--
-- Per the v1.0.4 wrapped-juice initiative + user request 2026-05-07
-- ("when you compare shows, it should automatically take the battles
--  into consideration and rank shows... it's hard to know which show
--  is the top ranked show when 5 shows are 10/10").
--
-- Default 0 — existing rows behave as if they've never battled, which
-- is correct (no false claims). Counter is monotonic; a show that
-- loses a comparison doesn't decrement.

alter table public.shows
  add column if not exists battle_wins integer not null default 0;
