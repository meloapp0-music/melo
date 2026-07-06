-- 0014: Videos on shows
-- ======================
-- Per docs/initiatives/2026-06-27-video-uploads.md.
--   1. shows.videos — array of public-bucket URLs, parallel to shows.photos.
--   2. show-videos Storage bucket — mirrors the show-photos bucket security
--      exactly (migration 0003): writes gated to the caller's own
--      {user_id}/... folder, public read. Plus bucket-level caps: 45MB per
--      file (Supabase per-object ceiling is 50MB; client also enforces a
--      60s duration cap) and video MIME types only.

-- 1. Column ---------------------------------------------------------------
alter table public.shows
  add column if not exists videos text[] not null default '{}';

-- 2. Bucket ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'show-videos',
  'show-videos',
  true,
  47185920, -- 45 MB
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do nothing;

-- 3. Policies — writes only inside your own {user_id}/ folder --------------
create policy "show-videos owner insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'show-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "show-videos owner update"
  on storage.objects
  for update
  using (
    bucket_id = 'show-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "show-videos owner delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'show-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "show-videos public read"
  on storage.objects
  for select
  using (bucket_id = 'show-videos');
