---
name: show-recap-reel
description: "melo made you a recap" — a per-show, auto-advancing story reel (Wrapped-style, but for ONE memorable show) driven by the user's real setlist/rating/photos/videos. Flagship concept from the Melo Recap design doc; ambition includes a shareable MP4/Story export.
type: project
---

# Show Recap Reel — "melo made you a recap"

- Started: 2026-07-16
- Status: in-progress (building Phase 1 — the in-app reel)
- Last updated: 2026-07-16

## Context
Aidan designed "Melo Recap" in Claude Design (`Melo Recap.dc.html`, 210KB React
app, 94 scenes) and asked to implement it. The doc is a **concept exploration**:
~10 visual treatments of ONE idea — a shareable, auto-advancing story reel that
recaps a single memorable show (all built around Coldplay @ Rose Bowl as
placeholder data). Distinct from the existing YEAR Wrapped: this is **per-show**.

**Decisions (Aidan, 2026-07-16):**
1. Build the flagship **"melo made you a recap" montage** treatment first (the
   design's own title; maps cleanest onto real setlist + rating + media).
2. **Also invest in the MP4 / Story video export** (not just an in-app reel).

Honest sequencing given #2: the reel has to exist before it can be encoded, and
the MP4 path can only be verified on-device (WebCodecs-in-WKWebView is the
undocumented piece from the share-card research). So **reel first, MP4 second.**

## What the design's reel engine does (decoded from the doc)
- A `[data-hype-stage]` reel: absolute-positioned `[data-scene]` divs, cross-faded
  by a rAF loop; each scene has `data-dur` (0.4s beat flashes → 2.6s holds).
- Per-scene: an animated `[data-label]` entrance (translateY+scale+fade), an
  optional `[data-flash]` white pop on the beat, optional video with `data-start`.
- Chrome: top/bottom letterbox bars, a `[data-prog]` progress bar (#D8A56B),
  and a **9:16 (284×505) ↔ 1:1 (400×400) aspect toggle**; adjustable pace (12–26s).
- Visual system (reused verbatim — it already IS Melo's palette): browns
  #3D2C1E/#2C1912/#43271A, ember #E8573A, amber #F4A261/#FFC75F, creams
  #F3E8CC/#FAF8F5. Fonts: Outfit + DM Sans (already shipped) + **Oswald**
  (cinematic condensed caps, new). 15 keyframes: filmZoom/grainShift/vhsJitter/
  beatPulse/flicker/etc.

## Plan
### Phase 1 — the in-app reel (this pass)
- **`lib/recap.js`** — `buildScenes(show)`: a pure function turning a real show
  into the montage scene list. Intro (artist/venue/date + "melo made you a
  recap") → a cinematic label per setlist song (Ken-Burns over the user's
  photos/clips) → score reveal (`score` → a verdict word, 9.5+=Unreal …) →
  outro ("Kept forever" + melo wordmark). Degrades gracefully with no
  setlist/media.
- **`components/RecapReel.jsx`** — full-screen player: rAF auto-advance,
  Story-style tap (left=back, right=skip, hold=pause), letterbox, progress,
  aspect toggle. Uses Melo design tokens + Oswald.
- **Entry point** — a "Recap" action on ShowDetail (own show, has setlist/media);
  opens the reel via AppContext (`recapShow`/`setRecapShow`).
- Verify in a browser harness against real-shaped data; commit.

### Phase 2 — the MP4 / Story export (next, honest big-lift)
- Re-render the same scenes **deterministically to Canvas 2D frames** (the reel's
  DOM animation can't be rasterized reliably — html2canvas is why Melo dropped it),
  1080×1920 @30fps, then **WebCodecs `VideoEncoder` → mediabunny mux → MP4
  (faststart, H.264 Baseline)**. Share via the native sheet to IG Stories.
- **Gated on an on-device WebCodecs spike** (undocumented in WKWebView). Feature-
  detect `window.VideoEncoder`; fall back to a static share-card frame (existing
  native-canvas path) where unavailable. IG Stories caps video at ~20s — design
  the shareable cut to 12–15s even though the in-app reel can run longer.

## Open questions / follow-ups
- Which shows qualify for a recap? (has a setlist? rated? has media?) — likely
  surface the action only when there's enough to make it sing.
- A YEAR recap (vs the existing Wrapped) is a possible future variant; out of
  scope now.
- The other 9 design treatments (ADMIT ONE stub, minute-by-minute, diary,
  scrapbook, bold-caps) are parked; revisit if the flagship lands.
