// db/rankings.js — per-OUTING ranking. Strictly private to the owner.
//
// Two tables, deliberately, during the transition:
//
//   ranking_entries  (0020) — the real one. Keyed by (user_id, scope,
//                             entity_key), where entity_key is a show uuid OR a
//                             festival key. A twelve-act festival is ONE row.
//   rankings         (0001) — legacy ELO + position, keyed by show_id. Left
//                             populated and unread so reverting the client
//                             restores the old order. Battle Mode still writes
//                             its `elo`.
//
// See docs/initiatives/2026-07-30-rank-outings-not-shows.md

import { supabase } from '../supabase';
import { OUTING_SCOPE } from '../ranking';

/** Legacy ELO map, `{ showId: elo }`. Battle Mode only. */
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

/**
 * The ranked order for one scope: `{ entityKey: position }`.
 *
 * `outing` is the top-level order (festivals + standalone shows). A festival's
 * own sets live under `festival:<key>`.
 */
export async function getPositions(scope = OUTING_SCOPE) {
  const { data, error } = await supabase
    .from('ranking_entries')
    .select('entity_key, position')
    .eq('scope', scope)
    .order('position', { ascending: true });
  if (error) throw error;
  const out = {};
  (data || []).forEach((r) => { out[r.entity_key] = r.position; });
  return out;
}

/**
 * Persist a whole ranked order for one scope.
 *
 * Rewritten wholesale rather than patched, because inserting at index k shifts
 * everything below it anyway — and a partial update can leave a gap or put two
 * entities at #4, a corruption that stays invisible until a leaderboard renders
 * it. Stale rows for keys no longer in the list are deleted in the same pass,
 * which is also what cleans up entities whose shows were removed (entity_key is
 * text, so nothing cascades).
 */
export async function savePositions(orderedKeys, userId, scope = OUTING_SCOPE) {
  if (!userId || !orderedKeys?.length) return;
  const rows = orderedKeys.map((entity_key, i) => ({
    user_id: userId,
    scope,
    entity_key,
    position: i + 1,
  }));
  const { error } = await supabase
    .from('ranking_entries')
    .upsert(rows, { onConflict: 'user_id,scope,entity_key' });
  if (error) throw error;

  // Drop anything in this scope that's no longer in the order. The stale set is
  // computed here rather than expressed as a `not.in(...)` filter: festival keys
  // contain "|" and arbitrary punctuation from the festival name, and
  // hand-building that filter string is a quoting bug waiting to happen.
  //
  // Best-effort. An orphan is inert — readers only order entities they can
  // resolve, and the denominator counts resolvable entities — so a failed prune
  // is never worth surfacing to the user.
  try {
    const keep = new Set(orderedKeys);
    const { data: existing } = await supabase
      .from('ranking_entries')
      .select('entity_key')
      .eq('scope', scope);
    const stale = (existing || []).map((r) => r.entity_key).filter((k) => !keep.has(k));
    if (stale.length) {
      await supabase.from('ranking_entries').delete().eq('scope', scope).in('entity_key', stale);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[Melo] ranking prune skipped (harmless)', err);
  }
}
