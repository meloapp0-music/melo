import { useState, useRef, useEffect } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate, isAttended } from '../store';

export default function ShowComparison({ showA, onClose }) {
  const { shows, getArtistImage, updateShow } = useApp();
  const [showB, setShowB] = useState(null);
  const [picking, setPicking] = useState(true);
  // One battle increment per (showA, showB) pair, ever — opening
  // Compare and going back to pick a different opponent shouldn't
  // double-count. The set is per-component-mount; if the user
  // navigates away and reopens, that's intentional fresh state.
  const recordedRef = useRef(new Set());

  const others = shows.filter((s) => isAttended(s) && s.id !== showA.id);

  const bgStyle = (artist) => {
    const img = getArtistImage(artist);
    return img
      ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: getArtistGradient(artist) };
  };

  const categories = showB ? [
    { label: 'Score', a: showA.score || 0, b: showB.score || 0, fmt: (v) => Number.isInteger(v) ? v : v.toFixed(1) },
    { label: 'Setlist Length', a: showA.setlist?.length || 0, b: showB.setlist?.length || 0, fmt: (v) => `${v} songs` },
    { label: 'Friends', a: showA.buddies?.length || 0, b: showB.buddies?.length || 0, fmt: (v) => v },
    { label: 'Vibes', a: showA.vibes?.length || 0, b: showB.vibes?.length || 0, fmt: (v) => v },
    { label: 'Notes', a: showA.notes?.length || 0, b: showB.notes?.length || 0, fmt: (v) => v > 0 ? '✓' : '—' },
  ] : [];

  const aWins = categories.filter((c) => c.a > c.b).length;
  const bWins = categories.filter((c) => c.b > c.a).length;
  const overallWinner = aWins > bWins ? 'A' : bWins > aWins ? 'B' : 'Tie';

  // Auto-record the battle winner once per (showA, showB) pair per
  // Compare session. Used by Wrapped as a tiebreaker between shows
  // tied on numeric score. Ties don't increment. The recordedRef
  // dedupes if the user toggles back to picking + reselects the
  // same opponent within this same Compare session. Failures are
  // swallowed — the visible Compare result is the source of truth
  // even if the persisted counter misses.
  useEffect(() => {
    if (!showB || overallWinner === 'Tie') return;
    const pairKey = [showA.id, showB.id].sort().join('|');
    if (recordedRef.current.has(pairKey)) return;
    recordedRef.current.add(pairKey);
    const winnerShow = overallWinner === 'A' ? showA : showB;
    const newWins = (winnerShow.battleWins || 0) + 1;
    try { updateShow(winnerShow.id, { battleWins: newWins }); } catch {}
    // overallWinner is derived purely from showA/showB, so listing
    // those two is sufficient — eslint-disable for the derived value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showA?.id, showB?.id]);

  return (
    <div className="compare-overlay">
      <div className="compare-backdrop" onClick={onClose} />
      <div className="compare-sheet">
        <div className="compare-header">
          <h2>Compare Shows</h2>
          <button className="log-close" onClick={onClose}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {picking && !showB ? (
          <div className="compare-picker">
            <p style={{ color: '#9B8A7E', fontSize: 14, marginBottom: 16 }}>
              Comparing <strong>{showA.artist}</strong> — pick a second show:
            </p>
            <div className="compare-picker-list">
              {others.map((s) => (
                <div
                  key={s.id}
                  className="compare-picker-item"
                  onClick={() => { setShowB(s); setPicking(false); }}
                >
                  <div className="compare-picker-thumb" style={bgStyle(s.artist)} />
                  <div className="compare-picker-info">
                    <div className="compare-picker-artist">{s.artist}</div>
                    <div className="compare-picker-meta">{s.venue} · {formatDate(s.date)}</div>
                  </div>
                  <div className="compare-picker-score">
                    {s.score > 0 ? (Number.isInteger(s.score) ? s.score : s.score.toFixed(1)) : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : showB ? (
          <div className="compare-body fade-in">
            {/* Two cards side by side */}
            <div className="compare-cards">
              <div className={`compare-card ${overallWinner === 'A' ? 'winner' : ''}`}>
                <div className="compare-card-img" style={bgStyle(showA.artist)} />
                <div className="compare-card-artist">{showA.artist}</div>
                <div className="compare-card-venue">{showA.venue}</div>
              </div>
              <div className="compare-vs">VS</div>
              <div className={`compare-card ${overallWinner === 'B' ? 'winner' : ''}`}>
                <div className="compare-card-img" style={bgStyle(showB.artist)} />
                <div className="compare-card-artist">{showB.artist}</div>
                <div className="compare-card-venue">{showB.venue}</div>
              </div>
            </div>

            {/* Category comparisons */}
            <div className="compare-categories">
              {categories.map((cat) => {
                const aWin = cat.a > cat.b;
                const bWin = cat.b > cat.a;
                return (
                  <div key={cat.label} className="compare-cat-row">
                    <div className={`compare-cat-val ${aWin ? 'win' : ''}`}>{cat.fmt(cat.a)}</div>
                    <div className="compare-cat-label">{cat.label}</div>
                    <div className={`compare-cat-val ${bWin ? 'win' : ''}`}>{cat.fmt(cat.b)}</div>
                  </div>
                );
              })}
            </div>

            {/* Overall Winner */}
            <div className="compare-winner">
              <div className="compare-winner-label">Overall Winner</div>
              <div className="compare-winner-name">
                {overallWinner === 'Tie' ? '🤝 It\'s a Tie!' : (
                  <>🏆 {overallWinner === 'A' ? showA.artist : showB.artist}</>
                )}
              </div>
              <div className="compare-winner-score">{aWins} — {bWins}</div>
            </div>

            <button className="compare-retry" onClick={() => { setShowB(null); setPicking(true); }}>
              Compare with another show
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
