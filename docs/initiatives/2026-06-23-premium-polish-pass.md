---
name: Premium Polish Pass
description: Finish-level visual upgrade (color/depth/imagery/motion only — no layout or data changes) to move the app from "flat placeholder" to "premium ticket-stub drawer." From the design_handoff_melo_polish handoff.
type: project
---

# Premium Polish Pass

- Started: 2026-06-23
- Status: shipped
- Last updated: 2026-06-23

## Context
A design handoff (`~/Downloads/design_handoff_melo_polish/`) specifies a
finish-level visual upgrade to the home + poster surfaces. **No layout,
navigation, or data-model changes** — color, depth, imagery, and motion only.
Goal: move the app from "flat placeholder" to "premium ticket-stub drawer."
This is the polish step the user wanted done *before* building the Showgoer-style
first-run "starting navigation" (see [[cold-start-activation]]).

Five changes in the handoff README:
1. **Warm-only fallback gradient** (the headline — recolors every poster/avatar/
   hero app-wide from one helper).
2. **Letter-art watermark + soft shadow** on fallback poster cards.
3. **Real photos layered over the gradient as a base layer** (a slow/failed image
   never leaves a blank card).
4. **Richer home hero** (warm corner glow + the stat card overlapping the wash).
5. **Two touches**: ember halo behind the sign-in lockup; gentle transform-only
   entrance motion; button label `white-space: nowrap`.

## How it maps to the real app (confirmed by exploration)
The handoff is an HTML/JSX prototype assuming one shared `ShowCard` +
`nameGradient`. The real app differs:
- The fallback gradient helper is **`getArtistGradient(name)` in `src/web/store.js`**
  (not `nameGradient`). One edit there recolors every surface (Home, MyShows,
  Profile, Artists, Songs, Rankings, Map, Wrapped, ShowDetail hero, friend feed…).
- There is **no shared `ShowCard`** — each page inlines the poster pattern with a
  local `bgStyle(artist)` helper + CSS classes (`.home-show-card`, `.home-top-card`,
  `.show-poster`, `.upnext-card`, …). So Changes 2 & 3 are applied to the primary
  poster surfaces (Home rail + Top Rated + My Shows grid) rather than one component.
- Tokens that exist: `--card-radius`, `--shadow-sm/md/lg`, `--bg`, `--orange`,
  `--amber`, `--brown*`. The handoff's `--gradient-hero` / `--scrim-poster` /
  `--ease-out` do **not** exist → inline the literal values, layered over the app's
  existing washes.
- The README's "detail-hero crashed on a missing `nameGradient`" bug does **not**
  exist here — `ShowDetail.jsx` already uses `getArtistGradient(show.artist)`. Change 1
  improves it for free.

## Changes made
- 2026-06-23: Initiative created. Implementing all five changes.
- 2026-06-23: **All five shipped (in code).** Verified via `npm run build` (clean)
  and the dev preview.
  - **Change 1** — `store.js` `getArtistGradient` rewritten to the warm-band math
    (hue 8–44°, `linear-gradient(150deg, …)`). Recolors every fallback poster,
    avatar, and detail hero app-wide. Verified: sample name-hashes all resolve to
    warm hues (h ≈ 13–58°) — no more full-spectrum rainbow. Left the share-card
    `nameStops` (shareCardKit.js) alone — it intentionally uses full-spectrum mesh.
  - **Change 2** — letter-art watermark + soft shadow. New shared `.poster-letter`
    / `.poster-letter--lg` CSS (no z-index, sits above the bg layer and below the
    scrim in both z-indexed Home cards and plain-stacking My Shows posters). Added
    the ghosted initial to `.home-show-card` (Home rail), `.home-top-card` (Top
    Rated), and `.show-poster` (My Shows grid) when the show has no photo. Added
    `box-shadow: var(--shadow-sm)` to `.home-show-card` (was none); `.show-poster`
    already had `--shadow-md`.
  - **Change 3** — photo over gradient base. `bgStyle()` in Home.jsx + MyShows.jsx
    now returns `background: url(photo) center/cover, <gradient>` so the warm
    gradient is always the base layer and a slow/failed image never blanks a card.
  - **Change 4** — richer home hero. `.home-hero`: added the warm corner-glow
    radial over the existing wash + bottom padding 36→52px. `.home-stats`: overlap
    margin-top −18→−34px so the stat card laps up into the wash.
  - **Change 5** — `.auth-page` ember-halo radial (verified on the sign-in screen);
    `@keyframes melo-rise` (transform-only) + a `prefers-reduced-motion`-gated
    staggered entrance on `.page > *`; `white-space: nowrap` on `.settings-save-btn`.
  - Tokens that didn't exist in the real app (`--gradient-hero`, `--scrim-poster`,
    `--ease-out`) were inlined as literals layered over the app's existing washes.
