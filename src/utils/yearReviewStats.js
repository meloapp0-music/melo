/**
 * Aggregate stats for attended shows in a given calendar year.
 */
export function buildYearReview(attended, year) {
  const inYear = attended.filter((s) => {
    const d = new Date(s.date);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === year;
  });

  const totalShows = inYear.length;

  const artistCounts = new Map();
  const venueCounts = new Map();
  const cityCounts = new Map();
  const monthCounts = Array(12).fill(0);
  const vibeCounts = new Map();
  let scoreSum = 0;
  let scoreN = 0;

  for (const s of inYear) {
    const a = (s.artist || '').trim();
    if (a) {
      artistCounts.set(a, (artistCounts.get(a) || 0) + 1);
    }
    const v = (s.venue || '').trim();
    if (v) {
      venueCounts.set(v, (venueCounts.get(v) || 0) + 1);
    }
    const c = (s.city || '').trim();
    if (c) {
      cityCounts.set(c, (cityCounts.get(c) || 0) + 1);
    }
    const d = new Date(s.date);
    if (!Number.isNaN(d.getTime())) {
      monthCounts[d.getMonth()] += 1;
    }
    if (typeof s.score === 'number' && !Number.isNaN(s.score)) {
      scoreSum += s.score;
      scoreN += 1;
    }
    const vibeList = Array.isArray(s.vibes) ? s.vibes : [];
    for (const id of vibeList) {
      if (id == null || id === '') {
        continue;
      }
      vibeCounts.set(id, (vibeCounts.get(id) || 0) + 1);
    }
  }

  const topEntry = (map) => {
    let best = null;
    let bestN = -1;
    for (const [k, n] of map) {
      if (n > bestN) {
        bestN = n;
        best = k;
      }
    }
    return best;
  };

  const avgScore = scoreN > 0 ? scoreSum / scoreN : null;

  let topVibe = null;
  let topVibeN = 0;
  for (const [id, n] of vibeCounts) {
    if (n > topVibeN) {
      topVibeN = n;
      topVibe = id;
    }
  }

  return {
    artistCounts,
    avgScore,
    cityCounts,
    inYear,
    monthCounts,
    scoreN,
    topArtist: topEntry(artistCounts),
    topCity: topEntry(cityCounts),
    topVenue: topEntry(venueCounts),
    totalShows,
    topVibe,
    topVibeCount: topVibeN,
    venueCounts,
    vibeCounts,
  };
}
