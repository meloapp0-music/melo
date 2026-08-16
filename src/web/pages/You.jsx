import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App';
import {
  isAttended, calculateStreak, groupIntoOutings, artistBackground, festivalKey,
  getYear, getWrappedYears, formatDate,
} from '../store';
import { isUnlocked, daysUntilUnlock, seasonLabel } from '../lib/wrappedSeason';
import { MeloIcon } from '../components/MeloLogo';
import { uploadAvatar } from '../lib/storage';

// "You" — the single home for everything about your own live-music life.
// ======================================================================
// This is Stats and Profile merged. They were separate tabs doing one job, and
// they duplicated three blocks outright (stat grid, streak cards, Top Genres)
// while DISAGREEING on two numbers: Profile counted raw rows for "Shows" and
// every venue string for "Venues"; Stats collapsed festivals into one outing
// and excluded festival stages from the venue count. Same labels, two tabs
// apart, two answers. This file keeps Stats' math — festivals are one night
// out, and "Sahara Tent" is not a room you've been to.
//
// Built from Stats.jsx as the base because it was the better-engineered of the
// two (year scope, festival-aware counts, navigating tiles), with Profile's
// five unique blocks folded in: the avatar hero, the Wrapped archive,
// Milestones, Your Story, and the nav row.
//
// SCOPE RULES, since the year filter now sits above blocks that came from a
// page which never had one:
//   - Everything from Stats stays scoped (that was the point of the filter).
//   - Your Story is scoped — it's already year-grouped, so it reads naturally.
//   - Milestones stay ALL-TIME and say so. They're lifetime achievements; a
//     "First Show" badge that locks when you pick 2024 is a bug, not a filter.
//   - The Wrapped archive is all-time — it IS a year picker.
//
// docs/initiatives/2026-07-28-ia-simplification.md

const WRAPPED_CARD_GRADIENTS = [
  'linear-gradient(150deg, #F93827, #F4A261)',
  'linear-gradient(150deg, #845EC2, #D65DB1)',
  'linear-gradient(150deg, #2563EB, #00C9A7)',
  'linear-gradient(150deg, #1A1A2E, #F93827)',
  'linear-gradient(150deg, #0D8A56, #C4E538)',
];

