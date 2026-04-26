/**
 * Build chronological timeline: years ascending, shows oldest→newest within year.
 */
export function buildMusicJourneyTimeline(attended) {
  if (!Array.isArray(attended) || attended.length === 0) {
    return { firstShow: null, yearGroups: [] };
  }
  const sorted = [...attended].sort(
    (a, b) => new Date(a.date) - new Date(b.date),
  );
  const firstShow = sorted[0];
  const byYear = new Map();
  for (const s of sorted) {
    const y = new Date(s.date).getFullYear();
    if (!byYear.has(y)) {
      byYear.set(y, []);
    }
    byYear.get(y).push(s);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const yearGroups = years.map((year) => {
    const shows = [...byYear.get(year)].sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );
    const cities = new Set(
      shows.map((s) => String(s.city ?? '').trim()).filter(Boolean),
    );
    return {
      cityCount: cities.size,
      showCount: shows.length,
      shows,
      year,
    };
  });
  return { firstShow, yearGroups };
}
