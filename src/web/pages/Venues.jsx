import { useMemo, useState, useEffect } from 'react';
import { useApp } from '../App';
import { isAttended, getArtistGradient, festivalKey, latestShowPhoto } from '../store';

// Heuristic venue "type" from its name — gives each venue an icon + lets us
// group by the KIND of room, which says something about your taste (a club
// rat vs an arena head). Ordered specific → generic.
function venueType(name) {
  const n = (name || '').toLowerCase();
  if (/festival|\bfest\b|smokeout|lollapalooza|coachella|bonnaroo/.test(n)) return { key: 'festival', icon: '🎪', label: 'Festivals' };
  if (/amphitheat|pavilion|\bshed\b|bandshell|band shell/.test(n)) return { key: 'amphitheater', icon: '⛰️', label: 'Amphitheaters' };
  if (/park|field|meadow|green\b|beach|farm|forest|lawn|grounds|polo/.test(n)) return { key: 'outdoor', icon: '🌲', label: 'Outdoors' };
  if (/arena|stadium|coliseum|colosseum|\bbowl\b|\bdome\b|fieldhouse|forum|garden\b|\bcent(er|re)\b/.test(n)) return { key: 'arena', icon: '🏟️', label: 'Arenas' };
  if (/theat(re|er)|opera|\bhall\b|auditorium|ballroom|palace|orpheum|fillmore/.test(n)) return { key: 'theater', icon: '🎭', label: 'Theaters' };
  if (/club|lounge|\bbar\b|\broom\b|tavern|cafe|basement|underground|social|cellar|saloon/.test(n)) return { key: 'club', icon: '🎸', label: 'Clubs' };
  return { key: 'other', icon: '📍', label: 'Other rooms' };
}

const PERSONALITY = {
  club: 'a club rat', arena: 'an arena head', theater: 'a theater buff',
  festival: 'a festival goer', outdoor: 'an open-air soul',
  amphitheater: 'an amphitheater regular', other: 'a live-music devotee',
};
const TYPE_ORDER = ['arena', 'amphitheater', 'theater', 'club', 'festival', 'outdoor', 'other'];

