# Make It Legal — App Store / ToS Compliance Pass

- Started: 2026-04-20
- Status: shipped (code) · pending (legal review of copy + Edge Function deploy)
- Last updated: 2026-04-20

## Context

Melo is on a glide path to TestFlight + App Store, and Apple's review
process plus several of our upstream APIs (Setlist.fm, Ticketmaster,
Apple Music, MusicBrainz, Deezer) require things the prototype was
shipping without:

1. A user-visible **Privacy Policy** and **Terms of Service**.
2. **Attributions** for every third-party data source — both on a
   dedicated page and inline on the surfaces that use the data.
3. An in-app **Account Deletion** flow (Apple has rejected sign-in
   apps that lack one for ~3 years now).
4. Avoiding third-party CORS proxies (`corsproxy.io`) for Setlist.fm
   traffic — their ToS explicitly forbids unaffiliated infrastructure
   sitting in front of their API. Even as a dev convenience it's a
   liability if the App Store review lands during a corsproxy outage.

The user's prompt was: "is all of this legal? or are there things I
need to do to make it legal?" → after audit → "make it legal."

## Plan

Six-prong, all additive (no schema changes, no DB migrations):

1. **Legal page** — `src/web/pages/Legal.jsx` with Attributions /
   Privacy / Terms tabs. Privacy + Terms text is developer-drafted
   and prominently flagged "Draft — pending legal review."
2. **Account deletion** — client wrapper `src/web/lib/db/account.js`
   calls a new Supabase Edge Function `delete-account` which uses
   the service-role key to `auth.admin.deleteUser(uid)`. Migration
   0001 already has `on delete cascade` from every user-data table
   to `auth.users`, so the cascade wipes profiles/shows/rankings/
   user_settings automatically.
3. **CORS proxy** — Supabase Edge Function `api-proxy` with an
   allowlist (`api.deezer.com`, `api.setlist.fm`, `musicbrainz.org`).
   `CORS_PROXY` in `src/web/api.js` reads `VITE_API_PROXY_URL` and
   falls back to `corsproxy.io` so dev keeps working until the
   function is deployed.
4. **In-context attributions** — `setlist.fm (CC BY-SA)` under every
   PlayableSetlist; `30-sec previews via Apple Music` at the bottom
   of PlayableSetlist; `Festival listings powered by Ticketmaster`
   on the Festivals page.
5. **Settings entry points** — replace the stale Bandsintown row
   with Ticketmaster, add an `About → Legal & Attributions` link
   row, add a `Delete Account` button below `Sign Out` with a
   double-confirm.
6. **Env / docs** — `.env.example` documents the two new vars
   (`VITE_API_PROXY_URL`, `VITE_DEEZER_APP_ID`); deploy commands
   live in the Edge Function source comments.

Approved plan: `~/.claude/plans/immutable-greeting-sunrise.md`.

## Changes made

- 2026-04-20: Created `src/web/pages/Legal.jsx` (Attributions /
  Privacy / Terms tabs, with `<Source>` rows for Ticketmaster,
  Setlist.fm, Apple Music/iTunes, MusicBrainz, Deezer, Spotify,
  OSM/CARTO, Leaflet). Constants `LEGAL_LAST_UPDATED = '2026-04-20'`
  and `LEGAL_CONTACT_EMAIL = 'support@melo.app'` for easy editing.
- 2026-04-20: `src/web/App.jsx` imports `Legal` and routes
  `subPage === 'legal'`.
- 2026-04-20: Created `src/web/lib/db/account.js` with
  `deleteMyAccount()` — invokes the Edge Function, surfaces a
  friendly "function not deployed" message on 404, then calls
  `supabase.auth.signOut()` to clear the (now-orphaned) session.
- 2026-04-20: Created `supabase/functions/delete-account/index.ts`.
  Reads JWT from `Authorization` header, identifies caller via the
  anon client, then calls `auth.admin.deleteUser(userId)` with the
  service-role key. Deploy with
  `supabase functions deploy delete-account --no-verify-jwt`.
- 2026-04-20: Created `supabase/functions/api-proxy/index.ts`.
  `?url=<encoded>` query param, allowlist of upstream hosts,
  forwards only `x-api-key` + `accept` headers, 5-min edge cache,
  permissive CORS on responses. Deploy with
  `supabase functions deploy api-proxy --no-verify-jwt`.
- 2026-04-20: `src/web/api.js` — `CORS_PROXY` is now
  `import.meta.env.VITE_API_PROXY_URL || 'https://corsproxy.io/?'`,
  with comments explaining the Setlist.fm ToS rationale and a
  reservation for `VITE_DEEZER_APP_ID` (no behavior change yet).
- 2026-04-20: `src/web/pages/Settings.jsx` — replaced the stale
  Bandsintown integration row with Ticketmaster (Bandsintown was
  retired 2026-04-19). Added an `About` section with a
  `Legal & Attributions` link row that calls `navigate('legal')`.
  Added a `Delete Account` button below `Sign Out` that
  double-confirms then calls `deleteMyAccount()`.
- 2026-04-20: In-context attributions —
  `src/web/components/ShowDetail.jsx` (under PlayableSetlist),
  `src/web/components/PlayableSetlist.jsx` (bottom of song list),
  `src/web/pages/Festivals.jsx` (bottom of page).
- 2026-04-20: `src/web/App.css` — appended five new classes:
  `.settings-link-row`, `.settings-link-row-chevron`,
  `.settings-danger-btn-delete`, `.legal-attribution`,
  `.legal-attribution-inline`, `.legal-attribution-center`.
- 2026-04-20: `.env.example` documents `VITE_API_PROXY_URL` and
  `VITE_DEEZER_APP_ID` with deploy instructions.

## Open questions / follow-ups

- **Privacy + Terms text is developer-drafted and pending attorney
  review.** Update the `LEGAL_LAST_UPDATED` constant (and
  `LEGAL_CONTACT_EMAIL` if it changes) in `src/web/pages/Legal.jsx`
  when finalized.
- **Edge Functions need to be deployed** to the user's Supabase
  project before the new flows work in production:
  `supabase functions deploy delete-account --no-verify-jwt` and
  `supabase functions deploy api-proxy --no-verify-jwt`. Until then,
  Delete Account surfaces a friendly "function not deployed" error
  (handled in `lib/db/account.js`) and the proxy falls back to
  `corsproxy.io`.
- **Set `VITE_API_PROXY_URL` and `VITE_DEEZER_APP_ID`** in the
  production deploy environment after the Edge Function URL is
  known and after a Deezer app is registered.
- **Encryption-at-rest of the Setlist.fm API key** is still tracked
  in CLAUDE.md's security spine notes — out of scope here.
- **GDPR / cookie banner** — Melo currently sets only Supabase auth
  cookies (functionally necessary, no consent required under most
  regimes), but a future EU rollout may need explicit consent for
  the Setlist.fm key prompt.
