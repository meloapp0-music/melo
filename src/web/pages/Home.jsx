import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../App';
import {
  getArtistGradient, getGreeting, formatDate, daysUntil,
  calculateStreak,
  isAttended, isGoing, SHOW_STATUS, ticketmasterSearchUrl, festivalKey,
} from '../store';
import { fetchAllUpcomingEvents } from '../api';
import { attendeesForShows, friendsMatchingShows } from '../lib/db/shows';
import { getProfilesByIds } from '../lib/db/profiles';
import { MeloIcon } from '../components/MeloLogo';
import FriendsFeed from '../components/FriendsFeed';
import GetStarted from '../components/GetStarted';
import OnThisDay from '../components/OnThisDay';
import TasteNudge from '../components/TasteNudge';

// Day-precision local midnight; safer than `new Date()` for relative
// "is this date in the past" comparisons against `YYYY-MM-DD` strings.
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export default function Home() {
  const { shows, dayStamp, setSelectedShow, navigate, getArtistImage, prefetchImages, addShow, setLogEditTarget, showToast, profile } = useApp();

  const attended = shows.filter(isAttended);

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

  // Tagged co-attendees for the Up Next shows → "Going with …" on each card.
  const [upNextWith, setUpNextWith] = useState({}); // showId → [{userId,name,avatarUrl,avatarColor}]
  useEffect(() => {
    const ids = upNext.map((s) => s.id);
    if (!ids.length) { setUpNextWith({}); return; }
    let cancelled = false;
    (async () => {
      try {
        // "Going with" = tagged co-attendees ∪ friends who logged the SAME
        // artist+date as going (independent match, like the feed's group card).
        const pairs = upNext.map((s) => ({ artist: s.artist, date: s.date, festival: s.festival }));
        const [tagMap, indMap] = await Promise.all([
          attendeesForShows(ids).catch(() => new Map()),
          friendsMatchingShows(pairs, 'going').catch(() => new Map()),
        ]);
        // Festival acts match at the festival level (any day); else exact show.
        const key = (s) => festivalKey(s) || `${(s.artist || '').toLowerCase().trim()}|${s.date}`;
        const uids = [...new Set([
          ...[...tagMap.values()].flat(),
          ...[...indMap.values()].flat(),
        ].filter((id) => id && id !== profile?.id))];
        const profs = uids.length ? await getProfilesByIds(uids).catch(() => new Map()) : new Map();
        if (cancelled) return;
        const out = {};
        for (const s of upNext) {
          const merged = [...new Set([...(tagMap.get(s.id) || []), ...(indMap.get(key(s)) || [])])]
            .filter((id) => id && id !== profile?.id);
          if (!merged.length) continue;
          out[s.id] = merged.map((id) => {
            const p = profs.get(id);
            return { userId: id, name: p?.displayName || p?.username || 'Friend', avatarUrl: p?.avatarUrl, avatarColor: p?.avatarColor };
          });
        }
        setUpNextWith(out);
      } catch { if (!cancelled) setUpNextWith({}); }
    })();
    return () => { cancelled = true; };
  }, [upNext, profile?.id]);

  const withLabel = (people) => {
    const names = people.map((p) => p.name);
    return names.length <= 2 ? names.join(' & ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  };

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

  const bgStyle = (artist) => {
    const img = getArtistImage(artist);
    const grad = getArtistGradient(artist);
    // Gradient is always the base layer so a slow or failed photo never
    // leaves a blank card; the artist photo (if any) sits on top of it.
    return img
      ? { background: `url("${img}") center / cover no-repeat, ${grad}` }
      : { background: grad };
  };

  const [addedIds, setAddedIds] = useState(() => new Set());
  // Ticketmaster events have no stable id, so key on the same
  // artist|date|venue composite already used to dedupe them elsewhere.
  const wishlistKey = (ev) => `${ev.artist}|${ev.date}|${ev.venue}`;

  const handleAddWishlist = (ev, e) => {
    e.stopPropagation();
    const key = wishlistKey(ev);
    if (addedIds.has(key)) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    addShow({
      id, artist: ev.artist, date: ev.date, venue: ev.venue, city: ev.city,
      genre: '', score: 0, vibes: [], notes: '', setlist: [], buddies: [],
      status: SHOW_STATUS.WISHLIST, wishlist: true,
      createdAt: new Date().toISOString(),
    });
    setAddedIds((prev) => new Set(prev).add(key));
    showToast?.({ message: `🎟️ Added ${ev.artist} to your wishlist` });
  };

  return (
    <div className="page">
      <div className="home-hero">
        <div className="home-brand-row">
          <MeloIcon size={32} />
          <div className="home-brand-actions">
            {streak.current > 0 && (
              <span className="home-streak-chip" title="Your logging streak">🔥 {streak.current}</span>
            )}
            <button
              className="home-taste-btn"
              onClick={() => navigate('music-taste')}
              aria-label="Music taste & alerts"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
          </div>
        </div>
        <h1 className="home-greeting">{getGreeting()}</h1>
        <p className="home-greeting-sub">
          {shows.length === 0
            ? 'Let’s get your first show in the books.'
            : 'Every show you’ve ever seen, in one place.'}
        </p>
      </div>

      {/* First-run "starting navigation" — a 3-step activation checklist
          that ticks off against real state and vanishes once complete.
          Subsumes the old zero-show block + the music-taste prompt. */}
      {/* Renders only on an actual anniversary — absent almost every day. */}
      <OnThisDay />
      <GetStarted />

      {/* Second chance at "turn on alerts" for anyone who got past
          GetStarted without ever setting a taste — only shows in that gap
          (see TasteNudge's own gating), so it never doubles up with the
          GetStarted step above. */}
      <TasteNudge />

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
                  {upNextWith[show.id]?.length > 0 && (
                    <div className="upnext-with">
                      <div className="upnext-with-avatars">
                        {upNextWith[show.id].slice(0, 3).map((f) => (
                          <span
                            key={f.userId}
                            className="upnext-with-avatar"
                            style={f.avatarUrl ? { backgroundImage: `url(${f.avatarUrl})` } : { background: f.avatarColor || '#E8573A' }}
                          >
                            {!f.avatarUrl && f.name[0].toUpperCase()}
                          </span>
                        ))}
                      </div>
                      <span className="upnext-with-text">Going with {withLabel(upNextWith[show.id])}</span>
                    </div>
                  )}
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

      {/* Stats + Wrapped moved: Home leads with what's next + who's going.
          A slim 3-stat glance sits lower (below), and the full stat set +
          Wrapped live in Profile. See the v1.5 home-declutter initiative. */}

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

      {/* Stats live on their own Stats tab now — Home stays feed-first
          (Up Next + Friends). See v1.5 home-declutter initiative. */}

      {/* Streak nudge — only when the streak is about to lapse. */}
      {streak.atRisk && (
        <div className="streak-nudge fade-in">
          🔥 Keep your streak alive — log a show this month!
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

      {/* Home is feed-first now: Recent Shows (→ Shows tab), Top Rated
          (→ Rankings/Stats), and the genre "You Might Like" rail were pulled
          to keep the bottom from piling up. One discovery rail stays below. */}

      {/* Upcoming Shows */}
      {(upcoming.length > 0 || upcomingLoading) && (
        <div style={{ marginBottom: 28 }}>
          <div className="home-section-title"><h3>Upcoming Shows</h3></div>
          {upcomingLoading && upcoming.length === 0 ? (
            <div className="upcoming-loading">Finding upcoming shows...</div>
          ) : (
            <div className="home-scroll">
              {upcoming.map((ev, i) => {
                const wishlisted = addedIds.has(wishlistKey(ev));
                return (
                <div key={i} className="upcoming-card">
                  <div className="upcoming-card-img" style={bgStyle(ev.artist)}>
                    <div className="upcoming-card-date">{formatDate(ev.date)}</div>
                  </div>
                  <div className="upcoming-card-body">
                    <div className="upcoming-card-artist">{ev.artist}</div>
                    <div className="upcoming-card-venue">{ev.venue}{ev.city ? `, ${ev.city}` : ''}</div>
                    <div className="upcoming-card-btns">
                      <button
                        className={`upcoming-btn upcoming-btn-wishlist ${wishlisted ? 'added' : ''}`}
                        onClick={(e) => handleAddWishlist(ev, e)}
                        disabled={wishlisted}
                      >
                        {wishlisted ? '✓ Wishlisted' : '+ Wishlist'}
                      </button>
                      {ev.ticketUrl && (
                        <a className="upcoming-btn upcoming-btn-tickets" href={ev.ticketUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Tickets</a>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
