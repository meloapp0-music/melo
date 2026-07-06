---
name: video-uploads
description: Let users attach short videos to a show (alongside photos) — picked, compressed on-device, stored in an RLS'd Supabase bucket, played in-app and on public share pages. The make-or-break is keeping file size sane. Planned for the next version.
type: project
---

# Video Uploads for Shows

- Started: 2026-06-27
- Status: in-progress (v1 built 2026-07-01 — pending migration apply + device test)
- Last updated: 2026-07-01

## Context
Shows currently support **photos only** (`shows.photos: string[]`, Supabase Storage
bucket; see `2026-04-20-pre-launch-sprint.md`). The user wants to attach **videos** of a
show too — a concert clip is the most-captured, most-shared artifact of a night.

Pairs directly with [[public-share-pages]]: a clip is far more compelling on the public
show page someone lands on from a shared story, and it later unlocks **video share cards**
(the card animated over a clip), building on the canvas share-card renderer shipped in
`2026-06-25-share-cards-native-canvas.md`.

## Plan (proposed — decisions to lock before building)
- **Data model**: add `shows.videos: text[]` parallel to `photos`, plus a `show-videos`
  Storage bucket. Separate arrays (simplest) over a unified media table.
- **The hard part is size/cost.** Raw iPhone clips are 100–200MB+ (we just lived this
  converting clips for the App Store). Uploading those is slow, expensive (Supabase
  storage + egress), and slow to play back. Options, cheapest-first:
  1. **Cap + compress on-device before upload** *(preferred)* — limit duration (e.g.
     ≤60s) and transcode to ~1080p / ≤~20MB on the phone (a Capacitor plugin over
     AVFoundation, or an `ffmpeg.wasm` pass). Keeps infra simple, no server transcode
     bill. The 4K→1080p, size-targeted recipe we used for the App Store clips is the
     blueprint (downscale longest side to 1920, target bitrate by duration).
  2. Server-side transcode (Supabase Edge Function + ffmpeg) — robust but adds infra +
     cost; defer unless on-device proves unreliable across iOS versions.
- **Upload flow**: pick from library (Capacitor) → compress → upload to bucket → append
  URL to `shows.videos` → progress UI. Enforce per-show count + per-file size limits.
- **Playback**: HTML5 `<video playsinline>` with a poster frame, in ShowDetail and the
  share surfaces; lazy-load, tap-to-play (not autoplay) to save data.
- **Poster/thumbnail**: capture a first-frame poster on upload so grids don't fetch the
  whole video for a thumbnail.
- **Security spine (don't weaken)**: the `show-videos` bucket gets RLS exactly like the
  photos bucket — owner writes; reads scoped to the show's visibility, and to the
  curated public read surface from [[public-share-pages]] for explicitly-shared shows.

## Montage / "show recap" on the card (added 2026-06-30)
User wants, on a show card, an option to **create or see a fun 15-30s recap/montage** of
the show from its photos + videos. Two halves, very different cost:
- **See it — in-app recap player (Phase 1, easy):** a "▶ Play recap" button on the card
  that auto-sequences the show's clips + photos (Ken-Burns on stills, clips back-to-back)
  with a music bed, bookended by Melo's branded **endcards** (the `melo-endcard-*` clips
  produced 2026-06-30 are literally the intro/outro for this). It's a timed slideshow /
  playlist in the webview — NO video compositing, ships fast, feels magic.
- **Make/export it — one shareable MP4 (Phase 2, hard):** stitching multiple videos +
  photos into a single 15-30s MP4 needs real compositing. `ffmpeg.wasm` in WKWebView is
  slow/memory-heavy and crashes on multi-clip jobs → the performant paths are **native iOS
  AVFoundation (AVMutableComposition) via a Capacitor plugin** *(preferred for quality)* or
  **server-side ffmpeg (Edge Function)** *(adds infra + cost)*. Defer behind Phase 1.
- The montage = **[melo intro card] → user clips/photos → [melo endcard]** — a fully
  branded recap loop; every share carries Melo. Ties to video share cards in
  [[share-cards-native-canvas]].

## Open questions / follow-ups
- On-device compression reliability across iOS versions — this is the make-or-break call;
  prototype it first before committing the rest.
- Limits: max videos/show, max duration, max size — pick numbers that keep storage sane.
- Later: **video share cards** (canvas card composited over a clip) — ties to
  `2026-06-25-share-cards-native-canvas.md`.

## Changes made
- 2026-06-27: Initiative created (idea capture for the next version, alongside
  [[public-share-pages]]). No code yet.
- 2026-06-30: User asked for a 15-30s recap/montage option on the show card (create or
  see). Added the "Montage / show recap" section — Phase 1 in-app recap player (reuses
  the new branded `melo-endcard-*` clips as intro/outro), Phase 2 exportable MP4 (native
  AVFoundation or server-side ffmpeg). No code yet.
- 2026-07-01: **Built v1 (validate-not-transcode)**. Migration `0014_show_videos.sql`
  (shows.videos text[] + `show-videos` bucket mirroring show-photos RLS exactly — owner
  writes by folder, public read — PLUS bucket-level caps: 45MB/file + video MIME types).
  `storage.js`: `uploadShowVideo` (client-side validation ≤60s via off-DOM <video>
  metadata + ≤45MB; friendly errors; no transcode — WKWebView can't do it reliably, so
  v1 asks for short clips), `deleteShowVideo`. `db/shows.js`: `videos` in fromRow/toRow
  (with the migration-defense gate — only sent when non-empty so saves don't break
  before 0014 is applied) + update map. New `VideoPicker.jsx` (mirrors PhotoPicker;
  max 3 clips/show; video tiles w/ #t=0.01 iOS poster trick). LogShow: Videos section
  (Attended only) + `videos` in payload + `has_videos` analytics. ShowDetail: Videos
  section under Photos (tap-to-play, playsinline, never autoplay). **Verified in signed-
  in preview:** sheet shows Photos + "Videos short clips" with Add clips; compiles clean.
  **NOT yet done:** apply migration 0014 (Supabase dashboard/CLI) — uploads will fail
  until the bucket exists; then a real device test (pick a clip from the iOS library).
- 2026-07-02: **Migration 0014 APPLIED to production** via `supabase db push` (user
  approved). Surprise found first: the CLI migration history was drifted — 0006–0013 were
  applied manually via the dashboard and never recorded, so a naive push would have
  replayed them and errored on `create policy`. Fixed with `supabase migration repair
  --status applied 0006..0013` (bookkeeping only, no schema SQL) → then pushed 0014 alone.
  `supabase migration list` now clean 0001–0014; "Remote database is up to date." The
  `shows.videos` column + `show-videos` bucket + RLS are LIVE. Remaining: real device
  test (pick a clip from the iOS library, confirm upload + playback).
