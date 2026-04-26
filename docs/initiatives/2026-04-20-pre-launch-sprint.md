# Pre-Launch Sprint

- Started: 2026-04-20
- Status: shipped
- Last updated: 2026-04-20

## Context

After the legal-compliance pass landed, the user asked what else was
missing before App Store submission. Recommendation back was a Tier-1
feature trio (push notifications + tour alerts, photos on shows,
first-run calendar import) plus two infrastructure items (encrypt the
Setlist.fm key at rest; write the marketing site + App Store
screenshots specification). The user said "do all five," so they ship
together as one initiative.

The plan file lives at `~/.claude/plans/immutable-greeting-sunrise.md`.

## Plan

Five workstreams, one deploy:

1. **Push notifications + tour alerts.** Capacitor push plugin →
   device-tokens table → daily Edge Function cron that diffs
   wishlist artists against Ticketmaster's Discovery API and pushes
   APNs alerts for new shows. Dedup via `notifications_sent` table.
2. **Photos on shows.** Public-read Supabase Storage bucket
   `show-photos` with owner-write RLS, `shows.photos text[]` column,
   client-side resize before upload, PhotoPicker in LogShow, gallery
   + lightbox in ShowDetail, user photos preferred over Deezer art
   in Wrapped slides.
3. **First-run calendar import.** Capacitor calendar plugin →
   `lib/calendar.js` wrapper → `ImportFromCalendar.jsx` page with
   checkbox grid → batch `addShow`. Surfaced as Onboarding step 2
   (native only) and Settings → About entry.
4. **Setlist.fm key encryption-at-rest.** AES-GCM in Deno Edge
   Functions (cleaner than pgp_sym_encrypt; keeps the encryption
   key off the database connection). New `setlistfm-set-key` and
   `setlistfm-proxy` functions; client never sees plaintext after
   the initial paste-and-save round trip.
5. **Marketing site + App Store screenshots specification.**
   New `marketing/` directory at repo root with `index.html`,
   `style.css`, standalone `privacy.html` / `terms.html`, screenshot
   capture spec, and the full App Store Connect listing copy.

All schema changes land in one migration: `0003_pre_launch.sql`.
Single deploy, single rollback point.

## Changes made

- 2026-04-20: New migration `0003_pre_launch.sql` covering
  `device_tokens` + `notifications_sent` tables (RLS self-only on the
  former; service-role-only on the latter), `shows.photos text[]`
  column, `show-photos` Storage bucket + 4 policies (owner
  insert/update/delete by first folder segment, public read), and
  the encrypted Setlist.fm key column. Migration drops the legacy
  plaintext `setlist_fm_key` column with a `raise notice` warning
  that existing keys must be re-pasted.
- 2026-04-20: New Edge Function `setlistfm-set-key` — verifies JWT,
  AES-GCM encrypts the supplied key with `MELO_SETTINGS_ENC_KEY` (a
  Supabase secret), upserts ciphertext as bytea. Empty input clears
  the column (acts as the "Disconnect" toggle).
- 2026-04-20: New Edge Function `setlistfm-proxy` — verifies JWT,
  decrypts the per-user key in-memory, forwards
  `search/setlists` / `search/artists` requests with the user's key
  attached, returns the upstream response. Path allowlist prevents
  it from being abused as an open relay.
- 2026-04-20: New shared module `_shared/apns.ts` — APNs HTTP/2
  sender. ES256 JWT signing with the .p8 PEM (PKCS8 import via Web
  Crypto), JWT cached for 50 min, batch send returns per-token
  results so callers can prune dead tokens (410 / Unregistered).
- 2026-04-20: New Edge Function `tour-alerts` — daily cron. Pulls
  every wishlist row + device tokens + already-sent refs in three
  queries. Per user, looks up their wishlist artists on Ticketmaster
  (capped at 1000 lookups per run; 5 notifs per user per run),
  prefers events in the user's hint city, fires APNs alerts for new
  matches, prunes dead tokens, records every push to
  `notifications_sent` to prevent re-pushing.
- 2026-04-20: New `src/web/lib/storage.js` — `uploadShowPhoto()`
  resizes via Canvas to 2048px max edge / JPEG q=0.85 before
  uploading to `{userId}/{showId}/{ts}-{rand}.jpg`.
  `deleteShowPhoto()` is best-effort.
- 2026-04-20: New `src/web/components/PhotoPicker.jsx` — controlled
  multi-file picker that uploads in parallel and reports URLs back
  via `onChange`. Shows per-upload spinners.
- 2026-04-20: New `src/web/components/PhotoGallery.jsx` —
  horizontal-scroll thumbnails + fullscreen lightbox with keyboard
  nav (Esc / ←→).
- 2026-04-20: `LogShow.jsx` — added Photos section between Notes
  and submit. Generates a stable client-side `showId` at mount so
  uploads have a folder before the row exists; the DB ignores the
  client id and assigns a UUID, which is fine because photo paths
  are stored as full URLs.
- 2026-04-20: `ShowDetail.jsx` — gallery section above Notes; user's
  first photo now beats the Deezer artist image as the hero
  background.
- 2026-04-20: `Wrapped.jsx` — Top Artist, Top Venue, and Highest
  Rated slides prefer the user's own photo from a matching show
  over the canonical artist art.
- 2026-04-20: `lib/db/shows.js` — `fromRow`/`toRow`/`updateShow`
  now map the new `photos` column.
