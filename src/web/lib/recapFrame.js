// lib/recapFrame.js — the deterministic Canvas renderer for the recap export.
// ==========================================================================
// Draws any moment `t` of a recap as a single 1080×1920 frame, from the SAME
// buildScenes(show) list that drives the in-app RecapReel — so the exported MP4
// is the same recap, re-rendered at ~3.6× the in-app stage resolution ("as good
// as in-app, or better" — Aidan's fidelity bar).
//
// Everything here must be a pure function of (scenes, t, assets): no Date.now,
// no randomness that isn't seeded from t — the encode loop replays frames and
// identical inputs must give identical pixels. Async only where video sampling
// forces it (mediabunny's VideoSampleSink).
//
// Faithful-to-the-app notes:
//  - The in-app reel HARD-CUTS between scenes (content re-mounts with an
//    entrance animation; backgrounds swap instantly). The export does the same —
//    no cross-fade, by design.
//  - Ken-Burns, entrance easing, flash falloff and chrome mirror RecapReel's CSS
//    (recapKenBurns 6s ease-out from scale 1.12; recapLabelIn .36s overshoot;
//    recapFlash .28s ease-out; 40px bars / 12px progress on a 300×533 stage,
//    scaled here to 1080×1920).

import { Input, BlobSource, VideoSampleSink, ALL_FORMATS } from 'mediabunny';
import { beatScale } from './recap';

export const EXPORT_W = 1080;
export const EXPORT_H = 1920;

// 300×533 in-app stage → 1080×1920: everything scales by 3.6.
const S = EXPORT_W / 300;

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/** Scene list → absolute start/end times. */
export function computeTimeline(scenes) {
  const entries = [];
  let acc = 0;
  for (const scene of scenes) {
    entries.push({ scene, start: acc, end: acc + scene.dur });
    acc += scene.dur;
  }
  return { entries, total: acc };
}

/** Cap a timeline's total to `maxSeconds` by scaling every duration equally —
 *  IG Stories cuts at ~20s, so exports aim for ≤15s. Pacing stays proportional. */
export function fitTimeline(scenes, maxSeconds = 15) {
  const total = scenes.reduce((a, s) => a + s.dur, 0);
  if (total <= maxSeconds) return scenes;
  const k = maxSeconds / total;
  return scenes.map((s) => ({ ...s, dur: s.dur * k }));
}

// ---------------------------------------------------------------------------
// Assets — decode once, reuse every frame
// ---------------------------------------------------------------------------

/** Load fonts + decode every image/video the scenes reference.
 *  Returns { images: Map<url,ImageBitmap>, videos: Map<url,{sink,duration}>,
 *  dispose() }. Failures degrade per-asset (a dead photo → gradient), never
 *  throw the whole export away. */
