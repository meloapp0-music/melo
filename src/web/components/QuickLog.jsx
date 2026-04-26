import { useState } from 'react';
import { useApp } from '../App';
import { generateId } from '../store';

export default function QuickLog({ onClose, onOpenFull }) {
  const { addShow, showToast, setSelectedShow } = useApp();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const [artist, setArtist] = useState('');
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState(yesterday);
  const [score, setScore] = useState(0);

  const handleSave = async () => {
    if (!artist.trim()) return;
    const trimmedArtist = artist.trim();
    onClose();
    const saved = await addShow({
      id: generateId(),
      artist: trimmedArtist,
      date,
      venue: venue.trim(),
      city: '',
      genre: '',
      score,
      vibes: [],
      notes: '',
      setlist: [],
      buddies: [],
      status: 'attended',
      wishlist: false,
      createdAt: new Date().toISOString(),
    });
    if (showToast) {
      showToast({
        message: `✓ Logged ${trimmedArtist}`,
        onClick: saved?.id ? () => setSelectedShow(saved) : undefined,
      });
    }
  };

  const handleOpenFull = () => {
    onClose();
    onOpenFull();
  };

  return (
    <div className="quicklog-overlay">
      <div className="quicklog-backdrop" onClick={onClose} />
      <div className="quicklog-sheet">
        <div className="log-handle" />
        <div className="quicklog-header">
          <h3>Quick Log</h3>
          <button className="log-close" onClick={onClose}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="quicklog-body">
          <input className="log-input" placeholder="Artist / Band" value={artist} onChange={(e) => setArtist(e.target.value)} autoFocus />
          <input className="log-input" placeholder="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
          <input className="log-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

          <div className="quicklog-score-row">
            <span className="quicklog-score-label">Score</span>
            <div className="quicklog-scores">
              {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                <button
                  key={n}
                  className={`quicklog-score-btn ${score === n ? 'active' : ''}`}
                  onClick={() => setScore(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button className="log-submit" onClick={handleSave}>Save Quick</button>
          <button className="quicklog-full-btn" onClick={handleOpenFull}>
            Add More Details →
          </button>
        </div>
      </div>
    </div>
  );
}
