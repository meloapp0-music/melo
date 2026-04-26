import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../App';
import {
  formatDate, topArtists, inferHomeCity, SHOW_STATUS,
} from '../store';
import { fetchFestivals } from '../api';

// Formats "May 15, 2026" or "May 15 – May 17, 2026" for a festival
// that spans multiple days. If `endDate` is missing or equals `date`,
// falls back to the single-date formatter.
function formatRange(date, endDate) {
  if (!date) return '';
  if (!endDate || endDate === date) return formatDate(date);
  const a = new Date(date + 'T00:00:00');
  const b = new Date(endDate + 'T00:00:00');
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = a.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const right = b.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${left} – ${right}`;
}

function formatPrice(min, max, currency) {
  if (min == null && max == null) return '';
  const sym = currency === 'USD' ? '$' : currency ? `${currency} ` : '$';
  if (min != null && max != null && min !== max) {
    return `${sym}${Math.round(min)} – ${sym}${Math.round(max)}`;
  }
  return `${sym}${Math.round(min ?? max)}`;
}

export default function Festivals() {
  const { shows, addShow, navigate } = useApp();

  const homeCity = useMemo(() => inferHomeCity(shows), [shows]);
  const myArtists = useMemo(
    () => new Set(topArtists(shows, 25).map((n) => n.toLowerCase())),
    [shows]
  );

  const [mode, setMode] = useState(homeCity ? 'near' : 'anywhere');
  const [festivals, setFestivals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addedIds, setAddedIds] = useState(new Set());

  useEffect(() => {
    setLoading(true);
    fetchFestivals({ city: mode === 'near' ? homeCity : undefined })
      .then((list) => setFestivals(list || []))
      .catch(() => setFestivals([]))
      .finally(() => setLoading(false));
  }, [mode, homeCity]);

  // Annotate each festival with the subset of its lineup that
  // intersects the user's top artists (case-insensitive).
  const annotated = useMemo(() => {
    return festivals.map((f) => {
      const matched = (f.lineup || []).filter((a) =>
        myArtists.has((a || '').toLowerCase())
      );
      return { ...f, matchedArtists: matched };
    });
  }, [festivals, myArtists]);

  const handleAddGoing = (festival) => {
    if (addedIds.has(festival.id)) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    addShow({
      id,
      artist: festival.name,
      date: festival.date,
      venue: festival.venue,
      city: festival.city,
      genre: '',
      score: 0,
      vibes: [],
      notes: '',
      setlist: [],
      buddies: [],
      status: SHOW_STATUS.GOING,
      wishlist: false,
      createdAt: new Date().toISOString(),
    });
    setAddedIds((prev) => new Set(prev).add(festival.id));
  };

  return (
    <div className="page page-top">
      <button className="back-btn" onClick={() => navigate('home')}>
        <svg viewBox="0 0 24 24">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>

      <div className="shows-header" style={{ marginBottom: 8 }}>
        <h1>Festivals</h1>
      </div>
      <p
        style={{
          color: 'var(--brown-muted)',
          fontSize: 14,
          marginTop: 0,
          marginBottom: 18,
        }}
      >
        Upcoming festivals featuring artists you love.
      </p>

      <div className="festival-mode-tabs">
        <button
          className={`shows-tab ${mode === 'near' ? 'active' : ''}`}
          onClick={() => setMode('near')}
          disabled={!homeCity}
        >
          {homeCity ? `Near ${homeCity}` : 'Near Me'}
        </button>
        <button
          className={`shows-tab ${mode === 'anywhere' ? 'active' : ''}`}
          onClick={() => setMode('anywhere')}
        >
          Anywhere
        </button>
      </div>

      {loading ? (
        <div className="upcoming-loading">Finding festivals…</div>
      ) : annotated.length === 0 ? (
        <div className="shows-empty fade-in">
          <div className="shows-empty-icon">🎪</div>
          <p>
            {mode === 'near' && homeCity
              ? `No festivals near ${homeCity} yet. Try Anywhere.`
              : "Couldn't load festivals right now. Check back later."}
          </p>
        </div>
      ) : (
        <div className="festival-list fade-in">
          {annotated.map((fest) => {
            const added = addedIds.has(fest.id);
            const priceLabel = formatPrice(
              fest.priceMin,
              fest.priceMax,
              fest.priceCurrency
            );
            return (
              <div key={fest.id} className="festival-card">
                {fest.image && (
                  <div
                    className="festival-card-img"
                    style={{ backgroundImage: `url(${fest.image})` }}
                  />
                )}
                <div className="festival-card-body">
                  <div className="festival-card-title">{fest.name}</div>
                  <div className="festival-card-meta">
                    {[fest.city, fest.state].filter(Boolean).join(', ')}
                    {fest.date && ' · '}
                    {formatRange(fest.date, fest.endDate)}
                    {priceLabel && (
                      <>
                        {' · '}
                        <span className="festival-card-price">{priceLabel}</span>
                      </>
                    )}
                  </div>

                  {fest.matchedArtists.length > 0 && (
                    <>
                      <div className="festival-card-badge">
                        🎤 {fest.matchedArtists.length} of your artists playing
                      </div>
                      <div className="festival-matched-artists">
                        {fest.matchedArtists.slice(0, 6).map((a) => (
                          <span key={a} className="festival-artist-chip">
                            {a}
                          </span>
                        ))}
                        {fest.matchedArtists.length > 6 && (
                          <span className="festival-artist-chip festival-artist-chip-more">
                            +{fest.matchedArtists.length - 6}
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  <div className="festival-actions">
                    <button
                      className={`upcoming-btn ${
                        added
                          ? 'upcoming-btn-going'
                          : 'upcoming-btn-wishlist'
                      }`}
                      onClick={() => handleAddGoing(fest)}
                      disabled={added}
                    >
                      {added ? '✓ Going' : '+ Going'}
                    </button>
                    {fest.ticketUrl && (
                      <a
                        className="upcoming-btn upcoming-btn-tickets"
                        href={fest.ticketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Tickets →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ticketmaster brand guidelines require visible attribution on
          surfaces that present their event listings. */}
      <div className="legal-attribution legal-attribution-center">
        Festival listings powered by Ticketmaster
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
