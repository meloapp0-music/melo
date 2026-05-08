# Music Integration — Spotify + Apple Music

- Started: 2026-05-08
- Status: planned (Phase 1 targeted for v1.1, ~1-2 weeks)
- Last updated: 2026-05-08

## Context

Today Melo's connection to streaming services is one-way: we link out
to Spotify / Apple Music tracks via the `PlayableSetlist` component
(30-sec previews + deep-link icons). We don't read anything back.

Real integration unlocks meaningful surfaces:
- Pre-show hype playlists (this artist's top tracks for a Going show)
- Setlist playback (the actual setlist from a logged show, as a
  one-click "play this entire show" button)
- Listening-stats overlay (your Spotify stats next to your live
  ratings — "you stream this artist 4x more than your average")
- A future "better live than recorded" indicator

User asked (2026-05-08):
> "Spotify/Apple Music connect - See your streaming stats alongside
>  live show ratings. Setlist playback - Auto-generate playlist of the
>  exact setlist from shows. Pre-show playlist - Create hype playlists
>  for upcoming concerts."

This is also a meaningful retention/engagement loop — users return to
Melo to play their setlists, Melo becomes the primary entry point
into their music listening.

## Plan

Phased, Spotify-first (better API, better deep-link support, larger US
audience). Apple Music as Phase 3 if user demand justifies the second
integration cost.

### Phase 1 — Spotify OAuth + setlist playback

- New "Connect Spotify" button in Settings → Account
- Spotify Web API OAuth flow (PKCE, no secret needed)
- Required scopes: `user-read-private`, `playlist-modify-private`,
  `playlist-modify-public`
- Token storage: encrypted-at-rest in `user_settings`, same pattern
  as the Setlist.fm key (existing `MELO_SETTINGS_ENC_KEY` infra)
- New "Play this setlist" button on ShowDetail. Behavior:
  1. Check if a "Melo: {artist} at {venue}, {date}" playlist
     already exists → reuse
  2. Else: create one. Resolve each setlist song to a Spotify track ID
     via the search API (artist + track), add to playlist
  3. Open the Spotify app via `spotify:playlist:{id}` deep link
- Edge: songs Spotify doesn't have (covers, unreleased tracks) are
  silently skipped with a small footer note ("3 songs not on Spotify")

### Phase 2 — Pre-show hype playlist + listening stats

- New "Hype playlist" button on Going / Wishlist shows
  - Creates a playlist of the artist's top 30 tracks (Spotify Top
    Tracks endpoint)
  - Optional: includes openers' top tracks if `lineup` field is set
- Listening-stats card on artist's ShowDetail:
  - "You've streamed {artist} {N} times this year"
  - "{artist} is in your top {X}% of artists"
  - Powered by Spotify "Top Artists" endpoint, computed on demand
    against user's medium_term + long_term ranges
- Cache this data in `user_listening_stats` to avoid re-hitting
  Spotify on every show open

### Phase 3 — Apple Music integration (if Phase 1+2 succeed)

- MusicKit JS for OAuth + library access
- Same surfaces (setlist playback, hype playlist, listening stats)
- Apple Music has fewer endpoints than Spotify, so some features
  (e.g., top-tracks-by-time-range) may not have a direct equivalent
- Deferred until Spotify metrics show real engagement

## Schema

Migration `0008_streaming_connect.sql`:

```sql
alter table public.user_settings
  add column if not exists spotify_token_encrypted bytea,
  add column if not exists spotify_refresh_token_encrypted bytea,
  add column if not exists spotify_user_id text;

create table if not exists public.user_listening_stats (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}',
  refreshed_at timestamptz not null default now()
);
alter table public.user_listening_stats enable row level security;
create policy "stats_select_own" on public.user_listening_stats
  for select using (user_id = auth.uid());
create policy "stats_upsert_own" on public.user_listening_stats
  for all using (user_id = auth.uid());
```

## Changes made

_None yet — planning only._

## Open questions / follow-ups

- **Token refresh.** Spotify access tokens expire after 1 hour; need
  a server-side refresh path (Edge Function) that decrypts the
  refresh token, calls Spotify's token endpoint, encrypts the new
  access token. Same encryption pattern as `setlistfm-proxy`.
- **Setlist song resolution accuracy.** "Live at..." versions vs
  studio versions — which to prefer? Probably studio (Spotify's
  default search ranks them higher anyway).
- **Cost.** Spotify Web API is free for personal apps. No worries
  at our scale.
- **Pull-back risk: Spotify killing endpoints.** They've deprecated
  `/v1/audio-features` and `/v1/recommendations` in 2024. Avoid
  building features that depend on those — use Top Tracks + Search
  + User Profile, which are core endpoints unlikely to disappear.
- **Apple Music demographics.** ~30% US smartphone share is iOS-
  defaulted to Apple Music. Phase 1 ignores them initially — risky
  if those users churn. Mitigation: ensure Phase 1's setlist
  playback also surfaces the Apple Music deep link (already shipped
  via `PlayableSetlist`) so non-Spotify users still have a path.
- **"Better live than recorded" metric** depends on rich listening
  data the average user won't have for live-only artists. Defer to
  Phase 4 or skip entirely.
- **Cross-link with `2026-04-19-playable-setlists.md`** — that
  initiative shipped per-song deep links. This is the next layer:
  full-setlist playlist creation.
