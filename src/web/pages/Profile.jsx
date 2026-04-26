import { useMemo, useRef, useState } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate, getYear, calculateStreak, isAttended } from '../store';
import { MeloIcon } from '../components/MeloLogo';
import { uploadAvatar } from '../lib/storage';

export default function Profile() {
  const { shows, navigate, setSelectedShow, getArtistImage, profile, session, updateProfile } = useApp();
  const fileInputRef = useRef(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const userId = session?.user?.id || null;

  const onAvatarPick = () => {
    if (avatarUploading) return;
    fileInputRef.current?.click();
  };

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
  const attended = shows.filter(isAttended);
  const streak = useMemo(() => calculateStreak(shows), [shows]);

  const stats = useMemo(() => {
    const artists = new Set(attended.map((s) => s.artist));
    const cities = new Set(attended.map((s) => s.city).filter(Boolean));
    const venues = new Set(attended.map((s) => s.venue).filter(Boolean));
    // Unique songs heard live, deduped across all attended shows. Matches
    // the `Heard Live` count on the Songs page so the Profile stat ties
    // visually to its destination when tapped.
    const uniqueSongKeys = new Set();
    attended.forEach((s) => {
      (s.setlist || []).forEach((song) => {
        const k = song?.toLowerCase().trim();
        if (k) uniqueSongKeys.add(`${s.artist}|${k}`);
      });
    });
    return {
      shows: attended.length,
      artists: artists.size,
      cities: cities.size,
      venues: venues.size,
      songs: uniqueSongKeys.size,
    };
  }, [attended]);

  const genreCounts = useMemo(() => {
    const map = {};
    attended.forEach((s) => {
      if (s.genre) map[s.genre] = (map[s.genre] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [attended]);

  const maxGenre = genreCounts.length > 0 ? genreCounts[0][1] : 1;

  const milestones = useMemo(() => {
    const list = [
      { icon: '🎤', title: 'First Show', desc: 'Attended your first concert', unlocked: attended.length >= 1 },
      { icon: '🔥', title: 'On Fire', desc: '5 shows attended', unlocked: attended.length >= 5 },
      { icon: '⭐', title: 'Perfect 10', desc: 'Gave a show a perfect score', unlocked: attended.some((s) => s.score >= 10) },
      { icon: '🌍', title: 'Explorer', desc: 'Visited 3+ cities', unlocked: new Set(attended.map((s) => s.city)).size >= 3 },
      { icon: '👯', title: 'Social Butterfly', desc: 'Went with 3+ different buddies', unlocked: new Set(attended.flatMap((s) => s.buddies || [])).size >= 3 },
      { icon: '📝', title: 'Setlist Nerd', desc: 'Logged 50+ songs', unlocked: attended.reduce((sum, s) => sum + (s.setlist?.length || 0), 0) >= 50 },
    ];
    return list;
  }, [attended]);

  const timeline = useMemo(() => {
    const sorted = [...attended].sort((a, b) => new Date(a.date) - new Date(b.date));
    const groups = {};
    sorted.forEach((s) => {
      const yr = getYear(s.date);
      if (!groups[yr]) groups[yr] = [];
      groups[yr].push(s);
    });
    return Object.entries(groups).sort((a, b) => Number(b[0]) - Number(a[0]));
  }, [attended]);

  const firstShow = [...attended].sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  const bgStyle = (artist) => {
    const img = getArtistImage(artist);
    return img
      ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: getArtistGradient(artist) };
  };

  return (
    <div className="page" style={{ padding: 0 }}>
      <div className="profile-hero">
        <button
          type="button"
          className="profile-avatar-logo profile-avatar-tap"
          onClick={onAvatarPick}
          aria-label={profile?.avatarUrl ? 'Change profile picture' : 'Upload profile picture'}
          disabled={avatarUploading}
        >
          {profile?.avatarUrl ? (
            <img className="profile-avatar-img" src={profile.avatarUrl} alt="" />
          ) : (
            <MeloIcon size={80} rounded={true} />
          )}
          <span className="profile-avatar-edit" aria-hidden="true">
            {avatarUploading ? '…' : '✎'}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onAvatarFile}
        />
        <h1 className="profile-name">
          {profile?.displayName || profile?.username || 'Music Lover'}
        </h1>
        <p className="profile-joined">
          {firstShow ? `Since ${formatDate(firstShow.date)}` : 'Your concert journey starts here'}
        </p>
        {avatarError && (
          <p className="profile-avatar-error">{avatarError}</p>
        )}
      </div>

      <div style={{ padding: '0 20px' }}>
        <div className="profile-stats">
          <button type="button" className="profile-stat profile-stat-btn" onClick={() => navigate('shows')}>
            <div className="profile-stat-num">{stats.shows}</div>
            <div className="profile-stat-label">Shows</div>
          </button>
          <button type="button" className="profile-stat profile-stat-btn" onClick={() => navigate('artists')}>
            <div className="profile-stat-num">{stats.artists}</div>
            <div className="profile-stat-label">Artists</div>
          </button>
          <button type="button" className="profile-stat profile-stat-btn" onClick={() => navigate('songs')}>
            <div className="profile-stat-num">{stats.songs}</div>
            <div className="profile-stat-label">Songs</div>
          </button>
          <div className="profile-stat">
            <div className="profile-stat-num">{stats.venues}</div>
            <div className="profile-stat-label">Venues</div>
          </div>
        </div>

        {/* Streak */}
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

        {/* Nav Buttons */}
        <div className="profile-nav-btns">
          <button className="profile-nav-btn" onClick={() => navigate('rankings')}>
            <svg viewBox="0 0 24 24">
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
            </svg>
            Rankings
          </button>
          <button className="profile-nav-btn" onClick={() => navigate('songs')}>
            <svg viewBox="0 0 24 24">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            Songs
          </button>
          <button className="profile-nav-btn" onClick={() => navigate('buddies')}>
            <svg viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            Buddies
          </button>
          <button className="profile-nav-btn" onClick={() => navigate('settings')}>
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            Settings
          </button>
        </div>

        {/* Genre Chart */}
        {genreCounts.length > 0 && (
          <div className="profile-section">
            <h3>Top Genres</h3>
            <div className="genre-chart">
              {genreCounts.map(([genre, count]) => (
                <div key={genre} className="genre-row">
                  <div className="genre-label">{genre}</div>
                  <div className="genre-bar-wrap">
                    <div
                      className="genre-bar"
                      style={{ width: `${(count / maxGenre) * 100}%` }}
                    >
                      {count}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Milestones */}
        <div className="profile-section">
          <h3>Milestones</h3>
          <div className="milestones">
            {milestones.map((m, i) => (
              <div key={i} className={`milestone ${m.unlocked ? '' : 'locked'}`}>
                <div className="milestone-icon">{m.icon}</div>
                <div className="milestone-title">{m.title}</div>
                <div className="milestone-desc">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
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
                      <div className="timeline-chapter-title">
                        Your First Show
                      </div>
                    </div>
                  )}
                  {yearShows
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map((show) => (
                      <div
                        key={show.id}
                        className="timeline-item"
                        onClick={() => setSelectedShow(show)}
                      >
                        <div
                          className="timeline-item-thumb"
                          style={bgStyle(show.artist)}
                        />
                        <div className="timeline-item-info">
                          <div className="timeline-item-artist">
                            {show.artist}
                          </div>
                          <div className="timeline-item-venue">
                            {show.venue}
                          </div>
                        </div>
                        <div className="timeline-item-date">
                          {formatDate(show.date)}
                        </div>
                      </div>
                    ))}
                </div>
              ))}
              <div className="timeline-continues">
                <div className="timeline-continues-text">
                  Your story continues...
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
