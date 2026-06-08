import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../App';
import { isAttended, formatDate, getArtistGradient } from '../store';
import { getProfileById } from '../lib/db/profiles';
import { listUserShows } from '../lib/db/shows';
import {
  getRelationships, requestFriend, acceptFriend, removeFriend,
  blockUser, reportUser,
} from '../lib/db/friendships';

// Friend / other-user profile sheet. Shows their stats, recent shows,
// "shows you've been to together," and friend/block/report actions.
// RLS gates whether their shows are visible. Per buddies-phase-2.
export default function UserProfileView({ userId, onClose }) {
  const { shows: myShows, getArtistImage, showToast } = useApp();

  const [profile, setProfile] = useState(null);
  const [theirShows, setTheirShows] = useState([]);
  const [rel, setRel] = useState(null); // 'friends'|'incoming'|'outgoing'|undefined
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = async () => {
    try {
      const [p, rmap] = await Promise.all([getProfileById(userId), getRelationships()]);
      setProfile(p);
      setRel(rmap[userId]);
      // Shows only load if RLS allows (friends + visibility). Empty
      // otherwise — we show a "private" state.
      try { setTheirShows(await listUserShows(userId)); } catch { setTheirShows([]); }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Melo] profile load failed', err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  const theirAttended = theirShows.filter(isAttended);

  const stats = useMemo(() => {
    const artists = new Set(theirAttended.map((s) => s.artist));
    const cities = new Set(theirAttended.map((s) => s.city).filter(Boolean));
    return { shows: theirAttended.length, artists: artists.size, cities: cities.size };
  }, [theirAttended]);

  // "Shows you've been to together" — intersect on artist + date.
  const together = useMemo(() => {
    const mine = new Set(
      myShows.filter(isAttended).map((s) => `${(s.artist || '').toLowerCase()}|${s.date}`)
    );
    return theirAttended.filter((s) => mine.has(`${(s.artist || '').toLowerCase()}|${s.date}`));
  }, [myShows, theirAttended]);

  const act = async (fn, msg) => {
    try { await fn(); if (msg) showToast?.({ message: msg }); await load(); }
    catch (err) { showToast?.({ message: err?.message || 'Something went wrong' }); }
  };

  const handleBlock = () => {
    setMenuOpen(false);
    if (!confirm('Block this user? They won\'t be able to find you, friend you, or see your shows.')) return;
    act(() => blockUser(userId), 'User blocked').then(onClose);
  };
  const handleReport = () => {
    setMenuOpen(false);
    const reason = prompt('Report this user — what\'s wrong? (optional)');
    if (reason === null) return;
    act(() => reportUser(userId, reason), 'Report submitted');
  };

  const bgStyle = (artist) => {
    const img = getArtistImage(artist);
    return img
      ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: getArtistGradient(artist) };
  };

  const friendButton = () => {
    if (rel === 'friends') return <button className="detail-compare-btn" onClick={() => act(() => removeFriend(userId), 'Removed')}>✓ Friends</button>;
    if (rel === 'outgoing') return <button className="detail-compare-btn" disabled>Requested</button>;
    if (rel === 'incoming') return <button className="log-submit" onClick={() => act(() => acceptFriend(userId), 'Friend added 🎶')}>Accept request</button>;
    return <button className="log-submit" onClick={() => act(() => requestFriend(userId), 'Request sent')}>+ Add friend</button>;
  };

  return (
    <div className="detail-overlay">
      <div className="detail-backdrop" onClick={onClose} />
      <div className="detail-sheet" style={{ maxHeight: '90vh', overflow: 'auto' }}>
        <div className="log-header" style={{ padding: '20px 20px 8px', position: 'relative' }}>
          <button className="detail-close" onClick={onClose}>×</button>
          <button
            className="detail-fav"
            style={{ right: 60 }}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="More options"
          >
            <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" fill="#fff" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="#fff" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="#fff" stroke="none"/></svg>
          </button>
          {menuOpen && (
            <div className="profile-menu">
              <button onClick={handleReport}>Report</button>
              <button onClick={handleBlock} className="profile-menu-danger">Block</button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="upcoming-loading" style={{ padding: 40 }}>Loading…</div>
        ) : !profile ? (
          <div className="shows-empty" style={{ padding: 40 }}><p>Couldn't load this profile.</p></div>
        ) : (
          <div style={{ padding: '0 20px 28px' }}>
            <div style={{ textAlign: 'center' }}>
              <div
                className="settings-account-avatar"
                style={{
                  width: 80, height: 80, margin: '0 auto 10px', fontSize: 32,
                  background: profile.avatarColor,
                  ...(profile.avatarUrl ? { backgroundImage: `url(${profile.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
                }}
              >
                {!profile.avatarUrl && (profile.displayName || profile.username || '?')[0].toUpperCase()}
              </div>
              <h2 style={{ margin: 0 }}>{profile.displayName || profile.username}</h2>
              <p className="settings-desc">@{profile.username}</p>
              {profile.bio && <p className="settings-desc" style={{ marginTop: 4 }}>{profile.bio}</p>}
              <div style={{ marginTop: 12 }}>{friendButton()}</div>
            </div>

            {/* Stats */}
            <div className="profile-stats" style={{ marginTop: 20 }}>
              <div className="profile-stat"><div className="profile-stat-num">{stats.shows}</div><div className="profile-stat-label">Shows</div></div>
              <div className="profile-stat"><div className="profile-stat-num">{stats.artists}</div><div className="profile-stat-label">Artists</div></div>
              <div className="profile-stat"><div className="profile-stat-num">{stats.cities}</div><div className="profile-stat-label">Cities</div></div>
              <div className="profile-stat"><div className="profile-stat-num">{together.length}</div><div className="profile-stat-label">Together</div></div>
            </div>

            {/* Shows together */}
            {together.length > 0 && (
              <div className="profile-section">
                <h3>Shows you've been to together</h3>
                <div className="shows-list">
                  {together.slice(0, 10).map((s) => (
                    <div key={s.id} className="show-list-item" style={{ cursor: 'default' }}>
                      <div className="show-list-thumb" style={bgStyle(s.artist)} />
                      <div className="show-list-info">
                        <div className="show-list-artist">{s.artist}</div>
                        <div className="show-list-meta">{s.venue} · {formatDate(s.date)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Their recent shows (or private state) */}
            <div className="profile-section">
              <h3>{profile.displayName || profile.username}'s shows</h3>
              {theirAttended.length === 0 ? (
                <p className="settings-desc">
                  {rel === 'friends'
                    ? 'No shows visible — they keep their history private.'
                    : 'Add them as a friend to see their concert history.'}
                </p>
              ) : (
                <div className="shows-list">
                  {theirAttended.slice(0, 15).map((s) => (
                    <div key={s.id} className="show-list-item" style={{ cursor: 'default' }}>
                      <div className="show-list-thumb" style={bgStyle(s.artist)} />
                      <div className="show-list-info">
                        <div className="show-list-artist">{s.artist}</div>
                        <div className="show-list-meta">{s.venue} · {formatDate(s.date)}</div>
                      </div>
                      {isAttended(s) && s.score > 0 && (
                        <div className="show-list-score">
                          {Number.isInteger(s.score) ? s.score : s.score.toFixed(1)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
