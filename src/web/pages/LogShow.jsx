import { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../App';
import {
  VIBES, CITIES, VENUES_BY_CITY, GENRES, generateId, formatDate,
  SHOW_STATUS, getShowStatus,
} from '../store';
import { fetchSetlists, fetchUpcomingEventsMulti, getCachedImage, fetchArtistImage, searchArtists, fetchCoActs, searchPastShows, searchFestivalByName, searchFestivalNames, FESTIVAL_NAMES } from '../api';
import { listFriends } from '../lib/db/friendships';
import { tagAttendee, untagAttendee, listAttendees } from '../lib/db/shows';
import { track } from '../lib/analytics';
import PhotoPicker from '../components/PhotoPicker';
import VideoPicker from '../components/VideoPicker';

// Title-case an arbitrary user input ("luke combs" → "Luke Combs"). Used as a
// fallback when an external API doesn't echo back a canonical artist name.
const titleCase = (s) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

// Festival name field with a suggestion dropdown (mirrors the city/venue
// autocomplete). Suggests known festivals as you type; onSelect fires when the
// user picks one, so the caller can immediately pull that festival's lineup.
function FestivalAutocomplete({ value, onChange, onSelect, placeholder }) {
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState([]); // live TM festival-name matches
  const debounceRef = useRef(null);
  const q = (value || '').trim().toLowerCase();

  // Curated matches are instant and reliable — they also cover big festivals
  // TM doesn't currently list as on-sale events (e.g. Coachella).
  const curated = (q ? FESTIVAL_NAMES.filter((n) => n.toLowerCase().includes(q)) : FESTIVAL_NAMES).slice(0, 6);

  // Live Ticketmaster festival-name search (debounced) so ANY festival —
  // Windy City Smokeout and the long tail — autofills, not just the curated
  // list. Only runs while the dropdown is open and 2+ chars are typed.
  useEffect(() => {
    if (!open || q.length < 2) { setLive([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try { setLive(await searchFestivalNames((value || '').trim(), 6)); }
      catch { setLive([]); }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [q, open, value]);

  // Merge curated first, then live names not already shown (case-insensitive).
  const seen = new Set(curated.map((n) => n.toLowerCase()));
  const matches = [...curated];
  for (const n of live) {
    const lc = n.toLowerCase();
    if (!seen.has(lc)) { seen.add(lc); matches.push(n); }
  }
  const shown = matches.slice(0, 8);

  return (
    <div className="log-input-wrap">
      <input
        className="log-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && shown.length > 0 && (
        <div className="log-autocomplete">
          {shown.map((n) => (
            <div
              key={n}
              className="log-autocomplete-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(n); setOpen(false); onSelect?.(n); }}
            >
              🎪 {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Three-status segmented control. `editingShow` is set when LogShow is
// opened from the Home "How was X?" CTA — we hydrate all fields from
// the existing record and call updateShow on save instead of addShow.
// `prefill` lets a caller open LogShow straight into a specific mode instead
// of the default blank form — e.g. a tapped tour/genre-alert notification
// opens Wishlist's Search view (mode 'tour'), pre-searched for that artist,
// instead of landing on a blank Home. Shape: { status, mode, tourArtist }.
// Ignored while editing an existing show.
export default function LogShow({ onClose, editingShow = null, prefill = null }) {
  const { addShow, addShows, updateShow, buddies, settings, navigate, session, showToast, setSelectedShow } = useApp();
  const userId = session?.user?.id || null;

  // When editing a past Going show, default-pivot it to Attended so the
  // user lands directly in the "score it" flow.
  const initialStatus = editingShow
    ? (getShowStatus(editingShow) === SHOW_STATUS.GOING
        ? SHOW_STATUS.ATTENDED
        : getShowStatus(editingShow))
    : (prefill?.status || SHOW_STATUS.ATTENDED);

  const [artist, setArtist] = useState(editingShow?.artist || '');
  const [date, setDate] = useState(editingShow?.date || '');
  const [city, setCity] = useState(editingShow?.city || '');
  const [venue, setVenue] = useState(editingShow?.venue || '');
  // We don't capture `venueUrl` from autofill — both Ticketmaster and
  // Setlist.fm return their own internal venue pages, not the official
  // venue website. ShowDetail auto-resolves the official URL via
  // Wikipedia/Wikidata on first open and caches the result.
  // For an editing show, we carry the existing URL forward unless the
  // user changes the venue field (in which case the stored URL no
  // longer matches and gets cleared so ShowDetail re-resolves).
  const [venueUrl, setVenueUrl] = useState(editingShow?.venueUrl || '');
  const [festival, setFestival] = useState(editingShow?.festival || '');
  const [genre, setGenre] = useState(editingShow?.genre || '');
  const [score, setScore] = useState(editingShow?.score || 0);
  const [vibes, setVibes] = useState(editingShow?.vibes || []);
  const [notes, setNotes] = useState(editingShow?.notes || '');
  const [setlist, setSetlist] = useState(
    editingShow?.setlist?.length ? editingShow.setlist : ['']
  );
  const [selBuddies, setSelBuddies] = useState(editingShow?.buddies || []);

  // Real-friend tags (show_attendees) — distinct from the free-text
  // `selBuddies`. These link to actual Melo users, power the feed's
  // "going with …" line, and let friends-of-friends be discovered. Tags
  // are written after the show row exists (it needs an id). Per
  // docs/initiatives/2026-06-14-social-feed-likes-comments.md.
  const [friends, setFriends] = useState([]);
  const [taggedIds, setTaggedIds] = useState(new Set());
  const originalTagsRef = useRef(new Set());
  useEffect(() => {
    let cancelled = false;
    listFriends().then((fr) => { if (!cancelled) setFriends(fr); }).catch(() => {});
    if (editingShow?.id) {
      listAttendees(editingShow.id).then((rows) => {
        if (cancelled) return;
        const ids = new Set((rows || []).map((r) => r.user_id));
        setTaggedIds(ids);
        originalTagsRef.current = new Set(ids);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [editingShow?.id]);

  const toggleTag = (uid) =>
    setTaggedIds((prev) => {
      const n = new Set(prev);
      if (n.has(uid)) n.delete(uid); else n.add(uid);
      return n;
    });
  const [newBuddyName, setNewBuddyName] = useState('');
  // Openers — opening acts on the bill. Auto-suggested from
  // Ticketmaster's `lineup` (upcoming shows) or a Setlist.fm co-act
  // lookup at the same venue+date (past shows). Per v1.0.6 initiative.
  const [openers, setOpeners] = useState(editingShow?.openers || []);
  const [openerSuggestions, setOpenerSuggestions] = useState([]);
  const [newOpenerName, setNewOpenerName] = useState('');
  const [photos, setPhotos] = useState(editingShow?.photos || []);
  const [videos, setVideos] = useState(editingShow?.videos || []);
  const [cityOpen, setCityOpen] = useState(false);
  const [venueOpen, setVenueOpen] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const [artistError, setArtistError] = useState(false);
  const [saving, setSaving] = useState(false);

  // ----- "Find a past show" finder mode (Attended tab) -----
  // Location-first search so festival-goers can find shows without
  // typing each artist. Per v1.0.7 festival-past-show-finder initiative.
  // Attended modes: 'quick' | 'festival' | 'finder'. Going/Wishlist modes:
  // 'tour' (labeled "Search" in the UI — kept 'tour' internally to avoid
  // churn) | 'festival'. Going/Wishlist has no 'quick' form; its manual-entry
  // escape hatch lives inside Search mode (see `manualEntry`).
  // Editing ALWAYS uses the full quick-log form (that's the edit form), for
  // any status — otherwise editing a Wishlist/Going show would land on the
  // empty Search view instead of the show's fields. Only NEW future shows
  // default to Search ('tour').
  const [logMode, setLogMode] = useState(
    editingShow
      ? 'quick'
      : prefill?.mode || (initialStatus === SHOW_STATUS.ATTENDED ? 'quick' : 'tour')
  );
  const [finderFestival, setFinderFestival] = useState('');
  const [finderSource, setFinderSource] = useState('past'); // 'past' | 'festival' | 'tour'
  const [tourArtist, setTourArtist] = useState((!editingShow && prefill?.tourArtist) || ''); // Going/Wishlist "full tour" browse
  // Search mode's fallback for a show that's in no database — reveals a
  // compact manual form (artist/date/city/venue) that reuses handleSubmit.
  const [manualEntry, setManualEntry] = useState(false);
  const [finderArtist, setFinderArtist] = useState('');
  const [finderCity, setFinderCity] = useState('');
  const [finderYear, setFinderYear] = useState('');
  const [finderVenue, setFinderVenue] = useState('');
  const [finderResults, setFinderResults] = useState([]);
  const [finderSelected, setFinderSelected] = useState({}); // key → result
  const [finderLoading, setFinderLoading] = useState(false);
  const [finderSearched, setFinderSearched] = useState(false);

  // Stable client-side id for new shows so photo uploads have a folder
  // to land in *before* the row exists. The DB ignores this id on
  // insert and assigns a real UUID — the photo paths just keep using
  // this temp segment, which doesn't break anything (storage RLS only
  // checks the FIRST folder segment = userId; the photos column stores
  // full URLs so they resolve regardless of path).
  const photoShowIdRef = useRef(editingShow?.id || generateId());

  // ---- Logging funnel ----
  // `show_log_started` on open; `show_log_abandoned` on close-without-save
  // (the unmount cleanup, gated by submittedRef). `show_logged` fires from
  // handleSubmit. See docs/initiatives/2026-05-15-product-analytics.md.
  const submittedRef = useRef(false);
  useEffect(() => {
    track('show_log_started', { is_edit: !!editingShow });
    return () => {
      if (!submittedRef.current) {
        track('show_log_abandoned', { is_edit: !!editingShow });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // This autocomplete's results only render inside the quick-log form
    // (showQuick = Attended, or any edit). On a NEW Going/Wishlist show the
    // only artist field is Search mode's manual fallback, which shares this
    // `artist` state — so skip the fetch there to avoid wasted Deezer/TM
    // calls and a stale-results flash when switching back to Attended.
    if (!isAttendedTab && !editingShow) {
      setShowResults([]);
      setArtistMatches([]);
      setShowsLoading(false);
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
    // (No early bail when the user has no personal apiKey — the
    // setlistfm-proxy Edge Function falls back to a shared key so
    // searches work out-of-the-box for everyone.)

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
          // Multi-source: Ticketmaster (big rooms) + JamBase (small venues like
          // Schubas Tavern). JamBase is a no-op until enabled, so this stays
          // Ticketmaster-only until you wire up the key.
          const events = await fetchUpcomingEventsMulti(probe, {
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
  }, [artist, status, apiKey, city, date, isAttendedTab, isFutureTab, editingShow]);

  // Keep artist artwork in sync as the user types (uses cached Deezer image).
  // The avatar only shows in the quick-log form, so skip on a new future show
  // (Search-mode manual entry shares `artist` but renders no avatar).
  useEffect(() => {
    if (!isAttendedTab && !editingShow) { setArtistImage(null); return; }
    const q = artist.trim();
    if (q.length < 3) { setArtistImage(null); return; }
    const cached = getCachedImage(q);
    if (cached) { setArtistImage(cached); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      fetchArtistImage(q).then((url) => { if (!cancelled && url) setArtistImage(url); });
    }, 700);
    return () => { cancelled = true; clearTimeout(t); };
  }, [artist, isAttendedTab, editingShow]);

  const filteredCities = city
    ? CITIES.filter((c) => c.toLowerCase().includes(city.toLowerCase()))
    : [];
  const ALL_VENUES = useMemo(() => [...new Set(Object.values(VENUES_BY_CITY).flat())], []);
  const cityVenues = VENUES_BY_CITY[city] || (city.trim() ? ALL_VENUES : []);
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

  const addBuddyByName = (raw) => {
    const name = raw.trim();
    if (!name) return;
    if (!selBuddies.includes(name)) {
      setSelBuddies((prev) => [...prev, name]);
    }
    setNewBuddyName('');
  };

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

    // Suggest openers from upstream data.
    //  - Ticketmaster's `lineup` is the full bill — skip [0] (headliner)
    //  - Setlist.fm gives just one artist per row, so we re-query
    //    co-acts at the same venue+date in a separate call.
    if (Array.isArray(show.lineup) && show.lineup.length > 1) {
      const headliner = (show.artist || '').toLowerCase();
      setOpenerSuggestions(
        show.lineup
          .slice(1)
          .filter((n) => n && n.toLowerCase() !== headliner)
      );
    } else if (show.venue && show.date && show.artist) {
      fetchCoActs(show.venue, show.date, show.artist).then((coActs) => {
        if (coActs && coActs.length > 0) setOpenerSuggestions(coActs);
      });
    }

    setArtistOpen(false);
    setShowResults([]);
    setArtistMatches([]);
  };

  // If the user edits the venue text, any existing `venueUrl` is for
  // the old venue and no longer matches — clear it so ShowDetail
  // re-resolves on next open.
  const handleVenueChange = (next) => {
    setVenue(next);
    if (venueUrl) setVenueUrl('');
  };

  // User picked an artist suggestion (Deezer) — replace the typed text
  // with the canonical name. The useEffect will re-run with the new value
  // and load fresh Ticketmaster events for the corrected name.
  const pickArtist = (match) => {
    setArtist(match.name);
    setArtistMatches([]);
    // Don't close the dropdown — let the spinner show while we re-fetch.
  };

  // Accept whatever the user typed as the band — the universal escape
  // hatch so ANY artist (small/local/pop-up, in no database) can be
  // selected, not just ones Setlist.fm/Deezer/Ticketmaster know about.
  const pickTyped = () => {
    setArtist(titleCase(artist.trim()));
    setArtistOpen(false);
    setShowResults([]);
    setArtistMatches([]);
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!artist.trim()) {
      setArtistError(true);
      showToast?.({ message: 'Add an artist to log this show' });
      return;
    }
    setSaving(true);
    // handleSubmit is shared by Attended's quick-log AND the Search-mode
    // manual fallback (a NEW future show). The manual form only collects
    // artist/date/city/venue, so the score/vibes/setlist/etc. state could
    // still hold stale values from an Attended interaction earlier in the
    // same open sheet — persist those ONLY for Attended or when editing an
    // existing show (which legitimately loaded them). A new future show gets
    // the same clean shape as a multi-selected one (see logSelected).
    const keepAll = isAttendedTab || !!editingShow;
    const payload = {
      artist: artist.trim(),
      date: date || new Date().toISOString().split('T')[0],
      city: city.trim(),
      venue: venue.trim(),
      venueUrl: venueUrl.trim(),
      festival: keepAll ? festival.trim() : '',
      genre: keepAll ? genre : '',
      score: keepAll ? score : 0,
      vibes: keepAll ? vibes : [],
      notes: keepAll ? notes.trim() : '',
      setlist: keepAll ? setlist.filter((s) => s.trim()) : [],
      buddies: keepAll ? selBuddies : [],
      openers: keepAll ? openers : [],
      photos: keepAll ? photos : [],
      videos: keepAll ? videos : [],
      status,
      // Legacy boolean shadow — kept in sync with status so any stray
      // reader that hasn't been migrated to the helpers still does the
      // right thing for Attended vs Wishlist. Going lands in the
      // "false" bucket (visible bug if any helper miss; intentional).
      wishlist: status === SHOW_STATUS.WISHLIST,
    };
    // The core action. Properties are shape/metadata only — never the
    // artist/venue/notes the user typed.
    submittedRef.current = true;
    track('show_logged', {
      status: payload.status,
      is_edit: !!editingShow,
      has_setlist: payload.setlist.length > 0,
      has_photos: payload.photos.length > 0,
      has_videos: payload.videos.length > 0,
      score_set: payload.score > 0,
    });
    // We close the sheet first so the toast doesn't appear behind the
    // dimmed backdrop. Then fire-and-forget the save + show toast.
    onClose();
    try {
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
      // Reconcile real-friend tags now that the show row (and its id)
      // exists. Diff against what was loaded so edits add/remove cleanly.
      if (savedShow?.id) {
        const orig = originalTagsRef.current;
        const add = [...taggedIds].filter((id) => !orig.has(id));
        const remove = [...orig].filter((id) => !taggedIds.has(id));
        await Promise.all([
          ...add.map((id) => tagAttendee(savedShow.id, id).catch(() => {})),
          ...remove.map((id) => untagAttendee(savedShow.id, id).catch(() => {})),
        ]);
      }
      if (showToast) {
        const verb = editingShow ? 'Updated' : 'Logged';
        showToast({
          message: `✓ ${verb} ${payload.artist}`,
          onClick: savedShow?.id ? () => setSelectedShow(savedShow) : undefined,
        });
      }
    } finally {
      setSaving(false);
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

  // ----- Finder handlers -----
  const resultKey = (r) => `${r.artist}|${r.date}|${r.venue}`;

  // `override` lets the Quick-log Festival field jump straight in with a value
  // (state setters are async, so we can't rely on finder* state being updated
  // yet when we trigger the search from elsewhere).
  const runFinder = async (override = {}) => {
    const fest = (typeof override.festival === 'string' ? override.festival : finderFestival).trim();
    const year = (typeof override.year === 'string' ? override.year : finderYear).trim();
    const artist = finderArtist.trim();
    const city = finderCity.trim();
    const venue = finderVenue.trim();
    if (!fest && !artist && !city && !venue) return;
    setFinderLoading(true);
    setFinderSearched(false);
    setFinderSelected({});
    setFinderSource(fest ? 'festival' : 'past');
    try {
      // A festival name takes over: resolve it to a lineup + per-day setlists.
      // Otherwise fall back to the general artist/city/year/venue search.
      const results = fest
        ? await searchFestivalByName(fest, { year: year || undefined, futureOnly: isFutureTab })
        : await searchPastShows({
            artist: artist || undefined,
            city: city || undefined,
            year: year || undefined,
            venue: venue || undefined,
          });
      setFinderResults(results);
    } catch {
      setFinderResults([]);
    } finally {
      setFinderLoading(false);
      setFinderSearched(true);
    }
  };


  const toggleResult = (r) => {
    const k = resultKey(r);
    setFinderSelected((cur) => {
      const next = { ...cur };
      if (next[k]) delete next[k];
      else next[k] = r;
      return next;
    });
  };

  // Whether every row in a group is currently selected — drives the
  // Select all / Deselect all toggle label + behavior.
  const groupAllSelected = (rows) =>
    rows.length > 0 && rows.every((r) => finderSelected[resultKey(r)]);

  const toggleAllInGroup = (rows) => {
    const allOn = groupAllSelected(rows);
    setFinderSelected((cur) => {
      const next = { ...cur };
      rows.forEach((r) => {
        const k = resultKey(r);
        if (allOn) delete next[k];   // all were selected → deselect all
        else next[k] = r;            // otherwise → select all
      });
      return next;
    });
  };

  // Group finder results by festival → "Individual shows" for the rest.
  const finderGroups = (() => {
    const groups = {};
    finderResults.forEach((r) => {
      const key = r.festival || '__individual__';
      (groups[key] = groups[key] || []).push(r);
    });
    return Object.entries(groups).sort((a, b) => {
      if (a[0] === '__individual__') return 1;
      if (b[0] === '__individual__') return -1;
      return a[0].localeCompare(b[0]);
    });
  })();

  const selectedCount = Object.keys(finderSelected).length;

  const logSelected = async () => {
    const picked = Object.values(finderSelected);
    if (picked.length === 0) return;
    const payloads = picked.map((r) => ({
      id: generateId(),
      artist: r.artist,
      date: r.date || new Date().toISOString().split('T')[0],
      city: r.city || '',
      venue: r.venue || '',
      venueUrl: '',
      festival: r.festival || '',
      // Autofilled from the event's Ticketmaster classification (Search tab).
      // Festival / past-show finder rows carry no genre, so they stay '' —
      // Attended's behavior is unchanged.
      genre: r.genre || '',
      score: 0,
      vibes: [],
      notes: '',
      setlist: r.songs || [],
      buddies: [],
      openers: [],
      photos: [],
      status,
      wishlist: status === SHOW_STATUS.WISHLIST,
      createdAt: new Date().toISOString(),
    }));
    onClose();
    const created = await addShows(payloads);
    const n = (created && created.length) || payloads.length;
    const verb = status === SHOW_STATUS.WISHLIST ? 'Added' : status === SHOW_STATUS.GOING ? 'Added' : 'Logged';
    const dest = status === SHOW_STATUS.WISHLIST ? ' to Wishlist' : status === SHOW_STATUS.GOING ? ' to Going' : '';
    if (showToast) showToast({ message: `✓ ${verb} ${n} show${n === 1 ? '' : 's'}${dest}` });
  };

  // Full-tour browse: pull EVERY upcoming date for one artist (any city —
  // matches "search Noah Kahan, see the next N months of shows", not just
  // what's playing near you), multi-select, add several at once. Reuses the
  // same finderSelected/toggleResult/logSelected plumbing as the festival
  // picker — the results render is source-aware (see finderResultsBlock).
  const runTourSearch = async (nameArg) => {
    const name = (typeof nameArg === 'string' ? nameArg : tourArtist).trim();
    if (!name) return;
    if (typeof nameArg === 'string') setTourArtist(name);
    setFinderLoading(true);
    setFinderSearched(false);
    setFinderSelected({});
    setFinderSource('tour');
    try {
      const results = await fetchUpcomingEventsMulti(name);
      setFinderResults(results);
    } catch {
      setFinderResults([]);
    } finally {
      setFinderLoading(false);
      setFinderSearched(true);
    }
  };

  // Opened via prefill (e.g. a tapped tour/genre-alert notification) straight
  // into Search mode (internal mode 'tour') with an artist already known —
  // auto-run the search once on mount instead of making the user retype it.
  useEffect(() => {
    if (!editingShow && prefill?.mode === 'tour' && prefill?.tourArtist) {
      runTourSearch(prefill.tourArtist);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showFinder = isAttendedTab && logMode === 'finder';
  const showFestival = (isAttendedTab || isFutureTab) && logMode === 'festival';
  // Search is the DEFAULT for a new Going/Wishlist show — anything that isn't
  // Festival lands here (not a strict logMode === 'tour' check), so a stray/
  // unknown logMode can never leave the body blank. Not shown while editing
  // (edit always uses the quick form below).
  const showTour = isFutureTab && !editingShow && logMode !== 'festival';
  // Quick-log form: the Attended logging flow AND the edit form for a show of
  // ANY status (editing forces logMode 'quick' above, so showFinder/showTour/
  // showFestival are all false while editing). Going/Wishlist LOGGING (not
  // editing) uses Search ('tour') + Festival instead and never renders this.
  const showQuick = (isAttendedTab || editingShow) && !showFinder && !showFestival && !showTour;

  // Switching modes clears any stale finder results/selection so one mode's
  // results don't bleed into another.
  const switchMode = (m) => {
    setLogMode(m);
    setFinderResults([]);
    setFinderSelected({});
    setFinderSearched(false);
    setManualEntry(false);
  };

  // Attended's modes ('quick'/'festival'/'finder') and Going/Wishlist's
  // ('tour'/'festival') share the same logMode namespace but aren't valid
  // across each other — e.g. leaving Attended in 'finder' mode and switching
  // to Wishlist would leave none of Wishlist's own tabs looking selected, and
  // (since Wishlist has no 'quick' form) render a blank body. Reset to each
  // status's OWN default on every status change: Attended → 'quick', Going/
  // Wishlist → 'tour' (Search).
  const switchStatus = (s) => {
    setStatus(s);
    switchMode(s === SHOW_STATUS.ATTENDED ? 'quick' : 'tour');
  };

  // Shared results UI — rendered by the "Find a past show" finder AND inline in
  // Quick log after "Find this festival's lineup". Only one is ever mounted at a
  // time (quick-log form vs. finder), so there's no duplicate render.
  const finderResultsBlock = (
    <>
      {finderSearched && finderResults.length === 0 && !finderLoading && (
        <div className="log-show-empty">
          {finderSource === 'festival'
            ? "Couldn't find that festival yet. Check the spelling, add the year, or use the details fields. Setlists also keep filling in over the days after a festival."
            : finderSource === 'tour'
              ? "No upcoming shows found for that artist. Check the spelling, or they may not have announced dates yet."
              : "No shows found. Try a nearby/bigger city, a different year, or the festival's venue name."}
        </div>
      )}

      {finderGroups.map(([festival, rows]) => (
        <div key={festival} className="log-finder-group">
          <div className="log-finder-group-head">
            <span className="log-finder-group-name">
              {festival === '__individual__'
                ? (finderSource === 'tour' ? 'Upcoming shows' : 'Individual shows')
                : `🎪 ${festival}`}
            </span>
            <button
              type="button"
              className="log-finder-selectall"
              onClick={() => toggleAllInGroup(rows)}
            >
              {groupAllSelected(rows) ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          {rows.map((r) => {
            const k = resultKey(r);
            const sel = !!finderSelected[k];
            return (
              <div
                key={k}
                className={`log-finder-result ${sel ? 'selected' : ''}`}
                onClick={() => toggleResult(r)}
              >
                <div className="log-finder-check">{sel ? '✓' : ''}</div>
                <div className="log-finder-result-main">
                  <div className="log-finder-result-artist">{r.artist}</div>
                  <div className="log-finder-result-meta">
                    {[r.venue, r.city].filter(Boolean).join(' · ')}
                    {r.displayDate ? ` · ${r.displayDate}` : r.date ? ` · ${formatDate(r.date)}` : ''}
                  </div>
                </div>
                {r.songCount > 0 && (
                  <div className="log-finder-result-songs">{r.songCount} songs</div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {finderResults.length > 0 && (
        <div className="log-show-attr">
          {finderSource === 'festival'
            ? 'Powered by Ticketmaster + Setlist.fm'
            : finderSource === 'tour'
              ? 'Powered by Ticketmaster + JamBase'
              : 'Powered by Setlist.fm'}
        </div>
      )}

      {selectedCount > 0 && (
        <button className="log-submit" onClick={logSelected}>
          {status === SHOW_STATUS.WISHLIST
            ? `Add ${selectedCount} to Wishlist`
            : status === SHOW_STATUS.GOING
              ? `Add ${selectedCount} to Going`
              : `Log ${selectedCount} show${selectedCount === 1 ? '' : 's'}`}
        </button>
      )}
    </>
  );

  return (
    <div className="log-overlay">
      <div className="log-backdrop" onClick={onClose} />
      <div className="log-sheet">
        <div className="log-handle" />
        <div className="log-header">
          <div>
            <h2>{editingShow ? 'Edit Show' : 'Log a Show'}</h2>
            {!editingShow && (
              <p style={{ margin: '2px 0 0', color: 'var(--brown-muted)', fontSize: 13 }}>
                Capture the night in 30 seconds.
              </p>
            )}
          </div>
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
              onClick={() => switchStatus(SHOW_STATUS.ATTENDED)}
            >
              Attended
            </button>
            <button
              className={`shows-tab ${status === SHOW_STATUS.GOING ? 'active' : ''}`}
              onClick={() => switchStatus(SHOW_STATUS.GOING)}
            >
              Going
            </button>
            <button
              className={`shows-tab ${status === SHOW_STATUS.WISHLIST ? 'active' : ''}`}
              onClick={() => switchStatus(SHOW_STATUS.WISHLIST)}
            >
              Wishlist
            </button>
          </div>

          {/* Mode toggle — Attended only: log one show, a whole festival, or
              find an older past show. Per v1.0.7 festival-past-show-finder. */}
          {isAttendedTab && (
            <div className="log-mode-toggle">
              <button
                type="button"
                className={`log-mode-btn ${logMode === 'quick' ? 'active' : ''}`}
                onClick={() => switchMode('quick')}
              >
                Quick log
              </button>
              <button
                type="button"
                className={`log-mode-btn ${logMode === 'festival' ? 'active' : ''}`}
                onClick={() => switchMode('festival')}
              >
                Festival
              </button>
              <button
                type="button"
                className={`log-mode-btn ${logMode === 'finder' ? 'active' : ''}`}
                onClick={() => switchMode('finder')}
              >
                Past show
              </button>
            </div>
          )}

          {/* Mode toggle — Going/Wishlist: just two ways in. Search an artist
              (see their whole upcoming schedule, add any dates — or add a show
              manually if it's not listed), or pull a festival's lineup. Hidden
              while editing (editing shows the full form directly, no modes). */}
          {isFutureTab && !editingShow && (
            <div className="log-mode-toggle">
              <button
                type="button"
                className={`log-mode-btn ${logMode === 'tour' ? 'active' : ''}`}
                onClick={() => switchMode('tour')}
              >
                Search
              </button>
              <button
                type="button"
                className={`log-mode-btn ${logMode === 'festival' ? 'active' : ''}`}
                onClick={() => switchMode('festival')}
              >
                Festival
              </button>
            </div>
          )}

          {/* Search mode — the single primary way to add a Going/Wishlist
              show: type an artist, see their whole upcoming schedule (any
              city), tap the dates you want. Genre autofills from the event.
              A show in no database? The manual fallback below still adds it. */}
          {showTour && (
            <div className="log-finder">
              <div className="log-section">
                <p className="log-finder-hint">
                  Search an artist to see their upcoming shows — any city — and
                  tap the dates you want to add.
                </p>
                <div className="log-input-wrap">
                  <input
                    className="log-input"
                    placeholder="Search an artist (e.g. Noah Kahan)"
                    value={tourArtist}
                    onChange={(e) => setTourArtist(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runTourSearch(); } }}
                  />
                </div>
                <button
                  type="button"
                  className="log-finder-search"
                  onClick={() => runTourSearch()}
                  disabled={finderLoading || !tourArtist.trim()}
                >
                  {finderLoading ? 'Finding shows…' : 'Find shows'}
                </button>
              </div>
              {finderResultsBlock}

              {/* Manual fallback — preserves the old Quick-log escape hatch so
                  ANY show (even one in no database) can still be wishlisted.
                  Reuses handleSubmit + the shared artist/date/city/venue
                  state. Unobtrusive until opened. */}
              <div className="log-section log-manual-section">
                {!manualEntry ? (
                  <button
                    type="button"
                    className="log-manual-toggle"
                    onClick={() => {
                      setManualEntry(true);
                      if (!artist.trim() && tourArtist.trim()) setArtist(tourArtist.trim());
                    }}
                  >
                    Can’t find it? Add a show manually →
                  </button>
                ) : (
                  <>
                    <div className="log-section-title">Add manually</div>
                    <div className="log-input-wrap">
                      <input
                        className="log-input"
                        placeholder="Artist / Band"
                        value={artist}
                        style={artistError ? { borderColor: 'var(--red, #E24B4A)' } : undefined}
                        onChange={(e) => { setArtist(e.target.value); setArtistError(false); }}
                      />
                    </div>
                    <div className="log-row">
                      <input
                        className="log-input"
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </div>
                    <div className="log-input-wrap">
                      <input
                        className="log-input"
                        placeholder="City"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                      />
                    </div>
                    <div className="log-input-wrap">
                      <input
                        className="log-input"
                        placeholder="Venue"
                        value={venue}
                        onChange={(e) => setVenue(e.target.value)}
                      />
                    </div>
                    <button
                      className="log-submit"
                      onClick={handleSubmit}
                      disabled={saving}
                    >
                      {saving ? 'Saving…' : submitLabel}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Festival mode — festival-first: pick/type a festival, pull the whole
              lineup, multi-select the acts you saw, log them all at once. */}
          {showFestival && (
            <div className="log-finder">
              <div className="log-section">
                <p className="log-finder-hint">
                  Which festival? Pick it or type it and we'll pull the whole
                  day-by-day lineup — tap the acts {isFutureTab ? "you want to catch" : "you saw"}, then {isFutureTab ? 'add' : 'log'} them all at once.
                </p>
                <FestivalAutocomplete
                  value={finderFestival}
                  onChange={setFinderFestival}
                  onSelect={(name) => runFinder({ festival: name, year: finderYear.trim() })}
                  placeholder="Festival (e.g. Electric Forest)"
                />
                <div className="log-row">
                  <input
                    className="log-input"
                    type="number"
                    inputMode="numeric"
                    placeholder="Year (e.g. 2026)"
                    value={finderYear}
                    onChange={(e) => setFinderYear(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="log-finder-search"
                  onClick={() => runFinder({ festival: finderFestival.trim(), year: finderYear.trim() })}
                  disabled={finderLoading || !finderFestival.trim()}
                >
                  {finderLoading ? 'Finding the lineup…' : 'Find the lineup'}
                </button>
              </div>
              {finderResultsBlock}
            </div>
          )}

          {/* Finder mode — search by city/year, multi-select, log many at once */}
          {showFinder && (
            <div className="log-finder">
              <div className="log-section">
                <p className="log-finder-hint">
                  Find any past show by artist, city, year, or venue — any
                  combination narrows it down. Logging a whole festival? Use the
                  Festival tab.
                </p>
                <div className="log-input-wrap">
                  <input
                    className="log-input"
                    placeholder="Artist (optional)"
                    value={finderArtist}
                    onChange={(e) => setFinderArtist(e.target.value)}
                  />
                </div>
                <div className="log-input-wrap">
                  <input
                    className="log-input"
                    placeholder="City (e.g. Phoenix)"
                    value={finderCity}
                    onChange={(e) => setFinderCity(e.target.value)}
                  />
                </div>
                <div className="log-row">
                  <input
                    className="log-input"
                    type="number"
                    inputMode="numeric"
                    placeholder="Year (e.g. 2023)"
                    value={finderYear}
                    onChange={(e) => setFinderYear(e.target.value)}
                  />
                </div>
                <div className="log-input-wrap">
                  <input
                    className="log-input"
                    placeholder="Venue (optional, e.g. Tempe Beach Park)"
                    value={finderVenue}
                    onChange={(e) => setFinderVenue(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="log-finder-search"
                  onClick={() => runFinder({ festival: '' })}
                  disabled={finderLoading || (!finderArtist.trim() && !finderCity.trim() && !finderVenue.trim())}
                >
                  {finderLoading ? 'Searching…' : 'Search'}
                </button>
              </div>

              {finderResultsBlock}
            </div>
          )}

          {/* Quick-log form — default, and always for Going / Wishlist */}
          {showQuick && (
          <>

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
                style={artistError ? { borderColor: 'var(--red, #E24B4A)' } : undefined}
                onChange={(e) => {
                  setArtist(e.target.value);
                  setArtistOpen(true);
                  setArtistError(false);
                }}
                onFocus={() => setArtistOpen(true)}
                onBlur={() => setTimeout(() => setArtistOpen(false), 200)}
              />
              {showsLoading && (
                <span className="log-input-spinner" aria-hidden />
              )}

              {artistOpen && artist.trim().length >= 2 && (
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
                          : 'Try the artist\'s exact name on Setlist.fm — or fill in the venue and date below yourself.'}
                      </span>
                    </div>
                  ) : null}
                  {/* Universal "use what I typed" — always selectable so
                      ANY band can be logged, even one in no database. */}
                  <div
                    className="log-show-item log-use-typed"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={pickTyped}
                  >
                    <span className="log-use-typed-check" aria-hidden="true">✓</span>
                    <div className="log-show-item-main">
                      <div className="log-show-item-title">Use “{titleCase(artist.trim())}”</div>
                      <div className="log-show-item-meta">Log this band as you typed it</div>
                    </div>
                  </div>

                  <div className="log-show-attr">
                    Powered by {isFutureTab ? 'Deezer + Ticketmaster' : 'Setlist.fm'}
                  </div>
                </div>
              )}
            </div>

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
              {cityOpen && city.trim() && filteredCities.length === 0 && (
                <div className="log-autocomplete">
                  <div className="log-autocomplete-item" style={{ color: 'var(--brown-muted)', cursor: 'default' }}>
                    We'll use "{city}"
                  </div>
                </div>
              )}
            </div>
            <div className="log-input-wrap">
              <input
                className="log-input"
                placeholder="Venue"
                value={venue}
                onChange={(e) => {
                  handleVenueChange(e.target.value);
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
                        handleVenueChange(v);
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

          {/* (The inline "Festival" field was removed here — festivals now
              have their own dedicated Festival mode/tab, so tagging one inside
              the quick-log form was redundant and confusing.) */}

          {/* Openers — opening acts. Auto-suggested from
              Ticketmaster's lineup (upcoming) or a Setlist.fm co-act
              lookup (past). Per v1.0.6 initiative. */}
          <div className="log-section">
            <div className="log-section-title">
              Openers <span className="log-section-hint">optional</span>
            </div>
            {(() => {
              const remaining = openerSuggestions.filter((n) => !openers.includes(n));
              if (remaining.length === 0) return null;
              return (
                <div className="log-opener-suggestions">
                  <div className="log-opener-suggestions-label">
                    Also on the bill — tap to add
                  </div>
                  <div className="log-opener-chip-row">
                    {remaining.map((name) => (
                      <button
                        key={name}
                        type="button"
                        className="opener-suggest-chip"
                        onClick={() => setOpeners((cur) => [...cur, name])}
                      >
                        + {name}
                      </button>
                    ))}
                    {remaining.length > 1 && (
                      <button
                        type="button"
                        className="opener-suggest-chip opener-suggest-add-all"
                        onClick={() =>
                          setOpeners((cur) => {
                            const next = [...cur];
                            remaining.forEach((n) => {
                              if (!next.includes(n)) next.push(n);
                            });
                            return next;
                          })
                        }
                      >
                        + Add all
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="log-buddy-add">
              <input
                className="log-input"
                placeholder="Add an opener…"
                value={newOpenerName}
                onChange={(e) => setNewOpenerName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const name = newOpenerName.trim();
                    if (name && !openers.includes(name)) {
                      setOpeners((cur) => [...cur, name]);
                    }
                    setNewOpenerName('');
                  }
                }}
              />
              <button
                type="button"
                className="log-add-btn"
                onClick={() => {
                  const name = newOpenerName.trim();
                  if (name && !openers.includes(name)) {
                    setOpeners((cur) => [...cur, name]);
                  }
                  setNewOpenerName('');
                }}
              >
                + Add
              </button>
            </div>
            {openers.length > 0 && (
              <div className="log-opener-chips">
                {openers.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="opener-chip"
                    onClick={() => setOpeners((cur) => cur.filter((n) => n !== name))}
                    aria-label={`Remove opener ${name}`}
                  >
                    {name}
                    <span className="opener-chip-x" aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
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
                    onClick={() => setScore(score === n ? 0 : n)}
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

          {/* Tag friends (real Melo users) — any status. Powers the
              feed's "going with …" line + friends-of-friends discovery. */}
          {friends.length > 0 && (
            <div className="log-section">
              <div className="log-section-title">
                {isAttendedTab ? 'Who went with you?' : 'Who are you going with?'}
              </div>
              <div className="log-friend-tags">
                {friends.map((f) => {
                  const on = taggedIds.has(f.userId);
                  const nm = f.displayName || f.username;
                  return (
                    <button
                      key={f.userId}
                      type="button"
                      className={`log-friend-chip ${on ? 'active' : ''}`}
                      onClick={() => toggleTag(f.userId)}
                    >
                      {on ? '✓ ' : ''}{nm}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Went With — Attended only. Section always renders so first-time
              users (no past buddies derived from prior shows) can still tag
              names. Chip list is the union of derived buddies + any new
              names typed into selBuddies for this show. */}
          {isAttendedTab && (() => {
            const buddyChips = [
              ...buddies,
              ...selBuddies
                .filter((n) => !buddies.some((b) => b.name === n))
                .map((n) => ({ id: `new:${n}`, name: n, color: '#E8573A' })),
            ];
            return (
              <div className="log-section">
                <div className="log-section-title">Went With</div>
                <div className="log-buddy-add">
                  <input
                    className="log-input"
                    placeholder="Add a name…"
                    value={newBuddyName}
                    onChange={(e) => setNewBuddyName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addBuddyByName(newBuddyName);
                      }
                    }}
                  />
                  <button
                    className="log-add-btn"
                    onClick={() => addBuddyByName(newBuddyName)}
                  >
                    + Add
                  </button>
                </div>
                {buddyChips.length > 0 && (
                  <div className="log-buddies">
                    {buddyChips.map((b) => (
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
                )}
              </div>
            );
          })()}

          {/* Notes — Attended only */}
          {isAttendedTab && (
            <div className="log-section">
              <div className="log-section-title">Notes</div>
              <textarea
                className="log-textarea"
                placeholder="What made it unforgettable?"
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

          {/* Videos — short clips (≤60s, ≤45MB, max 3). Attended only:
              you film clips AT a show. Per the video-uploads initiative. */}
          {userId && isAttendedTab && (
            <div className="log-section">
              <div className="log-section-title">
                Videos <span className="log-section-hint">short clips</span>
              </div>
              <VideoPicker
                videos={videos}
                onChange={setVideos}
                userId={userId}
                showId={photoShowIdRef.current}
              />
            </div>
          )}

          <button className="log-submit" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : submitLabel}
          </button>

          </>
          )}
        </div>
      </div>
    </div>
  );
}
