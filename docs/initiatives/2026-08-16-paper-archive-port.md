# The paper-archive port

- Started: 2026-08-04
- Status: in-progress
- Last updated: 2026-08-16

## Context

Melo's visual language was a peach/orange gradient over Outfit sans — the look
it launched with, and one that says nothing about what the app is for. The
redesign moves it to **the paper archive**: warm bone paper (`#FDFCF6`),
Playfair Display italic as the display face, Inter set tiny, black, uppercase
and widely letter-spaced for every label, hairline rules instead of shadows,
and a single ember accent (`#F93827`). The thesis is that a concert log is an
archive — a printed record of nights that happened — not a dashboard.

The design was produced outside the repo (Sleek, later base44) and exists as
**21 exported HTML screens** in `~/Downloads/export-html/`, built with
Tailwind v4 + Playfair Display + Inter + JetBrains Mono. The approved approach
is to **port the export's utility classes verbatim** and rebind the hardcoded
content to real data — not to hand-translate the mockups into `App.css`.

That decision was learned the hard way. The first attempt (layers 1–3,
2026-08-04) read screenshots and hand-wrote CSS. It was rejected on sight:
fidelity is lost in translation, and a 46-rule italic sweep landed without
ever being seen on a real screen. The export's classes *are* the design.

This file exists because the port is the largest cross-cutting change in the
repo's history — 87 commits on `design/paper-archive` — and until now it had
no initiative note at all.

## Plan

Full plan: `~/.claude/plans/compressed-gathering-wren.md`.

**Phase 1 — foundation** (done). Tailwind v4 via `@tailwindcss/vite`, the
`@theme inline` token block copied verbatim from the export, local SVG icons
instead of the export's Iconify CDN script (the app must work in a venue with
no signal).

**Phase 2 — port, screen by screen.** Each screen is its own commit, verified
side by side against its export HTML at 375×812 in a browser before the next
one starts. Order was chosen to surface binding problems early: Home (6
states) → Drawer → Show Detail → You → Log Show → Duel → Leaderboard → Recap.

**The gap.** The export covers 8 surfaces. The app has 21 pages and 44
components. Everything else is either derived from `design-system.html` — the
specimen sheet of buttons, inputs, labels, stubs — or needs a new design pass.
Auth is the largest uncovered surface and the highest-priority one, because it
is the first screen every user sees.

### Standing constraints for every ported screen

- **The shell contract.** `.app` is a 100dvh flex column with
  `overflow: hidden`; a page must be `flex-1 min-h-0 overflow-y-auto`. A page
  that sets `min-h-screen` pushes the NavBar off the viewport — this shipped
  once and the nav bar vanished entirely. **Auth screens are the exception**:
  they are returned from `App.jsx`'s render gates *before* `.app` exists, so
  they are the root element and 100dvh is correct there.
- **No `hover:`.** Hover never fires on touch, and on iOS Safari a tap can
  strand an element in its hover appearance. `active:scale-95` instead.
- **No CDN anything** — no remote images, no icon scripts.
- **`--ember-text` (`#C74B32`) for small ember type.** The accent is 3.63:1 on
  paper, which fails WCAG AA; the export itself uses it at 10px anyway.
- **Brand marks via `MeloLogo.jsx`**, never raw letterforms.

## Changes made

- 2026-08-04: Layers 1–3 — display serif, paper surface, three-way type split.
  Layer 3's italic sweep was **rejected by the user** and surgically removed
  (43 declarations); the number split within it was independently right and
  was kept. Superseded by the verbatim port.
- 2026-08-04: `b8eafdf` eight artist colours replacing eight shades of one
  orange. Every artist had been rendering the same orange-brown because
  `getArtistGradient` was hue-locked to 8–44°. All eight clear WCAG AA.
- 2026-08-05: `7f3e76c` the wordmark consolidated from five definitions
  (three already drifted) to one.
- 2026-08-10: `36575d4` Tailwind v4 + the Sleek tokens, verbatim.
- 2026-08-10: `af8a906` Home ported.
- 2026-08-11: `607a009` **App.css was silently beating every Tailwind
  utility.** Unlayered `* { margin: 0; padding: 0 }` outranks *all* layered
  CSS regardless of specificity, so every ported utility resolved to 0.
  Verified fixed in the browser: `px-8` → 32px, `text-7xl` → 72px.
- 2026-08-11: `6524dee` Home's three data-driven states; `d6bad1b` tab bar +
  Leaderboard as a tab; `671d26e` nav graph made consistent; `f7c6a7b` the
  Drawer.
- 2026-08-11: `3bf894f` ported pages made the shell's scrolling child rather
  than 100vh tall — the fix for the vanished NavBar.
- 2026-08-16: `236fb43` **one ember, not three.** The app had been carrying
  `#E8573A` (old brand, 268 sites, all un-ported screens), `#F93827` (Sleek's
  accent, every ported screen) and `#ef4136` (the logo gradient) at the same
  time, plus two creams. All 278 instances swept to `#F93827`, so `--orange`
  and `--accent` are now the same colour under two names and porting a screen
  is no longer also a colour change. `--ember-text` deliberately left at
  `#C74B32`: re-derived from the new base, every lightness dark enough to
  clear 4.5:1 lands on blood red, which is a different colour rather than a
  darker ember.

## Open questions / follow-ups

- **`design/paper-archive` has no upstream.** 87 commits exist on one disk,
  including the source for three Edge Functions already live in production.
  This is the largest single risk on the project right now.
- **Dark mode does not exist** — no `prefers-color-scheme` rules, no theme
  attribute, nothing to switch on. Seven of the export's screens are night
  variants that cannot be ported until it does.
- 18 of 23 surfaces remain un-ported.
- `TheBill.jsx` is written but not yet wired into `Rankings.jsx`.
- Nothing in this port has ever run on a phone. iOS is still v1.6 / build 35.
