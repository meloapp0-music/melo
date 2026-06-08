-- 0010_friendships.sql
--
-- The two-way friend system (Buddies Phase 2). Adds:
--   * friendships     — requests (pending) + accepted friendships
--   * blocks          — safety (App Store Guideline 1.2)
--   * user_reports    — abuse reports for moderation
--   * show_attendees  — tag a real friend on a show
--   * can_view_shows()+ friend-read policy on shows
--
-- Per docs/initiatives/2026-05-05-buddies-phase-2.md.

-- ===== friendships =====
-- One row per pair, canonical user_a < user_b so a pair can't dupe.
-- status 'pending' = request outstanding; 'accepted' = friends.
-- requested_by tells us who initiated (the OTHER party accepts).
create table if not exists public.friendships (
  user_a       uuid not null references auth.users on delete cascade,
  user_b       uuid not null references auth.users on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  requested_by uuid not null references auth.users on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
alter table public.friendships enable row level security;

create policy "friendships read" on public.friendships
  for select using (auth.uid() = user_a or auth.uid() = user_b);
create policy "friendships insert" on public.friendships
  for insert with check (
    auth.uid() = requested_by
    and (auth.uid() = user_a or auth.uid() = user_b)
    and status = 'pending'
  );
-- Accept/modify: the party who did NOT request can update (to accept).
create policy "friendships accept" on public.friendships
  for update using (
    (auth.uid() = user_a or auth.uid() = user_b)
    and auth.uid() <> requested_by
  );
create policy "friendships delete" on public.friendships
  for delete using (auth.uid() = user_a or auth.uid() = user_b);

create index if not exists friendships_user_b on public.friendships(user_b);

-- Let users read the profile of anyone they have a friendship row with
-- (pending or accepted) — needed to render friends + incoming/outgoing
-- requests even when the other person isn't publicly searchable. OR's
-- with the existing "searchable or self" policy.
create policy "profiles read friend-or-pending" on public.profiles
  for select using (
    exists (
      select 1 from public.friendships f
      where f.user_a = least(auth.uid(), profiles.id)
        and f.user_b = greatest(auth.uid(), profiles.id)
    )
  );

-- ===== blocks =====
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users on delete cascade,
  blocked_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table public.blocks enable row level security;
create policy "blocks owner" on public.blocks
  for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- ===== user_reports =====
create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users on delete cascade,
  reported_id uuid not null references auth.users on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.user_reports enable row level security;
create policy "reports insert" on public.user_reports
  for insert with check (auth.uid() = reporter_id);

-- ===== show_attendees =====
-- Tag a real Melo user on a show you own. confirmed_at is set when that
-- user has their own matching show (auto-confirm handled in app logic).
create table if not exists public.show_attendees (
  show_id uuid not null references public.shows on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (show_id, user_id)
);
alter table public.show_attendees enable row level security;
create policy "attendees read" on public.show_attendees
  for select using (
    auth.uid() = user_id
    or auth.uid() = (select s.user_id from public.shows s where s.id = show_id)
  );
create policy "attendees write" on public.show_attendees
  for all using (
    auth.uid() = (select s.user_id from public.shows s where s.id = show_id)
  ) with check (
    auth.uid() = (select s.user_id from public.shows s where s.id = show_id)
  );

-- ===== can_view_shows() + friend-read policy on shows =====
-- SECURITY DEFINER so it can read friendships/blocks/profiles without
-- tripping their RLS (and without recursive policy evaluation).
-- Returns true when `viewer` may see `owner`'s shows:
--   * not blocked in either direction, AND
--   * owner's effective visibility is 'public', OR 'friends' + an
--     accepted friendship exists.
create or replace function public.can_view_shows(viewer uuid, owner uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    viewer is not null
    and owner is not null
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = owner and b.blocked_id = viewer)
         or (b.blocker_id = viewer and b.blocked_id = owner)
    )
    and (
      (select p.shows_visibility from public.profiles p where p.id = owner) = 'public'
      or (
        (select p.shows_visibility from public.profiles p where p.id = owner) = 'friends'
        and exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and (
              (f.user_a = least(viewer, owner) and f.user_b = greatest(viewer, owner))
            )
        )
      )
    );
$$;

create policy "shows friend read" on public.shows
  for select using (
    user_id = auth.uid() or public.can_view_shows(auth.uid(), user_id)
  );
