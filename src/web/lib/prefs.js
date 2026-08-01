// lib/prefs.js — small on-device preferences.
// ===========================================
// Per-DEVICE, not per-account. `user_settings` writes proxy through the
// setlistfm-set-key Edge Function, so adding a synced column means a migration
// plus a new write path — disproportionate for a UI preference. If one of these
// ever needs to follow a user between devices, promote it then.
//
// Every read is try/caught: localStorage throws in private-mode Safari and in
// some WKWebView configurations, and a preference is never worth a crash.

const read = (k, fallback) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? fallback : v === '1';
  } catch { return fallback; }
};
const write = (k, on) => {
  try { localStorage.setItem(k, on ? '1' : '0'); } catch { /* ignore */ }
};

const RANKING_KEY = 'melo_ranking_enabled';

/**
 * Is comparison-ranking on? Default TRUE.
 *
 * Some people find ranking music distasteful — it can read as judging the
 * artist rather than remembering the night. The mechanic is opt-OUT rather than
 * opt-in because it's what makes scores honest, but nobody should be stuck with
 * it. Turning it off stops the duel and the backlog prompt; the show's bucket
 * ("Loved it" → 9.0) becomes its score, and the drawer, recaps and everything
 * else are untouched.
 */
export const rankingEnabled = () => read(RANKING_KEY, true);
export const setRankingEnabled = (on) => write(RANKING_KEY, on);
