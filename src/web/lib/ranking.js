// lib/ranking.js — placing a show by comparison, not by score.
// ============================================================
// The problem with a 1–10 score is that it compresses. Nobody buys a ticket to
// a show they expect to hate, and post-show euphoria inflates everything, so
// real libraries cluster hard between 8 and 10. Sorting on that number produces
// an ordering full of ties that doesn't match what the user actually believes.
//
// Comparisons don't have that problem. "Coldplay or Fleet Foxes?" is easy, and
// it's honest. So after logging a show we ask two-to-five of them and BINARY
// SEARCH the answer into the existing ranked list.
//
// Why binary insertion rather than the ELO-over-random-pairs this replaces:
//   - ELO needs dozens of votes to converge, and converges to an *estimate*.
//     Binary insertion needs ⌈log₂(n+1)⌉ and is EXACT immediately.
//   - Random pairs mean the user might never be asked about the show they just
//     logged. Insertion asks at the one moment they're still thinking about it.
//   - 32 shows → 6 questions. 100 shows → 7. It scales the way nothing else here does.
//
// Pure and dependency-free: no React, no db, so the whole placement algorithm
// can be tested without mounting anything.
//
// docs/initiatives/2026-07-28-ia-simplification.md

/** Start placing `candidateId` into `orderedIds` (best → worst). */
export function startPlacement(orderedIds, candidateId) {
  const list = (orderedIds || []).filter((id) => id && id !== candidateId);
  return { list, candidateId, lo: 0, hi: list.length, asked: 0 };
}

/** True once the window has collapsed and the position is known. */
export const isPlaced = (s) => s.lo >= s.hi;

/** The show to compare against next, or null when placement is done. */
export function nextOpponent(s) {
  if (isPlaced(s)) return null;
  return s.list[(s.lo + s.hi) >> 1];
}

/**
 * Record one answer and narrow the window.
 * `candidateWon` = the newly logged show was the better night.
 *
 * Best → worst ordering, so a win moves the candidate toward the TOP, which
 * means searching the lower half of the index range.
 */
export function answer(s, candidateWon) {
  if (isPlaced(s)) return s;
  const mid = (s.lo + s.hi) >> 1;
  return candidateWon
    ? { ...s, hi: mid, asked: s.asked + 1 }
    : { ...s, lo: mid + 1, asked: s.asked + 1 };
}

/** Where the candidate lands. Valid mid-placement too — that's what makes an
 *  early "good enough" exit possible: `lo` is always the best current guess. */
export const placementIndex = (s) => s.lo;

/** How many questions remain, worst case. Drives the progress dots. */
export function remaining(s) {
  const span = Math.max(0, s.hi - s.lo);
  return span <= 0 ? 0 : Math.ceil(Math.log2(span + 1));
}

/** The final ordered list, candidate inserted. */
export function place(s) {
  const out = [...s.list];
  out.splice(Math.min(s.lo, out.length), 0, s.candidateId);
  return out;
}

/** Ordered ids → the `{ showId: position }` map the db stores. 1-based, dense.
 *  Positions are rewritten wholesale on every insert. That's O(n) writes, but n
 *  is a personal concert history — hundreds at the very most — and dense
 *  integers keep "you're #3" trivially readable everywhere else. */
export const toPositions = (orderedIds) =>
  Object.fromEntries((orderedIds || []).map((id, i) => [id, i + 1]));

/**
 * The user's ranked order, best → worst.
 *
 * Shows that have never been placed fall to the back, ordered by score so a
 * library that predates ranking still reads sensibly. `positions` is the stored
 * map; `shows` is any list of show objects.
 */
export function rankedOrder(shows, positions = {}) {
  const placed = [];
  const unplaced = [];
  (shows || []).forEach((sh) => (positions[sh.id] ? placed : unplaced).push(sh));
  placed.sort((a, b) => positions[a.id] - positions[b.id]);
  unplaced.sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.date).localeCompare(String(b.date)));
  return [...placed, ...unplaced];
}

/** 1-based rank of one show within `rankedOrder`, or 0 if absent. */
export const rankOf = (shows, positions, showId) =>
  rankedOrder(shows, positions).findIndex((s) => s.id === showId) + 1;

// ===========================================================================
// The melo score — a number DERIVED from where a show sits, not typed in.
// ===========================================================================
// A hand-entered 1–10 is an absolute judgement, and absolute judgements
// compress: nobody buys a ticket expecting to hate the night, so real libraries
// pile up at 8–10 and the number stops discriminating. The ranked order doesn't
// have that problem — it came from comparisons — so the honest score is one
// read off the order.
//
// The scale is RELATIVE TO YOUR OWN LIBRARY. A 9.4 means "near the top of what
// I've seen", not a claim about the show in the abstract. That's the whole
// point, and it's why two users' numbers aren't comparable.

const TOP = 9.9;          // your #1. Not 10.0 — leave somewhere to go.
const MAX_SPREAD = 3.4;   // so a big library bottoms out at 6.5
const PER_SHOW = 0.35;    // how fast the range opens up early on

/**
 * Score for rank `r` (1-based) in a library of `n` ranked shows.
 *
 * The spread GROWS with the library. With three shows, calling your third-best
 * night a 6.5 would be a lie — you haven't seen enough to know it's bad, only
 * that it's third. So early on the range is tight (9.9, 9.55, 9.2) and it opens
 * out as the collection earns the resolution.
 */
export function meloScore(r, n) {
  if (!r || r < 1 || !n || n < 1) return null;
  if (n === 1) return 9.5; // one show, nothing to compare it to
  const spread = Math.min(MAX_SPREAD, PER_SHOW * (n - 1));
  const t = (r - 1) / (n - 1); // 0 at the top, 1 at the bottom
  return Math.round((TOP - spread * t) * 10) / 10;
}

/** `{ showId: score }` for a whole library. */
export function meloScores(shows, positions = {}) {
  const order = rankedOrder(shows, positions);
  const n = order.length;
  return Object.fromEntries(order.map((s, i) => [s.id, meloScore(i + 1, n)]));
}

/** Display helper: always one decimal place ("9.0", not "9"). */
export const scoreText = (v) => (v == null ? '—' : Number(v).toFixed(1));
