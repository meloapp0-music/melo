// lib/wrappedSeason.js — Wrapped as a dated event, not a page.
// ============================================================
// Spotify Wrapped's reach doesn't come from the slides. It comes from everyone
// posting inside the same 48 hours: a scheduled cultural moment. Melo's
// per-show recap is better for frequency but gets none of that synchronised
// effect, and a year-in-review you can open in March isn't an event — it's a
// stats page.
//
// So the CURRENT year is locked until the season opens. Past years stay
// available forever (they've already had their moment). The lock is the
// feature: anticipation is what makes the unlock worth posting about.
//
// docs/initiatives/2026-07-31-wrapped-season.md

/** December 1st. Ahead of Spotify's usual early-December drop, deliberately —
 *  Melo's year is effectively over by then (few shows late December) and being
 *  first to the feed is worth more than being accurate about the last week. */
export const UNLOCK_MONTH = 12; // 1-indexed
export const UNLOCK_DAY = 1;

/** 'YYYY-MM-DD' local — never toISOString, which is UTC and rolls a day early
 *  west of Greenwich. Same reasoning as lib/anniversary.js. */
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The day year Y's Wrapped becomes available. */
export const unlockDate = (year) =>
  `${year}-${String(UNLOCK_MONTH).padStart(2, '0')}-${String(UNLOCK_DAY).padStart(2, '0')}`;

/**
 * Can this year's Wrapped be opened?
 *
 * Past years: always. The current year: only once the season opens. A future
 * year is never available — that would just be an empty page.
 */
export function isUnlocked(year, todayStr = localDate()) {
  const thisYear = Number(todayStr.slice(0, 4));
  if (!year || year > thisYear) return false;
  if (year < thisYear) return true;
  return todayStr >= unlockDate(year);
}

/** Whole days until year Y unlocks; 0 once it has. Drives the countdown copy. */
export function daysUntilUnlock(year, todayStr = localDate()) {
  if (isUnlocked(year, todayStr)) return 0;
  const target = new Date(`${unlockDate(year)}T00:00:00`);
  const today = new Date(`${todayStr}T00:00:00`);
  return Math.max(0, Math.round((target - today) / 86400000));
}

/**
 * Is today the day the season opens? The one day a year the "everyone at once"
 * push should fire — that synchronisation IS the mechanic.
 */
export const isUnlockDay = (todayStr = localDate()) =>
  todayStr === unlockDate(Number(todayStr.slice(0, 4)));

/** Label for a year card: past years and the just-unlocked one read "Wrapped";
 *  a still-locked current year reads "So Far", as it always has. */
export const seasonLabel = (year, todayStr = localDate()) =>
  (isUnlocked(year, todayStr) ? 'Wrapped' : 'So Far');
