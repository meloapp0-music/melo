import { useApp } from '../App';
import { isAttended, formatDate, getArtistGradient } from '../store';

// A page for one artist — every time you saw them live. Opened by tapping an
// artist on the "Your Lineup" page. Modal like VenueDetail / FestivalDetail;
// derives its shows live so it reflects deletes/edits.
export default function ArtistDetail({ artist, onClose, onOpenShow }) {
  const { shows, getArtistImage } = useApp();
  const name = artist?.name || '';

  const members = shows
    .filter((s) => isAttended(s) && s.artist === name)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (!name || members.length === 0) return null;

  const dates = members.map((s) => s.date).filter(Boolean).sort();
  const firstYear = dates[0]?.slice(0, 4) || '';
  const rated = members.filter((s) => s.score > 0);
  const avg = rated.length ? rated.reduce((a, s) => a + s.score, 0) / rated.length : 0;
  const cities = new Set(members.map((s) => s.city).filter(Boolean)).size;

  const img = getArtistImage(name);
  const heroStyle = img
    ? { background: `url("${img}") center / cover no-repeat, ${getArtistGradient(name)}` }
    : { background: getArtistGradient(name) };

  return (
    <div className="detail-overlay">
      <div className="detail-backdrop" onClick={onClose} />
      <div className="detail-sheet">
        <div className="detail-hero">
          <div className="gradient-bg" style={heroStyle} />
          <div className="detail-hero-overlay" />
          <div className="detail-hero-info">
            <div className="detail-festival-badge" style={{ marginBottom: 8 }}>
              <span aria-hidden="true">🎤</span><span>Artist</span>
            </div>
            <div className="detail-artist">{name}</div>
            <div className="detail-openers">
              Seen {members.length}×{firstYear ? ` · since ${firstYear}` : ''}
              {cities > 0 ? ` · ${cities} ${cities === 1 ? 'city' : 'cities'}` : ''}
            </div>
          </div>
          {avg > 0 && (
            <div className="detail-hero-score">{Number.isInteger(avg) ? avg : avg.toFixed(1)}</div>
          )}
          <button className="detail-close" onClick={onClose}>
            <svg viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="detail-body">
          <div className="detail-section">
            <div className="detail-section-title">Every time you saw {name} ({members.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.map((s) => (
                <div key={s.id} className="show-list-item" onClick={() => onOpenShow(s)}>
                  <div className="show-list-info">
                    <div className="show-list-artist">
                      {s.festival ? `🎪 ${s.festival}` : (s.venue || s.city || 'Show')}
                    </div>
                    <div className="show-list-meta">
                      {formatDate(s.date)}{s.city ? ` · ${s.city}` : ''}
                    </div>
                  </div>
                  {s.score > 0 && (
                    <div className="show-list-score">
                      {Number.isInteger(s.score) ? s.score : s.score.toFixed(1)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 20 }} />
        </div>
      </div>
    </div>
  );
}
