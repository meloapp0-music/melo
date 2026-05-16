import { useState, useEffect, useRef } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate, vibeStyle, isAttended, ticketmasterSearchUrl } from '../store';
import { fetchArtistBio, lookupVenueUrl, venueSearchUrl } from '../api';
import { track } from '../lib/analytics';
import PlayableSetlist from './PlayableSetlist';
import PhotoGallery from './PhotoGallery';

// Rough "how long ago" label for the pre-show card. Years once it's
// been 12+ months, otherwise months. Good enough for "you last saw
// them 2 years ago" — no need for day precision.
function timeAgoLabel(dateStr) {
  const then = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(then.getTime())) return '';
  const now = new Date();
  let months = (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
  if (months < 1) return 'less than a month ago';
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export default function ShowDetail({ show, onClose }) {
  const { deleteShow, buddies, getArtistImage, setCompareShow, setLogEditTarget, updateShow, shows } = useApp();

  // Pre-show intel — for an upcoming (Going / Wishlist) show, find the
  // user's most recent past show for the same artist. Per
  // docs/initiatives/2026-05-08-pre-show-toolkit.md (Phase 1).
  const lastSeen = (() => {
    if (isAttended(show)) return null;
    const name = (show.artist || '').trim().toLowerCase();
    if (!name) return null;
    const prior = shows
      .filter((s) => s.id !== show.id && isAttended(s) && s.date &&
        (s.artist || '').trim().toLowerCase() === name)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return prior[0] || null;
  })();

  // Auto-resolve the official venue website on open. We keep a local
  // mirror so the pill flips from "Loading…" → live link without forcing
  // the parent to refetch. State machine:
  //   idle      — URL is final (either a saved good URL, or we tried + missed)
  //   loading   — Wikidata lookup in flight
  //   not_found — lookup completed with no result; pill falls back to search
  // Stale Ticketmaster URLs from the very first venue-links cut are
  // detected and re-resolved here so dev installs heal automatically.
  //
  // CRITICAL: this effect runs ONCE per show.id change, not on every
  // re-render. Earlier we depended on `updateShow` (an unstable ref
  // from App.jsx) which created an infinite loop when the persist call
  // failed (App.jsx's updateShow refetches on error → state churn →
  // effect re-fires → resolves → persist fails → refetch → loop). With
  // a stable ref for updateShow + show.id-only deps, a failed save
  // logs and stops.
  const [venueUrl, setVenueUrl] = useState('');
  const [venueLookupState, setVenueLookupState] = useState('idle');
  const updateShowRef = useRef(updateShow);
  useEffect(() => { updateShowRef.current = updateShow; }, [updateShow]);

  // ★ Favorite. Local mirror so the star flips instantly — the parent
  // holds `selectedShow` as a separate object that updateShow() doesn't
  // re-push into this component. Per the v1.0.5 favorite initiative.
  const [isFavorite, setIsFavorite] = useState(!!show.isFavorite);
  const toggleFavorite = () => {
    const next = !isFavorite;
    setIsFavorite(next);
    try { updateShow(show.id, { isFavorite: next }); } catch { /* optimistic */ }
  };

  useEffect(() => {
    let cancelled = false;
    const isStale = (url) =>
      !url || url.includes('ticketmaster.com') || url.includes('setlist.fm');

    if (!show.venue) {
      setVenueUrl('');
      setVenueLookupState('idle');
      return;
    }

    if (show.venueUrl && !isStale(show.venueUrl)) {
      setVenueUrl(show.venueUrl);
      setVenueLookupState('idle');
      return;
    }

    // No saved URL or saved-but-stale → resolve from Wikipedia/Wikidata.
    setVenueUrl('');
    setVenueLookupState('loading');
    lookupVenueUrl(show.venue, show.city).then((resolved) => {
      if (cancelled) return;
      if (resolved) {
        setVenueUrl(resolved);
        setVenueLookupState('idle');
        // Best-effort persist so the next open is instant. Failures
        // (e.g. column doesn't exist because the migration hasn't been
        // run) are logged by App.jsx's updateShow but never bubble up
        // here — the in-memory pill still works for this session.
        try { updateShowRef.current(show.id, { venueUrl: resolved }); } catch {}
      } else {
        setVenueLookupState('not_found');
      }
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id]);
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
    const v = vibeStyle(name);
    return v.bg ? { background: v.bg, color: v.color } : {};
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
            {show.festival && (
              <div className="detail-festival-badge">
                <span aria-hidden="true">🎪</span>
                <span>{show.festival}</span>
              </div>
            )}
          </div>
          {show.score > 0 && (
            <div className="detail-hero-score">
              {Number.isInteger(show.score) ? show.score : show.score.toFixed(1)}
            </div>
          )}
          <button
            className={`detail-fav ${isFavorite ? 'active' : ''}`}
            onClick={toggleFavorite}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={isFavorite}
          >
            <svg viewBox="0 0 24 24">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
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

          {/* Pre-show card — only on upcoming (Going / Wishlist) shows.
              Surfaces the user's last time seeing this artist. Per
              docs/initiatives/2026-05-08-pre-show-toolkit.md. */}
          {!isAttended(show) && (
            <div className="preshow-card">
              <div className="preshow-card-label">Pre-show</div>
              {lastSeen ? (
                <>
                  <div className="preshow-title">
                    You last saw {show.artist} {timeAgoLabel(lastSeen.date)}
                  </div>
                  <div className="preshow-detail">
                    {[
                      [lastSeen.venue, lastSeen.city].filter(Boolean).join(', '),
                      formatDate(lastSeen.date),
                    ].filter(Boolean).join(' · ')}
                  </div>
                  {lastSeen.score > 0 && (
                    <div className="preshow-score-row">
                      <span className="preshow-score">
                        {Number.isInteger(lastSeen.score)
                          ? lastSeen.score
                          : lastSeen.score.toFixed(1)}
                      </span>
                      <span className="preshow-score-label">
                        your rating that night
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="preshow-title">
                  First time seeing {show.artist} ✨
                </div>
              )}
            </div>
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

          {/* Venue links card. Pill label = the venue name itself, so the
              user knows where they're going before they tap. The pill is
              ALWAYS clickable — preferred URL is the official site
              resolved via Wikipedia/Wikidata, fallback is a Google
              search for "{venue} {city} official site" so the user
              always lands somewhere useful. Future phases add artist
              merch + tour merch pills here. Per
              docs/initiatives/2026-05-05-venue-and-merch-links.md. */}
          {show.venue && (
            <div className="detail-links-row">
              <a
                className={
                  'detail-link-pill' +
                  (venueLookupState === 'loading' ? ' detail-link-pill-loading' : '')
                }
                href={venueUrl || venueSearchUrl(show.venue, show.city)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('venue_link_tapped', { resolved: !!venueUrl })}
              >
                <span aria-hidden="true">📍</span>
                <span className="detail-link-pill-name">{show.venue}</span>
                <span className="detail-link-arrow" aria-hidden="true">
                  {venueLookupState === 'loading' ? '…' : venueUrl ? '↗' : '🔍'}
                </span>
              </a>
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
            onClick={() => { onClose(); setLogEditTarget(show); }}
          >
            Edit show
          </button>

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
