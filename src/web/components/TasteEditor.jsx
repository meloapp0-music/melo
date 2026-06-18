import { useState } from 'react';
import { searchArtists } from '../api';

// Reusable "music taste" editor — favorite genres, artists, and home
// city. Controlled: pass value={{ genres, artists, city }} + onChange.
// Used by Onboarding, Settings, and the home re-prompt. Per
// docs/initiatives/2026-06-16-music-taste-onboarding.md.

const TASTE_GENRES = [
  'Rock', 'Pop', 'Hip-Hop', 'Country', 'Electronic',
  'R&B', 'Metal', 'Latin', 'Folk', 'Indie', 'Jazz', 'Alternative',
];

export default function TasteEditor({ value, onChange }) {
  const { genres = [], artists = [], city = '' } = value || {};
  const [artistQuery, setArtistQuery] = useState('');
  const [results, setResults] = useState([]);

  const set = (patch) => onChange({ genres, artists, city, ...patch });

  const toggleGenre = (g) =>
    set({ genres: genres.includes(g) ? genres.filter((x) => x !== g) : [...genres, g] });

  const runArtistSearch = async (q) => {
    setArtistQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    try {
      const r = await searchArtists(q.trim(), 6);
      setResults(r || []);
    } catch { setResults([]); }
  };

  const addArtist = (name) => {
    const n = (name || '').trim();
    if (n && !artists.some((a) => a.toLowerCase() === n.toLowerCase())) {
      set({ artists: [...artists, n] });
    }
    setArtistQuery('');
    setResults([]);
  };
  const removeArtist = (name) => set({ artists: artists.filter((a) => a !== name) });

  return (
    <div className="taste-editor">
      <div className="taste-label">Favorite genres</div>
      <div className="taste-genres">
        {TASTE_GENRES.map((g) => (
          <button
            key={g}
            type="button"
            className={`taste-genre ${genres.includes(g) ? 'active' : ''}`}
            onClick={() => toggleGenre(g)}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="taste-label">Artists you love</div>
      {artists.length > 0 && (
        <div className="taste-artist-chips">
          {artists.map((a) => (
            <span key={a} className="taste-artist-chip">
              {a}
              <button type="button" onClick={() => removeArtist(a)} aria-label={`Remove ${a}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="taste-artist-search">
        <input
          className="log-input"
          placeholder="Search an artist…"
          value={artistQuery}
          onChange={(e) => runArtistSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (artistQuery.trim()) addArtist(artistQuery); } }}
        />
        {artistQuery.trim().length >= 2 && (
          <div className="taste-artist-results">
            {results.map((r) => (
              <button
                key={r.name}
                type="button"
                className="taste-artist-result"
                onClick={() => addArtist(r.name)}
              >
                {r.image && <span className="taste-artist-img" style={{ backgroundImage: `url(${r.image})` }} />}
                <span>{r.name}</span>
              </button>
            ))}
            <button
              type="button"
              className="taste-artist-result taste-use-typed"
              onClick={() => addArtist(artistQuery)}
            >
              + Add “{artistQuery.trim()}”
            </button>
          </div>
        )}
      </div>

      <div className="taste-label">Your city</div>
      <input
        className="log-input"
        placeholder="e.g. Chicago"
        value={city}
        onChange={(e) => set({ city: e.target.value })}
      />
      <p className="taste-hint">Used to alert you when artists you love play near you.</p>
    </div>
  );
}
