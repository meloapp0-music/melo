import { useState, useEffect } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate, VIBES, isAttended, ticketmasterSearchUrl } from '../store';
import { fetchArtistBio } from '../api';
import PlayableSetlist from './PlayableSetlist';
import PhotoGallery from './PhotoGallery';

export default function ShowDetail({ show, onClose }) {
  const { deleteShow, buddies, getArtistImage, setCompareShow } = useApp();
  const artistImage = getArtistImage(show.artist);
  const gradient = getArtistGradient(show.artist);

  // MusicBrainz artist bio
  const [bio, setBio] = useState(null);
  const [bioLoading, setBioLoading] = useState(true);

  useEffect(() => {
    setBioLoading(true);
    fetchArtistBio(show.artist)
      .then((data) => setBio(data))
      .catch(() => setBio(null))
      .finally(() => setBioLoading(false));
  }, [show.artist]);

  // Hero priority: user's own photo > Deezer artist image > generated
  // gradient. Their concert photos make the page personal — fall back
  // to the canonical artist art only when the user hasn't uploaded any.
  const heroPhoto = show.photos?.[0] || null;
  const heroStyle = (heroPhoto || artistImage)
    ? { backgroundImage: `url(${heroPhoto || artistImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: gradient };

  const getVibeStyle = (name) => {
    const v = VIBES.find((vb) => vb.name === name);
    return v ? { background: v.bg, color: v.color } : {};
  };

  const getBuddyColor = (name) => {
    const b = buddies.find((bd) => bd.name === name);
    return b ? b.color : '#999';
  };

  return (
    <div className="detail-overlay">
      <div className="detail-backdrop" onClick={onClose} />
      <div className="detail-sheet">
        <div className="detail-hero">
          <div className="gradient-bg" style={heroStyle} />
          <div className="detail-hero-overlay" />
          <div className="detail-hero-info">
            <div className="detail-artist">{show.artist}</div>
            <div className="detail-meta">
              {formatDate(show.date)} &middot; {show.venue}, {show.city}
            </div>
          </div>
          {show.score > 0 && (
            <div className="detail-hero-score">
              {Number.isInteger(show.score) ? show.score : show.score.toFixed(1)}
            </div>
          )}
          <button className="detail-close" onClick={onClose}>
            <svg viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="detail-body">
          {/* Tickets / find-tickets — only for shows the user hasn't been to
              yet. For attended shows, the ticketing flow is over. */}
          {!isAttended(show) && (
            <a
              className="detail-tickets-btn"
              href={ticketmasterSearchUrl(show)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="detail-tickets-icon" aria-hidden="true">🎟️</span>
              <span>Find tickets on Ticketmaster</span>
              <span className="detail-tickets-arrow" aria-hidden="true">↗</span>
            </a>
          )}

          {show.vibes && show.vibes.length > 0 && (
            <div className="detail-vibes-row">
              {show.vibes.map((v) => (
                <span key={v} className="detail-vibe" style={getVibeStyle(v)}>
                  {v}
                </span>
              ))}
            </div>
          )}

          {show.photos && show.photos.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-title">Photos ({show.photos.length})</div>
              <PhotoGallery photos={show.photos} />
            </div>
          )}

          {show.notes && (
            <div className="detail-section">
              <div className="detail-section-title">Notes</div>
              <p className="detail-notes">{show.notes}</p>
            </div>
          )}

          {show.setlist && show.setlist.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-title">Setlist ({show.setlist.length} songs)</div>
              <PlayableSetlist
                artist={show.artist}
                songs={show.setlist}
                numbered
              />
              {/* Setlist.fm requires visible attribution + CC-BY-SA notice
                  on every surface that displays their data. */}
              <div className="legal-attribution">
                Setlist data via{' '}
                <a href="https://setlist.fm" target="_blank" rel="noopener">setlist.fm</a>
                {' '}(CC BY-SA)
              </div>
            </div>
          )}

          {show.buddies && show.buddies.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-title">Went With</div>
              <div className="detail-buddies">
                {show.buddies.map((name) => (
                  <div key={name} className="detail-buddy">
                    <div
                      className="detail-buddy-avatar"
                      style={{ background: getBuddyColor(name) }}
                    >
                      {name[0]}
                    </div>
                    <span className="detail-buddy-name">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {show.genre && (
            <div className="detail-section">
              <div className="detail-section-title">Genre</div>
              <span className="filter-chip active" style={{ cursor: 'default' }}>
                {show.genre}
              </span>
            </div>
          )}

          {/* Artist Bio from MusicBrainz */}
          <div className="detail-section">
            <div className="detail-section-title">About the Artist</div>
            {bioLoading ? (
              <div className="bio-loading">Loading artist info...</div>
            ) : bio ? (
              <div className="bio-card">
                <div className="bio-header">
                  <div
                    className="bio-avatar"
                    style={
                      artistImage
                        ? { backgroundImage: `url(${artistImage})` }
                        : { background: gradient }
                    }
                  />
                  <div>
                    <div className="bio-name">{bio.name}</div>
                    <div className="bio-type">
                      {bio.type || 'Artist'}
                      {bio.country ? ` · ${bio.country}` : ''}
                      {bio.beginYear ? ` · Since ${bio.beginYear}` : ''}
                      {bio.active === false && bio.endYear ? ` – ${bio.endYear}` : ''}
                    </div>
                  </div>
                </div>
                {bio.disambiguation && (
                  <p className="bio-desc">{bio.disambiguation}</p>
                )}
                {bio.genres && bio.genres.length > 0 && (
                  <div className="bio-genres">
                    {bio.genres.map((g) => (
                      <span key={g} className="bio-genre-pill">{g}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bio-loading" style={{ opacity: 0.5 }}>
                No artist info available
              </div>
            )}
          </div>

          <button
            className="detail-compare-btn"
            onClick={() => { onClose(); setCompareShow(show); }}
          >
            ⚔️ Compare with another show
          </button>

          <button
            className="detail-delete"
            onClick={() => {
              if (confirm('Delete this show?')) deleteShow(show.id);
            }}
          >
            Delete Show
          </button>
        </div>
      </div>
    </div>
  );
}
