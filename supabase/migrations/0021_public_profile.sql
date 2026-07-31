-- 0021: Public profile pages — melo.show/@username
-- ================================================
-- The concert résumé. "47 shows · 3 countries · top artist: Coldplay" is a
-- link-in-bio artifact people share unprompted, which makes it the cheapest
-- acquisition loop in the app.
--
-- THE CRITICAL DIFFERENCE FROM 0016. A share token is unguessable, so a show
-- page is safe by obscurity plus opt-in. A profile URL is `@username` — it is
-- guessable BY DESIGN, that's the point. So the token trick doesn't apply and
-- this must be:
--
--   * OFF by default. `public_profile` defaults to false; an existing user
--     publishes nothing until they explicitly turn it on.
--   * Hard-filtered on that flag inside the function, so a username alone
--     reaches nothing.
--   * A hand-picked column list. No user_id, no notes, no buddies, no
--     venue_url, no share tokens — nothing the owner didn't intend to publish.
--
-- As with 0016 this adds NO rls policy to `profiles` or `shows`. `anon` still
-- has zero direct read access; the only public path is the function below.
--
-- See docs/initiatives/2026-07-30-public-profile.md

alter table public.profiles
  add column if not exists public_profile boolean not null default false;

comment on column public.profiles.public_profile is
  'Opt-in. When false (the default) get_public_profile returns nothing for this
   user, and melo.show/@username 404s.';

-- Only published profiles are ever looked up by username.
create index if not exists profiles_public_username_idx
  on public.profiles (lower(username))
  where public_profile;

-- ---------------------------------------------------------------------------
-- The public read surface.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so it can see past RLS, safe BECAUSE:
--   1. it hard-filters on `public_profile = true` — an un-published username
--      returns zero rows no matter who asks,
--   2. it returns aggregates and a hand-picked column list only,
--   3. search_path is pinned (a SECURITY DEFINER function without this can be
--      hijacked through a mutable search_path).
create or replace function public.get_public_profile(p_username text)
returns table (
  username      text,
  display_name  text,
  avatar_url    text,
  avatar_color  text,
  show_count    bigint,
  artist_count  bigint,
  city_count    bigint,
  first_year    int,
  top_artists   text[]
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select p.id, p.username, p.display_name, p.avatar_url, p.avatar_color
    from public.profiles p
    where p.public_profile
      and lower(p.username) = lower(p_username)
    limit 1
  ),
  -- Attended only. A wishlist is a plan, not a résumé — and publishing what
  -- someone intends to do is a different privacy question entirely.
  mine as (
    select s.artist, s.city, s.date, s.festival
    from public.shows s
    join me on me.id = s.user_id
    where coalesce(s.status, case when s.wishlist then 'wishlist' else 'attended' end) = 'attended'
  )
  select
    me.username, me.display_name, me.avatar_url, me.avatar_color,
    (select count(*) from mine),
    (select count(distinct artist) from mine where artist is not null),
    (select count(distinct city) from mine where city is not null and city <> ''),
    (select min(extract(year from date))::int from mine),
    (select coalesce(array_agg(a order by n desc, a), '{}')
       from (select artist as a, count(*) as n
               from mine where artist is not null
              group by artist order by n desc, artist limit 5) t)
  from me;
$$;

-- A logged-out visitor is the entire point.
grant execute on function public.get_public_profile(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The shows shown on that page. Separate function so the column list is
-- explicit and reviewable rather than buried in a join.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_profile_shows(p_username text, p_limit int default 24)
returns table (
  artist   text,
  venue    text,
  city     text,
  date     date,
  festival text
)
language sql
security definer
set search_path = public
stable
as $$
  select s.artist, s.venue, s.city, s.date, s.festival
  from public.shows s
  join public.profiles p on p.id = s.user_id
  where p.public_profile
    and lower(p.username) = lower(p_username)
    and coalesce(s.status, case when s.wishlist then 'wishlist' else 'attended' end) = 'attended'
  order by s.date desc
  limit least(coalesce(p_limit, 24), 60);
$$;

grant execute on function public.get_public_profile_shows(text, int) to anon, authenticated;
