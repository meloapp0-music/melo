import { useMemo, useState } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate, isAttended } from '../store';

export default function Artists() {
  const { shows, setSelectedShow, getArtistImage, navigate } = useApp();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());

  // Build per-artist summary: all attended shows grouped by artist,
  // with show count + avg score + latest show date for sorting. Same
  // shape/feel as the Songs page, which groups by artist too.
  const artistGroups = useMemo(() => {
    const groups = {};
    shows.filter(isAttended).forEach((s) => {
      if (!s.artist) return;
      if (!groups[s.artist]) {
        groups[s.artist] = {
          artist: s.artist,
          shows: [],
          totalScore: 0,
          scoredCount: 0,
        };
      }
      groups[s.artist].shows.push(s);
      if (s.score > 0) {
        groups[s.artist].totalScore += s.score;
        groups[s.artist].scoredCount++;
      }
    });
    return Object.values(groups)
      .map((g) => ({
        ...g,
        shows: g.shows.sort((a, b) => new Date(b.date) - new Date(a.date)),
        avgScore: g.scoredCount ? g.totalScore / g.scoredCount : 0,
        latestDate: g.shows[0]?.date || '',
      }))
      .sort(
        (a, b) =>
          b.shows.length - a.shows.length ||
          new Date(b.latestDate) - new Date(a.latestDate) ||
          a.artist.localeCompare(b.artist)
      );
  }, [shows]);

  const filtered = useMemo(() => {
    if (!search.trim()) return artistGroups;
    const q = search.toLowerCase();
    return artistGroups.filter((g) => g.artist.toLowerCase().includes(q));
  }, [artistGroups, search]);

  const toggle = (artist) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(artist)) next.delete(artist);
      else next.add(artist);
      return next;
    });
  };

  const bgStyle = (artist) => {
    const img = getArtistImage(artist);
    return img
      ? {
        backgroundImage: `url(${img})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
      : { background: getArtistGradient(artist) };
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
        <h1>Artists</h1>
      </div>
      <p
        style={{
          color: 'var(--brown-muted)',
          fontSize: 14,
          marginTop: 0,
          marginBottom: 18,
        }}
      >
        {artistGroups.length} artist{artistGroups.length === 1 ? '' : 's'} you've seen live.
      </p>

      <div className="shows-search">
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
        <input
          placeholder="Search artists..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="shows-empty fade-in">
          <div className="shows-empty-icon">🎤</div>
          <p>
            {artistGroups.length === 0
              ? "You haven't logged any shows yet"
              : 'No artists match that search'}
          </p>
        </div>
      ) : (
        <div className="artists-list fade-in">
          {filtered.map((g) => {
            const isOpen = expanded.has(g.artist);
            const scoreLabel = g.scoredCount
              ? Number.isInteger(g.avgScore)
                ? g.avgScore
                : g.avgScore.toFixed(1)
              : '—';
            return (
              <div
                key={g.artist}
                className={`artist-card ${isOpen ? 'open' : ''}`}
              >
                <button
                  className="artist-card-head"
                  onClick={() => toggle(g.artist)}
                  aria-expanded={isOpen}
                >
                  <div className="artist-card-thumb" style={bgStyle(g.artist)} />
                  <div className="artist-card-info">
                    <div className="artist-card-name">{g.artist}</div>
                    <div className="artist-card-meta">
                      {g.shows.length} show{g.shows.length === 1 ? '' : 's'}
                      {' · '}
                      avg {scoreLabel}
                    </div>
                  </div>
                  <svg
                    className="artist-card-chevron"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="artist-card-shows">
                    {g.shows.map((show) => (
                      <button
                        key={show.id}
                        className="artist-show-row"
                        onClick={() => setSelectedShow(show)}
                      >
                        <div className="artist-show-info">
                          <div className="artist-show-venue">
                            {show.venue || show.city || 'Show'}
                          </div>
                          <div className="artist-show-date">
                            {formatDate(show.date)}
                            {show.city ? ` · ${show.city}` : ''}
                          </div>
                        </div>
                        {show.score > 0 && (
                          <div className="artist-show-score">
                            {Number.isInteger(show.score)
                              ? show.score
                              : show.score.toFixed(1)}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
}
