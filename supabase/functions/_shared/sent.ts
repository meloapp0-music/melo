// notifications_sent readers.
// ===========================
// Exists because of a live bug: every cron read its dedup set with a plain
// `.select()`, and PostgREST caps a select at 1,000 rows by default. That table
// has been accumulating a row per notification per user for months, so the set
// came back truncated — most already-sent items looked unsent and were pushed
// again on every run.
//
// It was invisible for a long time because the run stats look identical either
// way: `pushed` counts APNs acceptances, and re-pushing an old event is
// indistinguishable from finding a new one unless you run the same sweep twice
// in a row and notice the number doesn't move.
//
// Two readers, because the crons know their refs at different times:
//   * byRefs   — you already know which refs matter. One targeted query,
//                chunked to keep the URL under PostgREST's limit. Cheapest,
//                and immune to the table's size.
//   * allPaged — you don't know the refs until mid-run. Pages to the end
//                instead of silently stopping at 1,000.
//
// Prefer byRefs. allPaged grows with the table forever.

const PAGE = 1000;      // PostgREST's default ceiling
const CHUNK = 150;      // refs per `in(...)` — keeps the query string sane

/**
 * Sent refs for one kind, restricted to the refs you care about.
 * Returns user_id -> Set<ref>.
 */
export async function sentRefsByUser(
  admin: any,
  kind: string,
  refs: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const unique = [...new Set(refs.filter(Boolean))];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from('notifications_sent')
      .select('user_id, ref')
      .eq('kind', kind)
      .in('ref', slice);
    if (error) {
      // Fail loud. Silently continuing here is what caused the storm: an empty
      // dedup set reads as "nothing has been sent", so everything re-sends.
      throw new Error(`sentRefsByUser(${kind}) failed: ${error.message}`);
    }
    for (const r of data || []) {
      const s = out.get(r.user_id) || new Set<string>();
      s.add(r.ref);
      out.set(r.user_id, s);
    }
  }
  return out;
}

/**
 * Every sent row for the given kinds, paged to completion.
 * Returns user_id -> Set<`kind|ref`>.
 */
export async function allSentByUser(
  admin: any,
  kinds: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('notifications_sent')
      .select('user_id, kind, ref')
      .in('kind', kinds)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`allSentByUser failed: ${error.message}`);
    for (const r of data || []) {
      const s = out.get(r.user_id) || new Set<string>();
      s.add(`${r.kind}|${r.ref}`);
      out.set(r.user_id, s);
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}
