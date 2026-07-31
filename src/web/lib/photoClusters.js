// lib/photoClusters.js — turning a pile of photos into candidate shows.
// =====================================================================
// Everything about Melo gets better with library size: the ranking needs
// something to compare against, the drawer needs stubs, the receipt needs "3rd
// time seeing them", anniversaries need a past. And a user's camera roll
// already contains every show they've been to — it's just unstructured.
//
// This groups selected photos into NIGHTS and scores how concert-shaped each
// one looks. Pure and dependency-free, so the heuristic can be tuned against
// tests instead of against a phone.
//
// docs/initiatives/2026-07-30-camera-roll-backfill.md

// Photos more than this far apart are different nights out. Four hours is
// comfortably longer than a set plus an encore plus the walk to the car, and
// comfortably shorter than the gap to the next day.
const GAP_MS = 4 * 60 * 60 * 1000;

// Anything before 5am belongs to the PREVIOUS evening's show. A photo taken at
// 00:47 on the 15th is from the night of the 14th — this is the single rule
// that decides whether a backfilled show lands on the right date.
const NIGHT_ROLLOVER_HOUR = 5;

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The date a photo's night belongs to. */
export function showDateOf(taken) {
  const d = new Date(taken);
  if (d.getHours() < NIGHT_ROLLOVER_HOUR) d.setDate(d.getDate() - 1);
  return ymd(d);
}

/**
 * How much this cluster looks like a gig rather than a birthday lunch.
 * 0–1. Deliberately conservative: a false positive costs the user a rejection
 * tap, but a wall of them costs their trust in the whole feature.
 */
export function concertScore(cluster) {
  const { photos } = cluster;
  const n = photos.length;
  if (!n) return 0;

  // Evening hours are the strongest single signal. Treat 18:00–02:00 as "gig
  // time"; anything at 11am is somebody's brunch.
  const atNight = photos.filter((p) => {
    const h = p.takenAt.getHours();
    return h >= 18 || h < 2;
  }).length;
  const nightRatio = atNight / n;

  const spanMin = (cluster.end - cluster.start) / 60000;

  let s = 0;
  s += Math.min(nightRatio, 1) * 0.5;          // when
  s += Math.min(n / 6, 1) * 0.3;               // how many — a gig generates a burst
  s += spanMin >= 20 && spanMin <= 300 ? 0.2   // how long — a set, not a snapshot
    : spanMin > 300 ? 0.05 : 0;
  return Math.round(Math.min(s, 1) * 100) / 100;
}

/**
 * Group photo metadata into candidate nights.
 *
 * `items`: `[{ file, takenAt, lat, lon, exact }]` — anything without a
 * `takenAt` is dropped, since a cluster with no date can't become a show.
 */
export function clusterPhotos(items) {
  const usable = (items || []).filter((i) => i?.takenAt instanceof Date && !Number.isNaN(i.takenAt.getTime()));
  if (!usable.length) return [];

  const sorted = [...usable].sort((a, b) => a.takenAt - b.takenAt);
  const clusters = [];
  let cur = null;

  for (const item of sorted) {
    // A new cluster starts on a big time gap OR when the night rolls over —
    // two shows on consecutive evenings can be less than four hours apart in
    // wall-clock terms if one ran late and the next started early.
    const sameNight = cur && showDateOf(item.takenAt) === cur.date;
    const closeEnough = cur && item.takenAt - cur.end <= GAP_MS;
    if (!cur || !sameNight || !closeEnough) {
      cur = { date: showDateOf(item.takenAt), photos: [], start: item.takenAt, end: item.takenAt };
      clusters.push(cur);
    }
    cur.photos.push(item);
    cur.end = item.takenAt;
  }

  return clusters
    .map((c) => {
      const withGps = c.photos.filter((p) => p.lat != null && p.lon != null);
      return {
        ...c,
        // Any photo whose time came from `lastModified` rather than EXIF makes
        // the whole cluster's date soft — the review step says so.
        exact: c.photos.every((p) => p.exact),
        // Mean position, when the OS didn't strip it. Often absent: iOS drops
        // GPS through a file input unless the user granted full library access.
        lat: withGps.length ? withGps.reduce((a, p) => a + p.lat, 0) / withGps.length : null,
        lon: withGps.length ? withGps.reduce((a, p) => a + p.lon, 0) / withGps.length : null,
        confidence: concertScore(c),
      };
    })
    .sort((a, b) => b.start - a.start); // newest night first
}

/**
 * Drop clusters for nights already in the library — re-proposing a show the
 * user logged years ago is how this feature becomes annoying instead of useful.
 */
export const withoutLogged = (clusters, shows) => {
  const taken = new Set((shows || []).map((s) => s.date).filter(Boolean));
  return (clusters || []).filter((c) => !taken.has(c.date));
};

/** Only the clusters worth showing, best-looking first. */
export const likelyShows = (clusters, min = 0.45) =>
  (clusters || []).filter((c) => c.confidence >= min);
