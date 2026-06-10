# "An Artist You Love Is Playing Your City" Alerts

- Started: 2026-05-22
- Status: in-progress (code complete; pending Edge Function redeploy)
- Last updated: 2026-05-22

## Context

User saw Seated (go.seated.com) and wanted exactly ONE thing from it:
> "all I want out of that is the notification when artists are in your
> city. that's the only part I want — if we can find a way to do that
> (doesn't have to be through Seated) then that's what i want."

No Seated needed. Melo already has the entire push pipeline:
- `tour-alerts` daily cron (`supabase/functions/tour-alerts/index.ts`)
  that queries Ticketmaster per artist and sends APNs pushes
- `device_tokens` + `notifications_sent` tables + `_shared/apns.ts`
  sender (all live since `0003_pre_launch.sql`)
- `inferHomeCity(shows)` and `topArtists(shows)` in `store.js` that
  derive your city + favorite artists **purely from logged shows — no
  GPS, no location permission**

The existing cron only watched **wishlist** artists and notified about
**any** new tour announcement (with a soft city-sort). The two gaps:
1. It ignored **artists you've seen and loved** — only wishlist/going.
2. It wasn't a true **"playing YOUR city"** alert.

This initiative closes both by extending the cron — not adding a new
system.

## Plan / What shipped

All in `supabase/functions/tour-alerts/index.ts`:

1. **Broaden the data load.** Query every user's shows
   (`user_id, artist, city, score, status, wishlist`) instead of just
   wishlist rows.

2. **Derive home city + watch set server-side** (replicating
   `inferHomeCity` / `topArtists` intent, no client import):
   - **home city** = most-common city among the user's *attended*
     shows.
   - **watch set** = "artists you care about" = attended-and-loved
     (`score >= 7`) ∪ Going ∪ Wishlist.

3. **City-filtered lookup.** `searchTm(artist, homeCity)` already
   passes `city` to Ticketmaster, so when a home city is known every
   result is in that metro. New users with no attended shows fall back
   to the prior global tour-announcement behavior (no regression).

4. **City-aware copy.** When the matched event is in the home city:
   `"{artist} is playing {city} 🎟️"` / `"{venue} · {date} — tickets
   available"` (data kind `city_match`). Otherwise the original
   `"{artist} just announced a tour 🎤"` (kind `tour_alert`).

5. **Single dedup namespace.** Everything is recorded in
   `notifications_sent` under kind `tour_alert`, so the same event is
   never notified twice regardless of which copy fired. Existing
   per-user caps (`MAX_NOTIFS_PER_USER = 5`) prevent storms.

No schema change. No new dependency. No client/UI change. Reuses the
existing APNs sender, device-token table, dedup table, and caps.

## Changes made

- 2026-05-22: Extended `tour-alerts/index.ts` — broadened watch set to
  loved+going+wishlist artists, derived home city server-side, added
  city-filtered TM lookup + "playing your city" copy + `venue` field
  on the TM event shape. Code complete.
- 2026-05-22: Added **pre-show reminders** to the same cron (user
  request — "notify me a week out + a day or two before to make sure I
  have tickets and check venue guidelines"). For each Going show with a
  future date:
  - ~1 week out (`d` in 6–8): `"{artist} is 1 week away 🎟️ — Got your
    tickets sorted?"` (kind `preshow_week`).
  - ~1–2 days out (`d` in 1–2): `"{artist} is tomorrow/in 2 days! 🎶 —
    Double-check your tickets and the venue guidelines."` (kind
    `preshow_day`).
  - No TM lookup (date math only); deduped per show per kind via
    `notifications_sent`; shares the `MAX_NOTIFS_PER_USER` cap.
  - Refactors dedup to composite `${kind}|${ref}` keys and extracts a
    shared `pruneDeadTokens` helper + a `daysUntil` helper. No schema
    change.
- 2026-06-09: **Push was never actually delivering — root-caused and
  fixed.** Symptom: a "going" Mumford & Sons show 2 days out produced no
  notification. Investigation (live, via SQL editor + CLI):
  - ✅ Cron IS scheduled & active (`tour-alerts-daily`, `0 17 * * *`),
    APNs fully configured, bundle ID correct (verified by digest match),
    cron WAS recording `preshow_*` rows daily.
  - ❌ But `device_tokens` was **empty for every user** — no push ever
    reached a single device since launch.
  - **Root cause:** `ios/App/App/AppDelegate.swift` was missing
    `didRegisterForRemoteNotificationsWithDeviceToken` (+ the
    `didFailToRegister` counterpart). iOS returned APNs tokens fine, but
    they were never forwarded to `@capacitor/push-notifications`, so the
    JS `registration` event never fired and no token was ever saved.
    Fixed by adding the two standard Capacitor forwarding callbacks.
    (Native file; `/ios` is gitignored, so the fix lives on disk and
    ships with the next Xcode build.)
  - **Secondary bug fixed:** the cron recorded `notifications_sent` even
    when the send was skipped (no token) or rejected by APNs — which
    marked every reminder "sent" and then permanently suppressed retries.
    Now each send site only records after APNs accepts ≥1 push
    (`okCount > 0`). Deployed (tour-alerts v12).
  - **Latent risk flagged:** `aps-environment = development` in
    `App.entitlements`. App Store/TestFlight distribution should force
    `production` (matching the production-targeted server), but verify on
    the first real build — if tokens register yet don't deliver
    (BadDeviceToken), this is the next thing to fix.
  - **Requires a new iOS build** to take effect (the v1.2 binary already
    in review predates this fix).

## Deploy (required — code changes don't auto-ship)

Edge Functions deploy separately from the app:
```
supabase functions deploy tour-alerts --no-verify-jwt
```
The cron schedule is already set (`0 17 * * *`). No migration to run.
APNs secrets are already configured from the pre-launch sprint.

## Open questions / follow-ups

- **Settings opt-out toggle.** Currently on-by-default for everyone
  (consistent with the existing always-on tour alerts). A
  `user_settings.alerts_enabled` column + a Settings toggle is the
  recommended fast-follow before scaling marketing — some users will
  want to silence it. Ties into `2026-05-05-notifications-system.md`
  (which plans per-kind preferences + an in-app inbox).
- **Scaling.** The cron pulls all shows for all users in one query
  (matches the pre-existing approach). Fine for current scale; add
  pagination + per-user batching when the table is large.
- **Localized send time.** Fires at 17:00 UTC for everyone. P2 could
  target ~10am local once we store a timezone.
- **City vs metro.** TM's `city` filter is metro-fuzzy (good — catches
  suburbs), but a user whose home city is a small suburb might miss
  metro-listed shows. Acceptable for v1.
- **Cross-link** `2026-05-21-trip-discovery.md` (the manual "who's
  playing in [city]" search — this is its automated push sibling) and
  `2026-05-11-wishlist-watching.md` (explicit artist+city watches).
