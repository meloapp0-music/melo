import theme from '../theme';

const CITY_COUNTRY_FALLBACK = {
  'New York': 'USA',
  Morrison: 'USA',
  Manchester: 'UK',
  'Los Angeles': 'USA',
  Brooklyn: 'USA',
  Nashville: 'USA',
  London: 'UK',
  Chicago: 'USA',
  Reykjavík: 'Iceland',
  Toronto: 'Canada',
};

export const MUSIC_DNA_COLORS = theme.musicDna.segmentColors;

export function countryForShow(show) {
  const c = show?.country?.trim();
  if (c) {
    return c;
  }
  const city = show?.city?.trim();
  return CITY_COUNTRY_FALLBACK[city] ?? '';
}

export function isNightOwlShow(show) {
  const d = new Date(show.date);
  if (Number.isNaN(d.getTime())) {
    return false;
  }
  return d.getHours() >= 23;
}

export function hasFestivalVeteranShow(shows) {
  return (shows ?? []).some((s) => (s.supportActs?.length ?? 0) >= 5);
}

export function computeResumeStats(attended) {
  const shows = attended ?? [];
  const totalShows = shows.length;
  const artists = new Set(shows.map((s) => s.artist?.trim()).filter(Boolean));
  const cities = new Set(shows.map((s) => s.city?.trim()).filter(Boolean));
  const countries = new Set(
    shows.map(countryForShow).filter(Boolean),
  );

  return {
    citiesVisited: cities.size,
    countriesVisited: countries.size,
    nightOwl: shows.some(isNightOwlShow),
    festivalVeteran: hasFestivalVeteranShow(shows),
    totalShows,
    uniqueArtists: artists.size,
  };
}

export function computeGenreBreakdown(attended) {
  const shows = attended ?? [];
  const counts = new Map();
  for (const s of shows) {
    const g = s.genre?.trim() || 'Other';
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const total = shows.length;
  if (total === 0) {
    return [];
  }
  return [...counts.entries()]
    .map(([genre, count]) => ({
      genre,
      count,
      pct: count / total,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Min share of bar width to show genre label inside the segment (else legend row). */
export const DNA_INLINE_LABEL_MIN_PCT = 0.12;

export function buildMilestones(stats) {
  const {
    totalShows,
    citiesVisited,
    countriesVisited,
    nightOwl,
    festivalVeteran,
  } = stats;

  return [
    {
      description: 'Your journey began',
      emoji: '🎤',
      id: 'first',
      name: 'First Show',
      unlocked: totalShows >= 1,
    },
    {
      description: 'Double digits',
      emoji: '🔥',
      id: 'shows10',
      name: '10 Shows',
      unlocked: totalShows >= 10,
    },
    {
      description: 'Quarter century',
      emoji: '⚡',
      id: 'shows25',
      name: '25 Shows',
      unlocked: totalShows >= 25,
    },
    {
      description: 'Hall of fame',
      emoji: '👑',
      id: 'shows50',
      name: '50 Shows',
      unlocked: totalShows >= 50,
    },
    {
      description: 'Always on the road',
      emoji: '🗺️',
      id: 'cities5',
      name: '5 Cities',
      unlocked: citiesVisited >= 5,
    },
    {
      description: 'Passport getting full',
      emoji: '🌍',
      id: 'countries3',
      name: '3 Countries',
      unlocked: countriesVisited >= 3,
    },
    {
      description: 'Main act after 11pm',
      emoji: '🌙',
      id: 'nightOwl',
      name: 'Night Owl',
      unlocked: nightOwl,
    },
    {
      description: '5+ openers on one bill',
      emoji: '🎪',
      id: 'festival',
      name: 'Festival Veteran',
      unlocked: festivalVeteran,
    },
  ];
}
