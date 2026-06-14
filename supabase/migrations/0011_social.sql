-- 0011_social.sql
--
-- The social layer on top of the friend graph (0010): reactions and
-- comments on shows, plus widening show_attendees so friends can see
-- who's going together (co-attendees in the feed). Per
-- docs/initiatives/2026-06-14-social-feed-likes-comments.md.
--
-- Visibility rule everywhere: you may interact with / see interactions
-- on a show you can VIEW — i.e. your own, or a friend's per
-- can_view_shows() (0010), which already enforces friendship + blocks +
-- profile visibility. We reuse that one helper so the social tables
-- can't be more permissive than the shows they hang off.

-- ===== show_reactions =====
-- One row per (show, user); `emoji` holds the reaction. The plain "like"
-- is just the ❤️ reaction, so likes and quick-reactions share a table.
create table if not exists public.show_reactions (
  show_id    uuid not null references public.shows on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  emoji      text not null default '❤️' check (char_length(emoji) <= 8),
  created_at timestamptz not null default now(),
  primary key (show_id, user_id)
);
alter table public.show_reactions enable row level security;

-- SECURITY DEFINER helper: may `viewer` see show `sid`? (own or
-- can_view_shows). Keeps the policies short and avoids recursive RLS on
-- the shows table.
create or replace function public.can_view_show_id(viewer uuid, sid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shows s
    where s.id = sid
      and (s.user_id = viewer or public.can_view_shows(viewer, s.user_id))
  );
$$;

create policy "reactions read" on public.show_reactions
  for select using (public.can_view_show_id(auth.uid(), show_id));
create policy "reactions write own" on public.show_reactions
  for all using (
    auth.uid() = user_id and public.can_view_show_id(auth.uid(), show_id)
  ) with check (
    auth.uid() = user_id and public.can_view_show_id(auth.uid(), show_id)
  );

create index if not exists show_reactions_show_idx on public.show_reactions(show_id);

-- ===== show_comments =====
create table if not exists public.show_comments (
  id         uuid primary key default gen_random_uuid(),
  show_id    uuid not null references public.shows on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.show_comments enable row level security;

-- Read: you can see the show AND there's no block between you and the
-- comment's author (so a blocked user's words vanish even on a mutual
-- friend's show).
create policy "comments read" on public.show_comments
  for select using (
    public.can_view_show_id(auth.uid(), show_id)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = show_comments.user_id)
         or (b.blocker_id = show_comments.user_id and b.blocked_id = auth.uid())
    )
  );
-- Write: your own comment, on a show you can see.
create policy "comments insert own" on public.show_comments
  for insert with check (
    auth.uid() = user_id and public.can_view_show_id(auth.uid(), show_id)
  );
-- Delete: the author OR the show's owner (owner moderation).
create policy "comments delete own-or-owner" on public.show_comments
  for delete using (
    auth.uid() = user_id
    or auth.uid() = (select s.user_id from public.shows s where s.id = show_id)
  );

create index if not exists show_comments_show_idx on public.show_comments(show_id, created_at);

-- ===== comment_reports (moderation; App Store Guideline 1.2) =====
create table if not exists public.comment_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users on delete cascade,
  comment_id  uuid not null references public.show_comments on delete cascade,
  reason      text,
  created_at  timestamptz not null default now()
);
alter table public.comment_reports enable row level security;
create policy "comment_reports insert" on public.comment_reports
  for insert with check (auth.uid() = reporter_id);

-- ===== widen show_attendees read =====
-- 0010 only let the owner + the tagged user read tags. The feed needs a
-- friend who can VIEW the show to see who's going together, so add a
-- view-scoped read policy alongside the existing one.
create policy "attendees read for viewers" on public.show_attendees
  for select using (public.can_view_show_id(auth.uid(), show_id));

-- ===== tagging consent (safety) =====
-- 0010's write policy let an owner tag ANY user_id. Harmless while tags
-- were private, but the broadcast read above would turn it into a
-- non-consensual "outing" vector (tag a stranger on a public show →
-- their name renders in everyone's feed). Lock it down: you may only
-- tag people you're ACCEPTED friends with, and a tagged user can always
-- remove themselves.
drop policy if exists "attendees write" on public.show_attendees;

create policy "attendees insert friends" on public.show_attendees
  for insert with check (
    auth.uid() = (select s.user_id from public.shows s where s.id = show_id)
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and f.user_a = least(auth.uid(), user_id)
        and f.user_b = greatest(auth.uid(), user_id)
    )
  );

-- Delete: the show owner (manage their tags) OR the tagged user
-- (remove yourself from someone else's show).
create policy "attendees owner delete" on public.show_attendees
  for delete using (
    auth.uid() = (select s.user_id from public.shows s where s.id = show_id)
  );
create policy "attendees self delete" on public.show_attendees
  for delete using (auth.uid() = user_id);
