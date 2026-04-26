-- =============================================================
-- Melo — Phase 1: Auth + cloud sync schema
-- =============================================================
-- Tables: profiles, shows, rankings, user_settings
-- All tables use Row-Level Security (RLS); policies are strict:
-- every user can only see/write their own rows.
-- Friendship + shared-attendance tables arrive in 0002/0003.
-- =============================================================

-- Required extensions ------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;  -- username trigram search (used in 0002)

-- =============================================================
-- profiles — extends auth.users
-- =============================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null
                check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name  text not null default '',
  avatar_color  text not null default '#E8573A',
  bio           text not null default '',
  is_searchable boolean not null default true,
  shows_visibility text not null default 'friends'
                   check (shows_visibility in ('public','friends','private')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-populate a placeholder profile on signup. The user picks a real
-- username during onboarding.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  temp_username text;
begin
  temp_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  insert into public.profiles (id, username, display_name)
  values (new.id, temp_username, coalesce(new.raw_user_meta_data->>'display_name', ''));
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh -------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Trigram index for username/display_name search (used in Phase 2)
create index profiles_username_trgm on public.profiles
  using gin (username gin_trgm_ops);
create index profiles_display_name_trgm on public.profiles
  using gin (display_name gin_trgm_ops);

-- =============================================================
-- shows — one row per concert, owned by one user
-- =============================================================
create table public.shows (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  artist      text not null,
  date        date not null,
  venue       text not null default '',
  city        text not null default '',
  genre       text not null default '',
  score       numeric(3,1),
  vibes       text[] not null default '{}',
  notes       text not null default '',
  setlist     text[] not null default '{}',
  buddies     text[] not null default '{}',  -- transitional, replaced by show_attendees in 0003
  wishlist    boolean not null default false,
  visibility  text check (visibility in ('public','friends','private')),  -- null = inherit from profile
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index shows_user_id_idx on public.shows(user_id);
create index shows_user_date_idx on public.shows(user_id, date desc);
create trigger shows_touch before update on public.shows
  for each row execute function public.touch_updated_at();

-- =============================================================
-- rankings — ELO score per show, strictly private
-- =============================================================
create table public.rankings (
  show_id uuid primary key references public.shows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  elo     integer not null default 1200,
  updated_at timestamptz not null default now()
);

create index rankings_user_id_idx on public.rankings(user_id);
create trigger rankings_touch before update on public.rankings
  for each row execute function public.touch_updated_at();

-- =============================================================
-- user_settings — per-user app settings incl. Setlist.fm key
-- =============================================================
create table public.user_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  setlist_fm_key   text not null default '',
  updated_at       timestamptz not null default now()
);

create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- =============================================================
-- Row-Level Security
-- =============================================================

-- profiles -------------------------------------------------------
alter table public.profiles enable row level security;

-- Anyone authenticated can read searchable profiles (username search).
-- Friend-only fields will be further restricted in 0002 when we know
-- who is friends with whom.
create policy "profiles read searchable" on public.profiles
  for select
  to authenticated
  using (is_searchable = true or id = auth.uid());

create policy "profiles self update" on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No INSERT/DELETE policies: rows are created/deleted exclusively by
-- the handle_new_user trigger + auth.users CASCADE.

-- shows ----------------------------------------------------------
alter table public.shows enable row level security;

create policy "shows owner all" on public.shows
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Friend read access is added in migration 0002.

-- rankings -------------------------------------------------------
alter table public.rankings enable row level security;

create policy "rankings self all" on public.rankings
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- user_settings --------------------------------------------------
alter table public.user_settings enable row level security;

create policy "user_settings self all" on public.user_settings
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
