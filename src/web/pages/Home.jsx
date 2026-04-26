import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../App';
import {
  getArtistGradient, getGreeting, formatDate,
  calculateStreak, getWrappedYears, DISCOVERY_ARTISTS,
  isAttended, isGoing, SHOW_STATUS,
} from '../store';
import { fetchAllUpcomingEvents, fetchDiscoveryEvents } from '../api';
import { MeloIcon } from '../components/MeloLogo';

// Day-precision UTC midnight; safer than `new Date()` for relative
// "is this date in the past" comparisons against `YYYY-MM-DD` strings.
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysUntil = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  const diff = (d - today()) / (1000 * 60 * 60 * 24);
  return Math.round(diff);
};

export default function Home() {
  const { shows, setSelectedShow, navigate, getArtistImage, addShow, setWrappedYear, setLogEditTarget } = useApp();
  const attended = shows.filter(isAttended);
  const cities = new Set(attended.map((s) => s.city));
  const artists = new Set(attended.map((s) => s.artist));
  const avgScore =
    attended.length > 0
      ? (attended.reduce((sum, s) => sum + s.score, 0) / attended.length).toFixed(1)
      : 0;

  const sorted = [...attended].sort((a, b) => new Date(b.date) - new Date(a.date));
  const recent = sorted.slice(0, 8);
  const topRated = [...attended].sort((a, b) => b.score - a.score)[0];

  // Going shows split by date — future ones get a countdown card,
  // past ones get a "How was it?" CTA that converts them to Attended
  // and opens the score editor pre-filled.
  const goingFuture = useMemo(() => {
    const t = today();
    return shows
      .filter(isGoing)
      .filter((s) => new Date(s.date + 'T00:00:00') >= t)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 3);
  }, [shows]);

  const goingPast = useMemo(() => {
    const t = today();
    return shows
      .filter(isGoing)
      .filter((s) => new Date(s.date + 'T00:00:00') < t)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3);
  }, [shows]);

  // Streak
  const streak = useMemo(() => calculateStreak(shows), [shows]);

  // Wrapped years
  const wrappedYears = useMemo(() => getWrappedYears(shows), [shows]);
  const latestWrappedYear = wrappedYears[0];

  // Upcoming shows from Bandsintown
  const [upcoming, setUpcoming] = useState([]);
  const [upcomingLoading, setUpcomingLoading] = useState(false);

  useEffect(() => {
    if (attended.length === 0) return;
    const artistNames = [...new Set(attended.map((s) => s.artist))];
    setUpcomingLoading(true);
    fetchAllUpcomingEvents(artistNames)
      .then((events) => setUpcoming(events.slice(0, 12)))
      .catch(() => {})
      .finally(() => setUpcomingLoading(false));
  }, [attended.length]);

  // Discovery feed
  const [discovery, setDiscovery] = useState([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  useEffect(() => {
    if (attended.length === 0) return;
    const seenArtists = new Set(attended.map((s) => s.artist));
    const genreCounts = {};
    attended.forEach((s) => { if (s.genre) genreCounts[s.genre] = (genreCounts[s.genre] || 0) + 1; });
    const topGenres = Object.keys(genreCounts).sort((a, b) => genreCounts[b] - genreCounts[a]).slice(0, 3);
    const genreMap = {};
    topGenres.forEach((g) => { if (DISCOVERY_ARTISTS[g]) genreMap[g] = DISCOVERY_ARTISTS[g]; });
    const topCities = [...new Set(attended.map((s) => s.city).filter(Boolean))].slice(0, 5);

    if (Object.keys(genreMap).length === 0) return;
    setDiscoveryLoading(true);
    fetchDiscoveryEvents(genreMap, seenArtists, topCities)
      .then((events) => setDiscovery(events))
      .catch(() => {})
      .finally(() => setDiscoveryLoading(false));
  }, [attended.length]);

  const bgStyle = (artist) => {
    const img = getArtistImage(artist);
    return img
      ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: getArtistGradient(artist) };
  };

  const handleAddWishlist = (ev, e) => {
    e.stopPropagation();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    addShow({
      id, artist: ev.artist, date: ev.date, venue: ev.venue, city: ev.city,
      genre: '', score: 0, vibes: [], notes: '', setlist: [], buddies: [],
      status: SHOW_STATUS.WISHLIST, wishlist: true,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <div className="page">
      <div className="home-hero">
        <div className="home-brand-row">
          <MeloIcon size={32} />
        </div>
        <h1 className="home-greeting">{getGreeting()}</h1>
        <p className="home-greeting-sub">Your concert journey awaits</p>
      </div>

      {/* "How was [show]?" — past Going shows that need a score */}
      {goingPast.length > 0 && (
        <div className="going-recap fade-in">
          {goingPast.map((show) => (
            <button
              key={show.id}
              className="going-recap-card"
              onClick={() => setLogEditTarget(show)}
            >
              <div className="going-recap-thumb" style={bgStyle(show.artist)} />
              <div className="going-recap-body">
                <div className="going-recap-title">
                  How was {show.artist}?
                </div>
                <div className="going-recap-meta">
                  {show.venue ? `${show.venue} · ` : ''}{formatDate(show.date)} — tap to score
                </div>
              </div>
              <span className="going-recap-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      <div className="home-stats">
        <button
          type="button"
          className="home-stat home-stat-btn"
          onClick={() => navigate('shows')}
          aria-label={`${attended.length} shows — view all`}
        >
          <div className="home-stat-num">{attended.length}</div>
          <div className="home-stat-label">Shows</div>
        </button>
        <div className="home-stat-divider" />
        <button
          type="button"
          className="home-stat home-stat-btn"
          onClick={() => navigate('artists')}
          aria-label={`${artists.size} artists — view all`}
        >
          <div className="home-stat-num">{artists.size}</div>
          <div className="home-stat-label">Artists</div>
        </button>
        <div className="home-stat-divider" />
        <button
          type="button"
          className="home-stat home-stat-btn"
          onClick={() => navigate('map')}
          aria-label={`${cities.size} cities — view map`}
        >
          <div className="home-stat-num">{cities.size}</div>
          <div className="home-stat-label">Cities</div>
        </button>
        <div className="home-stat-divider" />
        <div className="home-stat">
          <div className="home-stat-num">{avgScore}</div>
          <div className="home-stat-label">Avg Score</div>
        </div>
        {streak.current > 0 && (
          <>
            <div className="home-stat-divider" />
            <div className="home-stat">
              <div className="home-stat-num streak-flame">🔥 {streak.current}</div>
              <div className="home-stat-label">Streak</div>
            </div>
          </>
        )}
      </div>

      {/* Streak nudge */}
      {streak.atRisk && (
        <div className="streak-nudge fade-in">
          🔥 Keep your streak alive — log a show this month!
        </div>
      )}

      {/* Wrapped Banner */}
      {latestWrappedYear && (
        <div
          className="wrapped-banner"
          onClick={() => setWrappedYear(latestWrappedYear)}
        >
          <div className="wrapped-banner-text">
            <span className="wrapped-banner-title">Your {latestWrappedYear} Wrapped</span>
            <span className="wrapped-banner-sub">See your year in music 🎶</span>
          </div>
          <span className="wrapped-banner-arrow">→</span>
        </div>
      )}

      {/* Going — upcoming shows the user has tickets for, with countdown */}
      {goingFuture.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="home-section-title">
            <h3>You're Going</h3>
            <button className="home-see-all" onClick={() => navigate('shows')}>See All</button>
          </div>
          <div className="home-scroll">
            {goingFuture.map((show) => {
              const d = daysUntil(show.date);
              const countdown =
                d <= 0 ? 'Today' :
                  d === 1 ? 'Tomorrow' :
                    d < 7 ? `in ${d} days` :
                      d < 30 ? `in ${Math.round(d / 7)} weeks` :
                        `in ${Math.round(d / 30)} months`;
              return (
                <div
                  key={show.id}
                  className="upcoming-card"
                  onClick={() => setSelectedShow(show)}
                >
                  <div className="upcoming-card-img" style={bgStyle(show.artist)}>
                    <div className="upcoming-card-date">{countdown}</div>
                  </div>
                  <div className="upcoming-card-body">
                    <div className="upcoming-card-artist">{show.artist}</div>
                    <div className="upcoming-card-venue">
                      {show.venue}{show.city ? `, ${show.city}` : ''}
                    </div>
                    <div className="upcoming-card-btns">
                      <div className="upcoming-btn upcoming-btn-going">
                        🎟️ {formatDate(show.date)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Festivals discovery CTA — opens the Festivals subpage */}
      <div
        className="home-festival-cta"
        onClick={() => navigate('festivals')}
      >
        <div className="home-festival-cta-text">
          <span className="home-festival-cta-title">Explore Festivals</span>
          <span className="home-festival-cta-sub">
            See which festivals your top artists are playing
          </span>
        </div>
        <span className="home-festival-cta-arrow">→</span>
      </div>

      {recent.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="home-section-title">
            <h3>Recent Shows</h3>
            <button className="home-see-all" onClick={() => navigate('shows')}>See All</button>
          </div>
          <div className="home-scroll">
            {recent.map((show) => (
              <div key={show.id} className="home-show-card" onClick={() => setSelectedShow(show)}>
                <div className="home-show-card-bg" style={bgStyle(show.artist)} />
                <div className="home-show-card-overlay" />
                <div className="home-show-card-score">{Math.round(show.score)}</div>
                <div className="home-show-card-info">
                  <div className="home-show-card-artist">{show.artist}</div>
                  <div className="home-show-card-venue">{show.venue}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discovery Feed */}
      {(discovery.length > 0 || discoveryLoading) && (
        <div style={{ marginBottom: 28 }}>
          <div className="home-section-title">
            <h3>You Might Like</h3>
          </div>
          {discoveryLoading && discovery.length === 0 ? (
            <div className="upcoming-loading">Finding shows for you...</div>
          ) : (
            <div className="home-scroll">
              {discovery.map((ev, i) => (
                <div key={i} className="upcoming-card">
                  <div className="upcoming-card-img" style={bgStyle(ev.artist)}>
                    <div className="upcoming-card-date">{formatDate(ev.date)}</div>
                  </div>
                  <div className="upcoming-card-body">
                    <div className="upcoming-card-artist">{ev.artist}</div>
                    <div className="upcoming-card-venue">{ev.venue}{ev.city ? `, ${ev.city}` : ''}</div>
                    <div className="upcoming-card-btns">
                      {ev.ticketUrl && (
                        <a className="upcoming-btn upcoming-btn-tickets" href={ev.ticketUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                          Get Tickets
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {topRated && (
        <div style={{ marginBottom: 28 }}>
          <div className="home-section-title"><h3>Top Rated</h3></div>
          <div className="home-top-card" onClick={() => setSelectedShow(topRated)}>
            <div className="gradient-bg" style={bgStyle(topRated.artist)} />
            <div className="home-top-overlay" />
            <div className="home-top-score">{Math.round(topRated.score)}</div>
            <div className="home-top-info">
              <div className="home-top-badge">&#9733; TOP RATED</div>
              <div className="home-top-artist">{topRated.artist}</div>
              <div className="home-top-meta">{topRated.venue} &middot; {formatDate(topRated.date)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Shows */}
      {(upcoming.length > 0 || upcomingLoading) && (
        <div style={{ marginBottom: 28 }}>
          <div className="home-section-title"><h3>Upcoming Shows</h3></div>
          {upcomingLoading && upcoming.length === 0 ? (
            <div className="upcoming-loading">Finding upcoming shows...</div>
          ) : (
            <div className="home-scroll">
              {upcoming.map((ev, i) => (
                <div key={i} className="upcoming-card">
                  <div className="upcoming-card-img" style={bgStyle(ev.artist)}>
                    <div className="upcoming-card-date">{formatDate(ev.date)}</div>
                  </div>
                  <div className="upcoming-card-body">
                    <div className="upcoming-card-artist">{ev.artist}</div>
                    <div className="upcoming-card-venue">{ev.venue}{ev.city ? `, ${ev.city}` : ''}</div>
                    <div className="upcoming-card-btns">
                      <button className="upcoming-btn upcoming-btn-wishlist" onClick={(e) => handleAddWishlist(ev, e)}>+ Wishlist</button>
                      {ev.ticketUrl && (
                        <a className="upcoming-btn upcoming-btn-tickets" href={ev.ticketUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Tickets</a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
