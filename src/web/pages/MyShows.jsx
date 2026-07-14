import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../App';
import {
  getArtistGradient, formatDate, daysUntil,
  SHOW_STATUS, getShowStatus, isAttended, isGoing, isWishlist,
  ticketmasterSearchUrl, groupIntoOutings,
} from '../store';

// Honest "how soon" label for an upcoming (future-dated) show — used on
// Wishlist/Going items. Returns '' for past/attended shows, so it never
// clutters the Attended tab.
function upcomingLabel(dateStr) {
  if (!dateStr) return '';
  const d = daysUntil(dateStr);
  if (d < 0) return '';
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d <= 14) return `In ${d} days`;
  if (d <= 60) return `In ${Math.round(d / 7)} weeks`;
  return `In ${Math.round(d / 30)} months`;
}

export default function MyShows() {
  const { shows, setSelectedShow, getArtistImage, setSelectedFestival } = useApp();
  const [search, setSearch] = useState('');
  const [view, setView] = useState('grid');
  const [activeTab, setActiveTab] = useState(SHOW_STATUS.ATTENDED);
  const [genreFilter, setGenreFilter] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Genre chips are tab-specific (Attended/Going/Wishlist have different
  // genre sets), so a filter left over from another tab could silently hide
  // everything with no visible chip to explain why.
  useEffect(() => {
    setGenreFilter('');
  }, [activeTab]);

  const [festivalsOnly, setFestivalsOnly] = useState(false);

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

  // Festival card imagery: a real photo from any act at the festival, else the
  // headliner's artist image, else null (→ gradient only).
  const festivalImg = (o) => {
    const photo = (o.shows || []).map((s) => (s.photos || [])[0]).find(Boolean);
    return photo || getArtistImage((o.shows || [])[0]?.artist) || null;
  };
  const festivalBg = (o) => {
    const grad = getArtistGradient(o.festival);
    const img = festivalImg(o);
    return img
      ? { background: `url("${img}") center / cover no-repeat, ${grad}` }
      : { background: grad };
  };

  const festivalDateLabel = (o) =>
    o.dateStart && o.dateEnd && o.dateStart !== o.dateEnd
      ? `${formatDate(o.dateStart)} – ${formatDate(o.dateEnd)}`
      : formatDate(o.dateStart || o.date);

  // Attended tab collapses festivals into one card; Going/Wishlist have no
  // festivals, so their shows pass straight through as single-show items.
  const displayItems = useMemo(() => {
    if (activeTab !== SHOW_STATUS.ATTENDED) {
      return filtered.map((s) => ({ isFestival: false, key: s.id, show: s, date: s.date }));
    }
    let items = groupIntoOutings(filtered).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (festivalsOnly) items = items.filter((o) => o.isFestival);
    return items;
  }, [filtered, activeTab, festivalsOnly]);

  return (
    <div className="page">
      <div className="shows-header">
        <h1>My Shows</h1>
        <p style={{ margin: '2px 0 0', color: 'var(--brown-muted)', fontSize: 14 }}>
          Your whole concert history.
        </p>
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
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearch('')}
            style={{ background: 'none', border: 'none', padding: 0, display: 'flex', cursor: 'pointer', flexShrink: 0 }}
          >
            <svg viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
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
          {activeTab === SHOW_STATUS.ATTENDED && (
            <button
              className={`filter-chip ${festivalsOnly ? 'active' : ''}`}
              onClick={() => setFestivalsOnly((v) => !v)}
              aria-pressed={festivalsOnly}
            >
              <span aria-hidden="true">🎪</span> Festivals
            </button>
          )}
          {genres.length > 0 && (
            <button
              className={`filter-chip ${genreFilter === '' ? 'active' : ''}`}
              onClick={() => setGenreFilter('')}
            >
              All
            </button>
          )}
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

      {displayItems.length === 0 ? (
        <div className="shows-empty fade-in">
          <div className="shows-empty-icon">
            {activeTab === SHOW_STATUS.WISHLIST ? '\u2734'
              : activeTab === SHOW_STATUS.GOING ? '\uD83C\uDFAB'
                : festivalsOnly ? '\uD83C\uDFAA'
                  : '\uD83C\uDFB6'}
          </div>
          <p>
            {activeTab === SHOW_STATUS.WISHLIST
              ? 'No shows on your wishlist yet'
              : activeTab === SHOW_STATUS.GOING
                ? "No upcoming shows you're going to yet"
                : festivalsOnly
                  ? 'No festivals logged yet \u2014 log one from the Festival tab'
                  : 'No shows found'}
          </p>
        </div>
      ) : view === 'grid' ? (
        <div className="shows-grid fade-in">
          {displayItems.map((item) =>
            item.isFestival ? (
              <div key={item.key} className="show-poster" style={{ cursor: 'pointer' }} onClick={() => setSelectedFestival(item)}>
                <div className="show-poster-bg" style={festivalBg(item)} />
                {!festivalImg(item) && (
                  <div className="poster-letter" aria-hidden="true">
                    {(item.festival || '?').trim().charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="show-poster-overlay" />
                <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999 }}>
                  🎪 {item.artistCount} acts
                </div>
                {item.score > 0 && (
                  <div className="show-poster-score">
                    {Number.isInteger(item.score) ? item.score : item.score.toFixed(1)}
                  </div>
                )}
                <div className="show-poster-info">
                  <div className="show-poster-artist">{item.festival}</div>
                  <div className="show-poster-date">{festivalDateLabel(item)}</div>
                </div>
                <div className="show-poster-venue">{item.venue || item.city}</div>
              </div>
            ) : (
              <div
                key={item.show.id}
                className="show-poster"
                onClick={() => setSelectedShow(item.show)}
              >
                <div className="show-poster-bg" style={bgStyle(item.show.artist)} />
                {!getArtistImage(item.show.artist) && (
                  <div className="poster-letter" aria-hidden="true">
                    {(item.show.artist || '?').trim().charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="show-poster-overlay" />
                {item.show.isFavorite && (
                  <div className="show-poster-fav" aria-hidden="true">★</div>
                )}
                {isAttended(item.show) && item.show.score > 0 && (
                  <div className="show-poster-score">
                    {Number.isInteger(item.show.score) ? item.show.score : item.show.score.toFixed(1)}
                  </div>
                )}
                <div className="show-poster-info">
                  <div className="show-poster-artist">{item.show.artist}</div>
                  <div className="show-poster-date">
                    {formatDate(item.show.date)}
                    {upcomingLabel(item.show.date) && ` · ${upcomingLabel(item.show.date)}`}
                  </div>
                </div>
                <div className="show-poster-venue">{item.show.venue || item.show.city}</div>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="shows-list fade-in">
          {displayItems.map((item) =>
            item.isFestival ? (
              <div key={item.key} className="show-list-item" onClick={() => setSelectedFestival(item)}>
                <div className="show-list-thumb" style={festivalBg(item)} />
                <div className="show-list-info">
                  <div className="show-list-artist">🎪 {item.festival}</div>
                  <div className="show-list-meta">
                    {item.artistCount} artists &middot; {festivalDateLabel(item)}
                  </div>
                </div>
                {item.score > 0 && (
                  <div className="show-list-score">
                    {Number.isInteger(item.score) ? item.score : item.score.toFixed(1)}
                  </div>
                )}
              </div>
            ) : (
              <div
                key={item.show.id}
                className="show-list-item"
                onClick={() => setSelectedShow(item.show)}
              >
                <div className="show-list-thumb" style={bgStyle(item.show.artist)} />
                <div className="show-list-info">
                  <div className="show-list-artist">
                    {item.show.isFavorite && (
                      <span className="show-list-fav" aria-hidden="true">★</span>
                    )}
                    {item.show.artist}
                  </div>
                  <div className="show-list-meta">
                    {item.show.venue} &middot; {formatDate(item.show.date)}
                    {upcomingLabel(item.show.date) && (
                      <span style={{ color: '#E8573A', fontWeight: 700 }}> &middot; {upcomingLabel(item.show.date)}</span>
                    )}
                  </div>
                </div>
                {isAttended(item.show) && item.show.score > 0 && (
                  <div className="show-list-score">
                    {Number.isInteger(item.show.score) ? item.show.score : item.show.score.toFixed(1)}
                  </div>
                )}
                {/* Tickets shortcut for Wishlist + Going — opens TM search
                    in a new tab. stopPropagation so the row tap (open detail)
                    doesn't fire when the user means to hit the link. */}
                {!isAttended(item.show) && (
                  <a
                    className="show-list-tickets"
                    href={ticketmasterSearchUrl(item.show)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Find tickets for ${item.show.artist} on Ticketmaster`}
                  >
                    Tickets
                  </a>
                )}
              </div>
            )
          )}
        </div>
      )}

      <div style={{ height: 20 }} />
    </div>
  );
}
