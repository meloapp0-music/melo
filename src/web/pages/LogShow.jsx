import { useState, useEffect, useRef } from 'react';
import { useApp } from '../App';
import {
  VIBES, CITIES, VENUES_BY_CITY, GENRES, generateId, formatDate,
  SHOW_STATUS, getShowStatus,
} from '../store';
import { fetchSetlists, fetchUpcomingEvents, getCachedImage, fetchArtistImage, searchArtists } from '../api';
import PhotoPicker from '../components/PhotoPicker';

// Title-case an arbitrary user input ("luke combs" → "Luke Combs"). Used as a
// fallback when an external API doesn't echo back a canonical artist name.
const titleCase = (s) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

// Three-status segmented control. `editingShow` is set when LogShow is
// opened from the Home "How was X?" CTA — we hydrate all fields from
// the existing record and call updateShow on save instead of addShow.
export default function LogShow({ onClose, editingShow = null }) {
  const { addShow, updateShow, buddies, settings, navigate, session, showToast, setSelectedShow } = useApp();
  const userId = session?.user?.id || null;

  // When editing a past Going show, default-pivot it to Attended so the
  // user lands directly in the "score it" flow.
  const initialStatus = editingShow
    ? (getShowStatus(editingShow) === SHOW_STATUS.GOING
        ? SHOW_STATUS.ATTENDED
        : getShowStatus(editingShow))
    : SHOW_STATUS.ATTENDED;

  const [artist, setArtist] = useState(editingShow?.artist || '');
  const [date, setDate] = useState(editingShow?.date || '');
  const [city, setCity] = useState(editingShow?.city || '');
  const [venue, setVenue] = useState(editingShow?.venue || '');
  const [festival, setFestival] = useState(editingShow?.festival || '');
  const [genre, setGenre] = useState(editingShow?.genre || '');
  const [score, setScore] = useState(editingShow?.score || 0);
  const [vibes, setVibes] = useState(editingShow?.vibes || []);
  const [notes, setNotes] = useState(editingShow?.notes || '');
  const [setlist, setSetlist] = useState(
    editingShow?.setlist?.length ? editingShow.setlist : ['']
  );
  const [selBuddies, setSelBuddies] = useState(editingShow?.buddies || []);
  const [photos, setPhotos] = useState(editingShow?.photos || []);
  const [cityOpen, setCityOpen] = useState(false);
  const [venueOpen, setVenueOpen] = useState(false);
  const [status, setStatus] = useState(initialStatus);

  // Stable client-side id for new shows so photo uploads have a folder
  // to land in *before* the row exists. The DB ignores this id on
  // insert and assigns a real UUID — the photo paths just keep using
  // this temp segment, which doesn't break anything (storage RLS only
  // checks the FIRST folder segment = userId; the photos column stores
  // full URLs so they resolve regardless of path).
  const photoShowIdRef = useRef(editingShow?.id || generateId());

  // Convenience flags — keep the JSX guards readable.
  const isAttendedTab = status === SHOW_STATUS.ATTENDED;
  const isFutureTab = status === SHOW_STATUS.GOING || status === SHOW_STATUS.WISHLIST;

  // ----- Artist autocomplete (real shows from Setlist.fm / Ticketmaster) -----
  const [artistOpen, setArtistOpen] = useState(false);
  const [artistImage, setArtistImage] = useState(null);
  const [showResults, setShowResults] = useState([]);       // event rows
  const [artistMatches, setArtistMatches] = useState([]);   // Deezer artist suggestions (future-show fallback)
  const [showsLoading, setShowsLoading] = useState(false);
  const [showsSearched, setShowsSearched] = useState(false); // true after first finished fetch
  // Track whether the user just picked a result so we don't immediately
  // re-search and re-open the dropdown.
  const justPickedRef = useRef(false);
  const debounceRef = useRef(null);

  const apiKey = settings?.setlistFmKey || '';

  // Fetch real shows when artist or mode changes.
  // Future tabs (Going / Wishlist) → Deezer canonical match → Ticketmaster
  //   lookup. The Deezer step lets users type "luke c" and still match
  //   "Luke Combs" upstream.
  // Attended tab → Setlist.fm (needs API key).
  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false;
      return;
    }
    const q = artist.trim();
    setShowsSearched(false);
    if (q.length < 2) {
      setShowResults([]);
      setArtistMatches([]);
      setShowsLoading(false);
      return;
    }
    if (isAttendedTab && q.length < 3) {
      // Setlist.fm queries are expensive; require 3+ chars there.
      setShowResults([]);
      return;
    }
    if (isAttendedTab && !apiKey) {
      // Attended mode without an API key — nothing to fetch, the no-key
      // hint will handle the UX.
      setShowResults([]);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setShowsLoading(true);
      try {
        if (isFutureTab) {
          // 1. Ask Deezer for canonical artist matches (forgives "luke c").
          const matches = await searchArtists(q, 5);
          setArtistMatches(matches);

          // 2. For the top match (or the raw query as a fallback), look
          //    up upcoming events on Ticketmaster. Pass city through so
          //    a heavy-touring artist's later-dated shows in a specific
          //    city (e.g. Mt Joy at Red Rocks in August) surface even
          //    when there are dozens of nearer-dated shows elsewhere.
          const probe = matches[0]?.name || q;
          const events = await fetchUpcomingEvents(probe, {
            city: city.trim() || undefined,
          });
          setShowResults(events.slice(0, 8));
        } else {
          // Past-show lookup. Pass whatever the user has already typed
          // into the City / Date fields as filters so we can find
          // historical shows, not just the most recent 10.
          const year = date ? date.split('-')[0] : undefined;
          const events = await fetchSetlists(q, apiKey, {
            city: city.trim() || undefined,
            year,
          });
          setShowResults(Array.isArray(events) ? events.slice(0, 8) : []);
          setArtistMatches([]);
        }
        setArtistOpen(true);
      } catch {
        setShowResults([]);
      } finally {
        setShowsLoading(false);
        setShowsSearched(true);
      }
    }, 500);

    return () => clearTimeout(debounceRef.current);
    // city + date included so the Setlist.fm filter refines live as the
    // user fills in the other fields — enables retroactive logging of
    // historical shows (e.g. Goose at Salt Shed, Chicago, 2022).
  }, [artist, status, apiKey, city, date, isAttendedTab, isFutureTab]);

  // Keep artist artwork in sync as the user types (uses cached Deezer image).
  useEffect(() => {
    const q = artist.trim();
    if (q.length < 3) { setArtistImage(null); return; }
    const cached = getCachedImage(q);
    if (cached) { setArtistImage(cached); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      fetchArtistImage(q).then((url) => { if (!cancelled && url) setArtistImage(url); });
    }, 700);
    return () => { cancelled = true; clearTimeout(t); };
  }, [artist]);

  const filteredCities = city
    ? CITIES.filter((c) => c.toLowerCase().includes(city.toLowerCase()))
    : [];
  const cityVenues = VENUES_BY_CITY[city] || [];
  const filteredVenues = venue
    ? cityVenues.filter((v) => v.toLowerCase().includes(venue.toLowerCase()))
    : cityVenues;

  const toggleVibe = (name) =>
    setVibes((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]
    );

  const toggleBuddy = (name) =>
    setSelBuddies((prev) =>
      prev.includes(name) ? prev.filter((b) => b !== name) : [...prev, name]
    );

  const updateSetlist = (i, val) => {
    const next = [...setlist];
    next[i] = val;
    setSetlist(next);
  };

  const addSetlistItem = () => setSetlist([...setlist, '']);
  const removeSetlistItem = (i) => setSetlist(setlist.filter((_, idx) => idx !== i));

  // User picked a real show from the dropdown — autofill the whole form.
  const pickShow = (show) => {
    justPickedRef.current = true;
    if (show.artist) setArtist(show.artist);
    else setArtist((cur) => titleCase(cur));
    if (show.venue) setVenue(show.venue);
    if (show.city) setCity(show.city);
    if (show.date) setDate(show.date);
    // Auto-fill festival from setlist.fm if it's there and the user
    // hasn't already typed something. They can still edit after.
    if (show.festival && !festival.trim()) setFestival(show.festival);
    if (Array.isArray(show.songs) && show.songs.length > 0) setSetlist(show.songs);
    setArtistOpen(false);
    setShowResults([]);
    setArtistMatches([]);
  };

  // User picked an artist suggestion (Deezer) — replace the typed text
  // with the canonical name. The useEffect will re-run with the new value
  // and load fresh Ticketmaster events for the corrected name.
  const pickArtist = (match) => {
    setArtist(match.name);
    setArtistMatches([]);
    // Don't close the dropdown — let the spinner show while we re-fetch.
  };

  const handleSubmit = async () => {
    if (!artist.trim()) return;
    const payload = {
      artist: artist.trim(),
      date: date || new Date().toISOString().split('T')[0],
      city: city.trim(),
      venue: venue.trim(),
      festival: festival.trim(),
      genre,
      score,
      vibes,
      notes: notes.trim(),
      setlist: setlist.filter((s) => s.trim()),
      buddies: selBuddies,
      photos,
      status,
      // Legacy boolean shadow — kept in sync with status so any stray
      // reader that hasn't been migrated to the helpers still does the
      // right thing for Attended vs Wishlist. Going lands in the
      // "false" bucket (visible bug if any helper miss; intentional).
      wishlist: status === SHOW_STATUS.WISHLIST,
    };
    // We close the sheet first so the toast doesn't appear behind the
    // dimmed backdrop. Then fire-and-forget the save + show toast.
    onClose();
    let savedShow = null;
    if (editingShow) {
      await updateShow(editingShow.id, payload);
      savedShow = { ...editingShow, ...payload };
    } else {
      savedShow = await addShow({
        id: generateId(),
        ...payload,
        createdAt: new Date().toISOString(),
      });
    }
    if (showToast) {
      const verb = editingShow ? 'Updated' : 'Logged';
      showToast({
        message: `✓ ${verb} ${payload.artist}`,
        onClick: savedShow?.id ? () => setSelectedShow(savedShow) : undefined,
      });
    }
  };

  const showResultLocation = (s) =>
    [s.city, s.state, s.country && !s.state ? s.country : null]
      .filter(Boolean)
      .join(', ');

  const submitLabel = editingShow
    ? 'Save Show'
    : status === SHOW_STATUS.WISHLIST
      ? 'Add to Wishlist'
      : status === SHOW_STATUS.GOING
        ? "I'm Going"
        : 'Log Show';

  return (
    <div className="log-overlay">
      <div className="log-backdrop" onClick={onClose} />
      <div className="log-sheet">
        <div className="log-handle" />
        <div className="log-header">
          <h2>{editingShow ? 'Edit Show' : 'Log a Show'}</h2>
          <button className="log-close" onClick={onClose}>
            <svg viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="log-body">
          {/* Status segmented control: Attended / Going / Wishlist */}
          <div className="log-status-tabs">
            <button
              className={`shows-tab ${status === SHOW_STATUS.ATTENDED ? 'active' : ''}`}
              onClick={() => setStatus(SHOW_STATUS.ATTENDED)}
            >
              Attended
            </button>
            <button
              className={`shows-tab ${status === SHOW_STATUS.GOING ? 'active' : ''}`}
              onClick={() => setStatus(SHOW_STATUS.GOING)}
            >
              Going
            </button>
            <button
              className={`shows-tab ${status === SHOW_STATUS.WISHLIST ? 'active' : ''}`}
              onClick={() => setStatus(SHOW_STATUS.WISHLIST)}
            >
              Wishlist
            </button>
          </div>

          {/* Artist (with real-show autocomplete) & Date */}
          <div className="log-section">
            <div className="log-section-title">Details</div>

            <div className="log-input-wrap log-artist-wrap">
              {artistImage && (
                <div
                  className="log-artist-avatar"
                  style={{ backgroundImage: `url(${artistImage})` }}
                />
              )}
              <input
                className={`log-input ${artistImage ? 'with-avatar' : ''}`}
                placeholder="Artist / Band"
                value={artist}
                onChange={(e) => {
                  setArtist(e.target.value);
                  setArtistOpen(true);
                }}
                onFocus={() => setArtistOpen(true)}
                onBlur={() => setTimeout(() => setArtistOpen(false), 200)}
              />
              {showsLoading && (
                <span className="log-input-spinner" aria-hidden />
              )}

              {artistOpen && artist.trim().length >= 2 && (isFutureTab || apiKey) && (
                <div className="log-autocomplete log-show-picker">
                  {showsLoading && showResults.length === 0 && artistMatches.length === 0 ? (
                    <div className="log-show-empty">Searching {isFutureTab ? 'upcoming' : 'past'} shows…</div>
                  ) : showResults.length > 0 ? (
                    showResults.map((s, i) => (
                      <div
                        key={`${s.venue}-${s.date}-${i}`}
                        className="log-show-item"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickShow(s)}
                      >
                        <div className="log-show-item-main">
                          <div className="log-show-item-title">
                            {s.artist || titleCase(artist.trim())}
                          </div>
                          <div className="log-show-item-venue">{s.venue || 'Venue TBA'}</div>
                          <div className="log-show-item-meta">
                            {showResultLocation(s)}
                            {showResultLocation(s) && (s.date || s.displayDate) ? ' · ' : ''}
                            {s.date ? formatDate(s.date) : s.displayDate}
                          </div>
                        </div>
                        {isAttendedTab && s.songCount > 0 && (
                          <div className="log-show-item-songs">{s.songCount} songs</div>
                        )}
                        {isFutureTab && (
                          <div className="log-show-item-songs upcoming">Upcoming</div>
                        )}
                      </div>
                    ))
                  ) : isFutureTab && artistMatches.length > 0 ? (
                    <>
                      <div className="log-show-empty" style={{ paddingBottom: 4 }}>
                        No upcoming tour dates yet — pick an artist to autofill the name:
                      </div>
                      {artistMatches.map((m) => (
                        <div
                          key={m.name}
                          className="log-show-item log-artist-suggestion"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickArtist(m)}
                        >
                          {m.image && (
                            <div
                              className="log-suggest-avatar"
                              style={{ backgroundImage: `url(${m.image})` }}
                            />
                          )}
                          <div className="log-show-item-main">
                            <div className="log-show-item-title">{m.name}</div>
                            {m.fans > 0 && (
                              <div className="log-show-item-meta">
                                {m.fans.toLocaleString()} fans on Deezer
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  ) : showsSearched ? (
                    <div className="log-show-empty">
                      No {isFutureTab ? 'upcoming tour dates' : 'setlists'} found for "{artist.trim()}".<br />
                      <span style={{ opacity: 0.7, fontSize: 12 }}>
                        {isFutureTab
                          ? 'Try the artist\'s full name — or just fill in the show details below manually.'
                          : 'Try the artist\'s exact name as it appears on Setlist.fm.'}
                      </span>
                    </div>
                  ) : null}
                  <div className="log-show-attr">
                    Powered by {isFutureTab ? 'Deezer + Ticketmaster' : 'Setlist.fm'}
                  </div>
                </div>
              )}
            </div>

            {/* No-API-key hint (Attended mode only) — sleek, inline */}
            {isAttendedTab && !apiKey && artist.trim().length >= 3 && !showsLoading && (
              <div
                className="log-apikey-hint"
                onClick={() => { onClose(); navigate('settings'); }}
              >
                <div className="log-apikey-hint-icon">🎵</div>
                <div className="log-apikey-hint-text">
                  <strong>Auto-fill setlists</strong>
                  <span>Connect Setlist.fm — free, takes 30 sec</span>
                </div>
                <span className="log-apikey-hint-arrow">→</span>
              </div>
            )}

            <div className="log-row">
              <input
                className="log-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* Location */}
          <div className="log-section">
            <div className="log-section-title">Location</div>
            <div className="log-input-wrap">
              <input
                className="log-input"
                placeholder="City"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setCityOpen(true);
                }}
                onFocus={() => setCityOpen(true)}
                onBlur={() => setTimeout(() => setCityOpen(false), 200)}
              />
              {cityOpen && filteredCities.length > 0 && (
                <div className="log-autocomplete">
                  {filteredCities.slice(0, 6).map((c) => (
                    <div
                      key={c}
                      className="log-autocomplete-item"
                      onClick={() => {
                        setCity(c);
                        setCityOpen(false);
                      }}
                    >
                      {c}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="log-input-wrap">
              <input
                className="log-input"
                placeholder="Venue"
                value={venue}
                onChange={(e) => {
                  setVenue(e.target.value);
                  setVenueOpen(true);
                }}
                onFocus={() => setVenueOpen(true)}
                onBlur={() => setTimeout(() => setVenueOpen(false), 200)}
              />
              {venueOpen && filteredVenues.length > 0 && (
                <div className="log-autocomplete">
                  {filteredVenues.slice(0, 6).map((v) => (
                    <div
                      key={v}
                      className="log-autocomplete-item"
                      onClick={() => {
                        setVenue(v);
                        setVenueOpen(false);
                      }}
                    >
                      {v}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Festival — optional context for shows that were part of a
              festival lineup. Auto-fills from Setlist.fm when the user
              picks a setlist whose `info`/`tour`/`venue` mention one. */}
          <div className="log-section">
            <div className="log-section-title">
              Festival <span className="log-section-hint">optional</span>
            </div>
            <input
              className="log-input"
              placeholder="e.g. Jazz Fest, Coachella, Lollapalooza"
              value={festival}
              onChange={(e) => setFestival(e.target.value)}
            />
          </div>

          {/* Genre */}
          <div className="log-section">
            <div className="log-section-title">Genre</div>
            <div className="log-genre-chips">
              {GENRES.map((g) => (
                <button
                  key={g}
                  className={`genre-chip ${genre === g ? 'active' : ''}`}
                  onClick={() => setGenre(genre === g ? '' : g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Score — Attended only (Going & Wishlist haven't happened yet) */}
          {isAttendedTab && (
            <div className="log-section">
              <div className="log-section-title">Score</div>
              <div className="log-scores">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    className={`log-score ${score === n ? 'active' : ''}`}
                    onClick={() => setScore(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Vibes — Attended only */}
          {isAttendedTab && (
            <div className="log-section">
              <div className="log-section-title">Vibes</div>
              <div className="log-vibes">
                {VIBES.map((v) => (
                  <button
                    key={v.name}
                    className={`vibe-pill ${vibes.includes(v.name) ? 'active' : ''}`}
                    style={{
                      background: vibes.includes(v.name) ? v.bg : 'rgba(61,44,30,0.04)',
                      color: vibes.includes(v.name) ? v.color : '#9B8A7E',
                    }}
                    onClick={() => toggleVibe(v.name)}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Setlist — Attended only */}
          {isAttendedTab && (
            <div className="log-section">
              <div className="log-section-title">Setlist</div>
              {setlist.map((song, i) => (
                <div key={i} className="log-setlist-item">
                  <input
                    className="log-input"
                    placeholder={`Song ${i + 1}`}
                    value={song}
                    onChange={(e) => updateSetlist(i, e.target.value)}
                  />
                  {setlist.length > 1 && (
                    <button
                      className="log-setlist-remove"
                      onClick={() => removeSetlistItem(i)}
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
              <button className="log-add-btn" onClick={addSetlistItem}>
                + Add Song
              </button>
            </div>
          )}

          {/* Buddies — Attended only */}
          {isAttendedTab && buddies.length > 0 && (
            <div className="log-section">
              <div className="log-section-title">Went With</div>
              <div className="log-buddies">
                {buddies.map((b) => (
                  <button
                    key={b.id}
                    className={`buddy-chip ${selBuddies.includes(b.name) ? 'active' : ''}`}
                    onClick={() => toggleBuddy(b.name)}
                  >
                    <div
                      className="buddy-chip-avatar"
                      style={{ background: b.color }}
                    >
                      {b.name[0]}
                    </div>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes — Attended only */}
          {isAttendedTab && (
            <div className="log-section">
              <div className="log-section-title">Notes</div>
              <textarea
                className="log-textarea"
                placeholder="How was the show?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          )}

          {/* Photos — available for any status. Going/wishlist users may
              upload tickets or posters; attended users upload their
              concert shots. Limited only by Storage bucket size. */}
          {userId && (
            <div className="log-section">
              <div className="log-section-title">Photos</div>
              <PhotoPicker
                photos={photos}
                onChange={setPhotos}
                userId={userId}
                showId={photoShowIdRef.current}
              />
            </div>
          )}

          <button className="log-submit" onClick={handleSubmit}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
