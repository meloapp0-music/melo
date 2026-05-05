import { useMemo, useState } from 'react';
import { useApp } from '../App';
import { getArtistGradient, isAttended, formatDate } from '../store';

export default function Buddies() {
  const { shows, buddies, navigate, getArtistImage, updateShow } = useApp();
  const attended = shows.filter(isAttended);

  // ----- Add Buddy modal state -----
  // Phase 1 architecture stores buddies as label strings inside each show's
  // `buddies` array — there's no separate buddy table. So "adding" a buddy
  // means picking past attended shows to retro-tag them on. Once any show
  // has the name, the derived `buddies` list (App.jsx) surfaces the buddy
  // everywhere.
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [pickedShowIds, setPickedShowIds] = useState([]);
  const [savingBuddy, setSavingBuddy] = useState(false);
  const [addError, setAddError] = useState('');

  const togglePicked = (id) =>
    setPickedShowIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const closeAdd = () => {
    setAddOpen(false);
    setNewName('');
    setPickedShowIds([]);
    setAddError('');
  };

  const saveBuddy = async () => {
    setAddError('');
    const name = newName.trim();
    if (!name) {
      setAddError('Type a name first');
      return;
    }
    if (pickedShowIds.length === 0) {
      setAddError('Pick at least one show to tag this buddy on');
      return;
    }
    setSavingBuddy(true);
    try {
      await Promise.all(
        pickedShowIds.map((id) => {
          const s = shows.find((sh) => sh.id === id);
          if (!s) return null;
          const existing = Array.isArray(s.buddies) ? s.buddies : [];
          if (existing.includes(name)) return null;
          return updateShow(id, { buddies: [...existing, name] });
        })
      );
      closeAdd();
    } catch (err) {
      setAddError(err?.message || 'Could not save');
    } finally {
      setSavingBuddy(false);
    }
  };

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
        <button
          className="buddies-add-btn"
          onClick={() => setAddOpen(true)}
          aria-label="Add a buddy"
        >
          + Add
        </button>
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
            <p>No buddies yet — tap "+ Add" up top to tag a friend on past shows.</p>
          </div>
        )}
      </div>

      {addOpen && (
        <div className="detail-overlay">
          <div className="detail-backdrop" onClick={closeAdd} />
          <div className="detail-sheet" style={{ maxHeight: '85vh', overflow: 'auto' }}>
            <div className="log-header" style={{ padding: '20px 20px 12px' }}>
              <button className="detail-close" onClick={closeAdd}>×</button>
              <h2 style={{ margin: 0 }}>Add a buddy</h2>
            </div>

            <div className="log-section">
              <div className="log-section-title">Name</div>
              <input
                className="log-input"
                placeholder="Their name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={40}
                autoFocus
              />
            </div>

            <div className="log-section">
              <div className="log-section-title">
                Tag on past shows ({pickedShowIds.length} selected)
              </div>
              {attended.length === 0 ? (
                <p className="settings-desc">
                  You haven't logged any attended shows yet — log a show first,
                  then come back to tag buddies on it.
                </p>
              ) : (
                <div className="buddy-add-shows">
                  {attended.map((s) => {
                    const picked = pickedShowIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`buddy-add-show-row ${picked ? 'picked' : ''}`}
                        onClick={() => togglePicked(s.id)}
                      >
                        <span className="buddy-add-show-check" aria-hidden>
                          {picked ? '✓' : ''}
                        </span>
                        <span className="buddy-add-show-info">
                          <strong>{s.artist}</strong>
                          <span className="settings-desc" style={{ marginBottom: 0 }}>
                            {formatDate(s.date)} · {s.venue || s.city || '—'}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {addError && (
              <p className="settings-desc" style={{ color: '#C34A36', padding: '0 20px' }}>{addError}</p>
            )}

            <div style={{ padding: '12px 20px 24px' }}>
              <button
                className="log-submit"
                onClick={saveBuddy}
                disabled={savingBuddy || attended.length === 0}
              >
                {savingBuddy ? 'Saving…' : 'Save buddy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
