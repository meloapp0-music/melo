-- 0015: Festival-level media
-- ==========================
-- Festivals in Melo are a DERIVED grouping — shows that share a festival
-- name+year (festivalKey). There is no festival row, so there was nowhere to
-- attach GENERAL festival media (a crowd shot, the grounds, the whole vibe)
-- that isn't tied to a single act. This table gives each (user, festival) that
-- home. Per-act media still lives on the show rows (shows.photos/.videos).
--
-- The URLs point at the EXISTING show-photos / show-videos Storage buckets,
-- under {user_id}/fest-<key>/... — their RLS (migration 0003 / 0014) already
-- gates writes by the first folder segment (= the caller), so NO new bucket is
-- needed.

create table if not exists public.festival_media (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  festival_key  text not null,
  festival_name text,
  photos        text[] not null default '{}',
  videos        text[] not null default '{}',
  updated_at    timestamptz not null default now(),
  unique (user_id, festival_key)
);

alter table public.festival_media enable row level security;

-- Self-only: your festival media is private to you (like your own notes). A
-- future phase can widen read to friends, mirroring can_view_shows.
create policy "festival_media own read" on public.festival_media
  for select using (auth.uid() = user_id);

create policy "festival_media own write" on public.festival_media
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists festival_media_user_idx
  on public.festival_media (user_id);
