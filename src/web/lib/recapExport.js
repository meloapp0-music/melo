// lib/recapExport.js — the recap MP4 encode orchestrator (Phase 2).
// ================================================================
// Turns a show into a shareable 1080×1920 H.264 MP4: the same buildScenes walk
// as the in-app reel, re-rendered frame-by-frame via recapFrame's deterministic
// drawFrame, encoded with mediabunny's CanvasSource (hardware AVC underneath).
//
// The whole pipeline was proven on-device 2026-07-24 (the RecapSpike run): the
// WKWebView encodes avc @1080×1920, decodes the user's HEVC clips, and did a
// 30-frame end-to-end in 0.3s. See the show-recap-reel initiative.
//
// Every `await source.add(...)` respects encoder backpressure — that await is
// the entire OOM story; do not fire-and-forget it.

import {
  Output, Mp4OutputFormat, BufferTarget, CanvasSource, canEncodeVideo,
} from 'mediabunny';
import { buildScenes } from './recap';
import {
  computeTimeline, fitTimeline, prepareAssets, drawFrame, EXPORT_W, EXPORT_H,
} from './recapFrame';

const FPS = 30;
const BITRATE = 8_000_000;   // ~13MB for 13s — comfortably under IG's limits
const MAX_SECONDS = 15;      // IG Stories cuts ~20s; leave headroom

// Capability gate for the export button. Cached — the answer can't change
// within a session, and canEncodeVideo spins up a probe encoder.
let _canExport = null;
export async function canExportRecap() {
  if (_canExport === null) {
    try {
      _canExport = await canEncodeVideo('avc', { width: EXPORT_W, height: EXPORT_H, bitrate: BITRATE });
    } catch { _canExport = false; }
  }
  return _canExport;
}

/** Encode a show's recap to an MP4 Blob.
 *  onProgress(0..1) drives the UI — frame-drawing dominates, so it's linear. */
export async function exportRecap(show, { onProgress } = {}) {
  const scenes = fitTimeline(buildScenes(show), MAX_SECONDS);
  const timeline = computeTimeline(scenes);
  const assets = await prepareAssets(scenes);

  try {
    const canvas = new OffscreenCanvas(EXPORT_W, EXPORT_H);
    const ctx = canvas.getContext('2d');
    const source = new CanvasSource(canvas, {
      codec: 'avc', // let WebCodecs pick the level — 42E01E (L3.0) can't hold 1080×1920
      bitrate: BITRATE,
      keyFrameInterval: 2,
    });
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });
    output.addVideoTrack(source, { frameRate: FPS });
    await output.start();

    const totalFrames = Math.ceil(timeline.total * FPS);
    const fallback = { cover: (show.photos || [])[0] };
    for (let f = 0; f < totalFrames; f++) {
      await drawFrame(ctx, timeline, f / FPS, assets, fallback);
      await source.add(f / FPS, 1 / FPS);
      if (f % 6 === 0) onProgress?.(f / totalFrames);
    }
    await output.finalize();
    onProgress?.(1);

    const bytes = output.target.buffer;
    if (!bytes || bytes.byteLength === 0) throw new Error('encode produced no bytes');
    return new Blob([bytes], { type: 'video/mp4' });
  } finally {
    assets.dispose();
  }
}
