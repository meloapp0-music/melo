---
name: video-uploads
description: Let users attach short videos to a show (alongside photos) — picked, compressed on-device, stored in an RLS'd Supabase bucket, played in-app and on public share pages. The make-or-break is keeping file size sane. Planned for the next version.
type: project
---

# Video Uploads for Shows

- Started: 2026-06-27
- Status: planned
- Last updated: 2026-06-27

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

## Open questions / follow-ups
- On-device compression reliability across iOS versions — this is the make-or-break call;
  prototype it first before committing the rest.
- Limits: max videos/show, max duration, max size — pick numbers that keep storage sane.
- Later: **video share cards** (canvas card composited over a clip) — ties to
  `2026-06-25-share-cards-native-canvas.md`.

## Changes made
- 2026-06-27: Initiative created (idea capture for the next version, alongside
  [[public-share-pages]]). No code yet.
