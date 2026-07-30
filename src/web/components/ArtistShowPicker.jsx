// ArtistShowPicker — the artist field, and the search behind it.
// ==============================================================
// Extracted verbatim from LogShow so the fast-log sheet can have it too. This
// is where logging speed actually comes from: picking a real row autofills
// venue, city, date, festival and the setlist in ONE tap. Without it a
// "quick" log is just four text inputs, which is no faster than the long form.
//
// Owns: the input, the artist avatar, both upstream searches, the dropdown,
// and the "use what I typed" escape hatch.
// Does NOT own: what happens to the picked data. It emits a normalised draft
// and the consuming sheet decides which of its fields to fill — LogShow fills
// thirteen sections and chases co-acts for opener suggestions; QuickLog fills
// four. Putting that decision here would mean the component knew about forms.
//
// Two upstream paths, by mode:
//   attended → Setlist.fm (past shows, with city/year narrowing)
//   future   → Deezer canonical match → Ticketmaster + JamBase upcoming events.
//              The Deezer hop is what lets someone type "luke c" and still
//              match "Luke Combs" upstream.
//
// docs/initiatives/2026-07-28-ia-simplification.md

import { useEffect, useRef, useState } from 'react';
import {
  fetchSetlists, fetchUpcomingEventsMulti, getCachedImage, fetchArtistImage, searchArtists,
} from '../api';
import { formatDate } from '../store';

// Title-case arbitrary input ("luke combs" → "Luke Combs") — the fallback when
// an external API doesn't echo back a canonical name.
export const titleCase = (s) =>
  String(s || '')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

const resultLocation = (s) =>
  [s.city, s.state, s.country && !s.state ? s.country : null].filter(Boolean).join(', ');

