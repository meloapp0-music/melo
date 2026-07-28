---
name: show-recap-reel
description: "melo made you a recap" — a per-show, auto-advancing story reel (Wrapped-style, but for ONE memorable show) driven by the user's real setlist/rating/photos/videos. Flagship concept from the Melo Recap design doc; ambition includes a shareable MP4/Story export.
type: project
---

# Show Recap Reel — "melo made you a recap"

- Started: 2026-07-16
- Status: in-progress — Phase 1 shipped (dev). **SPIKE PASSED ON-DEVICE 2026-07-24 (Aidan's iPhone): ALL GREEN** — VideoEncoder present, isConfigSupported(avc L4.0 @1080×1920) true, canEncodeVideo true, canDecodeVideo AVC **and HEVC** true, 30-frame end-to-end encode → 86KB mp4 in **0.3s on-device**, and a frame decoded+drawn from Aidan's own uploaded clip → **video beats are GO, no poster-frame fallback needed**. Only open item: the share-sheet run was dismissed before confirming Instagram appears (fallback = Save to Photos → post from IG, so not a blocker). Phase 2 CORE BUILT + browser-verified end-to-end 2026-07-24: `lib/recapFrame.js` (deterministic 1080×1920 renderer — timeline, Ken-Burns, entrance easing, flash, letterbox, progress bars, seeded grain, gradient parsing, word-wrap, video-beat sampling via VideoSampleSink) + `lib/recapExport.js` (CanvasSource → Mp4OutputFormat fastStart → Blob, fitTimeline caps exports at 15s for IG) + a capability-gated "📤 Share video" button in RecapReel with encode progress. **Chrome proof: the full recap encoded to a 15.03s 1080×1920 14.5MB MP4 in 2.6s; seeking to 13.6s inside the file shows the outro scene correctly rendered.** Remaining: on-device run (real clips in video beats + share-sheet/Instagram check + fidelity eyeball vs the in-app reel), then polish (grain/easing tuning, possible Worker offload)
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

**Decisions (Aidan, 2026-07-16):**
1. Share depth → **plain share sheet v1.** One-tap-to-Stories is a fast-follow.
2. Videos in the export → **OVERRODE the photos-only cut: if the user uploaded
   clips, they must appear in the exported recap** (photos-only is fine only when
   there are no clips). Plan: mediabunny's READ path — `Input` + `BlobSource`
   (fetch the Supabase clip URL as a Blob) + `VideoSampleSink.getSample(t)` for
   frame-accurate decode into the canvas loop, one clip decoded at a time,
   samples disposed promptly. A video beat needs only ~30–45 frames from the
   clip's start, so the decode volume is small. **Spike extended:** also test
   `canDecodeVideo('hevc')` + `('avc')` and draw one decoded frame — iPhone
   clips are typically HEVC, and if HEVC decode fails in WKWebView, those clips
   degrade to their poster frame (photo fallback) rather than blocking export.
   Cost of the override: ~+1–2 days.
3. OS floor → **accepted.** iOS 15–16.3 keeps the in-app reel, no export button.
4. Fidelity → **"as good as in-app, or better."** The export is REDRAWN, not
   screen-recorded, so the risk is subtle motion/type differences — budget the
   fidelity-tuning days (P1 becomes ~3–4 days). The upside of redrawing: the
   in-app stage is ~300px wide but the export renders at 1080×1920 — ~3.6× the
   resolution — so type, photos and the grain can genuinely look SHARPER than
   in-app. Target: a crisp "produced" version of the same recap.

**Updated effort with the overrides: ~7–10 focused days** (spike ½d → renderer
3–4d → video-beat decode 1–2d → encode+share 1d → polish 1–2d).

## Energy pass (2026-07-24) — the "boring" fix
Aidan's on-device verdict on Phase 1: **"the recap is boring."** Root causes vs
the design doc, and the fixes (applied to buildScenes + BOTH renderers so the
reel and export stay twins):
- **Tempo** — the doc cuts every 0.4–0.6s; ours held a uniform 1.15s (a
  slideshow). Now a tightening rhythm `[0.9,0.7,0.6,0.55…]` with a 1.2s landing
  on the last song; intro trimmed.
- **Sameness** — every beat was the same centered layout. Now: alternating
  center/lower-third layouts, alternating Ken-Burns direction (`kb`), a
  "TAKE 01" tape-label chip per song, and a 0.22s punch-in on every cut.
- **Type** — beats were a fixed 34px; now fit-to-width via the shared
  `beatScale()` (short titles go ~1.5×; canvas adds a measured clamp).
- **Silence** — the big one: the in-app reel now plays a looped **soundtrack**
  (the 30s iTunes preview of the setlist's opener via the existing
  `fetchSongPreview` infra) with a mute toggle. The export stays silent by the
  earlier decision; audio-in-export remains a later phase.
Verified in-browser: durs `[1.4,2,0.9,0.7,0.6,0.55]`, "Yellow" at 51px, TAKE
chips + lower layout render in BOTH the live reel and the canvas frames.
Also: the missing share button on-device was a stale build — the export button
shipped after the morning's spike build; rebuild fixes it.

## Design handoff arrives (2026-07-24) — the cut system
Aidan sent `design_handoff_melo_recap/` (README + DC source + the Melo design
system tokens + his real Coldplay clips). It reframes the feature: a recap is a
**post-log auto-generation** ("the morning after you log a show") offering
**ELEVEN cuts** in three tiers, chosen from a picker.

**Two things the handoff caught that the build had wrong:**
1. **Verdict words** — the score renders as a WORD ("UNREAL"), never a number.
   The number belongs ONLY on ticket-stub cuts. Fixed; scale re-anchored.
2. **Brand watermark** — every stage carries a melo mark bottom-right. Added.
Tokens were checked against `App.css`: the handoff's design system IS Melo's
(`--bg`, `--orange`, `--amber`, `--brown`…), so nothing needed re-theming.

**Built this pass (Aidan chose "picker + 2–3 cuts" over grinding all 11):**
- **`lib/recapCuts.js`** — the cut registry. Every cut is just another scene-list
  builder over the same show data, so adding one is an entry, not a rewrite.
  Scenes carry a `theme` both renderers understand: `dark` / `paper` / `diary`.
- **Cinematic** (Style tier) — slow zooms, 46px letterbox, long holds, no flash.
  Exports (same generic scene shape as Beat drop).
- **Ticket stubs** (Memory tier) — aged paper, Oswald print, perforation +
  barcode, rotated stub card, **"RATED 9.8" stamp** (the numeric exception),
  end card "Every stub, kept forever."
- **Dear diary** (Memory tier) — Caveat handwriting on cream, tape-mounted
  photo, gradient-clipped score, end "melo remembers, so you don't have to."
  (Caveat added to index.html fonts.)
- **`components/RecapPicker.jsx`** — "One recap · every vibe": the three-tier
  gallery, swatch per cut, Default badge, and an honest "In-app only for now"
  note on cuts whose Canvas exporter isn't written. Reachable from the bottom
  bar and from the end card ("Try another cut").
- The MP4 export button is now gated **per cut** (`cut.exportable`), so a cut
  without a canvas renderer plays in-app without offering a broken export.

**Still outstanding from the handoff:** 7 more cuts (Top 10 moments, Real time,
Fast-cut hype as distinct from Beat drop, Scrapbook, VHS, Super 8, One year
ago); the post-log **auto-generation trigger** (cron + push + a "recap ready"
state on ShowDetail — reuses the daily-post infra); anniversary resurfacing for
memory cuts; and canvas renderers for the paper/diary themes so they export.

## The arrival (2026-07-27) — "how do we make people WANT to open it?"
Aidan: *"it's good but I feel like the recap needs something people are going to
want to open and share and watch."* The handoff answers this in its first line —
and it's a mechanic, not a better reel:

> "a **post-log** feature: **the morning after** a user logs a show, melo
> auto-cuts their photos and clips — plus the setlist, their score, **and who
> they went with** — into a 15–20 second vertical reel built for sharing."

The reel was a button you had to hunt for. It's supposed to be a **gift that
shows up**. Three mechanics, one per verb:

- **WANT TO OPEN → it arrives.** New `supabase/functions/recap-ready` — a daily
  cron that finds shows logged in the last ~26h with enough material
  (mirrors `canRecap`), picks each user's richest one, and pushes *"melo made
  you a recap ✨ · Coldplay — 4 songs, 1 photo. Tap to watch."* Copy names
  what's IN the reel, because specificity earns the tap. Deduped via
  `notifications_sent` (kind `recap_ready`, ref showId); dead tokens pruned;
  one per user per run. `App.jsx` handles the tap by opening the show AND the
  reel — the notification promised a recap, so it lands ON the recap.
- **WANT TO SHARE → who you were with.** The handoff lists this beside setlist
  and score as core recap content, and it's the share engine: a reel naming
  your friends is one you send TO them. Added to all four cuts in each one's
  voice — a "With Sam & Claire" beat, a cinematic lower-third, an "ADMITS" stub
  row, and diary's "went with Sam & Claire ♡".
- **WANT TO WATCH AGAIN → the ready card** (handoff §2.1, high-fidelity):
  replaced the plain button with the green "🎉 {artist} is in the books" chip,
  a poster card carrying the **shimmer badge** ("✨ melo made you a recap", a
  220% gradient sweeping on a 2.6s loop), the real runtime ("Your 15s recap is
  ready.") and the gradient "▶ Watch & share" CTA.

Verified in-browser: the ready card renders chip/badge/headline/CTA with the
computed runtime and the old plain button is gone; the who-you-were-with scene
appears in all four cuts.

**Deploy needed:** `supabase functions deploy recap-ready --no-verify-jwt` +
a dashboard cron at `0 15 * * *` (≈10am Chicago — "the morning after").
Anniversary resurfacing ("One year ago tonight") is the remaining third of the
handoff's open/share/watch loop.

## All sixteen cuts, built from the prototype (2026-07-27)
Aidan: *"the ones you chose for users to pick are bad and i want them to have
options… these video recaps need to be perfect and you are not doing a good job."*

**He was right, and the cause was process.** The earlier pass read the handoff
README's *headings* and invented four cuts from them ("Cinematic", "Ticket
stubs", "Dear diary" as I imagined them). The handoff ships a working prototype
— `Melo Recap.dc.html` — with the real thing: **16 stages, 113 authored scenes**,
each with its own `data-dur` and copy. Paraphrasing a spec that contains the
answer is how you end up with four plausible cuts instead of sixteen right ones.

**The fix, and how to not repeat it:** extract, don't summarise. A ~50-line
HTMLParser script walks the prototype and dumps every stage → scene → duration →
copy as a flat outline. That outline is now the source of truth this file's cuts
were written against — same order, same durations, same words. Any future recap
work should start by re-running that extraction, not by re-reading the README.

**The biggest miss it exposed: the five no-camera cuts.** Handoff line 6 calls
this "the central product constraint" — a recap must be worth looking forward to
*whether or not the user shot any photos or video*, because most people put the
phone down at a great show. Five of the sixteen render from structured data
alone. They were entirely absent, which meant the recap silently failed for the
majority of logged shows, worst of all on the nights too good to film, and gave
a brand-new user with one logged show nothing at all. They are now the FIRST
tier, not a fallback.

### What landed
- **`lib/recapCuts.js` rewritten** — all 16 cuts, in tier order:
  - *No camera needed* — **The setlist** (EQ title → credits roll → encore held
    out on its own card → tally), **The receipt** (thermal stock, Oswald, dotted
    leaders, ember-gradient TOTAL, barcode), **Where it ranks** (giant gradient
    rank, top-5 board with this show outlined in ember), **The gig poster**
    (ochre stock, COLD/PLAY split, brick inverse card, rotated overprint stamp),
    **In your words** (vibe pills in their own colours, note as a pull quote,
    verdict).
  - *Quick* — Beat drop, **Top 10 moments** (the countdown: huge rank numeral
    top-left, moment bottom-left, #1 = the closer), **Real time**.
  - *Style* — the handoff's "same night, four more looks": **Fast-cut hype,
    Cinematic, Scrapbook, VHS**, plus **Super 8**. All five share one `look()`
    shaper and differ only in pace, casing, theme and chrome — which is what
    makes them read as the same night four ways.
  - *Memory* — **Ticket stubs** (now including **THE DRAWER**: your other stubs
    fanned -14°/-4°/+6° under "The ones you'll never throw out"), **One year
    ago**, **Dear diary**.
- **The fallback ladder is real selection logic** (handoff §3c), not prose:
  every cut declares `needs`, `cutEligible()` gates it, and `pickAutoCut()`
  picks the richest fillable cut — 4+ clips → quick cuts, 1–3 photos → style,
  none → the no-camera floor. Verified: bare show → receipt, data-only →
  setlist, 1 photo → cinematic, 4 clips → beatdrop. Opening the reel with no
  explicit cut now runs this instead of hard-defaulting to Beat drop.
- **`components/RecapScene.jsx` (new)** — the reel owns timing/taps/audio, this
  owns what a scene looks like, one self-contained block per theme.
- **Picker** — all four tiers in the handoff's order with the "always on" and
  "resurfaces over time" badges, a distinct swatch per cut, and unfillable cuts
  DIMMED with what to go add ("🔒 Add 2 more photos") rather than hidden.

### Bugs found by looking at it rather than trusting the build
- `.rc-body` took the class `rc-${theme}`, which collided with the inner card
  classes `.rc-stub` / `.rc-receipt` / `.rc-poster` / `.rc-diary` — the
  full-bleed body inherited the card's paper background. Now `rc-t-${theme}`.
- `.rc-center` is a shrink-to-fit flex item, so the setlist roll (its only
  child, `width:100%`) computed to **0px wide** and rendered nothing. `.rc-center`
  now sets `width:100%`.
- Top 10 counted down to the wrong end of the set — `moments[r-1]` put an early
  song at #1. Now `moments[i]`, so #1 is the closer.
- Setlist roll rows wrapped (29/57/86px tall), destroying the credits rhythm.
- Ticket stub printed "ADMIT ONE" as both eyebrow and tag, overlapping.
- The tally set the venue name at 34px amber next to a count; both stats are
  numeric now.
- Removed 111 lines of dead `.stub-*` / `.diary-*` CSS the rewrite orphaned.

### Still open
- Canvas renderers (`lib/recapFrame.js`) exist only for the dark themes, so the
  eleven paper/print cuts play in-app but can't export to MP4 yet. The picker
  marks them "In-app only for now".
- **Real time infers a clock.** Melo stores a show's date but no start time, so
  it runs from a 8:00 PM nominal downbeat at ~4.5 min/song. It reads as the
  shape of the night, not a claim about any minute — but if start times ever
  land in the schema, delete `clock()` and use them.
- Anniversary resurfacing (surfacing "One year ago" on the day) is still the
  unbuilt third of the open/share/watch loop.

## Open questions / follow-ups
- Which shows qualify for a recap? (has a setlist? rated? has media?) — likely
  surface the action only when there's enough to make it sing.
- A YEAR recap (vs the existing Wrapped) is a possible future variant; out of
  scope now.
- The other 9 design treatments (ADMIT ONE stub, minute-by-minute, diary,
  scrapbook, bold-caps) are parked; revisit if the flagship lands.
