// db/rankings.js — per-show ELO scores. Private to the owner.

import { supabase } from '../supabase';

export async function getRankings() {
  const { data, error } = await supabase.from('rankings').select('show_id, elo');
  if (error) throw error;
  // App consumes as { showId: elo } — keep that shape.
  const out = {};
  (data || []).forEach((r) => {
    out[r.show_id] = r.elo;
  });
  return out;
}

// Write many ratings at once. Matches the current UI that recomputes the full
// map after every vote.
export async function saveRankings(ratings, userId) {
  const rows = Object.entries(ratings).map(([showId, elo]) => ({
    show_id: showId,
    user_id: userId,
    elo,
  }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('rankings')
    .upsert(rows, { onConflict: 'show_id' });
  if (error) throw error;
}
