import { useState, useEffect, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { useApp } from '../App';
import {
  getArtistGradient, getGreeting, formatDate, daysUntil,
  calculateStreak, getWrappedYears, wrappedLabel, DISCOVERY_ARTISTS,
  isAttended, isGoing, SHOW_STATUS, ticketmasterSearchUrl,
} from '../store';
import { fetchAllUpcomingEvents, fetchDiscoveryEvents } from '../api';
import { MeloIcon } from '../components/MeloLogo';
import FriendsFeed from '../components/FriendsFeed';

// Day-precision local midnight; safer than `new Date()` for relative
// "is this date in the past" comparisons against `YYYY-MM-DD` strings.
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export default function Home() {
  const { shows, dayStamp, profile, setSelectedShow, navigate, getArtistImage, prefetchImages, addShow, setWrappedYear, setLogEditTarget } = useApp();

  // One-time nudge to set music taste (existing users never saw the
  // onboarding step). Drives the "artist in your city" alerts + Discover.
  const [tasteDismissed, setTasteDismissed] = useState(() => {
    try { return !!localStorage.getItem('melo_taste_dismissed'); } catch { return false; }
  });
  const showTastePrompt = !!profile &&
    (profile.favGenres?.length || 0) === 0 &&
    (profile.favArtists?.length || 0) === 0 &&
    !tasteDismissed;
  const dismissTaste = () => {
    try { localStorage.setItem('melo_taste_dismissed', '1'); } catch {}
    setTasteDismissed(true);
  };
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
  //
  // Shows within the next 7 days graduate out of the rail into the
  // full-width "Up Next" hero section at the top of the page.
  // dayStamp in the deps re-buckets everything when the date rolls over
  // while the webview stays alive in the iOS app switcher overnight.
  const upNext = useMemo(() => {
    return shows
      .filter(isGoing)
      .filter((s) => {
        const d = daysUntil(s.date);
        return d >= 0 && d <= 7;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shows, dayStamp]);

  const goingFuture = useMemo(() => {
    return shows
      .filter(isGoing)
      .filter((s) => daysUntil(s.date) > 7)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shows, dayStamp]);

  const goingPast = useMemo(() => {
    const t = today();
    return shows
      .filter(isGoing)
      .filter((s) => new Date(s.date + 'T00:00:00') < t)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shows, dayStamp]);

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
      .then((events) => {
        const sliced = events.slice(0, 12);
        setUpcoming(sliced);
        // Kick off Deezer photo lookups for any artists we don't already
        // have cached — replaces the gradient placeholder once images arrive.
        prefetchImages(sliced.map((e) => e.artist).filter(Boolean));
      })
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
      .then((events) => {
        setDiscovery(events);
        prefetchImages(events.map((e) => e.artist).filter(Boolean));
      })
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
      {showTastePrompt && (
        <div className="taste-prompt fade-in">
          <button className="taste-prompt-x" onClick={dismissTaste} aria-label="Dismiss">×</button>
          <div className="taste-prompt-icon" aria-hidden="true">🎧</div>
          <div className="taste-prompt-body">
            <div className="taste-prompt-title">Tell us your music taste</div>
            <div className="taste-prompt-sub">Get a heads-up when artists you love play your city.</div>
          </div>
          <button className="taste-prompt-cta" onClick={() => navigate('settings')}>Set it up →</button>
        </div>
      )}
      <div className="home-hero">
        <div className="home-brand-row">
          <MeloIcon size={32} />
        </div>
        <h1 className="home-greeting">{getGreeting()}</h1>
        <p className="home-greeting-sub">
          {shows.length === 0
            ? 'Let’s get your first show in the books.'
            : 'Your concert journey awaits'}
        </p>
      </div>

      {/* First-run guidance — only renders for users with zero shows of
          any status. Disappears the moment they log anything. Three
          parallel paths so different mental models all find a way in:
          log one manually, bulk-import past shows from Calendar (iOS
          only), or browse upcoming festivals to wishlist. */}
      {shows.length === 0 && (
        <div className="home-firstrun fade-in">
          <h2 className="home-firstrun-title">Pick your way in</h2>
          <p className="home-firstrun-sub">
            Melo gets better with every show you log. Start anywhere.
          </p>
          <div className="home-firstrun-cards">
            <button
              type="button"
              className="home-firstrun-card"
              onClick={() => navigate('log')}
            >
              <div className="home-firstrun-icon" aria-hidden="true">🎤</div>
              <div className="home-firstrun-card-title">Log a show</div>
              <div className="home-firstrun-card-desc">
                Past or future. Score it, add a photo, save the story.
              </div>
            </button>

            {/* Calendar-import card hidden in v1.0 — the underlying
                Capacitor plugin (@ebarooni/capacitor-calendar 8.0.1)
                fails on iOS with "requestReadOnlyCalendarAccess is not
                implemented" even with all Info.plist permission strings
                in place. Re-enable for v1.1 after swapping plugins or
                upgrading to a fixed version. The page + JS lib are
                still in the repo, just unreachable from the UI. */}

            <button
              type="button"
              className="home-firstrun-card"
              onClick={() => navigate('festivals')}
            >
              <div className="home-firstrun-icon" aria-hidden="true">🎪</div>
              <div className="home-firstrun-card-title">Browse festivals</div>
              <div className="home-firstrun-card-desc">
                See what’s coming up near you and stake out your wishlist.
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Up Next — going shows within the week. Full-width hero cards,
          countdown-first, with Tickets + Details. The imminent shows
          earn the top of the page; everything further out stays in the
          "You're Going" rail below. */}
      {upNext.length > 0 && (
        <div className="upnext-section fade-in">
          <div className="home-section-title">
            <h3>Up Next</h3>
          </div>
          {upNext.map((show) => {
            const d = daysUntil(show.date);
            const countdown =
              d === 0 ? 'Tonight' :
                d === 1 ? 'Tomorrow' :
                  `In ${d} days`;
            return (
              <button
                key={show.id}
                type="button"
                className="upnext-card"
                onClick={() => setSelectedShow(show)}
                aria-label={`${show.artist} ${countdown.toLowerCase()} — view details`}
              >
                <div className="upnext-card-bg" style={bgStyle(show.artist)} />
                <div className="upnext-card-overlay" />
                <div className="upnext-card-content">
                  <div className="upnext-countdown">{countdown}</div>
                  <div className="upnext-artist">{show.artist}</div>
                  <div className="upnext-meta">
                    {[show.venue, show.city].filter(Boolean).join(', ')}
                    {show.date ? ` · ${formatDate(show.date)}` : ''}
                  </div>
                  <div className="upnext-btns">
                    <a
                      className="upnext-btn upnext-btn-tickets"
                      href={ticketmasterSearchUrl(show)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      🎟️ Tickets
                    </a>
                    <span className="upnext-btn upnext-btn-details" aria-hidden="true">
                      Details →
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

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
            <span className="wrapped-banner-title">Your {latestWrappedYear} {wrappedLabel(latestWrappedYear)}</span>
            <span className="wrapped-banner-sub">See your year in music 🎶</span>
          </div>
          <span className="wrapped-banner-arrow">→</span>
        </div>
      )}

      {/* Friends activity feed — "Claire went to Mumford & Sons".
          Renders nothing until the user has friends with visible shows. */}
      <FriendsFeed />

      {/* Going — upcoming shows the user has tickets for, with countdown */}
      {goingFuture.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="home-section-title">
            <h3>You're Going</h3>
            <button className="home-see-all" onClick={() => navigate('shows')}>See All</button>
          </div>
          <div className="home-scroll">
            {goingFuture.map((show) => {
              // Everything here is >7 days out (the Up Next section owns
              // the rest of this week), so days → weeks → months.
              const d = daysUntil(show.date);
              const countdown =
                d < 14 ? `in ${d} days` :
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
                      <a
                        className="upcoming-btn upcoming-btn-tickets"
                        href={ticketmasterSearchUrl(show)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Tickets
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Discover CTA — opens the Discover page (city shows + festivals) */}
      <div
        className="home-festival-cta"
        onClick={() => navigate('festivals')}
      >
        <div className="home-festival-cta-text">
          <span className="home-festival-cta-title">Discover shows</span>
          <span className="home-festival-cta-sub">
            See who's playing in any city — concerts, festivals, tickets
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
