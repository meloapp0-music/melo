import { distanceKmKm } from './geoDistance';
import { geocodeCity } from './cityGeocode';

/**
 * Shows per year, average score per year, top lists, busiest month, total travel km.
 */
export async function buildDeepStats(attended, homeLatLng, signal) {
  const byYear = new Map();
  const scoreByYear = new Map();
  const scoreCountByYear = new Map();
  const artistCounts = new Map();
  const venueCounts = new Map();
  const cityCounts = new Map();
  const monthCounts = Array(12).fill(0);

  for (const s of attended) {
    const d = new Date(s.date);
    if (Number.isNaN(d.getTime())) {
      continue;
    }
    const y = d.getFullYear();
    byYear.set(y, (byYear.get(y) || 0) + 1);
    monthCounts[d.getMonth()] += 1;

    if (typeof s.score === 'number' && !Number.isNaN(s.score)) {
      scoreByYear.set(y, (scoreByYear.get(y) || 0) + s.score);
      scoreCountByYear.set(y, (scoreCountByYear.get(y) || 0) + 1);
    }

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
  }

  const yearsSorted = [...byYear.keys()].sort((a, b) => a - b);
  const showsPerYear = yearsSorted.map((year) => ({
    count: byYear.get(year) || 0,
    year,
  }));

  const avgScorePerYear = yearsSorted.map((year) => {
    const sum = scoreByYear.get(year) || 0;
    const n = scoreCountByYear.get(year) || 0;
    return {
      avg: n > 0 ? sum / n : null,
      year,
    };
  });

  const topN = (map, n) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name, count]) => ({ count, name }));

  let busiestMonth = 0;
  let busiestMonthN = -1;
  monthCounts.forEach((n, i) => {
    if (n > busiestMonthN) {
      busiestMonthN = n;
      busiestMonth = i;
    }
  });

  let totalKm = 0;
  if (
    homeLatLng &&
    typeof homeLatLng.lat === 'number' &&
    typeof homeLatLng.lng === 'number'
  ) {
    const seen = new Set();
    for (const s of attended) {
      const city = (s.city || '').trim();
      if (!city) {
        continue;
      }
      const key = `${city}|${(s.country || '').trim()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      try {
        const loc = await geocodeCity(city, s.country, signal);
        if (loc) {
          totalKm += distanceKmKm(
            homeLatLng.lat,
            homeLatLng.lng,
            loc.lat,
            loc.lng,
          );
        }
      } catch {
        /* skip */
      }
    }
  }

  return {
    artistTop5: topN(artistCounts, 5),
    avgScorePerYear,
    busiestMonth,
    busiestMonthCount: busiestMonthN,
    cityTop5: topN(cityCounts, 5),
    monthCounts,
    showsPerYear,
    totalKm,
    venueTop5: topN(venueCounts, 5),
    yearsSorted,
  };
}
