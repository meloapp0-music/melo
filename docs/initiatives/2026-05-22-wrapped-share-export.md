# Wrapped Share Export — wire up the dead "Share your year" button

- Started: 2026-05-22
- Status: in-progress — summary-slide share SHIPPED; per-slide share next
- Last updated: 2026-05-22

## Changes made

- 2026-05-22: **Shipped the summary "Share your year" share.** The dead
  `<p>` (Wrapped.jsx:717) is now a real button → `shareWrappedCard()`.
  - **New `src/web/lib/shareCard.js`** — renders a 1080×1920 PNG on a
    `<canvas>` (NOT html2canvas — zero deps, no font/CORS/gradient
    surprises, identical on web + device): dark→orange gradient, "melo"
    wordmark, year, 2×2 stat grid (shows/cities/avg/songs), miles, top
    artist/venue/best show, the personality sentence, and a
    `melo.show` + `@handle` branded footer. Shares via the Web Share
    API (file) with a download fallback.
  - `Wrapped.jsx` — button wired; fires `wrapped_shared` PostHog event;
    passes `profile.username` for the footer.
  - `App.css` — `.wrapped-share-btn` (white pill).
  - `npm run build` passes.
  - **Still TODO:** per-slide share icons (map/archetype/songs) for
    multi-card drops; on-device render QA (fonts/gradient in the PNG);
    a real `melo.show/@handle` resolver (point at the App Store for now).

## Context

The growth strategy (`2026-05-22-growth-strategy.md`) identified this as
the single highest-leverage viral gap, and it's **confirmed in code**:
`src/web/pages/Wrapped.jsx:717` renders `<p>Share your year in music</p>`
— a **dead string with no click handler.** The app literally invites
users to share their Wrapped and the "button" does nothing.

Spotify Wrapped is a growth engine *because people share it.* December is
the one moment superfans *want* to post their stats, to an audience of
pure concert fans. Every share is a free, branded, high-intent
impression. This must be wired up **before December's Wrapped season** —
hard timing.

## Plan

### 1. Branded share footer (build first — the multiplier)
A reusable footer baked into every exported image: cream Melo wordmark +
tappable `melo.show/@{username}` universal link. Without it, shares are
anonymous and convert nobody. Decide the commemorative-tickets
"watermark vs footer" question (`2026-04-30-commemorative-tickets.md`
line ~124) in favor of **clean + always-present + tappable.**

### 2. Render a share card → image
The hard part is turning a Wrapped slide into a 1080×1920 PNG. Options
(pick during build):
- **html2canvas** (add dep) snapshotting a hidden, fixed-size
  `.wrapped-share-card` div styled for export — fastest path, but
  watch web-font + gradient + cross-origin image fidelity in the
  Capacitor webview.
- **Canvas-drawn card** — more control, more code, no font/CORS
  surprises. Safer for a flagship visual.
- Recommend prototyping html2canvas first; fall back to canvas if the
  render looks off on-device.

The card content: top artists, miles traveled, archetype, songs heard
live, show count — the same data already in `data` in `Wrapped.jsx`.

### 3. Deliver via the existing share path
**Reuse `deliverFile()` in `src/web/lib/exportShows.js`** — it already
wraps the Web Share API with a file + anchor-download fallback (built
for data export). Pass the PNG blob → native iOS share sheet → IG
Stories / Messages / etc.

### 4. Wire the button + go per-slide
- Make the dead `<p>` an actual share button on the Summary slide.
- Then add a small share icon to *each* slide (map, archetype, top song,
  best show) — each exports its own card. Multiple Story frames per user
  = 3-4 branded impressions instead of one. (This is the per-slide
  quick win from the strategy + the deferred export noted in
  `2026-05-21-v1-0-7-wrapped-depth.md`.)

### Analytics
Fire a `wrapped_shared` PostHog event (with which slide) so we can see
share rate — the leading indicator of viral growth.

## Critical files
- `src/web/pages/Wrapped.jsx` — replace the dead `<p>` (line ~717) with
  a share button; add per-slide share icons; build the hidden
  `.wrapped-share-card` render target(s).
- `src/web/lib/exportShows.js` — reuse `deliverFile()`; maybe add an
  `imageBlob` helper.
- **New:** `src/web/lib/shareCard.js` — render Wrapped data → PNG blob
  (html2canvas or canvas) with the branded footer.
- `src/web/App.css` — `.wrapped-share-card` export styles + footer.
- `package.json` — `html2canvas` if that path is chosen.

## Verification
1. Open Wrapped → tap "Share your year" → a branded 1080×1920 card
   renders and the iOS share sheet opens → post to IG Stories.
2. The card shows real stats + a tappable `melo.show/@handle` footer.
3. Per-slide share icons each export that slide's card.
4. `wrapped_shared` event fires in PostHog.
5. On-device (not just web): fonts, gradients, and the map image render
   correctly in the exported PNG.

## Open questions / follow-ups
- **Render fidelity on-device** is the main risk — test the exported PNG
  on a real iPhone, not just the browser.
- **Universal link** `melo.show/@handle` needs the marketing site to
  resolve handles (or redirect to the App Store) — at minimum point it
  at the App Store for now.
- **Map image in the card** — the Leaflet map may not snapshot cleanly;
  consider a static styled route graphic for the share card.
- Cross-link: `2026-05-22-growth-strategy.md` (Quick Wins #1-3),
  `2026-05-21-v1-0-7-wrapped-depth.md`, `2026-04-30-commemorative-tickets.md`.
