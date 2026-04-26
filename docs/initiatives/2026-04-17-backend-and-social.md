# Backend & Social System

- Started: 2026-04-17
- Status: in-progress (Phase 1 shipped; Phases 2–5 pending)
- Last updated: 2026-04-19

## Context

Melo was built as a 100% client-side React SPA with every show, ranking,
buddy, and the Setlist.fm API key in `localStorage`. The product needs to
become social — tagging a friend on a show only works if that friend is a
real Melo user whose own profile can reflect the same memory. Clearing
browser storage also wiped everything and nothing synced across devices.

This initiative moves Melo onto Supabase: Postgres + email/password auth +
Row-Level Security + Edge Functions for the Setlist.fm key.

## Plan

Approved plan file (full SQL schema, RLS policies, file list, verification
matrix): `~/.claude/plans/immutable-greeting-sunrise.md`.

Phased rollout — each phase ships independently:

1. **Phase 1 — Auth + cloud sync.** Same UX, data persists across devices.
   Profiles, shows, rankings, user_settings. No friendships yet.
2. **Phase 2 — Friendships.** Canonical-pair friendships table, username
   search, request/accept/decline, friend profile view.
3. **Phase 3 — Shared show attendance.** `show_attendees` table, the "Alex
   linking" moment (label → friend_id), confirmation flow.
4. **Phase 4 — Polish + security.** Shared-show surfaces on friend profiles,
   visibility controls, Setlist.fm key moves to encrypted-at-rest via
   Edge Function.
5. **Phase 5 — Notifications.** Email on friend request / attendance tag /
   confirmation.

User decisions (recorded 2026-04-17):
- Auth method: **email + password** only for v1.
- Existing sample data: **discarded on signup.** New users start empty.

## Changes made

- 2026-04-17: Plan approved. Created `supabase/migrations/0001_init.sql`
  with `profiles`, `shows`, `rankings`, `user_settings` tables + RLS
  policies + `handle_new_user()` trigger.
- 2026-04-17: Added `@supabase/supabase-js` to dependencies.
- 2026-04-17: Created `.env.example` with `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`. Updated `.gitignore` for `.env*` and
  `supabase/.branches|.temp`.
- 2026-04-17: Created `src/web/lib/supabase.js` (client singleton with
  `persistSession` + `autoRefreshToken` enabled, `storageKey=melo.auth.session`).
- 2026-04-17: Created `src/web/lib/auth.js` exposing `useSession()`,
  `signIn`, `signUp`, `signOut`, `sendPasswordReset`, `updatePassword`.
- 2026-04-17: Created data-layer modules under `src/web/lib/db/`:
  `shows.js`, `rankings.js`, `settings.js`, `profiles.js`. All pages must
  go through these — no direct `supabase.from(...)` in components.
- 2026-04-17: Created `src/web/pages/auth/SignIn.jsx` (email + password
  form with forgot-password flow).
- 2026-04-17: Created `src/web/pages/auth/SignUp.jsx`, `Onboarding.jsx`,
  `ResetPassword.jsx`.
- 2026-04-17: Created `src/web/components/AuthGate.jsx` that swaps between
  SignIn and SignUp.
- 2026-04-17: Rewrote `src/web/App.jsx` as a session-aware state machine
  (`loading → unauthenticated → onboarding → app`). Replaced localStorage
  state initializers with Supabase loaders.
- 2026-04-17: Stripped `load*` / `save*` localStorage functions from
  `src/web/store.js`. Kept the pure helpers (VIBES, CITIES,
  getArtistGradient, calculateStreak, getWrappedYears, DISCOVERY_ARTISTS).
- 2026-04-17: Updated `Settings.jsx` and `Rankings.jsx` to route through
  `lib/db/*` instead of `store.js` load/save helpers.
- 2026-04-17: Added auth/onboarding CSS to `App.css` (`.auth-page`,
  `.auth-form`, `.auth-username-row`, `.auth-color-row`, `.app-splash`,
  `.app-data-loading`, `.settings-account-row`).
- 2026-04-17: Settings page gained an Account card (avatar + display
  name + Sign Out). The old localStorage-clearing "Clear All Data"
  button is gone — cloud data deletion is a Phase 4 task.
- 2026-04-17: `npm run build` passes clean (86 modules, 0 warnings)
  with the full rewrite. Phase 1 code is ready; needs Supabase project
  provisioning + `.env.local` + migration apply to verify end-to-end.
- 2026-04-19: **Phase 1 verified live.** User provisioned a Supabase
  project (ref `aptwdtteplznxmtxnopx`), filled in `.env.local`, ran
  `0001_init.sql` in the SQL editor (success, all 4 tables created with
  RLS), enabled Email auth with "Confirm email" off for testing, signed
  up via the AuthGate, completed Onboarding (username + display name),
  and landed on empty Home. End-to-end auth + cloud-sync now working.

## Open questions / follow-ups

- Need to provision the actual Supabase project, paste the URL + anon key
  into `.env.local`, and apply `0001_init.sql` before Phase 1 can be
  verified end-to-end.
- Write `scripts/test_rls.mjs` once env is wired — asserts the "can't read
  another user's shows" invariant automatically.
- Decide whether to email-verify on signup for v1 (currently
  `emailRedirectTo` is set but Supabase project may be configured
  differently).
- Phase 2 onward: design the friend profile view component
  (`UserProfileView`) so Profile.jsx becomes `<UserProfileView ownProfile>`.
