---
name: Share Cards — Native Canvas Export
description: Replace html2canvas with a native-canvas renderer for the 5 share-card styles, so exports are pixel-reliable on iOS (no font/letter-spacing/measurement gremlins) and verifiable on desktop.
type: project
---

# Share Cards — Native Canvas Export

- Started: 2026-06-25
- Status: in-progress
- Last updated: 2026-06-25

## Context
The redesigned share cards (5 styles: Vibe/Poster/Marquee/Player/Ticket) export
via **html2canvas**, which turned out to be unreliable in the iOS Capacitor
webview in ways that DON'T reproduce in desktop Chromium (so every fix was blind):
- Build 25: html-to-image → html2canvas (fixed iOS blank/foreignObject).
- Build 26: dropped a box-shadow that html2canvas bled over the Ticket's cream
  panel as a grey haze; replaced `transparent` gradient stops (html2canvas paints
  them black).
- Builds 27–28: font race — html2canvas rasterizes before web fonts finish loading
  → fallback faces with different metrics → mid-word baseline jumps, collapsed
  setlist rows.
- Still broken at build 28: **letter-spaced text** ("I WAS THERE", "ADMIT ONE",
  "+N more") breaks even with fonts loaded — proven because the song titles we
  de-spaced render clean while still-spaced labels break IN THE SAME IMAGE. So
  html2canvas mangles letter-spacing/dense text on iOS specifically.

Decision (user picked "draw the card directly"): **stop fighting html2canvas.**
Render each card with the native Canvas 2D API — `ctx.fillText`/`drawImage`/
gradients — exactly like `lib/shareCard.js` already does for the simple fallback.
Canvas output is **identical across platforms**, so it's reliable on iOS AND
verifiable on desktop. No more blind builds.

## Plan
- New module `lib/shareCardCanvas.js`: shared helpers (rounded rect, manual
  letter-spacing via per-glyph advance, left/center wrap, photo cover-draw with
  rounded clip, warm gradient bg, QR) + one `draw<Style>()` per card.
- `renderStyledCard(show, { style, theme, format, flags, photos, handle })` → Blob.
- `ShareCardView.doShare` calls `renderStyledCard` instead of html2canvas. Any
  style without a canvas renderer yet falls back to `renderShowCard` (the existing
  reliable simple card) — so NO html2canvas path remains and nothing can break.
- Build styles in priority order (what the user actually uses first): Ticket →
  Poster → Vibe → Marquee → Player. Verify each in the dev preview (canvas render
  == iOS render) before moving on.

## Changes made
- 2026-06-25: Initiative created. Building the canvas module + Ticket first.
- 2026-06-25: **Ticket ported + wired live (build 29).** New `lib/shareCardCanvas.js`
  with shared helpers (rounded rect, **manual letter-spacing** via per-glyph advance —
  the exact thing html2canvas botched, photo cover-draw w/ rounded clip, warm field
  fallback, `ensureFonts`, QR) + `drawTicket` (warm bleed, cream panel, 3-up photo
  grid, rating badge, title, venue/date, per-vibe-colour chips, setlist w/ dividers,
  "+N more", perforation, barcode + serial, scan lockup). `renderStyledCard(show,
  {style,…})` dispatches; returns null for unported styles → caller uses
  `renderShowCard`. **`ShareCardView.doShare` no longer uses html2canvas** — it calls
  `renderStyledCard` (|| `renderShowCard`). Removed the html2canvas import, the
  `isBlankImage` blank-detector, and the doShare font-race/settle dance (canvas needs
  none of it). Verified the Ticket in the dev preview pixel-clean: every letter-spaced
  label crisp, even setlist rows, correct vibe colours, rating badge — and since it's
  canvas it renders identically on iOS. Interim: defaulted the style picker to Ticket
  so every share is bulletproof; the other 4 styles fall back to the simple card until
  ported.

## Still to port (canvas renderers)
- Poster, Vibe, Marquee, Player → then restore the smart auto-pick + remove the
  hidden html2canvas export node + drop the html2canvas dependency.

## Open questions / follow-ups
- Photos need `crossOrigin='anonymous'` so `toBlob()` isn't tainted; the show
  photos are Supabase-hosted with CORS (they loaded under html2canvas useCORS), so
  this should hold — fall back to the generative field if a photo fails to load.
- The on-screen PREVIEW still uses the React components (DOM renders fine); only the
  EXPORT switches to canvas. Keep them visually in sync as styles are ported.
- Once all 5 are ported, html2canvas can be removed as a dependency.
