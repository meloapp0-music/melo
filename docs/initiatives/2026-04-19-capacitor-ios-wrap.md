# Capacitor: Wrap Melo as a Real iOS App

- Started: 2026-04-19
- Status: in-progress
- Last updated: 2026-04-19

## Context

Melo is a React 19 + Vite 8 SPA. The user wants it shipped as a real iOS
app (TestFlight → App Store), not just a "save to home screen" PWA.

Two paths considered:

| Path | Effort | Trade-off |
|---|---|---|
| **Capacitor wrap** (chosen) | ~1 day | Same React/Vite codebase, packaged in a native WKWebView shell. Real iOS app, App Store eligible, full Capacitor plugin ecosystem (Haptics, Share, StatusBar, etc.). |
| Full React Native rewrite | weeks | Native UI, better performance, but throws away the existing polished SPA. |

User chose Capacitor. The vestigial Expo / React Native dependencies in
`package.json` are dead code from a pre-pivot exploration and are being left
in place until a separate cleanup initiative — they don't interfere with the
Capacitor build (different webDir, different toolchain).

## Plan

1. Install `@capacitor/core`, `@capacitor/ios`, `@capacitor/cli`.
2. `npx cap init Melo com.melo.app --web-dir=dist`.
3. Configure `capacitor.config.json` with `ios.contentInset: "always"` so
   safe-area insets propagate to the webview.
4. `npm run build && npx cap add ios` to generate the Xcode project under
   `/ios`. Treat that folder as generated artifacts (already in `.gitignore`
   from the Expo era — we keep it ignored and regenerate on demand).
5. Add npm scripts: `cap:sync` (build + sync) and `cap:ios` (build + sync +
   open Xcode).
6. Verify `viewport-fit=cover` in `index.html` (already present).

## Changes made

- 2026-04-19: `npm install @capacitor/core @capacitor/ios` →
  `^8.3.1` for both. `npm install -D @capacitor/cli` → `^8.3.1`.
- 2026-04-19: `npx cap init Melo com.melo.app --web-dir=dist` created
  `capacitor.config.json` at the repo root.
- 2026-04-19: Edited `capacitor.config.json` to add
  `"ios": { "contentInset": "always" }`.
- 2026-04-19: `npm run build` → clean (86 modules, 0 warnings, 470 KB
  gzipped main bundle 132 KB).
- 2026-04-19: `npx cap add ios` generated `/ios/App` with the Xcode project
  + Swift Package Manager dependency manifest (no CocoaPods needed for v8).
- 2026-04-19: Added `cap:sync` and `cap:ios` scripts to `package.json`.
  Existing Expo `ios` script left untouched (vestigial, scheduled for
  cleanup in a separate initiative).
- 2026-04-19: Confirmed `index.html` already has
  `viewport-fit=cover, apple-mobile-web-app-capable=yes,
  apple-mobile-web-app-status-bar-style=black-translucent` from earlier
  PWA work — no changes needed.

## Open questions / follow-ups

- **Status bar styling**: install `@capacitor/status-bar` and call
  `StatusBar.setStyle({ style: Style.Dark })` on app boot so the iOS status
  bar matches our cream/white theme.
- **Splash screen**: install `@capacitor/splash-screen` and produce
  branded `Splash.imageset` assets (use `MeloIcon` at 2048px on the brand
  cream background).
- **Haptics**: `@capacitor/haptics` for the + button, ELO-vote taps,
  Wrapped slide swipes — small touches that make it feel native.
- **App icon**: generate the full iOS icon set (1024px master → all sizes)
  from `MeloIcon`. Currently still the Capacitor default.
- **App Store Connect**: bundle identifier `com.melo.app` reserved? Set up
  team, certificates, App Store Connect record, TestFlight build pipeline.
- **CI**: GitHub Actions workflow that runs `npm run build && npx cap sync
  ios && fastlane beta` on push to `main`. Out of scope for this
  initiative — log when starting.
- **Dead Expo deps**: `package.json` still lists ~20 Expo / React Native
  packages from a pre-pivot exploration. Schedule a `cleanup-expo-deps`
  initiative to remove them.

## Workflow reference

```bash
npm run dev           # web dev server (unchanged)
npm run build         # production web build
npm run cap:sync      # build + push web bundle into /ios
npm run cap:ios       # build + sync + open Xcode for run/archive
```
