import { useMemo } from 'react';
import { useApp } from '../App';
import { getArtistGradient, isAttended } from '../store';

export default function Buddies() {
  const { shows, buddies, navigate, getArtistImage } = useApp();
  const attended = shows.filter(isAttended);

  const buddyStats = useMemo(() => {
    return buddies
      .map((b) => {
        const sharedShows = attended.filter(
          (s) => s.buddies && s.buddies.includes(b.name)
        );
        return { ...b, shows: sharedShows, count: sharedShows.length };
      })
      .sort((a, b) => b.count - a.count);
  }, [buddies, attended]);

  const topBuddy = buddyStats[0];

  const bgStyle = (artist) => {
    const img = getArtistImage(artist);
    return img
      ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: getArtistGradient(artist) };
  };

  return (
    <div className="page page-top">
      <div className="buddies-header">
        <button className="back-btn" onClick={() => navigate('profile')}>
          <svg viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Profile
        </button>
        <h1>Buddies</h1>
      </div>

      {topBuddy && topBuddy.count > 0 && (
        <div className="buddy-spotlight">
          <div className="buddy-spotlight-inner">
            <div
              className="buddy-spotlight-avatar"
              style={{ background: topBuddy.color }}
            >
              {topBuddy.name[0]}
            </div>
            <div className="buddy-spotlight-name">{topBuddy.name}</div>
            <div className="buddy-spotlight-stat">
              Your #1 concert buddy &middot; {topBuddy.count} shows together
            </div>
          </div>
        </div>
      )}

      <div className="section-label">All Buddies</div>
      <div className="buddy-grid">
        {buddyStats.map((buddy) => (
          <div key={buddy.id} className="buddy-card">
            <div className="buddy-avatar" style={{ background: buddy.color }}>
              {buddy.name[0]}
            </div>
            <div className="buddy-info">
              <div className="buddy-name">{buddy.name}</div>
              <div className="buddy-shows-count">
                {buddy.count} show{buddy.count !== 1 ? 's' : ''} together
              </div>
            </div>
            <div className="buddy-thumbs">
              {buddy.shows.slice(0, 3).map((s) => (
                <div
                  key={s.id}
                  className="buddy-thumb"
                  style={bgStyle(s.artist)}
                />
              ))}
            </div>
          </div>
        ))}
        {buddyStats.length === 0 && (
          <div className="shows-empty">
            <p>No buddies yet. Add friends when logging shows!</p>
          </div>
        )}
      </div>
    </div>
  );
}
