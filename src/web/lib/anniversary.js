// lib/anniversary.js — "one year ago tonight".
// ============================================
// The core problem with a concert app is sparseness: the median user goes to a
// handful of shows a year, so there's no reason to open it on the other ~360
// days. Anniversaries are the cheapest answer — the library the user already
// built, resurfaced on the one day it's most affecting.
//
// Pure and string-based ON PURPOSE. `show.date` is a 'YYYY-MM-DD' string, and
// the moment you put it through `new Date()` you inherit a timezone: west of
// Greenwich `new Date('2025-08-01')` is *July 31st* locally, so a show would
// resurface a day early for most of the US. Comparing the month/day substrings
// sidesteps that entirely.
//
// docs/initiatives/2026-07-30-anniversaries.md

/** 'YYYY-MM-DD' for today in the LOCAL calendar (never toISOString — that's UTC). */
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Does `showDate` fall on the same calendar day as `todayStr`, in an earlier year?
 * Returns the number of years, or 0 for no.
 *
 * Feb 29 shows resurface on Feb 28 in non-leap years. Silently never surfacing
 * them for three years out of four would be a quiet bug in something whose
 * entire job is remembering.
 */
export function yearsAgo(showDate, todayStr = localDate()) {
  if (!showDate || showDate.length < 10 || !todayStr) return 0;
  const [sy, sm, sd] = showDate.slice(0, 10).split('-');
  const [ty, tm, td] = todayStr.slice(0, 10).split('-');
  const years = Number(ty) - Number(sy);
  if (!Number.isFinite(years) || years < 1) return 0;

  if (sm === tm && sd === td) return years;
  // Leap-day fallback: Feb 29 → Feb 28 when this year has no 29th.
  if (sm === '02' && sd === '29' && tm === '02' && td === '28' && !isLeap(Number(ty))) return years;
  return 0;
}

/**
 * Every attended show whose anniversary is today, newest-first.
 * Each entry: `{ show, years }`.
 */
export function anniversariesOn(shows, todayStr = localDate()) {
  return (shows || [])
    .map((show) => ({ show, years: yearsAgo(show?.date, todayStr) }))
    .filter((a) => a.years > 0)
    .sort((a, b) => b.years - a.years);
}

/**
 * The ONE anniversary worth surfacing today, or null.
 *
 * Ranked by how much there is to show — a night with photos and a setlist makes
 * a reel; a bare row makes a disappointment. Milestone years (5, 10, 15…) win
 * outright, because "ten years ago tonight" is a different feeling from "one".
 */
export function pickAnniversary(shows, todayStr = localDate()) {
  const all = anniversariesOn(shows, todayStr);
  if (!all.length) return null;
  const weight = ({ show, years }) => {
    const media = (show.photos || []).length + (show.videos || []).length;
    const songs = (show.setlist || []).filter(Boolean).length;
    const milestone = years % 5 === 0 ? 100 : 0;
    return milestone + media * 3 + songs + years;
  };
  return all.reduce((best, a) => (weight(a) > weight(best) ? a : best), all[0]);
}

/** "One year ago" / "5 years ago" — the phrase both the card and the push use. */
export const agoLabel = (years) => (years === 1 ? 'One year ago' : `${years} years ago`);
