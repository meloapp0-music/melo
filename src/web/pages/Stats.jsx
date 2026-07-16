import { useMemo, useState } from 'react';
import { useApp } from '../App';
import {
  isAttended, calculateStreak, groupIntoOutings, getArtistGradient, festivalKey,
  getYear, getWrappedYears, wrappedLabel,
} from '../store';

// A dedicated "your live-music life in numbers" page — its own nav tab, so the
// numbers are a destination instead of clutter on Home. Concert-specific: the
// stat grid, streak, most-seen artists, and top genres. Per the v1.5
// home-declutter initiative (Buddies tab → Profile, this took its slot).
//
// A YEAR FILTER (All Time · every logged year, descending) scopes every stat.
// It renders only when there are ≥2 distinct years — with 0–1 years there's
// nothing to filter and the page is what it always was. Design settled by a
// 3-lens panel; see docs/initiatives/2026-07-15-stats-year-filter.md. The two
// non-obvious calls it made:
//  - Streak: a specific year shows only "Longest Streak" (within that year).
//    calculateStreak's `current` is anchored to today, so it's meaningless for
//    a past year and leaks prior-year months into the current year — never
//    shown under a year label.
//  - Tiles that jump to all-time lists go inert in year scope (a scoped "3
//    Shows" must not link to an 87-row all-time list); rows that open a single
//    entity's own page stay live.
export default function Stats() {
  const { shows, navigate, getArtistImage, setSelectedVenue, setSelectedArtist } = useApp();

  const attended = useMemo(() => shows.filter(isAttended), [shows]);
  const years = useMemo(() => getWrappedYears(shows), [shows]); // descending; each has ≥1 attended show

  const [scope, setScope] = useState('all'); // 'all' | year number
  const activeYear = years.includes(scope) ? scope : 'all'; // fall back if the selected year disappears

  // The one filter that re-scopes the whole page: every derived memo below keys
  // off `scoped`, so the grid, streak, most-seen, venues, cities, and genres
  // all recompute together.
  const scoped = useMemo(
    () => (activeYear === 'all' ? attended : attended.filter((sh) => getYear(sh.date) === activeYear)),
    [attended, activeYear]
  );
  const outings = useMemo(() => groupIntoOutings(scoped), [scoped]);

  // Streak: all-time uses the full history (current + longest); a year shows
  // only the longest consecutive-month run WITHIN that year.
  const streak = useMemo(() => calculateStreak(shows), [shows]);
  const yearLongest = useMemo(() => calculateStreak(scoped).longest, [scoped]);

  const s = useMemo(() => {
    const artistCounts = new Map();
    const venueCounts = new Map();
    const cityCounts = new Map();
    const venues = new Set();
    const songKeys = new Set();
    scoped.forEach((sh) => {
      if (sh.artist) artistCounts.set(sh.artist, (artistCounts.get(sh.artist) || 0) + 1);
      if (sh.city) cityCounts.set(sh.city, (cityCounts.get(sh.city) || 0) + 1);
      // Skip festival stages ("Sahara Tent" etc.) — they'd pollute Top Venues
      // and the venue count. Festivals are their own thing, not a "room".
      if (sh.venue && !festivalKey(sh)) { venues.add(sh.venue); venueCounts.set(sh.venue, (venueCounts.get(sh.venue) || 0) + 1); }
      (sh.setlist || []).forEach((song) => {
        const k = song?.toLowerCase().trim();
        if (k) songKeys.add(`${sh.artist}|${k}`);
      });
    });
    const cities = new Set(cityCounts.keys());
    // Average scored the same way Home does: a festival counts as ONE outing.
    let sum = 0;
    let n = 0;
    outings.forEach((o) => {
      const sc = o.isFestival ? o.score : (o.show?.score || 0);
      if (sc > 0) { sum += sc; n += 1; }
    });
    return {
      shows: outings.length,
      artists: artistCounts.size,
      cities: cities.size,
      venues: venues.size,
      songs: songKeys.size,
      avg: n ? sum / n : 0,
      ratedN: n,
      topArtists: [...artistCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      topVenues: [...venueCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      topCities: [...cityCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c),
    };
  }, [scoped, outings]);

  const genreCounts = useMemo(() => {
    const map = {};
    scoped.forEach((sh) => { if (sh.genre) map[sh.genre] = (map[sh.genre] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [scoped]);
  const maxGenre = genreCounts.length ? genreCounts[0][1] : 1;

  const avgLabel = s.ratedN === 0 ? '—' : (Number.isInteger(s.avg) ? s.avg : s.avg.toFixed(1));

  const subtitle = activeYear === 'all'
    ? 'Your live-music life, by the numbers.'
    : wrappedLabel(activeYear) === 'So Far'
      ? `Your ${activeYear} so far.`
      : `Your ${activeYear} in live music.`;

  // Tiles used to go inert in year scope, because a year-scoped "3 Shows" must
  // not open an 87-row all-time list. The real fix was to make the destinations
  // year-aware, which they now are: navigate() carries the year and each page
  // scopes itself (see components/YearScope). So everything stays tappable.
  const navYear = activeYear === 'all' ? undefined : activeYear;

  if (attended.length === 0) {
    return (
      <div className="page">
        <div className="shows-header" style={{ marginBottom: 8 }}><h1>Your Stats</h1></div>
        <p style={{ color: 'var(--brown-muted)', fontSize: 15, marginTop: 4 }}>
          Log your first show and your live-music stats will start filling in here.
        </p>
      </div>
    );
  }

  // A stat tile: a navigating <button> in all-time scope, an inert <div> in a
  // year scope. `to` omitted → always static (the Venues tile).
  const Tile = ({ num, label, to }) => {
    if (to) {
      return (
        <button type="button" className="stats-tile" onClick={() => navigate(to, { year: navYear })}>
          <div className="stats-tile-num">{num}</div><div className="stats-tile-label">{label}</div>
        </button>
      );
    }
    // No destination (Venues had none) → static, but still tappable-looking is
    // wrong, so keep the -static class.
    return (
      <div className="stats-tile stats-tile-static">
        <div className="stats-tile-num">{num}</div><div className="stats-tile-label">{label}</div>
      </div>
    );
  };

  return (
    <div className="page">
      <div className="shows-header" style={{ marginBottom: 4 }}><h1>Your Stats</h1></div>
      <p style={{ color: 'var(--brown-muted)', fontSize: 14, marginTop: 0, marginBottom: 18 }}>
        {subtitle}
      </p>

      {years.length >= 2 && (
        <div className="shows-filters">
          <button
            type="button"
            className={`filter-chip${activeYear === 'all' ? ' active' : ''}`}
            onClick={() => setScope('all')}
          >
            All Time
          </button>
          {years.map((y) => (
            <button
              key={y}
              type="button"
              className={`filter-chip${activeYear === y ? ' active' : ''}`}
              onClick={() => setScope(y)}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      <div className="stats-grid">
        <Tile num={s.shows} label="Shows" to="shows" />
        <Tile num={s.artists} label="Artists" to="artists" />
        <Tile num={s.cities} label="Cities" to="map" />
        <Tile num={s.songs} label="Songs" to="songs" />
        <Tile num={s.venues} label="Venues" to="venues" />
        <Tile num={avgLabel} label="Avg Score" to="rankings" />
      </div>

      {/* All Time: current + longest. A year: longest-within-year only, and only
          when it's an actual run (≥2) — a lone "1" isn't a streak. */}
      {activeYear === 'all' ? (
        (streak.current > 0 || streak.longest > 0) && (
          <div className="profile-streak">
            <div className="profile-streak-card">
              <div className="profile-streak-num">🔥 {streak.current}</div>
              <div className="profile-streak-label">Current Streak</div>
            </div>
            <div className="profile-streak-card">
              <div className="profile-streak-num">⚡ {streak.longest}</div>
              <div className="profile-streak-label">Longest Streak</div>
            </div>
          </div>
        )
      ) : yearLongest >= 2 && (
        <div className="profile-streak">
          <div className="profile-streak-card">
            <div className="profile-streak-num">⚡ {yearLongest}</div>
            <div className="profile-streak-label">Longest Streak</div>
          </div>
        </div>
      )}

      {s.topArtists.length > 0 && (
        <div className="profile-section">
          <h3>Most Seen</h3>
          <div className="stats-artists">
            {s.topArtists.map(([name, count], i) => {
              const img = getArtistImage(name);
              return (
                <button key={name} type="button" className="stats-artist-row" onClick={() => setSelectedArtist({ name })}>
                  <span className="stats-artist-rank">{i + 1}</span>
                  <span
                    className="stats-artist-thumb"
                    style={img
                      ? { background: `url("${img}") center / cover no-repeat, ${getArtistGradient(name)}` }
                      : { background: getArtistGradient(name) }}
                  />
                  <span className="stats-artist-name">{name}</span>
                  <span className="stats-artist-count">{count}×</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {s.topVenues.length > 0 && (
        <div className="profile-section">
          <div className="home-section-title">
            <h3>Top Venues</h3>
            <button className="home-see-all" onClick={() => navigate('venues', { year: navYear })}>See all</button>
          </div>
          <div className="stats-artists">
            {s.topVenues.map(([name, count], i) => (
              <button key={name} type="button" className="stats-artist-row" onClick={() => setSelectedVenue({ name })}>
                <span className="stats-artist-rank">{i + 1}</span>
                <span className="stats-artist-name">📍 {name}</span>
                <span className="stats-artist-count">{count}×</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {s.topCities.length > 0 && (
        <div className="profile-section">
          <div className="home-section-title">
            <h3>Cities</h3>
            <button className="home-see-all" onClick={() => navigate('map', { year: navYear })}>Map</button>
          </div>
          <div className="stats-city-chips">
            {s.topCities.map((c) => (
              <button key={c} type="button" className="stats-city-chip" onClick={() => navigate('map', { year: navYear })}>{c}</button>
            ))}
          </div>
        </div>
      )}

      {genreCounts.length > 0 && (
        <div className="profile-section">
          <h3>Top Genres</h3>
          <div className="genre-chart">
            {genreCounts.map(([genre, count]) => (
              <div key={genre} className="genre-row">
                <div className="genre-label">{genre}</div>
                <div className="genre-bar-wrap">
                  <div className="genre-bar" style={{ width: `${(count / maxGenre) * 100}%` }}>{count}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
}
