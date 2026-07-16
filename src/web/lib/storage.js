// lib/storage.js — Supabase Storage wrappers for show photos.
//
// All photos live in the `show-photos` bucket under the path
// `{user_id}/{show_id}/{filename}`. Storage RLS policies (see
// migration 0003) gate writes to the caller's own folder; the
// bucket itself is public-read so friends viewing a shared show
// can render images without an authenticated request.
//
// Uploads are resized client-side via Canvas to keep payloads
// small (concert phone shots come out at 4–8 MB raw; we target
// ~300–600 KB JPEGs at 2048px max edge).

import { supabase } from './supabase';

const BUCKET = 'show-photos';
const AVATAR_BUCKET = 'avatars';
const MAX_EDGE_PX = 2048;
const AVATAR_MAX_EDGE_PX = 512; // displayed at 80px; 512 is plenty for retina
const JPEG_QUALITY = 0.85;

/** Resize-and-upload one image. Returns the public URL. */
export async function uploadShowPhoto(file, userId, showId) {
  if (!file || !userId || !showId) throw new Error('uploadShowPhoto: missing arg');

  const blob = await resizeImage(file, MAX_EDGE_PX, JPEG_QUALITY);
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${userId}/${showId}/${ts}-${rand}.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: false,
      cacheControl: '31536000', // 1 year — paths include a random suffix so they're effectively immutable
    });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Resize-and-upload a profile picture. Returns the public URL.
 *  Uploaded to `avatars/{user_id}/{ts}-{rand}.jpg`. The bucket is
 *  public-read so other users (and the marketing site, eventually)
 *  can render it without an authenticated request. RLS still gates
 *  writes to the caller's own folder — see migration 0004. */
export async function uploadAvatar(file, userId) {
  if (!file || !userId) throw new Error('uploadAvatar: missing arg');

  const blob = await resizeImage(file, AVATAR_MAX_EDGE_PX, JPEG_QUALITY);
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${userId}/${ts}-${rand}.jpg`;

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: false,
      cacheControl: '31536000',
    });
  if (error) throw error;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Delete one photo by its public URL. Best-effort: storage failures
 *  are logged but not thrown, since we mostly just want the URL gone
 *  from the show row regardless. */
export async function deleteShowPhoto(publicUrl) {
  const path = pathFromPublicUrl(publicUrl);
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[Melo] deleteShowPhoto storage error', error);
  }
}

// ---------- videos ----------
// Videos can't be transcoded reliably inside the WKWebView (no
// AVFoundation access, ffmpeg.wasm is slow/crashy on phones), so v1
// VALIDATES instead of compressing: ≤60s and ≤45MB (the bucket also
// enforces 45MB + video MIME types server-side — migration 0014).
// A native compression pass is the planned phase 2 — see
// docs/initiatives/2026-06-27-video-uploads.md.

const VIDEO_BUCKET = 'show-videos';
// SIZE is what actually binds, not duration. 45MB is the Supabase FREE plan's
// hard 50MB per-file ceiling showing through (migration 0014) — not a design
// choice. At iPhone's default 4K30 (~170MB/min) it buys ~16s; 4K60 (~400MB/min)
// buys ~7s; only 1080p30 (~65MB/min) reaches ~40s. So VIDEO_MAX_SECONDS = 60 was
// unreachable at every setting except 720p30 and the duration check could never
// fire — the UI promised a minute the byte cap always refused. Raising the cap
// requires Supabase Pro AND resumable (TUS) uploads; see
// docs/initiatives/2026-06-23-public-share-pages.md (Phase 2).
export const VIDEO_MAX_BYTES = 45 * 1024 * 1024; // keep in sync with 0014
export const VIDEO_MAX_MB = 45;
export const VIDEO_MAX_SECONDS = 60; // a ceiling, not the binding limit

/** Upload one video. Validates duration + size, returns the public URL.
 *  Throws Error with a user-friendly message on validation failure. */
export async function uploadShowVideo(file, userId, showId) {
  if (!file || !userId || !showId) throw new Error('uploadShowVideo: missing arg');

  if (file.size > VIDEO_MAX_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    // "Trim it shorter" is useless advice at 4K, where the cap is ~16s — name
    // the setting that actually fixes it.
    throw new Error(
      `That clip is ${mb}MB — the limit is ${VIDEO_MAX_MB}MB. Trim it, or record in 1080p instead of 4K (Settings → Camera → Record Video) to fit ~40s.`
    );
  }
  const seconds = await videoDuration(file);
  if (seconds && seconds > VIDEO_MAX_SECONDS + 1) {
    throw new Error(`That clip is ${Math.round(seconds)}s — keep it under ${VIDEO_MAX_SECONDS}s. Short clips are the good stuff anyway.`);
  }

  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const ext = (file.name || '').toLowerCase().endsWith('.webm') ? 'webm'
    : (file.type === 'video/quicktime' || (file.name || '').toLowerCase().endsWith('.mov')) ? 'mov'
    : 'mp4';
  const path = `${userId}/${showId}/${ts}-${rand}.${ext}`;

  const { error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(path, file, {
      contentType: file.type || 'video/mp4',
      upsert: false,
      cacheControl: '31536000',
    });
  if (error) throw error;

  const { data } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Delete one video by its public URL. Best-effort, like deleteShowPhoto. */
export async function deleteShowVideo(publicUrl) {
  const marker = `/object/public/${VIDEO_BUCKET}/`;
  const i = (publicUrl || '').indexOf(marker);
  if (i === -1) return;
  const path = publicUrl.slice(i + marker.length);
  const { error } = await supabase.storage.from(VIDEO_BUCKET).remove([path]);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[Melo] deleteShowVideo storage error', error);
  }
}

/** Read a video file's duration (seconds) via an off-DOM <video>.
 *  Resolves 0 when metadata can't be read — we upload rather than
 *  false-reject in that case (the size cap still protects storage). */
function videoDuration(file) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      const done = (secs) => {
        URL.revokeObjectURL(url);
        resolve(secs);
      };
      v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : 0);
      v.onerror = () => done(0);
      v.src = url;
    } catch {
      resolve(0);
    }
  });
}

// ---------- internals ----------

function pathFromPublicUrl(url) {
  if (!url) return null;
  // Public URLs look like:
  //   https://<project>.supabase.co/storage/v1/object/public/show-photos/{user_id}/{show_id}/{file}
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return url.slice(i + marker.length);
}

/** Resize an image File/Blob to JPEG with `maxEdge` as the longer side. */
function resizeImage(file, maxEdge, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = () => reject(new Error('FileReader failed'));
    img.onload = () => {
      try {
        const ratio = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
          'image/jpeg',
          quality,
        );
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('image decode failed'));
    reader.readAsDataURL(file);
  });
}
