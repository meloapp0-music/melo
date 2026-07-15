import { useMemo, useState, useEffect } from 'react';
import { useApp } from '../App';
import { getArtistGradient, isAttended, groupIntoOutings, festivalKey } from '../store';

const article = (w) => (/^[aeiou]/i.test(w || '') ? 'an' : 'a');
const VISIBLE_CAP = 12;
// A festival where you logged this many acts+ collapses into ONE festival tile
// instead of flooding your lineup. Log only a couple acts → they stay separate.
const FEST_CARD_MIN = 4;

// "Your Lineup" — a collection wall of every artist you've seen live, sibling to
// "Your Rooms". Artist photos (Deezer) make it a trophy wall; repeats become a
// loyalty badge. A big festival log consolidates into one tappable festival tile.
export default function Artists() {
  const { shows, navigate, getArtistImage, prefetchImages, setSelectedArtist, setSelectedFestival } = useApp();
  const [groupBy, setGroupBy] = useState('seen'); // 'seen' | 'genre' | 'recent'
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const attended = useMemo(() => shows.filter(isAttended).filter((s) => s.artist), [shows]);

  // Per-artist summary (keeps its shows so we can tell festival vs standalone).
  const artists = useMemo(() => {
    const map = new Map();
    attended.forEach((s) => {
      let a = map.get(s.artist);
      if (!a) { a = { name: s.artist, shows: [], genres: {} }; map.set(s.artist, a); }
      a.shows.push(s);
      if (s.genre) a.genres[s.genre] = (a.genres[s.genre] || 0) + 1;
    });
    return [...map.values()].map((a) => {
      const dates = a.shows.map((s) => s.date).filter(Boolean).sort();
      const scored = a.shows.filter((s) => s.score > 0);
      return {
        name: a.name,
        shows: a.shows,
        count: a.shows.length,
        genre: Object.entries(a.genres).sort((x, y) => y[1] - x[1])[0]?.[0] || '',
        firstYear: dates[0]?.slice(0, 4) || '',
        lastDate: dates[dates.length - 1] || '',
        avg: scored.length ? scored.reduce((t, s) => t + s.score, 0) / scored.length : 0,
      };
    }).sort((x, y) =>
      y.count - x.count ||
      (y.lastDate || '').localeCompare(x.lastDate || '') ||
      x.name.localeCompare(y.name));
  }, [attended]);

  useEffect(() => { prefetchImages(artists.map((a) => a.name)); }, [artists, prefetchImages]);

  // "Big" festivals (>= FEST_CARD_MIN acts logged) collapse into a tile. An
  // artist stays an individual card only if they were seen somewhere OTHER than
  // a big festival (a standalone show, or a small festival) — so a headliner you
  // also caught on their own tour never disappears into a festival tile.
  const outings = useMemo(() => groupIntoOutings(attended), [attended]);
  const bigFests = useMemo(
    () => outings.filter((o) => o.isFestival && new Set(o.shows.map((s) => s.artist)).size >= FEST_CARD_MIN),
    [outings]
  );
  const bigFestKeys = useMemo(() => new Set(bigFests.map((o) => o.key)), [bigFests]);

  const festItems = useMemo(() => bigFests.map((o) => ({
    kind: 'festival',
    key: `fest-${o.key}`,
    outing: o,
    name: o.festival,
    actCount: new Set(o.shows.map((s) => s.artist)).size,
    date: o.date || '',
  })).sort((a, b) => b.actCount - a.actCount), [bigFests]);

  const soloArtists = useMemo(
    () => artists
      .filter((a) => a.shows.some((s) => !bigFestKeys.has(festivalKey(s))))
      .map((a) => ({ kind: 'artist', key: a.name, ...a })),
    [artists, bigFestKeys]
  );

  // The hero must come from the FOLDED list. Reading `artists[0]` crowns the
  // most-seen artist overall — including one who was only ever seen at a big
  // festival and therefore has no card on this page at all (they're folded into
  // the festival tile). Log nothing but Coachella and the grid would show a
  // single festival tile under a hero for an act with no card. `soloArtists`
  // preserves `artists`' ordering, so [0] is still the most-seen.
  const home = soloArtists[0];
  const superfans = useMemo(() => artists.filter((a) => a.count >= 3).length, [artists]);
  const topGenre = useMemo(() => {
    const g = {};
    artists.forEach((a) => { if (a.genre) g[a.genre] = (g[a.genre] || 0) + 1; });
    return Object.entries(g).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }, [artists]);

  const weight = (it) => (it.kind === 'festival' ? it.actCount : it.count);
  const dateOf = (it) => (it.kind === 'festival' ? it.date : it.lastDate) || '';

  const bySeen = useMemo(
    () => [...soloArtists, ...festItems].sort((a, b) => weight(b) - weight(a) || a.name.localeCompare(b.name)),
    [soloArtists, festItems]
  );
  const byRecent = useMemo(
    () => [...soloArtists, ...festItems].sort((a, b) => dateOf(b).localeCompare(dateOf(a))),
    [soloArtists, festItems]
  );
  const byGenre = useMemo(() => {
    const g = {};
    soloArtists.forEach((a) => { const k = a.genre || 'Other'; (g[k] = g[k] || []).push(a); });
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [soloArtists]);

  // Search bypasses folding — you can always find any artist, even one only
  // seen at a big festival.
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    return [
      ...artists.filter((a) => a.name.toLowerCase().includes(q)).map((a) => ({ kind: 'artist', key: a.name, ...a })),
      ...festItems.filter((f) => f.name.toLowerCase().includes(q)),
    ];
  }, [artists, festItems, q]);

  const bg = (a) => {
    const grad = getArtistGradient(a.name);
    const img = getArtistImage(a.name);
    return img ? `url("${img}") center / cover no-repeat, ${grad}` : grad;
  };

  const artistCard = (a) => (
    <button key={a.key} type="button" className="venue-card" style={{ background: bg(a) }} onClick={() => setSelectedArtist({ name: a.name })}>
      <div className="venue-card-overlay" />
      {a.count >= 2 && <div className="venue-card-count">{a.count}×</div>}
      <div className="venue-card-info">
        <div className="venue-card-name">{a.name}</div>
        {(a.genre || a.firstYear) && (
          <div className="venue-card-city">{a.genre || `since ${a.firstYear}`}</div>
        )}
      </div>
    </button>
  );

  const festCard = (f) => (
    <button key={f.key} type="button" className="venue-card" style={{ background: getArtistGradient(f.name) }} onClick={() => setSelectedFestival(f.outing)}>
      <div className="venue-card-overlay" />
      <div className="venue-card-icon" aria-hidden="true">🎪</div>
      <div className="venue-card-info">
        <div className="venue-card-name">{f.name}</div>
        <div className="venue-card-city">{f.actCount} acts</div>
      </div>
    </button>
  );

  const tile = (it) => (it.kind === 'festival' ? festCard(it) : artistCard(it));

  return (
    <div className="page page-top">
      <button className="back-btn" onClick={() => navigate('stats')}>
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
        Stats
      </button>
      <div className="shows-header" style={{ marginBottom: 6 }}><h1>Your Lineup</h1></div>

      {artists.length === 0 ? (
        <p style={{ color: 'var(--brown-muted)', fontSize: 15, marginTop: 4 }}>
          Log a show and every artist you’ve seen live will fill in here.
        </p>
      ) : (
        <>
          <p className="venue-personality">
            {artists.length} artist{artists.length === 1 ? '' : 's'} seen live.{' '}
            {topGenre
              ? <>You’re <b>{article(topGenre)} {topGenre.toLowerCase()} devotee</b>.</>
              : <>Your live-music <b>hall of fame</b>.</>}
            {superfans > 0 && <> {superfans} you’ve seen 3+ times.</>}
          </p>

          {home && (
            <button type="button" className="venue-hero" style={{ background: bg(home) }} onClick={() => setSelectedArtist({ name: home.name })}>
              <div className="venue-hero-overlay" />
              <div className="venue-hero-badge">🎤 Most seen</div>
              <div className="venue-hero-info">
                <div className="venue-hero-name">{home.name}</div>
                <div className="venue-hero-meta">
                  Seen {home.count}×{home.firstYear ? ` · since ${home.firstYear}` : ''}{home.genre ? ` · ${home.genre}` : ''}
                </div>
              </div>
            </button>
          )}

          <div className="venue-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
            <input type="text" placeholder={`Search your ${artists.length} artists…`} value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && (
              <button type="button" className="venue-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </div>

          {q ? (
            matches.length ? (
              <>
                <div className="venues-year-head" style={{ marginTop: 4 }}>{matches.length} {matches.length === 1 ? 'match' : 'matches'}</div>
                <div className="venue-grid">{matches.map(tile)}</div>
              </>
            ) : (
              <p style={{ color: 'var(--brown-muted)', fontSize: 15, marginTop: 12 }}>No artists match “{query.trim()}”.</p>
            )
          ) : (
            <>
              <div className="venue-seg">
                {[['seen', 'Most seen'], ['genre', 'By genre'], ['recent', 'Recently']].map(([k, label]) => (
                  <button key={k} type="button" className={`venue-seg-btn ${groupBy === k ? 'active' : ''}`} onClick={() => setGroupBy(k)}>
                    {label}
                  </button>
                ))}
              </div>

              {groupBy === 'seen' && (
                <>
                  <div className="venue-grid">{(showAll ? bySeen : bySeen.slice(0, VISIBLE_CAP)).map(tile)}</div>
                  {bySeen.length > VISIBLE_CAP && (
                    <button type="button" className="feed-see-more" onClick={() => setShowAll((v) => !v)}>
                      {showAll ? 'Show less' : `Show all ${bySeen.length}`}
                    </button>
                  )}
                </>
              )}

              {groupBy === 'genre' && (
                <>
                  {byGenre.map(([genre, list]) => (
                    <div key={genre} className="venues-year-group">
                      <div className="venues-year-head">{genre} <span className="venue-group-count">{list.length}</span></div>
                      <div className="venue-grid">{list.map(tile)}</div>
                    </div>
                  ))}
                  {festItems.length > 0 && (
                    <div className="venues-year-group">
                      <div className="venues-year-head">🎪 Festivals <span className="venue-group-count">{festItems.length}</span></div>
                      <div className="venue-grid">{festItems.map(tile)}</div>
                    </div>
                  )}
                </>
              )}

              {groupBy === 'recent' && <div className="venue-grid">{byRecent.map(tile)}</div>}
            </>
          )}

          <div style={{ height: 24 }} />
        </>
      )}
    </div>
  );
}