export async function prepareAssets(scenes) {
  // Fonts first — canvas fillText silently uses a fallback face otherwise.
  const faces = [
    '600 122px Oswald', '700 346px Oswald',
    '900 108px Outfit', '800 43px Outfit', '800 61px Outfit',
    '600 52px "DM Sans"',
  ];
  try {
    await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => {})));
    await document.fonts.ready;
  } catch { /* draw anyway */ }

  const imageUrls = new Set();
  const videoUrls = new Set();
  for (const s of scenes) {
    if (s.media) imageUrls.add(s.media);
    if (s.video) videoUrls.add(s.video);
  }

  const images = new Map();
  await Promise.all([...imageUrls].map(async (url) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      images.set(url, await createImageBitmap(await res.blob()));
    } catch { /* gradient fallback */ }
  }));

  const videos = new Map();
  await Promise.all([...videoUrls].map(async (url) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const input = new Input({ source: new BlobSource(await res.blob()), formats: ALL_FORMATS });
      const track = await input.getPrimaryVideoTrack();
      if (!track) return;
      const duration = await track.computeDuration().catch(() => 60);
      videos.set(url, { sink: new VideoSampleSink(track), duration, input });
    } catch { /* poster/gradient fallback */ }
  }));

  return {
    images,
    videos,
    dispose() {
      for (const bmp of images.values()) { try { bmp.close(); } catch { /* noop */ } }
      images.clear(); videos.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Easing + helpers
// ---------------------------------------------------------------------------

const easeOutQuad = (p) => 1 - (1 - p) * (1 - p);
// The reel's entrance curve cubic-bezier(.2,.9,.3,1.25) — an overshoot; this
// easeOutBack lands within a hair of it.
const easeOutBack = (p) => { const c = 1.3; const q = p - 1; return 1 + (c + 1) * q * q * q + c * q * q; };

// scene.grad is store.js's `linear-gradient(150deg, hsl(H S% L%), hsl(...))` —
// parse the two stops so the gradient backdrop matches the app exactly.
function parseGradient(grad) {
  const stops = [...String(grad || '').matchAll(/hsl\((\d+)[ ,]+(\d+)%?[ ,]+(\d+)%\)/g)]
    .map((m) => `hsl(${m[1]} ${m[2]}% ${m[3]}%)`);
  return stops.length >= 2 ? stops : ['#43271A', '#160d07'];
}

function fillGradientBg(ctx, grad) {
  const [a, b] = parseGradient(grad);
  // 150deg ≈ top-left → bottom-right bias, matching the CSS angle.
  const g = ctx.createLinearGradient(0, 0, EXPORT_W * 0.5, EXPORT_H);
  g.addColorStop(0, a); g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, EXPORT_W, EXPORT_H);
}

/** The scene's media scale: Ken-Burns (direction from scene.kb) × the 0.22s
 *  punch-in that lands on every cut. Mirrors .recap-kenburns/.kb-rev/.recap-punch. */
function mediaScale(localT, kb) {
  const p = easeOutQuad(Math.min(localT / 6, 1));
  const ken = kb === -1 ? 1.0 + 0.12 * p : 1.12 - 0.12 * p;
  const punch = 1 + 0.05 * (1 - Math.min(localT / 0.22, 1));
  return ken * punch;
}

/** Cover-fit + Ken-Burns/punch for any drawable with a known size. */
function drawCoverKenBurns(ctx, source, sw, sh, localT, kb) {
  if (!sw || !sh) return;
  const cover = Math.max(EXPORT_W / sw, EXPORT_H / sh) * mediaScale(localT, kb);
  const dw = sw * cover, dh = sh * cover;
  ctx.drawImage(source, (EXPORT_W - dw) / 2, (EXPORT_H - dh) / 2, dw, dh);
}

// Deterministic film grain: a pre-rendered noise tile, offset by a seed derived
// from the frame time (same t → same grain).
let grainTile = null;
function grain(ctx, t) {
  if (!grainTile) {
    grainTile = new OffscreenCanvas(128, 128);
    const g = grainTile.getContext('2d');
    let seed = 1234567;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rand() > 0.5 ? 255 : 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  const frame = Math.floor(t * 30);
  const ox = (frame * 37) % 128, oy = (frame * 61) % 128;
  ctx.save();
  ctx.globalAlpha = 0.05;
  for (let y = -oy; y < EXPORT_H; y += 128) {
    for (let x = -ox; x < EXPORT_W; x += 128) ctx.drawImage(grainTile, x, y);
  }
  ctx.restore();
}

/** Word-wrap `text` to maxWidth with the ctx's current font. */
function wrapLines(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (ctx.measureText(probe).width > maxWidth && line) { lines.push(line); line = w; }
    else line = probe;
  }
  if (line) lines.push(line);
  return lines;
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

const LETTERBOX = Math.round(40 * (EXPORT_H / 533)); // in-app 40px bars, scaled

// A montage beat row: HUGE fit-to-width Oswald caps. Base size comes from the
// shared beatScale heuristic; a measured clamp then guarantees one line fits.
function beatRow(ctx, text, maxTextW) {
  let size = 34 * S * beatScale(text);
  const upper = text.toUpperCase();
  ctx.font = `600 ${Math.round(size)}px Oswald, Outfit, sans-serif`;
  const w = ctx.measureText(upper).width;
  if (w > maxTextW) size *= maxTextW / w;
  return { font: `600 ${Math.round(size)}px Oswald, Outfit, sans-serif`, fill: '#FBF6EE', text: upper, size, gapAfter: 12 * S };
}

/** Draw the recap at absolute time `t` onto a 1080×1920 ctx. Async only because
 *  a video-backed beat samples its clip. */
export async function drawFrame(ctx, timeline, t, assets, fallback = {}) {
  const { entries, total } = timeline;
  const tt = Math.min(Math.max(t, 0), Math.max(total - 1e-4, 0));
  let active = entries[entries.length - 1];
  for (const e of entries) { if (tt >= e.start && tt < e.end) { active = e; break; } }
  const scene = active.scene;
  const localT = tt - active.start;

  // ---- backdrop: video beat → sampled clip frame; else photo; else gradient.
  // Mirrors RecapReel's priority (scene.video || scene.media || cover || grad).
  ctx.clearRect(0, 0, EXPORT_W, EXPORT_H);
  let drew = false;
  if (scene.video && assets.videos.has(scene.video)) {
    const { sink, duration } = assets.videos.get(scene.video);
    try {
      const sample = await sink.getSample(Math.min(localT, Math.max(duration - 0.05, 0)));
      if (sample) {
        const sw = sample.displayWidth || sample.codedWidth;
        const sh = sample.displayHeight || sample.codedHeight;
        const cover = Math.max(EXPORT_W / sw, EXPORT_H / sh) * mediaScale(localT, scene.kb);
        sample.draw(ctx, (EXPORT_W - sw * cover) / 2, (EXPORT_H - sh * cover) / 2, sw * cover, sh * cover);
        sample.close();
        drew = true;
      }
    } catch { /* fall through */ }
  }
  if (!drew) {
    const photoUrl = (scene.media && assets.images.has(scene.media) && scene.media)
      || (fallback.cover && assets.images.has(fallback.cover) && fallback.cover);
    if (photoUrl) {
      const bmp = assets.images.get(photoUrl);
      drawCoverKenBurns(ctx, bmp, bmp.width, bmp.height, localT, scene.kb);
      drew = true;
    }
  }
  if (!drew) fillGradientBg(ctx, scene.grad);

  // ---- scrim (matches .recap-scrim stops)
  const scrim = ctx.createLinearGradient(0, 0, 0, EXPORT_H);
  scrim.addColorStop(0, 'rgba(10,8,7,0.15)');
  scrim.addColorStop(0.45, 'rgba(10,8,7,0.35)');
  scrim.addColorStop(1, 'rgba(10,8,7,0.86)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, EXPORT_W, EXPORT_H);

  grain(ctx, tt);

  // ---- letterbox
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, EXPORT_W, LETTERBOX);
  ctx.fillRect(0, EXPORT_H - LETTERBOX, EXPORT_W, LETTERBOX);

  // ---- content block with the entrance animation
  const enter = Math.min(localT / 0.36, 1);
  const eased = easeOutBack(enter);
  const alpha = Math.min(localT / 0.3, 1);
  const rise = (1 - eased) * 16 * S; // 16px → export space
  const scl = 0.97 + 0.03 * eased;

  const lower = scene.layout === 'lower';
  ctx.save();
  // 'lower' anchors the block left + low (the in-app lower-third variant);
  // translation happens after the block is measured, so just set up scale here.
  ctx.translate(lower ? 26 * S : EXPORT_W / 2, EXPORT_H / 2 + rise);
  ctx.scale(scl, scl);
  ctx.globalAlpha = Math.max(0, Math.min(alpha, 1));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 24 * (S / 3.6);

  const maxTextW = EXPORT_W - 2 * 26 * S;
  const rows = []; // { font, fill, text, size, gapAfter, spacing? }
  const kind = scene.kind;
  if (scene.tag) {
    rows.push({ font: `800 ${Math.round(10.5 * S)}px Outfit, sans-serif`, fill: '#FFC75F', text: `TAKE ${scene.tag}`, size: 10.5 * S, gapAfter: 14 * S, spacing: 0.22, chip: true });
  }
  if (scene.label && kind === 'score') {
    rows.push({ font: `800 ${Math.round(12 * S)}px Outfit, sans-serif`, fill: '#F4A261', text: String(scene.label).toUpperCase(), size: 12 * S, gapAfter: 26 * S, spacing: 0.18 });
  }
  if (scene.big != null) {
    if (kind === 'score') {
      rows.push({ font: `700 ${Math.round(96 * S)}px Oswald, Outfit, sans-serif`, fill: '#FFFFFF', text: String(scene.big), size: 96 * S, gapAfter: 18 * S });
    } else if (kind === 'title' || kind === 'outro') {
      rows.push({ font: `900 ${Math.round(30 * S)}px Outfit, sans-serif`, fill: '#FBF6EE', text: String(scene.big), size: 30 * S, gapAfter: 12 * S });
    } else {
      rows.push(beatRow(ctx, String(scene.big), maxTextW));
    }
  }
  if (scene.label && kind !== 'score') {
    rows.push(beatRow(ctx, String(scene.label), maxTextW));
  }
  if (scene.sub) {
    rows.push(kind === 'score'
      ? { font: `600 ${Math.round(26 * S)}px Oswald, Outfit, sans-serif`, fill: '#F4A261', text: String(scene.sub).toUpperCase(), size: 26 * S, gapAfter: 0 }
      : { font: `600 ${Math.round(14.5 * S)}px "DM Sans", sans-serif`, fill: 'rgba(251,246,238,0.82)', text: String(scene.sub), size: 14.5 * S, gapAfter: 0 });
  }
  if (kind === 'title' || kind === 'outro') {
    rows.push({ font: `800 ${Math.round(17 * S)}px Outfit, sans-serif`, fill: 'rgba(251,246,238,0.6)', text: 'melo', size: 17 * S, gapAfter: 0, gapBefore: 22 * S });
  }

  // wrap + measure the whole block, then draw centered on (0,0)
  const lines = [];
  for (const r of rows) {
    ctx.font = r.font;
    if (r.gapBefore) lines.push({ spacer: r.gapBefore });
    for (const text of wrapLines(ctx, r.text, maxTextW)) {
      lines.push({ ...r, text, h: r.size * 1.12 });
    }
    if (r.gapAfter) lines.push({ spacer: r.gapAfter });
  }
  const blockH = lines.reduce((a, l) => a + (l.spacer || l.h), 0);
  // center layout: block centered on the anchor; lower: block bottom sits just
  // above the in-app 84px padding, left-aligned.
  let y = lower ? (EXPORT_H - LETTERBOX - 84 * S) - (EXPORT_H / 2 + rise) - blockH : -blockH / 2;
  if (lower) ctx.textAlign = 'left';
  for (const l of lines) {
    if (l.spacer) { y += l.spacer; continue; }
    ctx.font = l.font;
    ctx.fillStyle = l.fill;
    y += l.h;
    if (l.spacing) {
      // manual letter-spacing (eyebrow / tag chip)
      const chars = [...l.text];
      const widths = chars.map((c) => ctx.measureText(c).width);
      const gap = l.size * l.spacing;
      const totalW = widths.reduce((a, w) => a + w, 0) + gap * (chars.length - 1);
      let x = lower ? 0 : -totalW / 2;
      if (l.chip) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,199,95,0.4)';
        ctx.lineWidth = Math.max(2, 1 * (S / 3.6));
        ctx.beginPath();
        ctx.roundRect(x - 7 * S * 0.6, y - l.h - 3 * S * 0.6, totalW + 14 * S * 0.6, l.h + 9 * S * 0.6, 6 * S * 0.6);
        ctx.stroke();
        ctx.restore();
      }
      const align = ctx.textAlign;
      ctx.textAlign = 'left';
      for (let i = 0; i < chars.length; i++) {
        ctx.fillText(chars[i], x, y - l.h * 0.24);
        x += widths[i] + gap;
      }
      ctx.textAlign = align;
    } else {
      ctx.fillText(l.text, 0, y - l.h * 0.24);
    }
  }
  ctx.restore();

  // ---- flash (matches .recap-flash: from `amt`, gone by 0.28s)
  if (scene.flash) {
    const f = Math.max(0, 1 - localT / 0.28);
    if (f > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(scene.flash * f).toFixed(3)})`;
      ctx.fillRect(0, 0, EXPORT_W, EXPORT_H);
    }
  }

  // ---- story progress bars
  const inset = 12 * S, gap = 4 * S, segH = 2.5 * S, top = 12 * S;
  const n = entries.length;
  const segW = (EXPORT_W - inset * 2 - gap * (n - 1)) / n;
  entries.forEach((e, i) => {
    const x = inset + i * (segW + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x, top, segW, segH);
    const fill = e === active ? (localT / scene.dur) : (tt >= e.end ? 1 : 0);
    if (fill > 0) {
      ctx.fillStyle = '#D8A56B';
      ctx.fillRect(x, top, segW * Math.min(fill, 1), segH);
    }
  });
}
