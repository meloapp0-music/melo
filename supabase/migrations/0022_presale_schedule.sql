-- 0022 — the presale schedule
-- ===========================
-- "Users should be the first to know when a presale goes live."
--
-- The obvious implementation is to poll Ticketmaster harder and harder until
-- you catch the moment. That's both expensive and worse: TM's free tier is
-- 5,000 requests/day, and even a one-minute poll is still up to a minute late.
--
-- But TM already tells you WHEN. `sales.presales[].startDateTime` is on the
-- event the moment the presale is announced, often days ahead. So polling only
-- needs to discover the schedule; the firing is a clock problem, not an API
-- problem. This table is that schedule.
--
--   presale-sweep  (every 15 min, costs API calls) — learns what exists
--   presale-fire   (every minute, costs ZERO API calls) — fires on time
--
-- Which is how a per-minute alert stays inside a 5,000/day budget.
--
-- docs/initiatives/2026-07-16-notification-digest.md

create table if not exists public.presale_schedule (
  event_id     text        not null,
  -- An event carries several presales — artist, venue, cardholder — each with
  -- its own start. They're separately notifiable, so the name is part of the key.
  presale_name text        not null,
  artist       text        not null,
  -- Melo's genre label (Rock, Hip-Hop, ...), mapped back from Ticketmaster's
  -- classification. Stored so presale-fire can match a user's followed genres
  -- without re-querying TM — the whole point of this table is that firing
  -- costs nothing.
  genre        text        not null default '',
  venue        text        not null default '',
  city         text        not null default '',
  ticket_url   text        not null default '',
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  -- When the sweep first saw this row. A presale we learn about only AFTER it
  -- already opened must not fire a "goes live now" alert hours late, and this
  -- is how fire tells the difference between "just started" and "we only just
  -- found out".
  first_seen   timestamptz not null default now(),
  primary key (event_id, presale_name)
);

-- The fire cron's only query: "what starts in the next minute?" — run 1,440
-- times a day, so it gets its own index.
create index if not exists presale_schedule_starts_at_idx
  on public.presale_schedule(starts_at);

-- Matching a presale back to the users who follow that artist, or that genre
-- in that city.
create index if not exists presale_schedule_artist_idx
  on public.presale_schedule(lower(artist));
create index if not exists presale_schedule_genre_city_idx
  on public.presale_schedule(genre, lower(city))
  where genre <> '';

alter table public.presale_schedule enable row level security;

-- No policies, deliberately. This is server-owned scheduling data written and
-- read only by the two crons under the service role, which bypasses RLS. There
-- is no user_id to scope by, so any policy here would expose every row to every
-- user. If a "presales coming up" screen is ever built, it should read through
-- a view or an RPC that scopes to the caller's watched artists — not by opening
-- this table up.
--
-- RLS enabled + zero policies = deny-all to anon and authenticated, which is
-- the intended posture, not an oversight.

comment on table public.presale_schedule is
  'Server-owned presale schedule. presale-sweep discovers rows from the
   Ticketmaster Discovery API; presale-fire reads starts_at every minute and
   sends the "presale is live" push without touching TM. Service-role only.';
