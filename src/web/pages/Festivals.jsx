import { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../App';
import {
  formatDate, topArtists, inferHomeCity, SHOW_STATUS, generateId,
} from '../store';
import { fetchFestivals, searchEvents } from '../api';

// Discover "Shows" search modes. Genre values are Ticketmaster
// classification names (verified against the Discovery API).
const GENRES = [
  { label: 'Rock', value: 'Rock' },
  { label: 'Pop', value: 'Pop' },
  { label: 'Hip-Hop', value: 'Hip-Hop/Rap' },
  { label: 'Country', value: 'Country' },
  { label: 'Electronic', value: 'Dance/Electronic' },
  { label: 'R&B', value: 'R&B' },
  { label: 'Metal', value: 'Metal' },
  { label: 'Latin', value: 'Latin' },
  { label: 'Folk', value: 'Folk' },
];

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

  // Top-level Discover view: city-show search vs. festival browse.
  const [view, setView] = useState('shows'); // 'shows' | 'festivals'
  const [addedIds, setAddedIds] = useState(new Set());

  // ----- Festivals view state -----
  const [mode, setMode] = useState(homeCity ? 'near' : 'anywhere');
  const [festivals, setFestivals] = useState([]);
  const [loading, setLoading] = useState(false);

  // ----- Shows search view state -----
  // searchType: how the user is browsing — by 'city', 'artist', or
  // 'genre'. Each has its own input; results + loading are shared.
  const [searchType, setSearchType] = useState('city');
  const [cityQuery, setCityQuery] = useState(homeCity || '');
  const [artistQuery, setArtistQuery] = useState('');
  const [activeGenre, setActiveGenre] = useState('');
  const [cityEvents, setCityEvents] = useState([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [citySearched, setCitySearched] = useState(false);
  // What the current results represent — drives the empty-state copy so
  // it can't claim "no shows in {city}" after an artist/genre search.
  const [searchedLabel, setSearchedLabel] = useState('');

  useEffect(() => {
    if (view !== 'festivals') return;
    setLoading(true);
    fetchFestivals({ city: mode === 'near' ? homeCity : undefined })
      .then((list) => setFestivals(list || []))
      .catch(() => setFestivals([]))
      .finally(() => setLoading(false));
  }, [view, mode, homeCity]);

  // Monotonic token so a slow response from a prior search (or a search
  // in a mode the user has since left) can't land under the wrong tab.
  const searchSeq = useRef(0);

  // One search entry point for all three modes. `genreOverride` lets a
  // genre chip search on tap without waiting for state to settle.
  const runSearch = (genreOverride) => {
    let req;
    let label;
    if (searchType === 'artist') {
      const q = artistQuery.trim();
      if (!q) return;
      req = searchEvents({ keyword: q, size: 50 });
      label = q;
    } else if (searchType === 'genre') {
      const g = genreOverride || activeGenre;
      if (!g) return;
      setActiveGenre(g);
      // Genre is most useful filtered to where the user is; falls back
      // to a national browse when we don't know their home city.
      req = searchEvents({ genre: g, city: homeCity || undefined, size: 50 });
      const lbl = GENRES.find((x) => x.value === g)?.label || g;
      label = homeCity ? `${lbl} near ${homeCity}` : lbl;
    } else {
      const q = cityQuery.trim();
      if (!q) return;
      req = searchEvents({ city: q, size: 50 });
      label = q;
    }
    const seq = ++searchSeq.current;
    setCityLoading(true);
    setCitySearched(false);
    req
      .then((list) => { if (searchSeq.current === seq) setCityEvents(list || []); })
      .catch(() => { if (searchSeq.current === seq) setCityEvents([]); })
      .finally(() => {
        if (searchSeq.current !== seq) return; // superseded — drop it
        setCityLoading(false);
        setCitySearched(true);
        setSearchedLabel(label);
      });
  };

  // Switching mode clears prior results AND invalidates any in-flight
  // request so a late response can't repopulate the new tab.
  const switchSearchType = (t) => {
    if (t === searchType) return;
    searchSeq.current++;
    setSearchType(t);
    setCityEvents([]);
    setCitySearched(false);
    setCityLoading(false);
    setActiveGenre('');
  };

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

  // Taste-first: shows featuring an artist you love sort to the top.
  const sortedCityEvents = useMemo(() => {
    const liked = (e) => myArtists.has((e.artist || '').toLowerCase());
    return [...cityEvents].sort((a, b) => {
      const la = liked(a) ? 0 : 1;
      const lb = liked(b) ? 0 : 1;
      if (la !== lb) return la - lb;
      return (a.date || '').localeCompare(b.date || '');
    });
  }, [cityEvents, myArtists]);

  const handleAddGoing = (festival) => {
    if (addedIds.has(festival.id)) return;
    addShow({
      id: generateId(),
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

  // City-show discovery → Wishlist (browse-mode default: you haven't
  // bought yet). Tickets link covers the "how to get them" path.
  const handleAddWishlist = (ev) => {
    if (addedIds.has(ev.id)) return;
    addShow({
      id: generateId(),
      artist: ev.artist,
      date: ev.date,
      venue: ev.venue,
      city: ev.city,
      genre: '',
      score: 0,
      vibes: [],
      notes: '',
      setlist: [],
      buddies: [],
      openers: (ev.lineup || []).slice(1),
      status: SHOW_STATUS.WISHLIST,
      wishlist: true,
      createdAt: new Date().toISOString(),
    });
    setAddedIds((prev) => new Set(prev).add(ev.id));
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
        <h1>Discover</h1>
      </div>
      <p
        style={{
          color: 'var(--brown-muted)',
          fontSize: 14,
          marginTop: 0,
          marginBottom: 18,
        }}
      >
        Find concerts and festivals anywhere — see who's playing, where,
        and how to get tickets.
      </p>

      {/* Top-level view toggle */}
      <div className="festival-mode-tabs">
        <button
          className={`shows-tab ${view === 'shows' ? 'active' : ''}`}
          onClick={() => setView('shows')}
        >
          Shows
        </button>
        <button
          className={`shows-tab ${view === 'festivals' ? 'active' : ''}`}
          onClick={() => setView('festivals')}
        >
          Festivals
        </button>
      </div>

      {/* ===== SHOWS (city / artist / genre search) ===== */}
      {view === 'shows' && (
        <>
          {/* Search-mode toggle */}
          <div className="discover-type-tabs">
            <button
              className={`discover-type-tab ${searchType === 'city' ? 'active' : ''}`}
              onClick={() => switchSearchType('city')}
            >
              City
            </button>
            <button
              className={`discover-type-tab ${searchType === 'artist' ? 'active' : ''}`}
              onClick={() => switchSearchType('artist')}
            >
              Artist
            </button>
            <button
              className={`discover-type-tab ${searchType === 'genre' ? 'active' : ''}`}
              onClick={() => switchSearchType('genre')}
            >
              Genre
            </button>
          </div>

          {searchType === 'genre' ? (
            <div className="discover-genre-chips">
              {GENRES.map((g) => (
                <button
                  key={g.value}
                  className={`discover-genre-chip ${activeGenre === g.value ? 'active' : ''}`}
                  onClick={() => runSearch(g.value)}
                  disabled={cityLoading}
                >
                  {g.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="discover-search">
              <input
                className="log-input"
                placeholder={
                  searchType === 'artist'
                    ? 'Search an artist or band'
                    : 'Search a city (e.g. Austin)'
                }
                value={searchType === 'artist' ? artistQuery : cityQuery}
                onChange={(e) =>
                  searchType === 'artist'
                    ? setArtistQuery(e.target.value)
                    : setCityQuery(e.target.value)
                }
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              />
              <button
                className="discover-search-btn"
                onClick={() => runSearch()}
                disabled={
                  cityLoading ||
                  (searchType === 'artist' ? !artistQuery.trim() : !cityQuery.trim())
                }
              >
                {cityLoading ? '…' : 'Search'}
              </button>
            </div>
          )}

          {cityLoading ? (
            <div className="upcoming-loading">Finding shows…</div>
          ) : citySearched && sortedCityEvents.length === 0 ? (
            <div className="shows-empty fade-in">
              <div className="shows-empty-icon">🎫</div>
              <p>No upcoming shows found for "{searchedLabel}". Try another search.</p>
            </div>
          ) : sortedCityEvents.length > 0 ? (
            <div className="festival-list fade-in">
              {sortedCityEvents.map((ev) => {
                const added = addedIds.has(ev.id);
                const priceLabel = formatPrice(ev.priceMin, ev.priceMax, ev.priceCurrency);
                const liked = myArtists.has((ev.artist || '').toLowerCase());
                return (
                  <div key={ev.id} className="festival-card">
                    {ev.image && (
                      <div
                        className="festival-card-img"
                        style={{ backgroundImage: `url(${ev.image})` }}
                      />
                    )}
                    <div className="festival-card-body">
                      <div className="festival-card-title">{ev.artist}</div>
                      <div className="festival-card-meta">
                        {[ev.venue, ev.city].filter(Boolean).join(' · ')}
                        {ev.date && ' · '}
                        {ev.date && formatDate(ev.date)}
                        {priceLabel && (
                          <>
                            {' · '}
                            <span className="festival-card-price">{priceLabel}</span>
                          </>
                        )}
                      </div>

                      {liked && (
                        <div className="festival-card-badge">
                          🎤 An artist you love
                        </div>
                      )}

                      <div className="festival-actions">
                        <button
                          className={`upcoming-btn ${
                            added ? 'upcoming-btn-going' : 'upcoming-btn-wishlist'
                          }`}
                          onClick={() => handleAddWishlist(ev)}
                          disabled={added}
                        >
                          {added ? '✓ Added' : '+ Wishlist'}
                        </button>
                        {ev.ticketUrl && (
                          <a
                            className="upcoming-btn upcoming-btn-tickets"
                            href={ev.ticketUrl}
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
          ) : (
            <div className="shows-empty fade-in">
              <div className="shows-empty-icon">🎵</div>
              <p>
                {searchType === 'artist'
                  ? 'Search an artist to see where they’re playing.'
                  : searchType === 'genre'
                    ? 'Pick a genre to see what’s coming up.'
                    : 'Search a city to see who’s playing.'}
              </p>
            </div>
          )}
        </>
      )}

      {/* ===== FESTIVALS ===== */}
      {view === 'festivals' && (
        <>
          <div className="festival-mode-tabs" style={{ marginTop: 4 }}>
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
        </>
      )}

      {/* Ticketmaster brand guidelines require visible attribution on
          surfaces that present their event listings. */}
      <div className="legal-attribution legal-attribution-center">
        Listings powered by Ticketmaster
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
