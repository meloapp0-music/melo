// lib/db/festivalMedia.js — general festival-level photos/videos.
//
// A festival is a DERIVED grouping (no festival row), so this keys media by
// (user_id, festival_key). The URLs point at the show-photos / show-videos
// Storage buckets (uploaded under {user_id}/fest-<key>/...). Self-only RLS —
// see migration 0015_festival_media.sql.

import { supabase } from '../supabase';

/** Read one festival's saved media. Returns { photos, videos, ok }.
 *
 *  `ok` is the whole point: a read FAILURE and an empty festival both used to
 *  come back as `{photos: [], videos: []}`, and the caller can't tell them
 *  apart. Since a save upserts the full array, treating a failed read as "no
 *  media yet" means the next photo added WIPES every photo and video already
 *  saved. Callers must keep their editors locked unless `ok` is true. */
export async function getFestivalMedia(festivalKey) {
  if (!festivalKey) return { photos: [], videos: [], ok: false };
  const { data, error } = await supabase
    .from('festival_media')
    .select('photos, videos')
    .eq('festival_key', festivalKey)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[Melo] getFestivalMedia', error.message);
    return { photos: [], videos: [], ok: false };
  }
  // No row is a legitimate empty — ok.
  return { photos: data?.photos || [], videos: data?.videos || [], ok: true };
}

// Serialize writes per festival key. The photo picker and the video picker each
// upsert the FULL row, so two saves in flight at once that land out of order
// leave the DB holding the older payload — losing whichever landed first. A
// per-key promise chain makes the last call to setFestivalMedia the last write.
const writeQueues = new Map();

async function upsertMedia(festivalKey, festivalName, userId, photos, videos) {
  const { error } = await supabase
    .from('festival_media')
    .upsert(
      {
        user_id: userId,
        festival_key: festivalKey,
        festival_name: festivalName || null,
        photos,
        videos,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,festival_key' },
    );
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[Melo] setFestivalMedia', error.message);
    return false;
  }
  return true;
}

/** Upsert one festival's media (the full arrays — the pickers are controlled,
 *  so they always hand us the complete next list). Resolves to true on success. */
export async function setFestivalMedia(festivalKey, festivalName, userId, { photos = [], videos = [] } = {}) {
  if (!festivalKey || !userId) return false;
  const qKey = `${userId}|${festivalKey}`;

  // Chain onto the previous write for this festival. `.catch` first, so one
  // failed save doesn't wedge every save after it.
  const prev = writeQueues.get(qKey) || Promise.resolve();
  const tail = prev
    .catch(() => {})
    .then(() => upsertMedia(festivalKey, festivalName, userId, photos, videos))
    .catch(() => false); // stored promise must never reject (unhandled rejection)

  writeQueues.set(qKey, tail);
  const ok = await tail;
  // Drop the entry only if nothing queued behind us, so the map can't grow
  // without bound across a long session.
  if (writeQueues.get(qKey) === tail) writeQueues.delete(qKey);
  return ok;
}
