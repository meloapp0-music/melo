# Melo Brand System

- Started: 2026-04-17
- Status: shipped
- Last updated: 2026-04-17

## Context

User uploaded a brand logo set (dark rounded square with an orange
geometric "M" crown, the "melo" wordmark, and a "FIND YOUR NEXT SHOW"
tagline) and asked to weave the marks through the app so every surface
feels on-brand.

## Plan

Ship three reusable React components so every page renders the marks
identically and no-one is tempted to hand-roll a look-alike:

- `MeloIcon` — the SVG M inside the dark rounded square, size-controlled.
- `MeloWordmark` — the "melo" wordmark (Outfit 300, 0.06em tracking).
- `MeloLockup` — icon + wordmark + optional tagline, for splash surfaces.

Drop them into the highest-signal surfaces first: Home greeting row,
Profile avatar, Wrapped summary slide.

## Changes made

- 2026-04-17: Created `src/web/components/MeloLogo.jsx` exporting
  `MeloIcon`, `MeloWordmark`, `MeloLockup`. Unique SVG gradient ids per
  size so multiple instances render cleanly.
- 2026-04-17: Added `MeloIcon` above the Home greeting
  (`.home-brand-row`).
- 2026-04-17: Replaced the "M" string in Profile with `<MeloIcon size={80}/>`
  (`.profile-avatar-logo`).
- 2026-04-17: Wrapped summary slide uses `<MeloIcon>` + `<MeloWordmark>`
  instead of literal "melo" text.
- 2026-04-17: Reserved for auth screens — splash/sign-in now renders
  `<MeloLockup tagline iconSize=56 wordmarkSize=40>` (see Phase 1 auth).

## Open questions / follow-ups

- Consider adding the lockup to the app `<head>` as a favicon / PWA icon.
- Splash screen for the Expo/native build still uses the old M avatar.