- 2026-06-23: **Caveat** — the handoff's exact h2 math (`h1 + 8 + [0..9]`) can reach
  ~57–60°, so a few name-hashes (e.g. Tame Impala, Vampire Weekend) render olive-gold
  rather than ember. Kept as-is per the handoff's "match the math exactly" directive;
  tighten the h2 ceiling if an all-red/orange look is preferred. Not committed yet.
- 2026-06-23: **Resolved** — capped `h2` at 44° (`Math.min(…, 44)`) so the
  formerly-olive high-hash artists (Tame Impala, Vampire Weekend) now read warm
  amber-gold; this also makes the implementation match the README's stated 8–44°
  intent. Verified in preview.
- 2026-06-24: **Reverted Change 5's entrance motion (bug fix).** The `melo-rise`
  keyframe + `.page > *` staggered transform animation caused the fixed bottom
  NavBar to detach from the viewport and scroll up into the middle of the screen
  on **iOS (WKWebView)** — transform animations on page content are a known
  trigger for `position: fixed` breakage there, and the bug appeared exactly when
  this animation was added (606d413). Removed the keyframe + the `.page > *` rule
  (left an explanatory note in App.css). The rest of Change 5 (auth/sign-in ember
  halo, button `nowrap`) and every other change are unaffected. ⚠️ The animation
  also shipped in the **in-review 1.3 build**, so this fix must ride a new build.
- 2026-06-24: **Real NavBar fix (the `.page > *` removal did NOT fix it).** On
  device the bottom nav still floated into the middle on scroll; it tests fine in
  desktop Chromium, so the bug is **iOS WKWebView-specific**. Actual fix: (1)
  **portal the NavBar to `document.body`** (out of `.app`, which has
  `overflow-x: hidden` — iOS mis-positions fixed elements inside overflow/scroll
  ancestors), and (2) **remove the nav's `backdrop-filter`** (a `position:fixed`
  element with backdrop-filter is another known iOS detach trigger) — the bar is
  now near-solid cream (`rgba(250,248,245,0.96)`) instead of frosted. Pending
  device confirmation; restore the frosted look later if it proves stable.
- 2026-06-25: **Real fix — flex-column app shell (the portal/blur did NOT hold).**
  On device the bottom nav STILL floated up on scroll on build 29, so portaling to
  `<body>` + dropping backdrop-filter was the wrong tree. The honest root cause is
  broader: iOS WKWebView is unreliable with `position: fixed` here, full stop.
  Switched to the bulletproof pattern that uses NO fixed positioning: `.app` is a
  `100dvh` flex column, `.app .page` is the single scrolling region
  (`flex:1; overflow-y:auto; min-height:0`), and `.nav-bar` is a `flex-shrink:0`
  sibling at the bottom — a laid-out element that physically cannot scroll away.
  Un-portaled the NavBar (in-flow child of `.app` again). Scoped the scroll CSS to
  `.app .page` so the sign-in screen (a `.page` rendered OUTSIDE `.app`) keeps its
  full-height block layout. Unlike fixed positioning, **flexbox is deterministic** →
  verified in the dev preview by scrolling an injected `.app/.page/.nav-bar` 1600px:
  the nav stays pinned (navBottom == appBottom), and it behaves identically on iOS.
  Rides build 30.

## Open questions / follow-ups
- The letter-art watermark + photo-base layering is applied to the main poster
  surfaces (Home `.home-show-card` + `.home-top-card`, MyShows `.show-poster`).
  Other inline cards (Artists/Songs/Rankings/Profile/Map grids) still get the new
  warm gradient (Change 1) but not the watermark — extend later if wanted.
- Next: build the cold-start "starting navigation" (the reason this polish was
  sequenced first).