export default function Venues() {
  const { shows, navigate, setSelectedVenue, getVenueImage, prefetchVenueImages } = useApp();
  const [groupBy, setGroupBy] = useState('visits'); // 'visits' | 'type' | 'city'
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const VISIBLE_CAP = 12; // "Most seen" shows the top N; the rest live behind Show all / search

  // Exclude festival shows: a festival's individual acts each carry a STAGE as
  // their venue ("Sahara Tent", "Coachella Stage"), which would clutter the
  // rooms collection with stage names (and gradient cards, since Wikipedia has
  // no photo for a tent). Festivals already live in their own cards / detail
  // pages, so they don't belong in the venue tab.
  const attended = useMemo(
    () => shows.filter(isAttended).filter((s) => (s.venue || '').trim() && !festivalKey(s)),
    [shows]
  );

  const venues = useMemo(() => {
    const map = new Map();
    attended.forEach((s) => {
      const key = `${s.venue}|${s.city || ''}`.toLowerCase();
      if (!map.has(key)) map.set(key, { key, name: s.venue, city: s.city || '', shows: [], type: venueType(s.venue) });
      map.get(key).shows.push(s);
    });
    return [...map.values()].sort((a, b) => b.shows.length - a.shows.length || a.name.localeCompare(b.name));
  }, [attended]);

  // Kick off real venue-photo resolution (Wikimedia). Gradients show first,
  // then photos pop in as each resolves — same UX as artist images.
  useEffect(() => {
    prefetchVenueImages(venues.map((v) => ({ name: v.name, city: v.city })));
  }, [venues, prefetchVenueImages]);

  const home = venues[0];
  const personality = useMemo(() => {
    const counts = {};
    venues.forEach((v) => { counts[v.type.key] = (counts[v.type.key] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? PERSONALITY[top[0]] : null;
  }, [venues]);

  // Search jumps straight to a venue instead of scrolling — matches name or city.
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    return venues.filter((v) => v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q));
  }, [venues, q]);

  const openVenue = (v) => setSelectedVenue({ name: v.name, city: v.city });

  // Photo layered OVER the gradient (gradient shows through while it loads and
  // for any venue with no photo). Priority: YOUR own show photo at this venue →
  // the Wikimedia venue photo → gradient.
  const cardBg = (v) => {
    const grad = getArtistGradient(v.name);
    const url = latestShowPhoto(v.shows) || getVenueImage(v.name, v.city)?.url;
    return url ? `url("${url}") center / cover no-repeat, ${grad}` : grad;
  };

  const card = (v) => (
    <button key={v.key} type="button" className="venue-card" style={{ background: cardBg(v) }} onClick={() => openVenue(v)}>
      <div className="venue-card-overlay" />
      <div className="venue-card-icon" aria-hidden="true">{v.type.icon}</div>
      <div className="venue-card-count">{v.shows.length}×</div>
      <div className="venue-card-info">
        <div className="venue-card-name">{v.name}</div>
        {v.city && <div className="venue-card-city">{v.city}</div>}
      </div>
    </button>
  );

  // Grouped views
  const byType = useMemo(() => {
    const g = {};
    venues.forEach((v) => { (g[v.type.key] = g[v.type.key] || []).push(v); });
    return TYPE_ORDER.filter((k) => g[k]).map((k) => ({ label: venueType(g[k][0].name).label, icon: g[k][0].type.icon, key: k, list: g[k] }));
  }, [venues]);
  // Cities you frequent (2+ venues) get their own group; every one-venue city
  // collapses into a single "just passing through" section — otherwise a
  // well-travelled user gets dozens of tiny one-item groups.
  const byCity = useMemo(() => {
    const g = {};
    venues.forEach((v) => { const c = v.city || 'Unknown'; (g[c] = g[c] || []).push(v); });
    const all = Object.entries(g).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    return {
      multi: all.filter(([, list]) => list.length >= 2),
      singles: all.filter(([, list]) => list.length === 1).map(([, list]) => list[0]),
    };
  }, [venues]);

  return (
    <div className="page page-top">
      <button className="back-btn" onClick={() => navigate('stats')}>
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
        Stats
      </button>
      <div className="shows-header" style={{ marginBottom: 6 }}><h1>Your Rooms</h1></div>

      {attended.length === 0 ? (
        <p style={{ color: 'var(--brown-muted)', fontSize: 15, marginTop: 4 }}>
          Log a show with a venue and your rooms will start filling in here.
        </p>
      ) : (
        <>
          {personality && (
            <p className="venue-personality">
              {venues.length} rooms so far. You're <b>{personality}</b>.
            </p>
          )}

          {home && (
            <button type="button" className="venue-hero" style={{ background: cardBg(home) }} onClick={() => openVenue(home)}>
              <div className="venue-hero-overlay" />
              <div className="venue-hero-badge">🏠 Home venue</div>
              <div className="venue-hero-icon" aria-hidden="true">{home.type.icon}</div>
              <div className="venue-hero-info">
                <div className="venue-hero-name">{home.name}</div>
                <div className="venue-hero-meta">
                  {home.city ? `${home.city} · ` : ''}{home.shows.length} shows · {new Set(home.shows.map((s) => s.artist)).size} artists
                </div>
              </div>
            </button>
          )}

          <div className="venue-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
            <input
              type="text"
              placeholder={`Search your ${venues.length} rooms…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button type="button" className="venue-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </div>

          {q ? (
            matches.length ? (
              <>
                <div className="venues-year-head" style={{ marginTop: 4 }}>
                  {matches.length} {matches.length === 1 ? 'match' : 'matches'}
                </div>
                <div className="venue-grid">{matches.map(card)}</div>
              </>
            ) : (
              <p style={{ color: 'var(--brown-muted)', fontSize: 15, marginTop: 12 }}>
                No rooms match “{query.trim()}”.
              </p>
            )
          ) : (
            <>
              <div className="venue-seg">
                {[['visits', 'Most seen'], ['type', 'By type'], ['city', 'By city']].map(([k, label]) => (
                  <button key={k} type="button" className={`venue-seg-btn ${groupBy === k ? 'active' : ''}`} onClick={() => setGroupBy(k)}>
                    {label}
                  </button>
                ))}
              </div>

              {groupBy === 'visits' && (
                <>
                  <div className="venue-grid">{(showAll ? venues : venues.slice(0, VISIBLE_CAP)).map(card)}</div>
                  {venues.length > VISIBLE_CAP && (
                    <button type="button" className="feed-see-more" onClick={() => setShowAll((v) => !v)}>
                      {showAll ? 'Show less' : `Show all ${venues.length} rooms`}
                    </button>
                  )}
                </>
              )}

              {groupBy === 'type' && byType.map((g) => (
                <div key={g.key} className="venues-year-group">
                  <div className="venues-year-head">{g.icon} {g.label} <span className="venue-group-count">{g.list.length}</span></div>
                  <div className="venue-grid">{g.list.map(card)}</div>
                </div>
              ))}

              {groupBy === 'city' && (
                <>
                  {byCity.multi.map(([city, list]) => (
                    <div key={city} className="venues-year-group">
                      <div className="venues-year-head">{city} <span className="venue-group-count">{list.length}</span></div>
                      <div className="venue-grid">{list.map(card)}</div>
                    </div>
                  ))}
                  {byCity.singles.length > 0 && (
                    <div className="venues-year-group">
                      <div className="venues-year-head">
                        ✈️ Just passing through <span className="venue-group-count">{byCity.singles.length} {byCity.singles.length === 1 ? 'city' : 'cities'}</span>
                      </div>
                      <div className="venue-grid">{byCity.singles.map(card)}</div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <div style={{ height: 24 }} />
        </>
      )}
    </div>
  );
}
