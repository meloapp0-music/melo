import { useMemo } from 'react';
import { useApp } from '../App';
import { isAttended, calculateStreak, groupIntoOutings, getArtistGradient, festivalKey } from '../store';

// A dedicated "your live-music life in numbers" page — its own nav tab, so the
// numbers are a destination instead of clutter on Home. Concert-specific: the
// stat grid, streak, most-seen artists, and top genres. Per the v1.5
// home-declutter initiative (Buddies tab → Profile, this took its slot).
export default function Stats() {
  const { shows, navigate, getArtistImage, setSelectedVenue } = useApp();

  const attended = useMemo(() => shows.filter(isAttended), [shows]);
  const outings = useMemo(() => groupIntoOutings(attended), [attended]);
  const streak = useMemo(() => calculateStreak(shows), [shows]);

  const s = useMemo(() => {
    const artistCounts = new Map();
    const venueCounts = new Map();
    const cityCounts = new Map();
    const venues = new Set();
    const songKeys = new Set();
    attended.forEach((sh) => {
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
  }, [attended, outings]);

  const genreCounts = useMemo(() => {
    const map = {};
    attended.forEach((sh) => { if (sh.genre) map[sh.genre] = (map[sh.genre] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [attended]);
  const maxGenre = genreCounts.length ? genreCounts[0][1] : 1;

  const avgLabel = s.ratedN === 0 ? '—' : (Number.isInteger(s.avg) ? s.avg : s.avg.toFixed(1));

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

  return (
    <div className="page">
      <div className="shows-header" style={{ marginBottom: 4 }}><h1>Your Stats</h1></div>
      <p style={{ color: 'var(--brown-muted)', fontSize: 14, marginTop: 0, marginBottom: 18 }}>
        Your live-music life, by the numbers.
      </p>

      <div className="stats-grid">
        <button type="button" className="stats-tile" onClick={() => navigate('shows')}>
          <div className="stats-tile-num">{s.shows}</div><div className="stats-tile-label">Shows</div>
        </button>
        <button type="button" className="stats-tile" onClick={() => navigate('artists')}>
          <div className="stats-tile-num">{s.artists}</div><div className="stats-tile-label">Artists</div>
        </button>
        <button type="button" className="stats-tile" onClick={() => navigate('map')}>
          <div className="stats-tile-num">{s.cities}</div><div className="stats-tile-label">Cities</div>
        </button>
        <button type="button" className="stats-tile" onClick={() => navigate('songs')}>
          <div className="stats-tile-num">{s.songs}</div><div className="stats-tile-label">Songs</div>
        </button>
        <div className="stats-tile">
          <div className="stats-tile-num">{s.venues}</div><div className="stats-tile-label">Venues</div>
        </div>
        <button type="button" className="stats-tile" onClick={() => navigate('rankings')}>
          <div className="stats-tile-num">{avgLabel}</div><div className="stats-tile-label">Avg Score</div>
        </button>
      </div>

      {(streak.current > 0 || streak.longest > 0) && (
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
      )}

      {s.topArtists.length > 0 && (
        <div className="profile-section">
          <h3>Most Seen</h3>
          <div className="stats-artists">
            {s.topArtists.map(([name, count], i) => {
              const img = getArtistImage(name);
              return (
                <button key={name} type="button" className="stats-artist-row" onClick={() => navigate('artists')}>
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
            <button className="home-see-all" onClick={() => navigate('venues')}>See all</button>
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
            <button className="home-see-all" onClick={() => navigate('map')}>Map</button>
          </div>
          <div className="stats-city-chips">
            {s.topCities.map((c) => (
              <button key={c} type="button" className="stats-city-chip" onClick={() => navigate('map')}>{c}</button>
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