export default function ArtistShowPicker({
  value,
  onChange,
  onPick,
  mode = 'attended',          // 'attended' | 'future'
  enabled = true,             // false → render the input but run no searches
  city = '',
  date = '',
  apiKey = '',
  error = false,
  placeholder = 'Artist / Band',
  autoFocus = false,
}) {
  const isFuture = mode === 'future';

  const [open, setOpen] = useState(false);
  const [artistImage, setArtistImage] = useState(null);
  const [results, setResults] = useState([]);        // event rows
  const [matches, setMatches] = useState([]);        // Deezer artist suggestions
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);   // true after the first finished fetch
  // Set when the user picks a row, so the effect below doesn't immediately
  // re-search the value we just wrote and re-open the dropdown under them.
  const justPicked = useRef(false);
  const debounce = useRef(null);

  useEffect(() => {
    if (justPicked.current) { justPicked.current = false; return; }
    if (!enabled) { setResults([]); setMatches([]); setLoading(false); return undefined; }

    const q = String(value || '').trim();
    setSearched(false);
    if (q.length < 2) { setResults([]); setMatches([]); setLoading(false); return undefined; }
    // Setlist.fm queries are expensive; require 3+ characters there.
    if (!isFuture && q.length < 3) { setResults([]); return undefined; }
    // No bail when the user has no personal apiKey — the setlistfm-proxy Edge
    // Function falls back to a shared key so search works out of the box.

    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        if (isFuture) {
          const found = await searchArtists(q, 5);
          setMatches(found);
          // City is passed through so a heavy-touring artist's later-dated show
          // in a specific room still surfaces past the dozens of nearer dates.
          const probe = found[0]?.name || q;
          const events = await fetchUpcomingEventsMulti(probe, { city: city.trim() || undefined });
          setResults(events.slice(0, 8));
        } else {
          // Whatever's already typed into City/Date narrows the lookup, which
          // is what makes retroactive logging of old shows possible at all.
          const events = await fetchSetlists(q, apiKey, {
            city: city.trim() || undefined,
            year: date ? date.split('-')[0] : undefined,
          });
          setResults(Array.isArray(events) ? events.slice(0, 8) : []);
          setMatches([]);
        }
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, 500);

    return () => clearTimeout(debounce.current);
  }, [value, mode, apiKey, city, date, enabled, isFuture]);

  // Artist artwork, kept in sync as they type (cached Deezer image first).
  useEffect(() => {
    if (!enabled) { setArtistImage(null); return undefined; }
    const q = String(value || '').trim();
    if (q.length < 3) { setArtistImage(null); return undefined; }
    const cached = getCachedImage(q);
    if (cached) { setArtistImage(cached); return undefined; }
    let cancelled = false;
    const t = setTimeout(() => {
      fetchArtistImage(q).then((url) => { if (!cancelled && url) setArtistImage(url); });
    }, 700);
    return () => { cancelled = true; clearTimeout(t); };
  }, [value, enabled]);

  const close = () => { setOpen(false); setResults([]); setMatches([]); };

  const pickShow = (s) => {
    justPicked.current = true;
    close();
    onPick?.({
      kind: 'show',
      artist: s.artist || titleCase(value),
      venue: s.venue || '',
      city: s.city || '',
      date: s.date || '',
      festival: s.festival || '',
      songs: Array.isArray(s.songs) ? s.songs : [],
      lineup: Array.isArray(s.lineup) ? s.lineup : [],
      image: artistImage || '',
    });
  };

  // Canonical-name correction only. The dropdown deliberately stays OPEN so the
  // spinner shows while the corrected name re-fetches.
  const pickArtist = (m) => { setMatches([]); onPick?.({ kind: 'artist', artist: m.name }); };

  const pickTyped = () => { close(); onPick?.({ kind: 'typed', artist: titleCase(String(value).trim()) }); };

  const q = String(value || '').trim();

  return (
    <div className="log-input-wrap log-artist-wrap">
      {artistImage && <div className="log-artist-avatar" style={{ backgroundImage: `url(${artistImage})` }} />}
      <input
        className={`log-input ${artistImage ? 'with-avatar' : ''}`}
        placeholder={placeholder}
        value={value}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        style={error ? { borderColor: 'var(--red, #E24B4A)' } : undefined}
        onChange={(e) => { onChange?.(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {loading && <span className="log-input-spinner" aria-hidden />}

      {enabled && open && q.length >= 2 && (
        <div className="log-autocomplete log-show-picker">
          {loading && results.length === 0 && matches.length === 0 ? (
            <div className="log-show-empty">Searching {isFuture ? 'upcoming' : 'past'} shows…</div>
          ) : results.length > 0 ? (
            results.map((s, i) => (
              <div
                key={`${s.venue}-${s.date}-${i}`}
                className="log-show-item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickShow(s)}
              >
                <div className="log-show-item-main">
                  <div className="log-show-item-title">{s.artist || titleCase(q)}</div>
                  {s.festival && <div className="log-show-item-fest">🎪 {s.festival}</div>}
                  <div className="log-show-item-venue">{s.venue || 'Venue TBA'}</div>
                  <div className="log-show-item-meta">
                    {resultLocation(s)}
                    {resultLocation(s) && (s.date || s.displayDate) ? ' · ' : ''}
                    {s.date ? formatDate(s.date) : s.displayDate}
                  </div>
                </div>
                {!isFuture && s.songCount > 0 && <div className="log-show-item-songs">{s.songCount} songs</div>}
                {isFuture && <div className="log-show-item-songs upcoming">Upcoming</div>}
              </div>
            ))
          ) : isFuture && matches.length > 0 ? (
            <>
              <div className="log-show-empty" style={{ paddingBottom: 4 }}>
                No upcoming tour dates yet — pick an artist to autofill the name:
              </div>
              {matches.map((m) => (
                <div
                  key={m.name}
                  className="log-show-item log-artist-suggestion"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickArtist(m)}
                >
                  {m.image && <div className="log-suggest-avatar" style={{ backgroundImage: `url(${m.image})` }} />}
                  <div className="log-show-item-main">
                    <div className="log-show-item-title">{m.name}</div>
                    {m.fans > 0 && <div className="log-show-item-meta">{m.fans.toLocaleString()} fans on Deezer</div>}
                  </div>
                </div>
              ))}
            </>
          ) : searched ? (
            <div className="log-show-empty">
              No {isFuture ? 'upcoming tour dates' : 'setlists'} found for &quot;{q}&quot;.<br />
              <span style={{ opacity: 0.7, fontSize: 12 }}>
                {isFuture
                  ? 'Try the artist\'s full name — or just fill in the show details below manually.'
                  : 'Try the artist\'s exact name on Setlist.fm — or fill in the venue and date below yourself.'}
              </span>
            </div>
          ) : null}

          {/* The universal escape hatch — always selectable, so ANY band can be
              logged, including one that exists in no database. */}
          <div className="log-show-item log-use-typed" onMouseDown={(e) => e.preventDefault()} onClick={pickTyped}>
            <span className="log-use-typed-check" aria-hidden="true">✓</span>
            <div className="log-show-item-main">
              <div className="log-show-item-title">Use “{titleCase(q)}”</div>
              <div className="log-show-item-meta">Log this band as you typed it</div>
            </div>
          </div>

          <div className="log-show-attr">Powered by {isFuture ? 'Deezer + Ticketmaster' : 'Setlist.fm'}</div>
        </div>
      )}
    </div>
  );
}
