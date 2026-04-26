# Setlist.fm API Key Onboarding

- Started: 2026-04-17
- Status: shipped
- Last updated: 2026-04-17

## Context

Melo autofills real setlists from setlist.fm, but the API is per-user-key
only — we can't ship a shared key. Pre-this-change the Settings page
dropped users on "paste key" with no guidance; most bounced. Need to
compress the sign-up-to-first-autofill flow to under a minute.

## Plan

Replace the bare input with an inline 3-step walkthrough and make the
LogShow "no setlists" hint a one-tap jump to Settings. Keep the password
input behavior (type=password, Save button disabled when empty).

## Changes made

- 2026-04-17: Rewrote `src/web/pages/Settings.jsx` Setlist.fm card with a
  3-step walkthrough:
  1. `https://www.setlist.fm/signup` (30-second signup)
  2. `https://www.setlist.fm/settings/api` (instant-approval API form)
  3. Paste + Save.
- 2026-04-17: Save button disabled when input empty; turns green with a
  `✓ Saved — you're all set!` confirmation on save.
- 2026-04-17: Added `.log-apikey-hint` in `LogShow.jsx` — tap-to-open
  Settings. Navigates via `useApp().navigate('settings')` after closing
  the log sheet.
- 2026-04-17: `.setlist-steps`, `.setlist-step-num`, `.log-apikey-hint`
  styles added to `App.css`.

## Open questions / follow-ups

- In Phase 4 the API key moves to encrypted-at-rest behind an Edge
  Function proxy; the Settings UX stays the same but the network path
  changes.
