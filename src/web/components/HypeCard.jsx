import { useState } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate } from '../store';
import { shareHypeCard } from '../lib/shareCard';
import { track } from '../lib/analytics';

// Pre-show hype pop-up — shown once per show per countdown-day when a
// Going show is 0–2 days out ("Mumford & Sons in 2 days — share the
// excitement"). App.jsx owns the trigger + dismissal persistence; this
// component is pure presentation. Per
// docs/initiatives/2026-06-10-preshow-postshow-experience.md.
export default function HypeCard({ show, daysLeft, onClose }) {
  const { getArtistImage, setSelectedShow, profile } = useApp();
  const [sharing, setSharing] = useState(false);

  const img = getArtistImage(show.artist);
  const heroStyle = img
    ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: getArtistGradient(show.artist) };

  const countdown =
    daysLeft <= 0 ? 'TONIGHT' :
      daysLeft === 1 ? 'TOMORROW' :
        `IN ${daysLeft} DAYS`;

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    // Event props are sanitized enums/numbers only — never artist or
    // venue names (privacy spine, see lib/analytics.js).
    track('hype_shared', { days_left: daysLeft });
    try {
      await shareHypeCard(show, daysLeft, profile?.username);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="hype-overlay">
      <div className="hype-backdrop" onClick={onClose} />
      <div className="hype-card">
        <div className="hype-hero" style={heroStyle}>
          <div className="hype-hero-overlay" />
          <div className="hype-countdown">{countdown}</div>
        </div>
        <div className="hype-body">
          <div className="hype-artist">{show.artist}</div>
          <div className="hype-meta">
            {[show.venue, show.city].filter(Boolean).join(', ')}
            {show.date ? ` · ${formatDate(show.date)}` : ''}
          </div>
          <button className="hype-share-btn" onClick={share} disabled={sharing}>
            {sharing ? 'Making your card…' : '📣 Share the hype'}
          </button>
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
