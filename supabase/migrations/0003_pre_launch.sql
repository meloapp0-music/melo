-- =============================================================
-- Melo — Pre-launch sprint
-- =============================================================
-- This migration combines three pieces of the pre-launch sprint
-- so they land as one deploy:
--   1. device_tokens + notifications_sent      (push notifications)
--   2. shows.photos + show-photos Storage      (user photos)
--   3. setlist_fm_key_encrypted via pgcrypto   (encryption-at-rest)
--
-- DESTRUCTIVE: Section 3 drops the plaintext `setlist_fm_key` column
-- from `user_settings`. Anyone who had a key set under the 0001
-- schema will need to re-enter it after this migration runs. The
-- alternative — copy plaintext through pgp_sym_encrypt before
-- dropping — would require the encryption key to be available at
-- migration time, which couples migrations to runtime secrets. The
-- one-time UX hit is the better trade.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Push notification infrastructure
-- -------------------------------------------------------------

-- Per-device push tokens. Composite primary key on (user_id, token)
-- because the same physical device can be registered to multiple
-- accounts (uncommon, but harmless), and APNs tokens rotate so the
-- same user can have several stale tokens — we tolerate dupes and
-- refresh `last_seen_at` on every app launch via upsert.
create table public.device_tokens (
  user_id      uuid not null references auth.users(id) on delete cascade,
  token        text not null,
  platform     text not null check (platform in ('ios','android')),
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  primary key (user_id, token)
);

create index device_tokens_user_idx on public.device_tokens(user_id);

alter table public.device_tokens enable row level security;

create policy "device_tokens self all" on public.device_tokens
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Dedup table for the tour-alerts cron — without this, every daily
-- run would re-push the same Phoebe Bridgers Chicago show until the
-- event date passes. Keyed on (user, kind, ref) so we can extend to
-- new notification kinds (festival_alert, friend_going, etc.) later
-- without a schema change.
create table public.notifications_sent (
  user_id  uuid not null references auth.users(id) on delete cascade,
  kind     text not null,
  ref      text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, kind, ref)
);

create index notifications_sent_user_idx on public.notifications_sent(user_id);

alter table public.notifications_sent enable row level security;

-- No client policies. The Edge Function uses the service-role key,
-- which bypasses RLS. Locking clients out entirely prevents anyone
-- from spoofing "I already sent this" entries.

-- -------------------------------------------------------------
-- 2. Photos on shows
-- -------------------------------------------------------------

-- Array of public-bucket URLs. Empty default keeps existing rows
-- valid. We could normalize into a `show_photos` table (one row per
-- image) but the array fits comfortably under Postgres limits for
-- the v1 expected upper bound (~20 photos / show) and avoids a join
-- on every Wrapped slide render.
alter table public.shows
  add column photos text[] not null default '{}';

-- Public-read bucket. Friends-of-friends viewing a shared show need
-- to render the photo without an authenticated request. Write paths
-- are still gated by owner policies below.
insert into storage.buckets (id, name, public)
values ('show-photos', 'show-photos', true)
on conflict (id) do nothing;

-- Path layout: {user_id}/{show_id}/{filename}
-- The first folder segment is the user's auth.uid(), so we can
-- gate writes on that segment matching the caller.
create policy "show-photos owner insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'show-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "show-photos owner update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'show-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "show-photos owner delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'show-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "show-photos public read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'show-photos');

-- -------------------------------------------------------------
-- 3. Setlist.fm key encryption-at-rest
-- -------------------------------------------------------------

-- The actual encryption / decryption happens in two Edge Functions
-- (`setlistfm-set-key` and `setlistfm-proxy`) using AES-GCM with the
-- MELO_SETTINGS_ENC_KEY secret. The DB just stores the resulting
-- ciphertext + 12-byte IV + 16-byte tag as raw bytes. Postgres
-- never sees the plaintext key or the encryption key.
alter table public.user_settings
  add column setlist_fm_key_encrypted bytea;

do $$ begin
  raise notice
    'Dropping plaintext setlist_fm_key column. Existing users with a '
    'configured key will need to re-paste it once after this migration.';
end $$;

alter table public.user_settings drop column setlist_fm_key;
