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

import * as tus from 'tus-js-client';
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
// Videos are still not transcoded client-side (no AVFoundation in the
// WKWebView; ffmpeg.wasm is slow/crashy on phones). A WebCodecs + mediabunny
// pass is the planned next phase, gated on an on-device spike — see
// docs/initiatives/2026-06-23-public-share-pages.md (Phase 3). So we validate,
// but the cap is now big enough that validation rarely fires.

const VIDEO_BUCKET = 'show-videos';
// SIZE is what binds, not duration — so the two constants must agree.
//
// iPhone records 4K30 HEVC by DEFAULT at ~170MB/min. The old 45MB cap therefore
// bought ~16s while the UI promised 60s: the duration check could never fire at
// any setting except 720p30, and users always hit a bytes error instead. 200MB
// covers a full 60s at 4K30 (~170MB) and 1080p60 (~90MB), which makes
// VIDEO_MAX_SECONDS honest for the first time. Only a full minute of 4K60
// (~400MB/min) is excluded, and that's rejected by name rather than mystery.
//
// Two limits must agree or this silently fails: the bucket's file_size_limit
// (migration 0017) AND the project's GLOBAL file size limit (Dashboard →
// Storage → Settings). Per-bucket can never exceed global.
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024; // keep in sync with 0017
export const VIDEO_MAX_MB = 200;
export const VIDEO_MAX_SECONDS = 60;

// Supabase requires exactly 6MB TUS chunks ("it must be set to 6MB (for now) do
// not change it"). Do not tune this.
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

/** Resumable upload of one file to the videos bucket via TUS.
 *  Resolves on success; rejects with a user-facing Error. */
function tusUpload(file, path, onProgress) {
  return new Promise((resolve, reject) => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { reject(new Error('You need to be signed in to add a video.')); return; }

      // The TUS endpoint lives on the direct storage hostname, not the API
      // gateway: https://<project-ref>.storage.supabase.co/storage/v1/upload/resumable
      const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
      const ref = base.match(/^https:\/\/([^.]+)\.supabase\.co$/i)?.[1];
      const endpoint = ref
        ? `https://${ref}.storage.supabase.co/storage/v1/upload/resumable`
        : `${base}/storage/v1/upload/resumable`;

      const upload = new tus.Upload(file, {
        endpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${token}`,
          'x-upsert': 'false',
        },
        uploadDataDuringCreation: true,
        // Without this, re-picking the same clip after a delete is silently
        // treated as an already-finished upload.
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: VIDEO_BUCKET,
          objectName: path,
          contentType: file.type || 'video/mp4',
          // LOAD-BEARING, do not "tidy" to the default. A 1-year cacheControl
          // bills egress at Supabase's CACHED rate (~$0.03/GB) instead of the
          // uncached ~$0.09/GB — 3x on every byte a public share page serves.
          cacheControl: '31536000',
        },
        chunkSize: TUS_CHUNK_BYTES,
        onError: (err) => {
          // Surface the server's reason when it has one (e.g. the bucket's
          // file_size_limit rejecting the file) instead of a bare "failed".
          const detail = err?.originalResponse?.getBody?.() || err?.message || '';
          if (/exceeded the maximum allowed size|entity too large|413/i.test(String(detail))) {
            reject(new Error(
              `That clip is too large for the server. The limit is ${VIDEO_MAX_MB}MB — if this keeps happening the storage limit may need raising.`
            ));
            return;
          }
          reject(new Error('That upload failed — check your connection and try again.'));
        },
        onProgress: (sent, total) => {
          if (total > 0) onProgress?.(sent / total);
        },
        onSuccess: () => resolve(),
      });

      // Resume a half-finished upload of the same file rather than restarting —
      // the whole point of TUS at a venue with bad signal.
      const prev = await upload.findPreviousUploads();
      if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    })().catch(reject);
  });
}

/** Upload one video, resumably. Returns the public URL.
 *
 *  Resumable (TUS) rather than a plain .upload(): a 200MB file over venue LTE is
 *  minutes long, and a plain upload gives no progress, no resume, and dies whole
 *  on a blip — turning an honest "too big" error into a silent hang at a show.
 *  supabase-js has no TUS support, hence tus-js-client against the direct
 *  storage hostname.
 *
 *  @param onProgress (0..1) — drives the picker's progress bar.
 *  Throws Error with a user-friendly message on validation failure. */
export async function uploadShowVideo(file, userId, showId, onProgress) {
  if (!file || !userId || !showId) throw new Error('uploadShowVideo: missing arg');

  if (file.size > VIDEO_MAX_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    // Name the setting that actually fixes it — "trim it shorter" is useless
    // advice when the real cause is a 4K60 device default.
    throw new Error(
      `That clip is ${mb}MB — the limit is ${VIDEO_MAX_MB}MB. Trim it, or record in 4K30 / 1080p instead of 4K60 (Settings → Camera → Record Video).`
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

  await tusUpload(file, path, onProgress);

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
