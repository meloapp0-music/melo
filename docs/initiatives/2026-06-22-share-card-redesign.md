---
name: Share Card Redesign
description: Rebuild the "share your show" card from the design handoff — five styles + a Share-view builder shell. Phase 1 ships Vibe + the shell.
type: project
---

# Share Card Redesign

- Started: 2026-06-22
- Status: shipped
- Last updated: 2026-06-25

## Context
A design handoff (`~/Downloads/design_handoff_share_card/`) replaces the old flat
gradient+QR share card with **five distinct card styles** (Vibe, Poster, Marquee,
Player, Ticket), a one-tap **Share-view** shell, smart auto-pick, optional photos,
looping motion, and a tappable full-setlist popover. The handoff is an HTML/React
prototype (CDN Babel + sample data); the task is to recreate it inside the real
app, not ship the prototype.

The goal: give people a reason to stop scrolling when a friend posts a show.

## Plan
Per the handoff's suggested build order. **This commit = Phase 1: Vibe (the
no-photo default) + the Share-view shell + dock + auto-pick + the +N-more popover.**
Later: Poster (photo path), then Player/Marquee/Ticket, then real photo upload and
new-card raster export.

### How it maps to the real app (confirmed by exploration)
- **Data model** (`lib/db/shows.js` `fromRow`): `artist, venue, city, date` (ISO),
  `vibes: string[]`, `setlist: string[]`, `score: number|null`, `photos: string[]`.
  No `hasPhotos` field → use `photos.length > 0`. Rating uses `score`.
- **Tokens** (`App.css :root`): reuse `--orange #E8573A`, `--amber #F4A261`,
  `--brown #3D2C1E`, `--bg #FAF8F5`. Action gradient `linear-gradient(135deg,
  var(--amber), var(--orange))`. Fonts Outfit + DM Sans (already loaded in
  `index.html`).
- **Vibes**: reuse `vibeStyle()` from `store.js` (the handoff colors match exactly).
- **Generative gradient**: the handoff's `nameStops` shares `getArtistGradient`'s
  hash (`store.js`); ported as `nameStops` for the richer mesh field.
- **QR**: real QR via the `qrcode` lib already used in `lib/shareCard.js`.
- **Overlay**: full-screen conditionally-rendered overlay (the app's ShowDetail
  pattern), opened from the show's Share button.
- **Export**: Phase 1's "Share to your story" calls the existing
  `shareShowCard()` as an interim; rasterizing the NEW React card to PNG is a later
  phase (needs dom-to-image).

### Files
- **New:** `lib/shareCardKit.js` (themeField, nameStops, date fmt),
  `components/ShareCardParts.jsx` (Wordmark, Equalizer, real QrCode, MoreLink),
  `components/ShareCardVibe.jsx` (the Vibe card), `components/ShareCardView.jsx`
  (the Share-view shell: scaled 1080-canvas, dock, customize sheet, full-setlist
  popover).
- **Edit:** `App.css` (shell/dock/sheet/popover + `mc-*` motion classes),
  `App.jsx` (mount ShareCardView via state), `components/ShowDetail.jsx` (Share
  button opens the new view).

## Changes made
- 2026-06-22: Initiative created. Implementing Phase 1 (Vibe + Share-view shell).
- 2026-06-22: **Phase 1 shipped.** New: `lib/shareCardKit.js` (themeField/nameStops/
  date fmt, reusing `store.vibeStyle`), `components/ShareCardParts.jsx` (Wordmark,
  Equalizer, real `qrcode` QR, MoreLink), `components/ShareCardVibe.jsx` (the Vibe
  card, pixel-faithful, wired to the real show model), `components/ShareCardView.jsx`
  (Share-view shell: scaled 1080 canvas, dock, customize sheet, +N-more popover,
  auto-pick). Added `.sc-*` + `mc-*` styles to `App.css`. ShowDetail's "Share this
  show" button now opens the new builder (replacing the immediate export);
  share is still logged via `track('show_card_shared')`. Verified in the dev
  preview (Vibe card + customize sheet render correctly); `npm run build` clean.
  Interim: "Share to your story" calls the existing `shareShowCard` exporter until
  new-card raster export lands.
- 2026-06-22: **All five styles + real export shipped.** Added `ShareCardPoster`,
  `ShareCardMarquee`, `ShareCardPlayer`, `ShareCardTicket`, and `ShareCardPhotos`
  (renders `show.photos` in hero/stack/grid with a generative fallback).
  `ShareCardView` now switches all five styles, has a "Use my photos" toggle, and
  real smart auto-pick (photos → Poster/artist, else → Vibe). Replaced the interim
  exporter with **real raster export**: `html-to-image` rasterizes a hidden
  full-size (1080) copy of the card, and `getShareFontCss()` pre-embeds Outfit/DM
  Sans (woff2 inlined as data-URIs) so the PNG uses the real fonts instead of a
  system fallback — then `shareBlob` posts it. Exported `shareBlob` from
  `lib/shareCard.js`; added `html-to-image` dep. All five verified rendering in the
  dev preview incl. photo paths; export runs clean (no console errors, fonts
  fetchable + embedded). `npm run build` clean. Feature is functionally complete;
  photos come from the show's existing `photos[]` (no in-card upload needed).

- 2026-06-25: **Fixed: on iOS the export always fell back to the plain card.**
  `html-to-image` rasterizes via an SVG `<foreignObject>`, which the iOS WKWebView
  paints blank — so the on-device blank-detect (`isBlankImage`, added with the
  black-screen fix) always tripped and every share fell back to the simple
  canvas card (`renderShowCard`), never the user's chosen style (reported from a
  TestFlight build with a screenshot of the plain "I WAS THERE" fallback). Swapped
  the rasterizer in `ShareCardView.doShare` to **`html2canvas`** (paints the DOM to
  canvas directly — no foreignObject) and dropped the now-unused `getShareFontCss`
  font-embed. Verified in the dev preview that html2canvas reproduces the real
  `ShareCardVibe` **pixel-faithfully at 1080×1920**: rendered the live component into
  an off-screen native-size node (the exact shape of the hidden export node) and
  diffed the raster against the live DOM — indistinguishable. (A first attempt
  captured a `transform: scale()`-wrapped node and squashed; html2canvas mis-measures
  scaled ancestors — the real export node has no transform, so this is a non-issue.)
  Kept the blank-detect → `renderShowCard` fallback as a safety net so a share is
  never a black screen. Rides **build 24**. Commit af4b1e7. Note: photo styles
  (Player/Poster) need the photo to be CORS-loadable (`useCORS: true`); the no-photo
  styles (Vibe/Marquee/Ticket) are guaranteed.

## Open questions / follow-ups
- New-card raster export (dom-to-image vs an off-screen canvas re-render) — needed
  before "Share to your story" posts the actual new design. Until then it falls
  back to the existing card exporter.
- Real photo upload into the Poster/photo frames (replace the prototype's
  `<image-slot>` with the app's `show.photos` / show-photos bucket).
- QR currently targets the App Store install URL; the handoff wants it to deep-link
  to the show's full setlist (`melo.show/...`) — pending a public show URL.
