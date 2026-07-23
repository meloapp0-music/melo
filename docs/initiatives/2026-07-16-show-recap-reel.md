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

### Phase 2 — the MP4 / Story export — SCOPED 2026-07-16 (research workflow + local verification)

**Verdict:** realistic, gated on exactly ONE unknown — whether WebCodecs
`VideoEncoder` is wired up inside the Capacitor WKWebView (documented for Safari
16.4+, undocumented for WKWebView). Everything downstream is well-understood.
Honest v1 = **silent, photos-only, ~13s, 1080×1920 H.264 MP4**, shared via the
iOS share sheet Melo already uses. ~**5–7 focused days** if the spike passes.

**Architecture:** reuse the SAME pure `buildScenes(show)` (single source of truth
so export matches the in-app reel). New: `lib/recapFrame.js` (deterministic
`drawScene(ctx, scenes, t)` Canvas renderer) + `lib/recapExport.js` (encode
orchestrator). Flow: tap → frame loop on `OffscreenCanvas(1080,1920)` → mediabunny
→ Blob → the EXISTING `shareBlob()` (generalize its hardcoded `image/png` File
type — verified at shareCard.js:378 — to a passed mimeType). Zero native code,
zero Edge Functions. Runtime-gate the button behind `canEncodeVideo()`.

**Encode pipeline (verified against mediabunny source/docs — the earlier notes
guessed and got two things wrong):**
- Use **`CanvasSource`**, mediabunny's high-level wrapper — the app never touches
  a raw `VideoFrame`, so the WKWebView `VideoFrame.close()` OOM concern
  disappears. `await source.add(t, 1/30)` EVERY frame — that await IS the whole
  backpressure story (internal encoder queue caps at 4).
- `Output` + `Mp4OutputFormat({ fastStart: 'in-memory' })` + `BufferTarget`;
  `finalize()` → `output.target.buffer` → `Blob([...], {type:'video/mp4'})`.
- **CORRECTION 1 (codec):** `avc1.42E01E` (in the prior share-card notes) is
  Baseline **Level 3.0** — max 1620 macroblocks; 1080×1920 needs 8160 and would
  be REJECTED. Pass `codec: 'avc'` and let WebCodecs auto-pick the level (or
  force `avc1.42E028` = L4.0 if Baseline must be pinned).
- **CORRECTION 2 (version):** research lanes disagreed on mediabunny's version
  (1.23.x via jsdelivr vs 1.51.0 via GitHub vs 1.50.8 in the older note). It
  moves fast → **pin the exact installed version and re-verify the API surface
  against `node_modules` at build time**; the class names above are stable ≥1.10.
- ~13s @ 30fps ≈ 390 frames; ~13MB at 8Mbps VBR; encode wall-time dominated by
  the Canvas2D drawing, not the hardware AVC encode. Progress UI off
  `onEncodedPacket`.

**Frame render (`drawScene`):** layers in draw order — cover-fit photo backdrop
with Ken-Burns (scale/pan from `localT/dur`), scrim gradient (created once),
letterbox fillRects, type (Oswald caps / score number / cream subs, with the
translateY+scale+fade entrance eased over ~0.4s), flash overlay (alpha decay),
progress bars, wordmark. Cross-fade = two passes blended by `globalAlpha` (hard
cut is an acceptable schedule-slip fallback). Photos decoded once via
`createImageBitmap` + cached. **Await `document.fonts.ready` before the loop**
(canvas silently renders fallback fonts otherwise — reuse the share-card font
loading). **v1 is PHOTOS-ONLY:** video-backed beats fall back to the cover
photo/gradient in the export (frame-accurate decode of user clips in WKWebView is
flaky/slow — explicitly deferred).

**Share path:** v1 = the Web Share sheet already shipped (`shareBlob` →
`navigator.share({files})`), with the mime generalized to `video/mp4`. The user
taps Instagram → Stories inside IG. TRUE one-tap-to-Stories
(`instagram-stories://` + pasteboard `com.instagram.sharedSticker.backgroundVideo`
+ `LSApplicationQueriesSchemes` + a Facebook App ID) needs a small native plugin —
parked as a fast-follow, NOT v1. ⚠️ The failed research lane never live-verified
that iOS offers Instagram for a shared MP4 — **fold that check into the spike.**

**OS reach (verified locally):** deployment target IS 15.0
(`IPHONEOS_DEPLOYMENT_TARGET = 15.0`), WebCodecs needs 16.4+ → the export is a
capability-gated progressive enhancement; older iOS gets the in-app reel only.

**THE SPIKE (run FIRST, ~30–60 min on a real device, gates everything):**
in the actual Capacitor app (not Safari, not just simulator):
1. `await canEncodeVideo('avc', {width:1080, height:1920, bitrate:8e6})` — log
   boolean + any throw (cross-check `VideoEncoder.isConfigSupported` directly in
   case mediabunny masks the failure).
2. If true: minimal end-to-end — 10 frames of solid color + counter text via the
   pipeline above; log byte length; play the Blob in a `<video>`.
3. **Share-sheet check:** pass that Blob through `shareBlob` as `video/mp4` and
   confirm Instagram appears as a target on a phone with IG installed.
PASS = true + >0-byte playable blob + IG in the sheet. FAIL on (1)/(2) → the MP4
path is dead in WKWebView; feature stays in-app-only or pivots native.

**Phasing / effort:** P0 spike (~½ day) → P1 frame renderer (~2–3 days — the real
work is visual fidelity, not logic) → P2 encode + share wiring (~1 day) → P3
polish/cross-fades/Worker offload (~1–2 days). Each independently landable.

**Decisions for Aidan before build:**
1. Share depth — plain share sheet v1 (recommended) vs invest in the native
   one-tap-to-Stories bridge now?
2. Accept photos-only in the exported MP4 (clips still play in-app)?
3. OK that iOS 15–16.3 users get no export button?
4. Fidelity bar — pixel-identical to the DOM reel, or "clearly the same recap"?
   (This directly sets how many of P1's days get spent.)

## Open questions / follow-ups
- Which shows qualify for a recap? (has a setlist? rated? has media?) — likely
  surface the action only when there's enough to make it sing.
- A YEAR recap (vs the existing Wrapped) is a possible future variant; out of
  scope now.
- The other 9 design treatments (ADMIT ONE stub, minute-by-minute, diary,
  scrapbook, bold-caps) are parked; revisit if the flagship lands.
