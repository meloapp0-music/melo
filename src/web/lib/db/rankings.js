// db/rankings.js — per-show ranking. Strictly private to the owner.
//
// Two orderings live in this table, for a reason:
//   `position` — the real one. A 1-based dense rank produced by binary-search
//                inserting each new show (lib/ranking.js). Exact, and asked for
//                at log time.
//   `elo`      — the legacy Battle Mode estimate over random pairs. Kept so
//                existing libraries don't lose data and Battle Mode still runs;
//                readers prefer `position`.

import { supabase } from '../supabase';

/** Legacy ELO map, `{ showId: elo }`. Battle Mode still uses this. */
export async function getRankings() {
  const { data, error } = await supabase.from('rankings').select('show_id, elo');
  if (error) throw error;
  const out = {};
  (data || []).forEach((r) => { out[r.show_id] = r.elo; });
  return out;
}

/** Write many ELO ratings at once (Battle Mode recomputes after each vote). */
export async function saveRankings(ratings, userId) {
  const rows = Object.entries(ratings).map(([showId, elo]) => ({
    show_id: showId,
    user_id: userId,
    elo,
  }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('rankings').upsert(rows, { onConflict: 'show_id' });
  if (error) throw error;
}

/** The true ranked order, `{ showId: position }`. Only placed shows appear. */
export async function getPositions() {
  const { data, error } = await supabase
    .from('rankings')
    .select('show_id, position')
    .not('position', 'is', null)
    .order('position', { ascending: true });
  if (error) throw error;
  const out = {};
  (data || []).forEach((r) => { out[r.show_id] = r.position; });
  return out;
}

/**
 * Persist a whole ranked order.
 *
 * Positions are rewritten wholesale rather than patched, because inserting at
 * index k shifts every show below it anyway. One upsert, and the stored order
 * can never end up with a gap or a duplicate rank — which a partial update
 * absolutely can, and which would be invisible until a leaderboard rendered two
 * shows at #4.
 */
export async function savePositions(orderedIds, userId) {
  if (!userId || !orderedIds?.length) return;
  const rows = orderedIds.map((showId, i) => ({
    show_id: showId,
    user_id: userId,
    position: i + 1,
  }));
  const { error } = await supabase.from('rankings').upsert(rows, { onConflict: 'show_id' });
  if (error) throw error;
}
