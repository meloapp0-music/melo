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
const MAX_EDGE_PX = 2048;
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
