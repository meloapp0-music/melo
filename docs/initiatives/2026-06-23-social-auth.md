---
name: social-auth
description: One-tap "Sign in with Apple" (and Google) to remove the email + 8-digit OTP signup friction — the biggest accessibility/conversion win for getting new users in. Supabase supports the OAuth providers; iOS needs the native Apple capability + a Capacitor flow. Planned for 1.4.
type: project
---

# Social Auth — Sign in with Apple / Google

- Started: 2026-06-23
- Status: planned
- Last updated: 2026-06-23

## Context
Today, joining Melo = email + an **8-digit OTP** confirmation (`SignUp.jsx` →
`OtpEntry`). That friction is real — it made the App Store demo login a headache, and
every extra signup step bleeds conversion on a cold install. "Sign in with Apple" is
one tap, no password, no inbox round-trip — the highest-leverage **accessibility** win
for acquisition. Apple also effectively requires it once any third-party social login
is offered. Slotted for the 1.4 "stickier & more accessible" bundle.

## Plan
- **Supabase**: enable Apple + Google providers (Auth → Providers). Supabase issues the
  session; profiles still come from the `handle_new_user` trigger, so onboarding
  ([[cold-start-activation]]) is unchanged after auth.
- **iOS (Capacitor)**: add the "Sign in with Apple" capability to the App target; use
  `@capacitor-community/apple-sign-in` (or native OAuth via ASWebAuthenticationSession)
  to get the identity token → `supabase.auth.signInWithIdToken`.
- **Web/PWA**: `supabase.auth.signInWithOAuth` for Google.
- **UI**: "Continue with Apple" / "Continue with Google" buttons above the email form
  on `SignIn`/`SignUp`; keep email as a fallback.
- **Security spine**: no RLS/policy changes — same `auth.uid()` identity. Do not weaken.

## Changes made
- 2026-06-23: Initiative created (idea capture; deferred to 1.4).

## Open questions / follow-ups
- Native Apple sign-in needs a real device + Apple Developer config (Service ID, key) —
  can't be verified in the web preview.
- Decide account-merge behavior if someone later signs in with Apple using an email
  that already has a password account.