export default function You() {
  const {
    shows, navigate, getArtistImage, setSelectedVenue, setSelectedArtist, setSelectedShow, showScore,
    rankPositions, profile, session, updateProfile, setWrappedYear, openOverlay,
  } = useApp();

  // ---- Avatar (from Profile) ----
  const fileInputRef = useRef(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  // Fall back to the Melo logo if the avatar URL 404s (deleted object / flaky
  // load) instead of a broken-image icon. Reset on URL change.
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => { setAvatarFailed(false); }, [profile?.avatarUrl]);
  const userId = session?.user?.id || null;

  const onAvatarPick = () => { if (!avatarUploading) fileInputRef.current?.click(); };

  const onAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so the same file can be re-picked later
    if (!file || !userId) return;
    setAvatarUploading(true);
    setAvatarError('');
    try {
      const url = await uploadAvatar(file, userId);
      await updateProfile({ avatarUrl: url });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Melo] avatar upload failed', err);
      setAvatarError('Couldn’t upload that image. Try a different one?');
    } finally {
      setAvatarUploading(false);
    }
  };

  // ---- Scope ----
  const attended = useMemo(() => shows.filter(isAttended), [shows]);
  const years = useMemo(() => getWrappedYears(shows), [shows]); // descending; each has ≥1 attended show

  const [scope, setScope] = useState('all'); // 'all' | year number
  const activeYear = years.includes(scope) ? scope : 'all'; // fall back if the selected year disappears

  const scoped = useMemo(
    () => (activeYear === 'all' ? attended : attended.filter((sh) => getYear(sh.date) === activeYear)),
    [attended, activeYear]
  );
  const outings = useMemo(() => groupIntoOutings(scoped, showScore), [scoped, showScore]);

  // Streak: all-time uses the full history (current + longest); a year shows
  // only the longest consecutive-month run WITHIN that year. calculateStreak's
  // `current` is anchored to today, so it's meaningless under a past year.
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
    // Average scored the same way Home does: a festival counts as ONE outing.
    let sum = 0;
    let n = 0;
    outings.forEach((o) => {
      const sc = o.score || 0; // derived for both branches now (see groupIntoOutings)
      if (sc > 0) { sum += sc; n += 1; }
    });
    return {
      shows: outings.length,
      artists: artistCounts.size,
      cities: cityCounts.size,
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

  // All-time on purpose — lifetime achievements, not a filtered view.
  const milestones = useMemo(() => [
    { icon: '🎤', title: 'First Show', desc: 'Attended your first concert', unlocked: attended.length >= 1 },
    { icon: '🔥', title: 'On Fire', desc: '5 shows attended', unlocked: attended.length >= 5 },
    { icon: '⭐', title: 'Number One', desc: 'Ranked a show as your all-time best', unlocked: Object.values(rankPositions || {}).includes(1) },
    { icon: '🌍', title: 'Explorer', desc: 'Visited 3+ cities', unlocked: new Set(attended.map((sh) => sh.city)).size >= 3 },
    { icon: '👯', title: 'Social Butterfly', desc: 'Went with 3+ different buddies', unlocked: new Set(attended.flatMap((sh) => sh.buddies || [])).size >= 3 },
    { icon: '📝', title: 'Setlist Nerd', desc: 'Logged 50+ songs', unlocked: attended.reduce((sum, sh) => sum + (sh.setlist?.length || 0), 0) >= 50 },
  ], [attended, rankPositions]);

  // Scoped — the timeline is already year-grouped, so a year filter reads as
  // "that chapter" rather than as a truncation.
  const timeline = useMemo(() => {
    const sorted = [...scoped].sort((a, b) => new Date(a.date) - new Date(b.date));
    const groups = {};
    sorted.forEach((sh) => {
      const yr = getYear(sh.date);
      if (!groups[yr]) groups[yr] = [];
      groups[yr].push(sh);
    });
    return Object.entries(groups).sort((a, b) => Number(b[0]) - Number(a[0]));
  }, [scoped]);

  const firstShow = useMemo(
    () => [...attended].sort((a, b) => new Date(a.date) - new Date(b.date))[0],
    [attended]
  );
  const wrappedYears = years;

  const bgStyle = (artist) => artistBackground(artist, getArtistImage(artist));

  const avgLabel = s.ratedN === 0 ? '—' : (Number.isInteger(s.avg) ? s.avg : s.avg.toFixed(1));
  // navigate() carries the year and each destination scopes itself (see
  // components/YearScope), so every tile stays tappable in a year scope.
  const navYear = activeYear === 'all' ? undefined : activeYear;

  const Tile = ({ num, label, to }) => (
    <button type="button" className="stats-tile" onClick={() => navigate(to, { year: navYear })}>
      <div className="stats-tile-num">{num}</div><div className="stats-tile-label">{label}</div>
    </button>
  );

  // Buddies / Music Taste / Settings only. Rankings, Songs and Map used to live
  // here too, but they're reachable from the stat tiles above now — six buttons
  // where three will do was most of why this page felt like a junk drawer.
  const backfillCard = (
    <button className="backfill-entry" onClick={() => openOverlay('backfill', {})}>
      <span className="backfill-entry-icon" aria-hidden="true">📷</span>
      <span className="backfill-entry-text">
        <span className="backfill-entry-title">Find shows in your photos</span>
        <span className="backfill-entry-sub">
          Your camera roll already remembers them — melo can read the dates.
        </span>
      </span>
      <span className="backfill-entry-chev" aria-hidden="true">›</span>
    </button>
  );

  const navRow = (
    <div className="profile-nav-btns">
      <button className="profile-nav-btn" onClick={() => navigate('buddies')}>
        <svg viewBox="0 0 24 24">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
        Buddies
      </button>
      <button className="profile-nav-btn" onClick={() => navigate('music-taste')}>
        <svg viewBox="0 0 24 24">
          <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 10-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 000-7.8z" />
        </svg>
        Music Taste
      </button>
      <button className="profile-nav-btn" onClick={() => navigate('settings')}>
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
        Settings
      </button>
    </div>
  );

  return (
    // Zero only top/sides so the hero bleeds edge-to-edge; KEEP the class's
    // padding-bottom so the last cards clear the floating nav bar.
    <div className="page" style={{ paddingLeft: 0, paddingRight: 0, paddingTop: 0 }}>
      {/* ---- Hero. Renders ALWAYS, including for a zero-show account: Settings
           (and therefore sign-out and account deletion) is linked from this
           page and nowhere else, so an early return above the nav row would
           strand a brand-new user with no way out. ---- */}
      <div className="profile-hero">
        <button
          type="button"
          className="profile-avatar-logo profile-avatar-tap"
          onClick={onAvatarPick}
          aria-label={profile?.avatarUrl ? 'Change profile picture' : 'Upload profile picture'}
          disabled={avatarUploading}
        >
          {profile?.avatarUrl && !avatarFailed ? (
            <img className="profile-avatar-img" src={profile.avatarUrl} alt="" onError={() => setAvatarFailed(true)} />
          ) : (
            <MeloIcon size={80} rounded />
          )}
          <span className="profile-avatar-edit" aria-hidden="true">{avatarUploading ? '…' : '✎'}</span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarFile} />
        <h1 className="profile-name">{profile?.displayName || profile?.username || 'Music Lover'}</h1>
        <p className="profile-joined">
          {firstShow ? `Since ${formatDate(firstShow.date)}` : 'Your concert journey starts here'}
        </p>
        {avatarError && <p className="profile-avatar-error">{avatarError}</p>}
      </div>

      <div style={{ padding: '0 20px' }}>
        {attended.length === 0 ? (
          <>
            <p style={{ color: 'var(--brown-muted)', fontSize: 15, marginTop: 4, marginBottom: 18 }}>
              Log your first show and your live-music stats will start filling in here.
            </p>
            {backfillCard}
            {navRow}
          </>
        ) : (
          <>
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

            {/* All Time: current + longest. A year: longest-within-year only,
                and only when it's an actual run (≥2) — a lone "1" isn't one. */}
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

            {wrappedYears.length > 0 && (
              <div className="profile-section">
                <h3>Your Wrapped</h3>
                <div className="wrapped-archive">
                  {wrappedYears.map((year, i) => {
                    const count = attended.filter((sh) => getYear(sh.date) === year).length;
                    // The CURRENT year stays locked until the season opens on
                    // Dec 1. That's the point: a year-in-review you can open in
                    // March isn't an event, it's a stats page — and the reach
                    // comes from everyone opening theirs on the same day.
                    // Past years are always available; they've had their moment.
                    const open = isUnlocked(year);
                    const days = open ? 0 : daysUntilUnlock(year);
                    return (
                      <button
                        key={year}
                        type="button"
                        className={`wrapped-year-card${open ? '' : ' locked'}`}
                        style={{ background: WRAPPED_CARD_GRADIENTS[i % WRAPPED_CARD_GRADIENTS.length] }}
                        onClick={() => open && setWrappedYear(year)}
                        disabled={!open}
                      >
                        <div className="wrapped-year-card-year">{year}</div>
                        <div className="wrapped-year-card-label">{seasonLabel(year)}</div>
                        <div className="wrapped-year-card-count">{count} {count === 1 ? 'show' : 'shows'}</div>
                        {/* A locked card still says something worth reading —
                            the count is real, and the countdown is the hook. */}
                        {!open && (
                          <div className="wrapped-year-card-lock">
                            🔒 {days === 1 ? 'Opens tomorrow' : `Opens in ${days} days`}
                          </div>
                        )}
                      </button>
                    );
                  })}
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
                          style={artistBackground(name, img)}
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

            <div className="profile-section">
              <div className="home-section-title">
                <h3>Milestones</h3>
                {/* Stated, not silent — these ignore the year filter above on
                    purpose, and an unexplained mismatch reads as a bug. */}
                {activeYear !== 'all' && <span className="stats-scope-note">All time</span>}
              </div>
              <div className="milestones">
                {milestones.map((m) => (
                  <div key={m.title} className={`milestone ${m.unlocked ? '' : 'locked'}`}>
                    <div className="milestone-icon">{m.icon}</div>
                    <div className="milestone-title">{m.title}</div>
                    <div className="milestone-desc">{m.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {backfillCard}

            {timeline.length > 0 && (
              <div className="profile-section">
                <h3>Your Story</h3>
                <div className="timeline">
                  {timeline.map(([year, yearShows], yi) => (
                    <div key={year} className="timeline-year">
                      <div className="timeline-year-label">{year}</div>
                      {yi === timeline.length - 1 && yearShows[0] === firstShow && (
                        <div className="timeline-chapter">
                          <div className="timeline-chapter-label">Chapter 1</div>
                          <div className="timeline-chapter-title">Your First Show</div>
                        </div>
                      )}
                      {[...yearShows]
                        .sort((a, b) => new Date(b.date) - new Date(a.date))
                        .map((show) => (
                          <div key={show.id} className="timeline-item" onClick={() => setSelectedShow(show)}>
                            <div className="timeline-item-thumb" style={bgStyle(show.artist)} />
                            <div className="timeline-item-info">
                              <div className="timeline-item-artist">{show.artist}</div>
                              <div className="timeline-item-venue">{show.venue}</div>
                            </div>
                            <div className="timeline-item-date">{formatDate(show.date)}</div>
                          </div>
                        ))}
                    </div>
                  ))}
                  <div className="timeline-continues">
                    <div className="timeline-continues-text">Your story continues...</div>
                  </div>
                </div>
              </div>
            )}

            {navRow}
          </>
        )}

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
