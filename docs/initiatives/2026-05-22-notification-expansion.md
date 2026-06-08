# Notification Expansion — discovery suggestions + festival lineups

- Started: 2026-05-22
- Status: planned (next notification build)
- Last updated: 2026-05-22

## Context

The user wants notifications to be a consistent re-engagement engine —
not just reminders, but *discovery*:
> "notify people for shows, suggest shows consistently when artists they
> might be interested in are coming to Chicago / their city, and when
> festivals get announced + the lineup/details."

**What already exists** (in the `tour-alerts` daily cron):
- Pre-show reminders — day-of, 1–2 days, 1 week (per
  `2026-05-22-artist-in-your-city-alerts.md`)
- City alerts for **artists you already love** (loved/going/wishlist →
  "{artist} is playing {your city}")

**The two genuine gaps this initiative fills:**
1. **Discovery suggestions** — artists you DON'T already follow but would
   likely *like*, playing your city. ("Fans of Hozier love Bon Iver —
   he's playing Chicago.") This is taste-based recommendation, not just
   your logged artists.
2. **Festival announcements + lineups** — when a festival's lineup drops
   and it features artists you like. ("Lollapalooza lineup is out — 5 of
   your artists are playing.")

Ties into `2026-05-05-recommendations.md` (the taste engine) and
`2026-05-05-notifications-system.md` (the notification matrix + inbox).

## Feasibility

- **Related artists for discovery — feasible via Deezer** (already used,
  no auth). Deezer exposes `artist/{id}/related`. So: for a user's top
  artists, pull related artists → check which are playing the user's
  home city (Ticketmaster) → suggest. (Spotify's related-artist API is
  richer but needs OAuth — defer.)
- **Festival lineups — feasible via Ticketmaster.** `fetchFestivals`
  already returns festival events with `lineup` (attractions). Poll
  festivals, match each lineup against the user's `topArtists`, notify
  on new matches.

## Plan

### New notification kinds (extend the existing cron + dedup)
- `discovery` — "{related artist} is playing {city} — you might love them"
- `festival_lineup` — "{festival} lineup is out — {N} of your artists are playing"

Both reuse the existing `notifications_sent` dedup, `device_tokens`,
`sendApnsBatch`, per-user caps, and home-city derivation already in
`tour-alerts`.

### A) Discovery suggestions (taste-based, your city)
1. Per user: compute home city + top artists (already done in the cron).
2. For the top ~5 artists, fetch Deezer related artists (cache results;
   related artists rarely change — store in a small `related_artists`
   cache table or in-memory per run).
3. Filter related artists to those NOT already in the user's library.
4. For each candidate, check Ticketmaster for a show in the user's home
   city (reuse `searchTm(artist, city)`).
5. Notify on a NEW match (deduped by `discovery|eventId`). Cap hard —
   **max 1 discovery push/user/day** (discovery is lower-priority than
   reminders; avoid fatigue).

### B) Festival announcements + lineups
Run as a separate pass (poll-once, match-many — more efficient than
per-user TM calls):
1. Once per run, fetch upcoming festivals (Ticketmaster Festival
   classification), nationwide + bias to major fests.
2. For each festival, get its lineup (attractions).
3. For each user, count lineup ∩ their `topArtists`. If ≥1 match and not
   already notified (`festival_lineup|festivalId`), push
   "{festival} lineup is out — {N} of your artists are playing."
4. Tap → deep link to the Festivals/Discover page for that festival.

### Settings toggle (now genuinely needed)
With 5+ notification kinds (preshow ×3, city_match, discovery,
festival_lineup), users need control. Add a **Notifications** section in
Settings backed by new `user_settings` boolean columns:
`alerts_preshow`, `alerts_city`, `alerts_discovery`, `alerts_festival`
(all default true). The cron checks these before sending each kind.
This is the moment to build it — it also de-risks App Store review.

### Schema
- `user_settings` notification-preference columns (migration `0011`).
- Optional `related_artists(artist_id, related json, fetched_at)` cache
  table (or skip and cache in-memory per run for v1).

## Cadence / anti-fatigue rules
- Reminders > city_match > festival_lineup > discovery (priority order
  within the per-user cap).
- Discovery: max 1/day. Festival: max 1/run. Keep total ≤ MAX_NOTIFS_PER_USER.
- Honor the Settings toggles. Respect blocked/private later as relevant.

## Critical files
- **Edit:** `supabase/functions/tour-alerts/index.ts` — add discovery
  pass + festival-lineup pass + per-kind toggle checks. (Or split the
  festival pass into a `lineup-watcher` function if the cron gets heavy.)
- **Edit:** `src/web/api.js` (client) / inline server fetch — Deezer
  related-artists helper (server-side fetch in the Edge Function).
- **Create:** migration `0011_notification_prefs.sql`.
- **Edit:** `src/web/pages/Settings.jsx` — Notifications toggles section;
  `src/web/lib/db/settings.js` — map the new prefs.

## Verification
1. Apply migration 0011. Toggle prefs in Settings.
2. **Discovery:** a user whose top artist has a related act playing their
   home city gets one "you might love them" push (and none if the
   discovery toggle is off).
3. **Festival:** when a polled festival's lineup includes ≥1 of a user's
   top artists, they get one "{festival} lineup is out — N of your
   artists" push; deduped so it won't repeat.
4. Toggling a kind off in Settings suppresses that kind on the next run.
5. Per-user cap respected (no notification storms).

## Open questions / follow-ups
- **Discovery quality** — Deezer related artists is decent but coarse.
  Spotify related + audio features would be better (needs OAuth; ties to
  `2026-05-05-music-integration.md`). Start with Deezer.
- **Festival scope** — nationwide is noisy; consider biasing to the
  user's region + the big-name festivals first.
- **Localized send time** — still 17:00 UTC for all; revisit per-tz.
- **In-app inbox** — these pushes should also land in an inbox
  eventually (per `2026-05-05-notifications-system.md`) so users can
  review what they missed.
- **Cron load** — adding Deezer + festival polling increases per-run
  work; if it gets slow, split festival polling into its own scheduled
  `lineup-watcher` function.
