import { useState, useMemo } from 'react';
import { useApp } from '../App';
import {
  getArtistGradient, formatDate,
  SHOW_STATUS, getShowStatus, isAttended, isGoing, isWishlist,
  ticketmasterSearchUrl,
} from '../store';

export default function MyShows() {
  const { shows, setSelectedShow, getArtistImage } = useApp();
  const [search, setSearch] = useState('');
  const [view, setView] = useState('grid');
  const [activeTab, setActiveTab] = useState(SHOW_STATUS.ATTENDED);
  const [genreFilter, setGenreFilter] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const base = shows.filter((s) => getShowStatus(s) === activeTab);

  const genres = useMemo(() => {
    const set = new Set(base.map((s) => s.genre).filter(Boolean));
    return [...set].sort();
  }, [base]);

  const filtered = useMemo(() => {
    let list = base;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.artist.toLowerCase().includes(q) ||
          s.venue.toLowerCase().includes(q) ||
          s.city.toLowerCase().includes(q)
      );
    }
    if (genreFilter) {
      list = list.filter((s) => s.genre === genreFilter);
    }
    if (favoritesOnly) {
      list = list.filter((s) => s.isFavorite);
    }
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [base, search, genreFilter, favoritesOnly]);

  const bgStyle = (artist) => {
    const img = getArtistImage(artist);
    const grad = getArtistGradient(artist);
    // Gradient is always the base layer so a slow or failed photo never
    // leaves a blank card; the artist photo (if any) sits on top of it.
    return img
      ? { background: `url("${img}") center / cover no-repeat, ${grad}` }
      : { background: grad };
  };

  return (
    <div className="page">
      <div className="shows-header">
        <h1>My Shows</h1>
      </div>

      <div className="shows-search">
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
        <input
          placeholder="Search artists, venues, cities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="shows-tabs">
        <button
          className={`shows-tab ${activeTab === SHOW_STATUS.ATTENDED ? 'active' : ''}`}
          onClick={() => setActiveTab(SHOW_STATUS.ATTENDED)}
        >
          Attended ({shows.filter(isAttended).length})
        </button>
        <button
          className={`shows-tab ${activeTab === SHOW_STATUS.GOING ? 'active' : ''}`}
          onClick={() => setActiveTab(SHOW_STATUS.GOING)}
        >
          Going ({shows.filter(isGoing).length})
        </button>
        <button
          className={`shows-tab ${activeTab === SHOW_STATUS.WISHLIST ? 'active' : ''}`}
          onClick={() => setActiveTab(SHOW_STATUS.WISHLIST)}
        >
          Wishlist ({shows.filter(isWishlist).length})
        </button>
      </div>

      <div className="shows-toolbar">
        <div className="shows-filters" style={{ flex: 1, margin: 0, padding: 0 }}>
          <button
            className={`filter-chip filter-chip-fav ${favoritesOnly ? 'active' : ''}`}
            onClick={() => setFavoritesOnly((v) => !v)}
            aria-pressed={favoritesOnly}
          >
            <span aria-hidden="true">★</span> Favorites
          </button>
          {genres.map((g) => (
            <button
              key={g}
              className={`filter-chip ${genreFilter === g ? 'active' : ''}`}
              onClick={() => setGenreFilter(genreFilter === g ? '' : g)}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="shows-view-toggle">
          <button
            className={`view-btn ${view === 'grid' ? 'active' : ''}`}
            onClick={() => setView('grid')}
          >
            <svg viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
          <button
            className={`view-btn ${view === 'list' ? 'active' : ''}`}
            onClick={() => setView('list')}
          >
            <svg viewBox="0 0 24 24">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="shows-empty fade-in">
          <div className="shows-empty-icon">
            {activeTab === SHOW_STATUS.WISHLIST ? '\u2734'
              : activeTab === SHOW_STATUS.GOING ? '\uD83C\uDFAB'
                : '\uD83C\uDFB6'}
          </div>
          <p>
            {activeTab === SHOW_STATUS.WISHLIST
              ? 'No shows on your wishlist yet'
              : activeTab === SHOW_STATUS.GOING
                ? "No upcoming shows you're going to yet"
                : 'No shows found'}
          </p>
        </div>
      ) : view === 'grid' ? (
        <div className="shows-grid fade-in">
          {filtered.map((show) => (
            <div
              key={show.id}
              className="show-poster"
              onClick={() => setSelectedShow(show)}
            >
              <div className="show-poster-bg" style={bgStyle(show.artist)} />
              {!getArtistImage(show.artist) && (
                <div className="poster-letter" aria-hidden="true">
                  {(show.artist || '?').trim().charAt(0).toUpperCase()}
                </div>
              )}
              <div className="show-poster-overlay" />
              {show.isFavorite && (
                <div className="show-poster-fav" aria-hidden="true">★</div>
              )}
              {isAttended(show) && show.score > 0 && (
                <div className="show-poster-score">
                  {Number.isInteger(show.score) ? show.score : show.score.toFixed(1)}
                </div>
              )}
              <div className="show-poster-info">
                <div className="show-poster-artist">{show.artist}</div>
                <div className="show-poster-date">{formatDate(show.date)}</div>
              </div>
              <div className="show-poster-venue">{show.venue || show.city}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="shows-list fade-in">
          {filtered.map((show) => (
            <div
              key={show.id}
              className="show-list-item"
              onClick={() => setSelectedShow(show)}
            >
              <div className="show-list-thumb" style={bgStyle(show.artist)} />
              <div className="show-list-info">
                <div className="show-list-artist">
                  {show.isFavorite && (
                    <span className="show-list-fav" aria-hidden="true">★</span>
                  )}
                  {show.artist}
                </div>
                <div className="show-list-meta">
                  {show.venue} &middot; {formatDate(show.date)}
                </div>
              </div>
              {isAttended(show) && show.score > 0 && (
                <div className="show-list-score">
                  {Number.isInteger(show.score) ? show.score : show.score.toFixed(1)}
                </div>
              )}
              {/* Tickets shortcut for Wishlist + Going — opens TM search
                  in a new tab. stopPropagation so the row tap (open detail)
                  doesn't fire when the user means to hit the link. */}
              {!isAttended(show) && (
                <a
                  className="show-list-tickets"
                  href={ticketmasterSearchUrl(show)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Find tickets for ${show.artist} on Ticketmaster`}
                >
                  Tickets
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 20 }} />
    </div>
  );
}
