import { useApp } from '../App';
import { getArtistGradient, formatDate } from '../store';
import ShowDayInfo from './ShowDayInfo';

// Show-day pop-up — a Going show that's TODAY (daysUntil === 0). Reuses the
// HypeCard shell (frosted card + artist hero + countdown pill) but swaps the
// "share the hype" body for the ShowDayInfo panel: showtime, venue/artist
// Instagram, official info, bag policy, everything a fan needs walking in.
// App.jsx owns the trigger + once-per-show dismissal, mirroring HypeCard.
// Per docs/initiatives/2026-07-15-know-before-you-go.md.
export default function KnowBeforeYouGo({ show, onClose }) {
  const { getArtistImage, setSelectedShow } = useApp();

  const img = getArtistImage(show.artist);
  const heroStyle = img
    ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: getArtistGradient(show.artist) };

  return (
    <div className="hype-overlay">
      <div className="hype-backdrop" onClick={onClose} />
      <div className="hype-card kbyg-card">
        <div className="hype-hero" style={heroStyle}>
          <div className="hype-hero-overlay" />
          <div className="hype-countdown">TONIGHT</div>
        </div>
        <div className="hype-body">
          <div className="kbyg-title">Know Before You Go</div>
          <div className="hype-artist">{show.artist}</div>
          <div className="hype-meta">
            {[show.venue, show.city].filter(Boolean).join(', ')}
            {show.date ? ` · ${formatDate(show.date)}` : ''}
          </div>

          <div className="kbyg-scroll">
            <ShowDayInfo show={show} />
          </div>

          <button
            className="hype-view-btn"
            onClick={() => { onClose(); setSelectedShow(show); }}
          >
            View show details
          </button>
          <button className="hype-dismiss" onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
