// lib/db/festivalMedia.js — general festival-level photos/videos.
//
// A festival is a DERIVED grouping (no festival row), so this keys media by
// (user_id, festival_key). The URLs point at the show-photos / show-videos
// Storage buckets (uploaded under {user_id}/fest-<key>/...). Self-only RLS —
// see migration 0015_festival_media.sql.

import { supabase } from '../supabase';

/** Read one festival's saved media. Returns { photos, videos } (empty on miss
 *  or error, so callers never have to null-check). */
export async function getFestivalMedia(festivalKey) {
  if (!festivalKey) return { photos: [], videos: [] };
  const { data, error } = await supabase
    .from('festival_media')
    .select('photos, videos')
    .eq('festival_key', festivalKey)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[Melo] getFestivalMedia', error.message);
    return { photos: [], videos: [] };
  }
  return { photos: data?.photos || [], videos: data?.videos || [] };
}

/** Upsert one festival's media (the full arrays — the pickers are controlled,
 *  so they always hand us the complete next list). */
export async function setFestivalMedia(festivalKey, festivalName, userId, { photos = [], videos = [] } = {}) {
  if (!festivalKey || !userId) return;
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
  }
}