- 2026-04-20: New `src/web/lib/push.js` — `registerForPush()`
  no-ops on web, requests permission on iOS, registers with APNs,
  upserts the resulting token via the new
  `src/web/lib/db/devices.js`. Idempotent listener wiring.
- 2026-04-20: `App.jsx` — fires `registerForPush()` once on every
  signed-in transition; routes a new `import-calendar` subpage to
  `ImportFromCalendar`.
- 2026-04-20: New `src/web/lib/calendar.js` — Capacitor Calendar
  wrapper with permission handling, soft denylist of common
  non-concert keywords, and an event normalizer. Web fallback
  returns an empty array.
- 2026-04-20: New `src/web/pages/ImportFromCalendar.jsx` — checkbox
  grid backed by `scanCalendar`, pre-checks events that look like
  concerts, batch `addShow` for selected. Title-parsing heuristic
  splits "Artist @ Venue" / "Venue: Artist" / "Artist concert"
  patterns.
- 2026-04-20: `Onboarding.jsx` — added native-only step 2 that
  mounts `ImportFromCalendar`. Web users skip straight from profile
  → done.
- 2026-04-20: `Settings.jsx` — new "Import past shows from
  Calendar" link in the About section.
- 2026-04-20: `lib/db/settings.js` — completely rewritten. Returns
  `{ hasSetlistFmKey: boolean }` instead of plaintext.
  `updateSettings` now invokes the `setlistfm-set-key` Edge
  Function. Legacy `setlistFmKey` field shadowed with a
  `'__set__'` sentinel for any caller still doing truthy checks.
- 2026-04-20: `api.js::fetchSetlists` — switched from direct fetch
  via the CORS proxy to `supabase.functions.invoke('setlistfm-proxy')`.
  The user's plaintext key never leaves the server again.
- 2026-04-20: `Settings.jsx` — Setlist.fm card now shows
  Connected/Not-connected with Replace/Disconnect actions. Input
  appears only when the user explicitly wants to set or replace.
- 2026-04-20: `package.json` — added `@capacitor/push-notifications`
  and `@ebarooni/capacitor-calendar` deps.
- 2026-04-20: New `marketing/` directory: `index.html` (hero,
  three-up features, screenshot grid, footer), `style.css` (cream
  /orange/brown palette, responsive), `privacy.html` and
  `terms.html` (standalone pages so the App Store Privacy Policy
  URL resolves), `screenshots/README.md` (capture workflow + 5
  required screens × 2 simulator sizes), `app-store-listing.md`
  (final copy: name, subtitle, description, keywords, what's-new,
  reviewer notes, encryption-export answer, submission checklist).
- 2026-04-20: `App.css` — additive styles for `.photo-picker-*`,
  `.photo-gallery-*`, `.photo-lightbox-*`, `.import-cal-*`.
- 2026-04-20: `.env.example` — documented the four new server-side
  Supabase secrets (`MELO_SETTINGS_ENC_KEY`, `TICKETMASTER_KEY`,
  `APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_BUNDLE_ID`/`APNS_AUTH_KEY`)
  with the deploy commands and cron schedule incantation.
- 2026-04-20: Build fix — `lib/storage.js` had a stale `'../supabase'`
  import path; corrected to `'./supabase'` (it lives in the same
  `lib/` directory).
- 2026-04-20: Build fix — added `/* @vite-ignore */` to the dynamic
  imports of `@capacitor/push-notifications` (in `lib/push.js`) and
  `@ebarooni/capacitor-calendar` (in `lib/calendar.js`) so Vite
  doesn't try to statically resolve them at build time. The plugins
  are iOS-only and may not be installed in `node_modules` when the
  web build runs; the `@vite-ignore` hint defers resolution to
  runtime, where the existing try/catch handles "plugin missing"
  cleanly. `npm run build` now passes (524 kB main bundle / 148 kB
  gzip; same chunking shape as before the sprint).

## Open questions / follow-ups

- **iOS native deploy steps the user must run themselves**:
  1. `npm install` to pull the two new Capacitor plugins, then
     `npm run cap:sync`.
  2. In Xcode → target → Signing & Capabilities → add **Push
     Notifications** + **Background Modes** (Remote notifications).
  3. Apple Developer → Keys → create an APNs Auth Key, download
     `.p8`. Set the four `APNS_*` Supabase secrets.
  4. `supabase secrets set MELO_SETTINGS_ENC_KEY="$(openssl rand -base64 48)"`
  5. `supabase secrets set TICKETMASTER_KEY=<same key>`
  6. `supabase functions deploy setlistfm-set-key --no-verify-jwt`
  7. `supabase functions deploy setlistfm-proxy --no-verify-jwt`
  8. `supabase functions deploy tour-alerts --no-verify-jwt`
  9. `supabase functions schedule create tour-alerts --cron "0 17 * * *"`
- **Migration is destructive on existing data**: any user who had
  `setlist_fm_key` set under 0001 has to re-paste their key once.
  Migration prints a `raise notice`; not silent.
- **Marketing screenshots**: I cannot generate the actual PNG
  images. `marketing/screenshots/README.md` has the full capture
  workflow; placeholders sit at `01-home.png` … `05-songs.png`.
- **Android push** explicitly out of scope. APNs only for v1; FCM
  swap is a one-function patch when Android lands.
- **Encryption key rotation** explicitly out of scope. Rotation =
  re-encrypt every row with both old and new keys side-by-side; we
  defer until we have rotation pressure.
