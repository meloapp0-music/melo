-- 0004_profile_avatar.sql
--
-- Adds support for user-uploaded profile pictures.
--   * profiles.avatar_url — public URL of the uploaded image (empty if
--     the user hasn't picked one; the UI falls back to the MeloIcon).
--   * Storage bucket `avatars` with the same policy shape as
--     `show-photos` from 0003: public-read, owner-write gated by the
--     first folder segment matching the caller's user id.
--
-- Avatar paths look like: avatars/{user_id}/{timestamp}-{rand}.jpg
-- Resized client-side to 512px max edge before upload.

-- 1) profiles column ----------------------------------------------------
alter table public.profiles
  add column if not exists avatar_url text not null default '';

-- 2) storage bucket -----------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 3) storage policies (mirror the show-photos pattern) ------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars owner insert'
  ) then
    create policy "avatars owner insert" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars owner update'
  ) then
    create policy "avatars owner update" on storage.objects
      for update to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars owner delete'
  ) then
    create policy "avatars owner delete" on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars public read'
  ) then
    create policy "avatars public read" on storage.objects
      for select to public
      using (bucket_id = 'avatars');
  end if;
end $$;
