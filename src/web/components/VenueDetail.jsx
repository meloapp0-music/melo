import { useEffect } from 'react';
import { useApp } from '../App';
import { scoreText } from '../lib/ranking';
import { isAttended, formatDate, getArtistGradient, latestShowPhoto, festivalKey } from '../store';

// A page for one venue — every show you've seen there. Opened by tapping a
// venue anywhere (Stats' Top Venues, the Venues list). Modal like ShowDetail /
// FestivalDetail; derives its shows live so it reflects deletes/edits.
export default function VenueDetail({ venue, onClose, onOpenShow }) {
  const { shows, getArtistImage, getVenueImage, prefetchVenueImages, showScore } = useApp();
  const name = venue?.name || '';

  // A venue is (name, city) — NOT name alone. Venues.jsx keys its cards by
  // `venue|city`, so "House of Blues" is two separate rooms in Chicago and
  // Boston. Matching on name only would pool both into whichever card you
  // tapped, mislabel it with the other city, and ask for a photo under a
  // different cache key than the card prefetched. Same festival-stage exclusion
  // as Venues.jsx, so a festival's stage rows don't leak back into the count.
  const city = venue?.city || '';
  const members = shows
    .filter((s) => (
      isAttended(s)
      && !festivalKey(s)
      && (s.venue || '') === name
      && (s.city || '') === city
    ))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Resolve this venue's photo even when opened from somewhere that didn't
  // prefetch it (e.g. Stats' Top Venues). Cache-aware, so it's a no-op if warm.
  useEffect(() => {
    if (name) prefetchVenueImages([{ name, city }]);
  }, [name, city, prefetchVenueImages]);

  if (!name || members.length === 0) return null;
  const rated = members.map((s) => showScore(s)).filter((v) => v != null);
  const avg = rated.length ? rated.reduce((a, v) => a + v, 0) / rated.length : 0;
  const artistCount = new Set(members.map((s) => s.artist)).size;

  const thumbStyle = (artist) => {
    const img = getArtistImage(artist);
    const grad = getArtistGradient(artist);
    return img ? { background: `url("${img}") center / cover no-repeat, ${grad}` } : { background: grad };
  };
  // Priority: YOUR own photo from a show here → the Wikimedia venue photo →
  // a headliner's photo → gradient. Credit only shows for the Wikimedia one.
  const myPhoto = latestShowPhoto(members);
  const venueRec = getVenueImage(name, city);
  const showingVenuePhoto = !myPhoto && !!venueRec?.url;
  const heroImg = myPhoto || venueRec?.url || members.map((s) => getArtistImage(s.artist)).find(Boolean);
  const heroStyle = heroImg
    ? { background: `url("${heroImg}") center / cover no-repeat, ${getArtistGradient(name)}` }
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
              <span aria-hidden="true">📍</span><span>Venue</span>
            </div>
            <div className="detail-artist">{name}</div>
            {city && <div className="detail-meta">{city}</div>}
            <div className="detail-openers">
              {members.length} {members.length === 1 ? 'show' : 'shows'} · {artistCount} {artistCount === 1 ? 'artist' : 'artists'}
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
            <div className="detail-section-title">Shows here ({members.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.map((s) => (
                <div key={s.id} className="show-list-item" onClick={() => onOpenShow(s)}>
                  <div className="show-list-thumb" style={thumbStyle(s.artist)} />
                  <div className="show-list-info">
                    <div className="show-list-artist">{s.artist}</div>
                    <div className="show-list-meta">{formatDate(s.date)}</div>
                  </div>
                  {showScore(s) != null && (
                    <div className="show-list-score">
                      {scoreText(showScore(s))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          {showingVenuePhoto && (
            <div className="venue-photo-credit">
              Photo{venueRec.credit?.artist ? ` by ${venueRec.credit.artist}` : ''}
              {venueRec.credit?.license ? ` · ${venueRec.credit.license}` : ''} · via{' '}
              <a
                href={venueRec.credit?.file
                  ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(venueRec.credit.file)}`
                  : 'https://commons.wikimedia.org'}
                target="_blank"
                rel="noopener noreferrer"
              >Wikimedia Commons</a>
            </div>
          )}
          <div style={{ height: 20 }} />
        </div>
      </div>
    </div>
  );
}
