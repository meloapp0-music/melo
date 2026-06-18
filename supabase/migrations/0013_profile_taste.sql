-- 0013_profile_taste.sql
--
-- Onboarding "music taste": favorite genres, favorite artists, and a
-- home city. Captured at sign-up (and editable in Settings) so the app
-- has signal from day ONE — the tour-alerts cron can send "artist in
-- your city" alerts to a brand-new user with no logged shows yet, and
-- Discover can personalize. Per
-- docs/initiatives/2026-06-16-music-taste-onboarding.md.
--
-- No new policies needed: profiles already has self-update RLS, and
-- these are just columns the owner edits about themselves.

alter table public.profiles
  add column if not exists fav_genres  text[] not null default '{}',
  add column if not exists fav_artists text[] not null default '{}',
  add column if not exists home_city   text;
