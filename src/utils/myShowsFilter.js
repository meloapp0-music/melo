export const SORT_KEYS = {
  artist: 'artist',
  city: 'city',
  rating: 'rating',
  recent: 'recent',
};

export function filterShowsByQuery(shows, query) {
  const n = query.trim().toLowerCase();
  if (!n) {
    return shows;
  }
  return shows.filter((s) =>
    [s.artist, s.venue, s.city].some((field) =>
      (field || '').toLowerCase().includes(n),
    ),
  );
}

function scoreInBucket(score, bucket) {
  if (score == null) {
    return false;
  }
  switch (bucket) {
    case '9-10':
      return score >= 9;
    case '7-8':
      return score >= 7 && score < 9;
    case '5-6':
      return score >= 5 && score < 7;
    case '0-5':
      return score < 5;
    default:
      return false;
  }
}

function showMatchesChip(show, chipId) {
  const i = chipId.indexOf(':');
  if (i < 0) {
    return true;
  }
  const type = chipId.slice(0, i);
  const val = chipId.slice(i + 1);
  switch (type) {
    case 'year':
      return String(show.year) === val;
    case 'city':
      return show.city === decodeURIComponent(val);
    case 'genre':
      return show.genre === decodeURIComponent(val);
    case 'score':
      return scoreInBucket(show.score, val);
    default:
      return true;
  }
}

export function filterShowsByChips(shows, activeChipIds) {
  if (!activeChipIds.size) {
    return shows;
  }
  const groups = {};
  for (const id of activeChipIds) {
    const j = id.indexOf(':');
    if (j < 0) {
      continue;
    }
    const type = id.slice(0, j);
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(id);
  }
  return shows.filter((show) =>
    Object.values(groups).every((chipIds) =>
      chipIds.some((cid) => showMatchesChip(show, cid)),
    ),
  );
}

export function sortShows(shows, sortKey) {
  const out = [...shows];
  switch (sortKey) {
    case SORT_KEYS.rating:
      return out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    case SORT_KEYS.artist:
      return out.sort((a, b) => a.artist.localeCompare(b.artist));
    case SORT_KEYS.city:
      return out.sort((a, b) => a.city.localeCompare(b.city));
    case SORT_KEYS.recent:
    default:
      return out.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
  }
}

export function buildChipOptions(shows) {
  const years = [...new Set(shows.map((s) => s.year).filter(Boolean))].sort(
    (a, b) => b - a,
  );
  const cities = [...new Set(shows.map((s) => s.city).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
  const genres = [...new Set(shows.map((s) => s.genre).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
  const scoreBuckets = [
    { id: 'score:9-10', label: '9–10' },
    { id: 'score:7-8', label: '7–8' },
    { id: 'score:5-6', label: '5–6' },
    { id: 'score:0-5', label: '<5' },
  ];
  return {
    cities: cities.map((c) => ({
      id: `city:${encodeURIComponent(c)}`,
      label: c,
    })),
    genres: genres.map((g) => ({
      id: `genre:${encodeURIComponent(g)}`,
      label: g,
    })),
    scoreBuckets,
    years: years.map((y) => ({ id: `year:${y}`, label: String(y) })),
  };
}
