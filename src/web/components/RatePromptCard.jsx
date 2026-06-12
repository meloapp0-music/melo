import { useApp } from '../App';
import { getArtistGradient, formatDate } from '../store';

// Post-show rate pop-up — the morning-after twin of HypeCard. Shown on
// app open while a Going show's date is 1–3 days past and it still
// hasn't been rated; once per day until rated or it ages out. App.jsx
// owns the trigger + snooze; this is pure presentation (and reuses the
// hype-* styles so the two "moment" cards feel like one family). Per
// docs/initiatives/2026-06-10-preshow-postshow-experience.md.
export default function RatePromptCard({ show, daysAgo, onRate, onClose }) {
  const { getArtistImage } = useApp();

  const img = getArtistImage(show.artist);
  const heroStyle = img
    ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: getArtistGradient(show.artist) };

  const when =
    daysAgo <= 1 ? 'LAST NIGHT' : `${daysAgo} NIGHTS AGO`;

  return (
    <div className="hype-overlay">
      <div className="hype-backdrop" onClick={onClose} />
      <div className="hype-card">
        <div className="hype-hero" style={heroStyle}>
          <div className="hype-hero-overlay" />
          <div className="hype-countdown">{when}</div>
        </div>
        <div className="hype-body">
          <div className="hype-artist">How was {show.artist}?</div>
          <div className="hype-meta">
            {[show.venue, show.city].filter(Boolean).join(', ')}
            {show.date ? ` · ${formatDate(show.date)}` : ''}
          </div>
          <button className="hype-share-btn" onClick={onRate}>
            ⭐ Rate it now
          </button>
          <button className="hype-dismiss" onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
