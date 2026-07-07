// ============================
// Melo API Integration Layer
// ============================

import { supabase } from './lib/supabase';

// VITE_API_PROXY_URL points at our Supabase Edge Function (e.g.
// https://<project>.functions.supabase.co/api-proxy?url=). Falls back to
// corsproxy.io for dev/legacy until the function is deployed. Setlist.fm's
// ToS specifically forbids proxying their data through unaffiliated
// infrastructure, so production / App Store builds MUST set this.
// See `supabase/functions/api-proxy/index.ts` and `.env.example`.
const CORS_PROXY =
  import.meta.env.VITE_API_PROXY_URL || 'https://corsproxy.io/?';

// VITE_DEEZER_APP_ID is reserved for future use. Deezer's free tier accepts
// unauthenticated `search/artist` requests, which is what we use today, but
// a registered app gets higher rate limits. Wire it into the request URLs
// when we actually register an app at https://developers.deezer.com/.

// ===== IMAGE CACHE =====
function getImageCache() {
  try { return JSON.parse(localStorage.getItem('melo_image_cache') || '{}'); }
  catch { return {}; }
}

function setImageCacheEntry(artist, url) {
  const cache = getImageCache();
  cache[artist.toLowerCase().trim()] = url;
  localStorage.setItem('melo_image_cache', JSON.stringify(cache));
}

export function getCachedImage(artist) {
  if (!artist) return null;
  return getImageCache()[artist.toLowerCase().trim()] || null;
}

// ===== DEEZER — Artist search (canonical name + image lookup) =====
// Used to map a fuzzy user query ("luke c") to canonical artist names
// ("Luke Combs", "Luke Bryan", ...) so downstream APIs (Bandsintown,
// Setlist.fm) — both of which are essentially exact-match — actually
// find something.
export async function searchArtists(query, limit = 5) {
  if (!query || query.trim().length < 2) return [];
  try {
    const target = `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(`${CORS_PROXY}${encodeURIComponent(target)}`);
    if (!res.ok) throw new Error(`Deezer ${res.status}`);
    const data = await res.json();
    return (data?.data || []).slice(0, limit).map((a) => ({
      name: a.name,
      image: a.picture_xl || a.picture_big || a.picture_medium || '',
      fans: a.nb_fan || 0,
    }));
  } catch (err) {
    console.warn('[Melo] Deezer artist search failed for', query, err.message);
    return [];
  }
}

// ===== DEEZER — Artist Images =====
export async function fetchArtistImage(artistName) {
  if (!artistName) return null;
  const cached = getCachedImage(artistName);
  if (cached) return cached;

  try {
    const target = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}`;
    const res = await fetch(`${CORS_PROXY}${encodeURIComponent(target)}`);
    if (!res.ok) throw new Error(`Deezer ${res.status}`);
    const data = await res.json();
    if (data?.data?.[0]?.picture_xl) {
      const url = data.data[0].picture_xl;
      setImageCacheEntry(artistName, url);
      return url;
    }
  } catch (err) {
    console.warn('[Melo] Deezer fetch failed for', artistName, err.message);
  }
  return null;
}

// Batch-fetch images for multiple artists (non-blocking)
export async function prefetchArtistImages(artistNames, onUpdate) {
  const unique = [...new Set(artistNames)];
  const results = {};

  // Load from cache first
  unique.forEach((name) => {
    const cached = getCachedImage(name);
    if (cached) results[name] = cached;
  });

  // Fetch missing ones, staggered to avoid rate limits
  const missing = unique.filter((n) => !results[n]);
  for (let i = 0; i < missing.length; i++) {
    const name = missing[i];
    const url = await fetchArtistImage(name);
    if (url) {
      results[name] = url;
      onUpdate?.({ ...results });
    }
    // Small delay between requests to be polite to APIs
    if (i < missing.length - 1) await new Promise((r) => setTimeout(r, 300));
  }

  return results;
}

// Extract a festival name from a Setlist.fm setlist object.
//
// Setlist.fm doesn't have a structured `festival` field on the public
// API, so we sniff the unstructured ones in priority order:
//   1. `s.info` containing "Festival: NAME" — common pattern moderators
//      use ("Festival: Coachella 2026", "Festival: New Orleans Jazz...").
//   2. `s.tour.name` containing "Festival" or "Fest " (with trailing
//      space to avoid matching unrelated word-stems like "Fester").
//   3. `s.venue.name` ending in "Festival" or matching well-known
//      festival venues — last-resort fallback.
//
// Returns '' when nothing matches; the LogShow form treats empty as
// "no festival" and the user can type one in manually.
function extractFestivalFromSetlist(s) {
  if (!s) return '';
  // 1. Info field — most reliable
  const info = String(s.info || '');
  const m = info.match(/festival:\s*([^.\n]+)/i);
  if (m && m[1]) return m[1].trim().slice(0, 80);

  // 2. Tour name containing festival keyword
  const tourName = String(s.tour?.name || '').trim();
  if (/festival|\bfest(\s|$)/i.test(tourName)) {
    return tourName.slice(0, 80);
  }

  // 3. Venue name ending in Festival
  const venueName = String(s.venue?.name || '').trim();
  if (/festival$/i.test(venueName)) {
    return venueName.slice(0, 80);
  }

  return '';
}

// ===== SETLIST.FM — Real Setlists =====
// Goes through our `setlistfm-proxy` Edge Function so the user's API
// key never touches the client. The function decrypts the per-user
// key from `user_settings.setlist_fm_key_encrypted` and forwards the
// request with an `x-api-key` header. (See migration 0003 + the
// 2026-04-20-pre-launch-sprint initiative.)
//
// `apiKey` parameter is kept for backwards compatibility with callers
// — it's now ignored. The proxy resolves the key server-side: it tries
// the user's encrypted personal key first, then falls back to a
// shared MELO_SETLISTFM_FALLBACK_KEY env var so the app works
// out-of-the-box for users who haven't configured one of their own.
//
// `opts` can include `city`, `year`, `venue` to filter results — same
// contract as before.
// Shared mapper: a Setlist.fm setlist object → Melo's show-result
// shape. Used by both the artist search (fetchSetlists) and the
// location-first finder (searchPastShows).
function mapSetlistRow(s, fallbackArtist = '') {
  const songs = [];
  (s.sets?.set || []).forEach((set) => {
    (set.song || []).forEach((song) => {
      if (song.name) songs.push(song.name);
    });
  });
  const eventDate = s.eventDate; // dd-MM-yyyy
  const parts = eventDate ? eventDate.split('-') : [];
  const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : '';
  return {
    artist: s.artist?.name || fallbackArtist,
    venue: s.venue?.name || '',
    // Note: Setlist.fm's venue.url is its own page, not the official
    // site — ShowDetail resolves that via Wikipedia/Wikidata.
    city: s.venue?.city?.name || '',
    state: s.venue?.city?.stateCode || '',
    country: s.venue?.city?.country?.code || '',
    date: isoDate,
    displayDate: eventDate,
    songs,
    songCount: songs.length,
    tour: s.tour?.name || '',
    festival: extractFestivalFromSetlist(s),
  };
}

export async function fetchSetlists(artistName, _apiKey, opts = {}) {
  if (!artistName) return [];

  try {
    const params = new URLSearchParams({
      artistName,
      p: '1',
    });
    if (opts.city) params.set('cityName', opts.city);
    if (opts.year) params.set('year', String(opts.year));
    if (opts.venue) params.set('venueName', opts.venue);

    const { data, error } = await supabase.functions.invoke('setlistfm-proxy', {
      body: { path: 'search/setlists', query: params.toString() },
    });
    if (error) throw error;
    if (!data) return [];

    // Map ALL setlists (including ones with no song list — common for DJ /
    // electronic acts where the show data exists but Setlist.fm doesn't
    // record a track-by-track set). Then sort by songCount desc so shows
    // with rich setlists land at the top of the picker, but venue/date-only
    // entries are still pickable when that's all Setlist.fm has.
    return (data.setlist || [])
      .slice(0, 30)
      .map((s) => mapSetlistRow(s, artistName))
      .sort((a, b) => b.songCount - a.songCount)
      .slice(0, 10);
  } catch (err) {
    console.warn('[Melo] Setlist.fm fetch failed for', artistName, err.message);
    return [];
  }
}

// Location-first past-show search — NO artist required. Powers the
// "Find a past show" festival finder: search Setlist.fm by
// city / year / venue and get back every act that played there, so a
// festival-goer can find what they saw without typing each artist.
// Pulls up to 3 pages (festivals span many acts; Setlist.fm = 20/page).
// Per docs/initiatives/2026-05-21-festival-past-show-finder.md.
export async function searchPastShows({ artist, city, year, venue } = {}) {
  const base = {};
  if (artist && artist.trim()) base.artistName = artist.trim();
  if (city && city.trim()) base.cityName = city.trim();
  if (venue && venue.trim()) base.venueName = venue.trim();
  if (year && String(year).trim()) base.year = String(year).trim();
  // Need at least one specific filter (artist, city, or venue) — a
  // year-only query would return half the database.
  if (!base.artistName && !base.cityName && !base.venueName) return [];

  const all = [];
  try {
    for (let p = 1; p <= 3; p++) {
      const params = new URLSearchParams({ ...base, p: String(p) });
      const { data, error } = await supabase.functions.invoke('setlistfm-proxy', {
        body: { path: 'search/setlists', query: params.toString() },
      });
      if (error) throw error;
      const rows = data?.setlist || [];
      rows.forEach((s) => all.push(mapSetlistRow(s)));
      if (rows.length < 20) break; // last page reached
    }
  } catch (err) {
    console.warn('[Melo] searchPastShows failed', err.message);
    // fall through — return whatever we collected
  }

  // Dedupe by artist + date + venue.
  const seen = new Set();
  const deduped = [];
  for (const r of all) {
    const key = `${(r.artist || '').toLowerCase()}|${r.date}|${(r.venue || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  // Newest first, richer setlists first within a date.
  deduped.sort(
    (a, b) => (b.date || '').localeCompare(a.date || '') || b.songCount - a.songCount
  );
  return deduped;
}

// ===== Festival-name autofill =====
// "Type Electric Forest → the whole festival pops up." There is NO clean API
// for this: Ticketmaster is upcoming-events-only and fuzzy (searching "Electric
// Forest" returns "Electric Callboy" — verified 2026-06-30), so it can't find a
// festival someone JUST attended; and Setlist.fm, which DOES have the past
// setlists, isn't searchable by festival name. So we:
//   1. Resolve the festival name → its venue/city via a curated map (reliable
//      for the big festivals; the primary path for PAST festivals).
//   2. Pull the real per-day setlists from Setlist.fm for that venue/city+year.
//   3. Use Ticketmaster ONLY as a strict-match bonus (upcoming/unmapped fests),
//      never trusting a fuzzy hit — it just enriches the lineup when it has the
//      actual event.
// Every row is stamped with the festival name so the existing finder groups +
// multi-selects them unchanged.
// Per docs/initiatives/2026-05-21-festival-past-show-finder.md (2026-06-30 add).
//
// Curated map — seed set of major (mostly US) festivals → the venue or city
// Setlist.fm files them under. `q` is what we hand to searchPastShows: a
// venueName for big-city fests (so we don't drown in unrelated club shows), a
// cityName for small-town fests (clean + robust). Extend freely; these strings
// are tuned against Setlist.fm's naming.
const FESTIVAL_VENUES = {
  'electric forest': { q: { city: 'Rothbury' }, city: 'Rothbury', state: 'MI' },
  'coachella': { q: { city: 'Indio' }, city: 'Indio', state: 'CA' },
  'bonnaroo': { q: { city: 'Manchester' }, city: 'Manchester', state: 'TN' },
  'lollapalooza': { q: { venue: 'Grant Park' }, city: 'Chicago', state: 'IL' },
  'pitchfork music festival': { q: { venue: 'Union Park' }, city: 'Chicago', state: 'IL' },
  'riot fest': { q: { venue: 'Douglass Park' }, city: 'Chicago', state: 'IL' },
  'austin city limits': { q: { venue: 'Zilker Park' }, city: 'Austin', state: 'TX' },
  'acl': { q: { venue: 'Zilker Park' }, city: 'Austin', state: 'TX' },
  'outside lands': { q: { venue: 'Golden Gate Park' }, city: 'San Francisco', state: 'CA' },
  'governors ball': { q: { venue: 'Flushing Meadows Corona Park' }, city: 'New York', state: 'NY' },
  'bottlerock': { q: { city: 'Napa' }, city: 'Napa', state: 'CA' },
  'edc': { q: { venue: 'Las Vegas Motor Speedway' }, city: 'Las Vegas', state: 'NV' },
  'electric daisy carnival': { q: { venue: 'Las Vegas Motor Speedway' }, city: 'Las Vegas', state: 'NV' },
  'ultra': { q: { venue: 'Bayfront Park' }, city: 'Miami', state: 'FL' },
  'shaky knees': { q: { venue: 'Central Park' }, city: 'Atlanta', state: 'GA' },
  'boston calling': { q: { venue: 'Harvard Athletic Complex' }, city: 'Boston', state: 'MA' },
  'summerfest': { q: { venue: 'Henry Maier Festival Park' }, city: 'Milwaukee', state: 'WI' },
  'hangout': { q: { city: 'Gulf Shores' }, city: 'Gulf Shores', state: 'AL' },
  'railbird': { q: { city: 'Lexington' }, city: 'Lexington', state: 'KY' },
};

// Display-cased festival names for the Log-a-Show autocomplete dropdown. Kept in
// sync with FESTIVAL_VENUES above (the ones we can resolve to a lineup reliably).
export const FESTIVAL_NAMES = [
  'Coachella', 'Lollapalooza', 'Bonnaroo', 'Electric Forest', 'Austin City Limits',
  'Outside Lands', 'Governors Ball', 'BottleRock', 'EDC', 'Ultra',
  'Pitchfork Music Festival', 'Riot Fest', 'Shaky Knees', 'Boston Calling',
  'Summerfest', 'Hangout', 'Railbird',
];

function normalizeFestival(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\bmusic festival\b|\bfestival\b|\bfest\b/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lookupFestivalVenue(name) {
  const n = normalizeFestival(name);
  if (!n) return null;
  if (FESTIVAL_VENUES[n]) return FESTIVAL_VENUES[n];
  for (const [k, v] of Object.entries(FESTIVAL_VENUES)) {
    const nk = normalizeFestival(k);
    if (n === nk || n.includes(nk) || nk.includes(n)) return v;
  }
  return null;
}

function isoToDisplay(iso) {
  const p = String(iso || '').split('-');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : '';
}

export async function searchFestivalByName(name, { year, futureOnly } = {}) {
  const label = (name || '').trim();
  if (!label) return [];

  let venue = '';
  let city = '';
  let state = '';
  let resolvedYear = year ? String(year) : '';
  const lineup = []; // { artist, date } — only from a STRICT Ticketmaster hit

  // --- 1) Curated map (reliable for past festivals) ---
  const mapped = lookupFestivalVenue(label);
  if (mapped) {
    venue = mapped.q.venue || '';
    city = mapped.q.city || mapped.city || '';
    state = mapped.state || '';
  }

  // --- 2) Ticketmaster: STRICT match only (upcoming / unmapped fests) ---
  const key = import.meta.env.VITE_TICKETMASTER_KEY;
  if (key) {
    try {
      const params = new URLSearchParams({
        apikey: key,
        keyword: label,
        classificationName: 'music',
        sort: 'date,desc',
        size: '60',
      });
      const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        const events = data?._embedded?.events || [];
        const target = normalizeFestival(label);
        // Only events whose NAME really contains the festival label — never a
        // fuzzy fallback (that's how we'd get "Electric Callboy" for "Electric
        // Forest"). An empty result here is correct, not a bug.
        let pool = events.filter((ev) => normalizeFestival(ev.name).includes(target) && target);
        if (year) {
          const yr = pool.filter((ev) =>
            (ev?.dates?.start?.localDate || '').startsWith(String(year))
          );
          if (yr.length) pool = yr;
        }
        pool.sort((a, b) =>
          (b?.dates?.start?.localDate || '').localeCompare(a?.dates?.start?.localDate || '')
        );
        const primary = pool[0];
        if (primary) {
          const v = primary?._embedded?.venues?.[0] || {};
          if (!venue && !city) {
            venue = v.name || '';
            city = v.city?.name || '';
            state = v.state?.stateCode || v.state?.name || '';
          }
          if (!resolvedYear) resolvedYear = (primary?.dates?.start?.localDate || '').slice(0, 4);
        }
        // Multi-day festivals often list a "thin" GA/VIP ticket event per day
        // alongside the real lineup event — its only "attraction" is the
        // festival's own name (verified live against Windy City Smokeout:
        // duplicate same-date events, one full lineup + one whose sole
        // attraction is "Windy City Smokeout" itself). Filter that out so it
        // never shows up as a fake headliner.
        const targetNorm = normalizeFestival(label);
        pool.forEach((ev) => {
          const d = ev?.dates?.start?.localDate || '';
          (ev?._embedded?.attractions || []).forEach((a) => {
            if (a.name && normalizeFestival(a.name) !== targetNorm) {
              lineup.push({ artist: a.name, date: d });
            }
          });
        });
      }
    } catch (err) {
      console.warn('[Melo] Festival resolve (Ticketmaster) failed for', label, err.message);
    }
  }

  // Couldn't resolve the festival to any venue/city → let the caller nudge the
  // user to the details fields rather than return garbage.
  if (!venue && !city) return [];

  const lineupSet = new Set(lineup.map((l) => l.artist.toLowerCase()));

  // --- 3) Setlist.fm for the real per-day setlists ---
  // A resolved venue can be a dedicated festival ground (Grant Park, Union
  // Park — safe to trust broadly) OR a shared arena used for hundreds of
  // unrelated shows a year (verified live: Windy City Smokeout resolves to
  // United Center, and an unfiltered venue search pulled in every unrelated
  // concert Setlist.fm has logged there). Whenever we have a Ticketmaster-
  // confirmed lineup, ALWAYS filter to just those artists — on the venue
  // branch too, not only the city fallback — so a shared venue can never
  // leak in shows that have nothing to do with this festival.
  let rows = [];
  if (venue) {
    rows = await searchPastShows({ venue, year: resolvedYear || undefined });
    if (lineupSet.size) rows = rows.filter((r) => lineupSet.has((r.artist || '').toLowerCase()));
  }
  if (!rows.length && city) {
    // City search is broader; if we have a Ticketmaster lineup, keep only those
    // acts (avoids stamping unrelated club shows as the festival).
    const cityRows = await searchPastShows({ city, year: resolvedYear || undefined });
    rows = lineupSet.size
      ? cityRows.filter((r) => lineupSet.has((r.artist || '').toLowerCase()))
      : cityRows;
  }

  // Stamp the festival label so everything groups together in the finder.
  rows = rows.map((r) => ({ ...r, festival: label }));

  // --- 4) Add lineup acts Setlist.fm didn't return (no setlist logged yet) ---
  const have = new Set(rows.map((r) => (r.artist || '').toLowerCase()));
  const added = new Set();
  lineup.forEach(({ artist, date }) => {
    const la = artist.toLowerCase();
    if (have.has(la) || added.has(la)) return;
    added.add(la);
    rows.push({
      artist,
      venue,
      city,
      state,
      country: '',
      date: date || '',
      displayDate: isoToDisplay(date),
      songs: [],
      songCount: 0,
      tour: '',
      festival: label,
    });
  });

  // Called from Wishlist/Going, where a past show (this year's edition
  // already happened, or a prior year's setlist for an artist who's also on
  // THIS year's bill) is never useful — only ever a future date belongs on
  // a wishlist. Requires a real, resolvable date; a dateless row can't be
  // confirmed upcoming, so it's dropped too rather than risk showing stale
  // noise.
  if (futureOnly) {
    const todayIso = new Date().toISOString().slice(0, 10);
    rows = rows.filter((r) => r.date && r.date >= todayIso);
  }

  rows.sort(
    (a, b) =>
      (a.date || '').localeCompare(b.date || '') ||
      (a.artist || '').localeCompare(b.artist || '')
  );
  return rows;
}

// ===== SETLIST.FM — Co-act lookup =====
// Given a venue + date + headliner, finds OTHER artists who played
// that same venue on that same date — i.e. likely opening acts.
// Setlist.fm doesn't expose a "lineup" per show; each setlist row is
// a single artist. But searching by venue+date returns every artist
// who had a setlist logged that night → subtract the headliner → the
// rest are the openers.
//
// One extra proxied API call per dropdown pick — only fired when the
// user deliberately selects a past show, not on every keystroke.
//
// Per docs/initiatives/2026-05-21-v1-0-6-photos-and-openers.md.
export async function fetchCoActs(venueName, date, headliner) {
  if (!venueName || !date) return [];

  // Setlist.fm wants dd-MM-yyyy; we have YYYY-MM-DD.
  const parts = String(date).split('-');
  if (parts.length !== 3) return [];
  const slfDate = `${parts[2]}-${parts[1]}-${parts[0]}`;

  try {
    const params = new URLSearchParams({
      venueName,
      date: slfDate,
      p: '1',
    });
    const { data, error } = await supabase.functions.invoke('setlistfm-proxy', {
      body: { path: 'search/setlists', query: params.toString() },
    });
    if (error) throw error;
    if (!data) return [];
    const lcHeadliner = (headliner || '').toLowerCase();
    const names = (data.setlist || [])
      .map((s) => s.artist?.name)
      .filter(Boolean)
      .filter((n) => n.toLowerCase() !== lcHeadliner);
    return [...new Set(names)];
  } catch (err) {
    console.warn('[Melo] Co-act lookup failed for', venueName, date, err.message);
    return [];
  }
}

// ===== TICKETMASTER — Upcoming Tour Dates =====
// Free Discovery API: signup at https://developer-acct.ticketmaster.com/
// Consumer Key (no OAuth, no redirect URL) goes in .env.local as
// VITE_TICKETMASTER_KEY. CORS is enabled on this endpoint so no proxy
// needed. Free tier: 5,000 req/day, 5 req/sec.
//
// Replaced Bandsintown (2026-04-20) after they locked their public
// REST API behind partner-only app_ids and returned 403 for `app_id=melo`.
let _tmNoKeyWarned = false;

// `opts` accepts `{ city }` to narrow the search. Without it we pull
// the next 50 shows for the artist — enough to cover heavy tourers
// several months out. With `city`, Ticketmaster's fuzzy city match
// filters to a metro, so "Denver" surfaces Red Rocks shows even though
// Red Rocks is technically in Morrison, CO.
// Map a Ticketmaster classification genre name (e.g. "Hip-Hop/Rap",
// "Dance/Electronic") onto Melo's own GENRES vocabulary (see store.js), so a
// show pulled from Discovery can autofill its genre when added to a wishlist.
// Contains-based and ordered specific→broad; returns '' for anything we can't
// confidently place (we never guess a genre). Every non-empty return value is
// an EXACT member of GENRES, so the genre chips highlight correctly.
const TM_GENRE_RULES = [
  [/hip[-\s]?hop|rap/, 'Hip-Hop'],
  [/r&b|rhythm/, 'R&B'],
  // Reggae is checked BEFORE the Electronic rule: "Dancehall" contains
  // "dance", so without this ordering it would wrongly map to Electronic.
  [/reggae|ska|dancehall/, 'Reggae'],
  [/dance|electronic|edm|house|techno/, 'Electronic'],
  [/metal/, 'Metal'],
  [/punk/, 'Punk'],
  [/country/, 'Country'],
  [/bluegrass|folk/, 'Folk'],
  [/alternative/, 'Alternative'],
  [/indie/, 'Indie'],
  [/classical|orchestra/, 'Classical'],
  [/blues/, 'Blues'],
  [/jazz/, 'Jazz'],
  [/latin|reggaeton/, 'Latin'],
  [/soul|funk/, 'Soul'],
  [/world/, 'World'],
  [/rock/, 'Rock'],
  [/pop/, 'Pop'],
];
export function tmGenreToMelo(name) {
  // Coerce defensively — a non-string (e.g. an object from a JamBase genre
  // array) must yield '' rather than throw, which would collapse a whole
  // fetch batch to [] inside its try/catch.
  const n = (typeof name === 'string' ? name : '').toLowerCase().trim();
  if (!n || n === 'undefined' || n === 'other') return '';
  for (const [re, g] of TM_GENRE_RULES) if (re.test(n)) return g;
  return '';
}

export async function fetchUpcomingEvents(artistName, opts = {}) {
  if (!artistName) return [];

  const key = import.meta.env.VITE_TICKETMASTER_KEY;
  if (!key) {
    if (!_tmNoKeyWarned) {
      console.warn(
        '[Melo] VITE_TICKETMASTER_KEY not set — wishlist will only show ' +
          'Deezer artist suggestions (no upcoming shows). Get a free key at ' +
          'https://developer-acct.ticketmaster.com/ and add it to .env.local.'
      );
      _tmNoKeyWarned = true;
    }
    return [];
  }

  try {
    const params = new URLSearchParams({
      apikey: key,
      keyword: artistName,
      classificationName: 'music',
      sort: 'date,asc',
      size: '50',
    });
    if (opts.city) params.set('city', opts.city);
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Ticketmaster ${res.status}`);
    const data = await res.json();

    const events = data?._embedded?.events || [];
    const lcArtist = artistName.toLowerCase();

    // Discovery returns anything matching the keyword — filter down to
    // events where our artist is actually headlining or on the bill.
    const matching = events.filter((ev) => {
      const attractions = ev?._embedded?.attractions || [];
      if (attractions.length === 0) return true; // no lineup data, keep it
      return attractions.some((a) =>
        (a.name || '').toLowerCase().includes(lcArtist) ||
        lcArtist.includes((a.name || '').toLowerCase())
      );
    });

    return matching.slice(0, 8).map((ev) => {
      const venue = ev?._embedded?.venues?.[0] || {};
      const attractions = ev?._embedded?.attractions || [];
      const cls = ev?.classifications?.[0];
      return {
        artist: attractions[0]?.name || artistName,
        venue: venue.name || '',
        // Note: Ticketmaster's `venue.url` points to the Ticketmaster
        // venue listing, NOT the official venue website. We deliberately
        // don't capture it here. ShowDetail resolves the official URL
        // on demand via Wikipedia/Wikidata in `lookupVenueUrl`.
        city: venue.city?.name || '',
        state: venue.state?.stateCode || venue.state?.name || '',
        country: venue.country?.countryCode || venue.country?.name || '',
        date: ev?.dates?.start?.localDate || '',
        ticketUrl: ev.url || '',
        // Autofills the show's genre when wishlisted (Search tab). Falls back
        // to subGenre when the top genre is generic/undefined, else ''.
        genre: tmGenreToMelo(cls?.genre?.name) || tmGenreToMelo(cls?.subGenre?.name),
        lineup: attractions.map((a) => a.name).filter(Boolean),
      };
    });
  } catch (err) {
    console.warn('[Melo] Ticketmaster fetch failed for', artistName, err.message);
    return [];
  }
}

// ===== JAMBASE — small-venue coverage (Schubas-tier) =====
// Ticketmaster misses independent rooms (Schubas Tavern, Lincoln Hall, Empty
// Bottle). JamBase lists them. Routed through the `jambase-proxy` Edge Function
// so the Bearer key stays server-side (never in the bundle).
//
// OFF until BOTH: `VITE_JAMBASE_ENABLED === 'true'` (client) AND the
// `JAMBASE_KEY` secret is set + `jambase-proxy` deployed (server). So this is a
// clean no-op until you wire it up — the app stays Ticketmaster-only.
// Per docs/initiatives/2026-07-01-artist-tracking-anywhere.md.

// "US-IL" -> "IL"
function jbState(region) {
  const s = String(region || '');
  const m = s.match(/^[A-Z]{2}-([A-Z0-9]{1,3})$/);
  return m ? m[1] : s;
}

export async function fetchJamBaseEvents(artistName, opts = {}) {
  if (import.meta.env.VITE_JAMBASE_ENABLED !== 'true') return [];
  if (!artistName) return [];
  try {
    const today = new Date().toISOString().slice(0, 10);
    const params = new URLSearchParams({ artistName, eventDateFrom: today });
    if (opts.city) params.set('geoCityName', opts.city);
    if (opts.genre) params.set('genreSlug', opts.genre);

    const { data, error } = await supabase.functions.invoke('jambase-proxy', {
      body: { path: 'events', query: params.toString() },
    });
    if (error || !data) return [];

    // JamBase v3 is JSON-LD-ish and the list wrapper has varied across docs —
    // handle the likely shapes. If this returns [] once you have a real key,
    // log `data` to see the actual wrapper and adjust this one line.
    const events =
      data.events ||
      data['@graph'] ||
      (data.itemListElement || []).map((x) => x.item || x) ||
      (Array.isArray(data) ? data : []);

    const lc = artistName.toLowerCase();
    return events
      .map((ev) => {
        const performers = (ev.performer || []).filter(Boolean);
        const headliner = performers.find((p) => p['x-isHeadliner']) || performers[0] || {};
        const addr = ev.location?.address || {};
        const primaryOffer =
          (ev.offers || []).find((o) => o.category === 'ticketingLinkPrimary') ||
          (ev.offers || [])[0];
        return {
          artist: headliner.name || artistName,
          venue: ev.location?.name || '',
          city: addr.addressLocality || '',
          state: jbState(addr.addressRegion?.identifier),
          country: '',
          date: (ev.startDate || '').slice(0, 10),
          ticketUrl: primaryOffer?.url || '',
          // JamBase's genre shape varies (array | string | absent) — best-
          // effort map, degrades to '' so a small-venue show just has no
          // autofilled genre rather than a wrong one.
          genre: tmGenreToMelo(Array.isArray(ev.genre) ? ev.genre[0] : ev.genre),
          lineup: performers.map((p) => p.name).filter(Boolean),
          source: 'jambase',
        };
      })
      .filter(
        (e) =>
          (e.artist || '').toLowerCase().includes(lc) ||
          lc.includes((e.artist || '').toLowerCase()) ||
          e.lineup.some((n) => (n || '').toLowerCase().includes(lc)),
      );
  } catch (err) {
    console.warn('[Melo] JamBase fetch failed for', artistName, err?.message);
    return [];
  }
}

// Merge Ticketmaster (big rooms) + JamBase (small venues) → dedupe by
// artist+date+venue. Drop-in replacement for fetchUpcomingEvents at call sites
// that want full small-venue coverage. JamBase is a no-op until enabled, so
// today this returns exactly the Ticketmaster results.
export async function fetchUpcomingEventsMulti(artistName, opts = {}) {
  const [tm, jb] = await Promise.all([
    fetchUpcomingEvents(artistName, opts),
    fetchJamBaseEvents(artistName, opts),
  ]);
  const seen = new Set();
  const merged = [];
  for (const e of [...tm, ...jb]) {
    const k = `${(e.artist || '').toLowerCase()}|${e.date}|${(e.venue || '').toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(e);
  }
  merged.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return merged;
}

// ===== Wikipedia/Wikidata — Official venue website lookup =====
// Resolves the OFFICIAL venue website (e.g. brooklynsteel.com), not a
// Ticketmaster or Setlist.fm listing page. The earlier Ticketmaster-
// venues approach returned `ticketmaster.com/venue/...` URLs, which is
// not what users want — they want the venue's own site for parking,
// calendar, etc.
//
// Strategy:
//   1. Wikipedia OpenSearch for "{venue} {city}" → article title
//   2. Wikipedia pageprops → Wikidata QID
//   3. Wikidata Special:EntityData → property P856 ("official website")
//
// All three calls are anonymous + CORS-enabled (`origin=*`), so no
// proxy or API key is needed. Soft-fails to '' on any miss.
//
// Coverage: works well for venues with Wikipedia articles (most major
// + mid-size venues — Madison Square Garden, Red Rocks, Brooklyn
// Steel, Hollywood Bowl, etc.). Returns '' for small DIY clubs that
// don't have Wikipedia entries — caller should hide the pill in that
// case rather than fall back to a search-engine link the user didn't
// ask for.
// Hand-curated overrides for venues the Wikipedia/Wikidata heuristic
// resolves incorrectly. Matched by normalized substring so "The Salt
// Shed", "Salt Shed", and "The Fairgrounds at the Salt Shed" all hit
// the same entry. Grows as users report wrong links.
const VENUE_URL_OVERRIDES = [
  { match: 'salt shed', url: 'https://saltshedchicago.com' },
];

// Returns the override URL for a venue name, or '' if none. Exported
// so ShowDetail can apply it even over a previously-cached wrong URL.
export function venueOverrideUrl(venueName) {
  const n = (venueName || '').toLowerCase();
  const hit = VENUE_URL_OVERRIDES.find((o) => n.includes(o.match));
  return hit ? hit.url : '';
}

export async function lookupVenueUrl(venueName, city = '') {
  if (!venueName) return '';

  // A curated override always wins — skip the heuristic entirely.
  const override = venueOverrideUrl(venueName);
  if (override) return override;

  // 5-second total timeout — Wikipedia/Wikidata is usually fast, but
  // we'd rather fall back to the Google search URL than hang the pill.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const query = city ? `${venueName} ${city}` : venueName;

    // 1. Find the Wikipedia article for the venue. Uses full-text
    //    search (`list=search`) instead of OpenSearch — OpenSearch is
    //    prefix-only, so "Moody Center Austin" returns nothing because
    //    no article starts with that phrase. Full-text search ranks by
    //    article relevance and correctly returns the venue article
    //    even when the query includes the city for disambiguation.
    const searchUrl =
      `https://en.wikipedia.org/w/api.php?action=query&list=search` +
      `&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`;
    const searchRes = await fetch(searchUrl, { signal: controller.signal });
    if (!searchRes.ok) return '';
    const searchData = await searchRes.json();
    const title = searchData?.query?.search?.[0]?.title;
    if (!title) return '';

    // 2. Resolve the article title to a Wikidata QID.
    const propsUrl =
      `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops` +
      `&titles=${encodeURIComponent(title)}&format=json&origin=*`;
    const propsRes = await fetch(propsUrl, { signal: controller.signal });
    if (!propsRes.ok) return '';
    const propsData = await propsRes.json();
    const pages = propsData?.query?.pages || {};
    const firstPage = Object.values(pages)[0];
    const qid = firstPage?.pageprops?.wikibase_item;
    if (!qid) return '';

    // 3. Pull the official website (Wikidata property P856).
    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
    const entityRes = await fetch(entityUrl, { signal: controller.signal });
    if (entityRes.ok) {
      const entityData = await entityRes.json();
      const claims = entityData?.entities?.[qid]?.claims || {};
      const website = claims.P856?.[0]?.mainsnak?.datavalue?.value;
      if (website) return website;
    }

    // 4. Fallback: scan the Wikipedia article's external links and
    //    pick one that looks like an official venue site. Newer venues
    //    (Moody Center, Sphere, etc.) often have a complete Wikipedia
    //    article with the official site in the infobox but no P856
    //    populated on Wikidata yet.
    const extlinksUrl =
      `https://en.wikipedia.org/w/api.php?action=query&prop=extlinks` +
      `&titles=${encodeURIComponent(title)}&ellimit=30&format=json&origin=*`;
    const extlinksRes = await fetch(extlinksUrl, { signal: controller.signal });
    if (!extlinksRes.ok) return '';
    const extlinksData = await extlinksRes.json();
    const extPages = extlinksData?.query?.pages || {};
    const firstExtPage = Object.values(extPages)[0];
    const links = (firstExtPage?.extlinks || [])
      .map((l) => l['*'])
      .filter(Boolean);
    return pickOfficialLink(links, venueName);
  } catch (err) {
    console.warn('[Melo] Venue URL lookup failed for', venueName, err.message);
    return '';
  } finally {
    clearTimeout(timer);
  }
}

// Heuristic: from a list of external links scraped off a Wikipedia
// article, pick the one most likely to be the venue's official website.
//
// Strategy:
//   1. Filter out social media, ticketing partners, archive sites,
//      and other non-official domains
//   2. Prefer a URL whose hostname contains a meaningful word from the
//      venue name (so "moodycenter.com" wins for "Moody Center")
//   3. Otherwise fall back to the first remaining link, which on
//      Wikipedia is conventionally the infobox `website` field
function pickOfficialLink(links, venueName) {
  if (!links || links.length === 0) return '';

  const blocklist = [
    'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
    'youtube.com', 'youtu.be', 'tiktok.com', 'linkedin.com',
    'ticketmaster.com', 'songkick.com', 'axs.com', 'livenation.com',
    'stubhub.com', 'seatgeek.com', 'vividseats.com', 'setlist.fm',
    'archive.org', 'web.archive.org', 'wikipedia.org',
    'wikimedia.org', 'wikidata.org', 'commons.wikimedia.org',
    'doi.org', 'jstor.org', 'google.com', 'maps.google.com',
    'goo.gl', 'bit.ly', 'tinyurl.com',
  ];

  const hostnameOf = (url) => {
    try { return new URL(url).hostname.toLowerCase(); }
    catch { return ''; }
  };
  // When extlinks contain a venue's domain, they often link a deep
  // page (event listing, "about" page, etc). The user wants the
  // venue's website — return its origin (homepage), not the deep link.
  const homepageOf = (url) => {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.host}/`;
    } catch {
      return url;
    }
  };
  const isOfficial = (url) => {
    const h = hostnameOf(url);
    return h && !blocklist.some((b) => h === b || h.endsWith('.' + b));
  };

  const venueWords = venueName
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && w !== 'center' && w !== 'theater'
      && w !== 'theatre' && w !== 'arena' && w !== 'stadium' && w !== 'hall');

  // 1. Prefer hostname-matches a meaningful venue word → return the
  //    homepage of that domain (strips deep paths like /event/...).
  for (const url of links) {
    if (!isOfficial(url)) continue;
    const h = hostnameOf(url);
    if (venueWords.some((w) => h.includes(w))) return homepageOf(url);
  }
  // 2. Otherwise return the first non-blocklist link as-is
  for (const url of links) {
    if (isOfficial(url)) return url;
  }
  return '';
}

// Always-works fallback when Wikidata doesn't have the venue. Links to
// a Google search for "{venue} {city} official site" — top result is
// almost always the official venue page. One extra click, but never a
// dead pill.
export function venueSearchUrl(venueName, city = '') {
  const q = encodeURIComponent(
    `${venueName} ${city ? city + ' ' : ''}official site`
  );
  return `https://www.google.com/search?q=${q}`;
}

// Fetch upcoming for all logged artists
export async function fetchAllUpcomingEvents(artistNames) {
  const unique = [...new Set(artistNames)];
  const allEvents = [];

  for (let i = 0; i < unique.length; i++) {
    const events = await fetchUpcomingEvents(unique[i]);
    allEvents.push(...events);
    if (i < unique.length - 1) await new Promise((r) => setTimeout(r, 200));
  }

  // Sort by date
  return allEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
}

// ===== TICKETMASTER — Festivals =====
// Same Discovery API as `fetchUpcomingEvents`, but scoped to the
// Festival classification AND the Music segment. Earlier cuts only
// filtered by `classificationName=Festival`, which surfaced ballroom
// dance festivals, food festivals, Renaissance fairs, kids' fests,
// religious gatherings — everything Ticketmaster files under
// "Festival" regardless of whether music is involved. Adding
// `segmentName=Music` constrains it to actual music festivals.
//
// Belt-and-suspenders: also filter results client-side to drop any
// event whose segment / genre / sub-genre obviously isn't music
// (Ticketmaster's data is messy enough that some non-music events
// still slip through the segment filter).
//
// Params (all optional): `{ city, stateCode, size }`.
// Degrades gracefully without VITE_TICKETMASTER_KEY (returns []),
// matching `fetchUpcomingEvents`.
// Live festival-name autocomplete. The old Festival field only suggested a
// curated ~19-name list, so most real festivals (e.g. Windy City Smokeout)
// never appeared. This queries Ticketmaster's Festival classification by
// keyword and returns a deduped list of festival NAMES to suggest as the
// user types. Selecting one still resolves through searchFestivalByName,
// which handles any TM-listed festival (curated or not). Best-effort — an
// empty return (no key / no match / rate-limited) just means no live
// suggestions, and the curated list still shows.
export async function searchFestivalNames(query, limit = 6) {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const key = import.meta.env.VITE_TICKETMASTER_KEY;
  if (!key) return [];
  try {
    const params = new URLSearchParams({
      apikey: key,
      keyword: q,
      classificationName: 'Festival',
      segmentName: 'Music',
      sort: 'relevance,desc',
      size: '40',
    });
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    const events = data?._embedded?.events || [];
    // Multi-day festivals list one event per day / per ticket type, often
    // with a suffix (" - Saturday", " 3 Day Pass", " 2026"). Group by a
    // stripped base name and keep the SHORTEST raw name per group (usually
    // the cleanest, e.g. "Windy City Smokeout" over "…- Saturday").
    const stripSuffix = (name) =>
      String(name || '')
        .replace(/\s*[-–—:|]\s*(mon|tues|wednes|thurs|fri|satur|sun)day\b.*$/i, '')
        .replace(/\s*[-–—:|(]?\s*\d+\s*[- ]?day(?:\s*pass)?\b.*$/i, '')
        .replace(/\s*[-–—:|(]?\s*(single day|weekend|ga|vip|day \d)\b.*$/i, '')
        .replace(/\s*\b(19|20)\d{2}\b\s*$/,'')
        .replace(/\s+/g, ' ')
        .trim();
    // TM keyword search is fuzzy — a search for "riot" returned unrelated
    // festivals (Nocturnal Wonderland, Bass Canyon) that don't contain the
    // query at all. Keep only names that actually match what was typed, so
    // the autocomplete never suggests a wrong festival. (Real matches like
    // "Windy City Smokeout" for "windy" pass; the curated list still covers
    // big fests TM doesn't currently list, e.g. Coachella.)
    const qNorm = normalizeFestival(q);
    const qLc = q.toLowerCase();
    const byBase = new Map(); // normalized base -> cleanest display name
    for (const ev of events) {
      const raw = (ev?.name || '').trim();
      if (!raw) continue;
      const display = stripSuffix(raw) || raw;
      const base = normalizeFestival(display);
      if (!base) continue;
      if (!display.toLowerCase().includes(qLc) && !base.includes(qNorm)) continue;
      const cur = byBase.get(base);
      if (!cur || display.length < cur.length) byBase.set(base, display);
    }
    return [...byBase.values()].slice(0, limit);
  } catch (err) {
    console.warn('[Melo] Festival name search failed for', q, err?.message);
    return [];
  }
}

export async function fetchFestivals(opts = {}) {
  const key = import.meta.env.VITE_TICKETMASTER_KEY;
  if (!key) {
    if (!_tmNoKeyWarned) {
      console.warn(
        '[Melo] VITE_TICKETMASTER_KEY not set — Festivals page will be empty. ' +
          'Get a free key at https://developer-acct.ticketmaster.com/ and add ' +
          'it to .env.local.'
      );
      _tmNoKeyWarned = true;
    }
    return [];
  }

  // Non-music genre keywords that occasionally leak through even with
  // segmentName=Music. Drop them in post-processing. Lowercase match
  // against TM's classifications.genre.name + classifications.subGenre.name.
  const NON_MUSIC_HINTS = [
    'ballroom', 'ballet', 'dance', 'theatre', 'theater', 'comedy',
    'fair', 'cuisine', 'food', 'wine', 'beer festival', 'craft',
    'family', 'religious', 'cultural', 'arts', 'film',
  ];

  try {
    const params = new URLSearchParams({
      apikey: key,
      classificationName: 'Festival',
      segmentName: 'Music',          // Music segment only
      sort: 'date,asc',
      size: String(opts.size || 50),
    });
    if (opts.city) params.set('city', opts.city);
    if (opts.stateCode) params.set('stateCode', opts.stateCode);

    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Ticketmaster ${res.status}`);
    const data = await res.json();

    const events = data?._embedded?.events || [];

    return events
      // Defense-in-depth: drop anything whose top classification
      // segment isn't Music, OR whose genre/subgenre name screams
      // non-music. Belt + suspenders for TM's untrustworthy taxonomy.
      .filter((ev) => {
        const cls = ev?.classifications?.[0];
        if (!cls) return true; // unknown — keep, don't over-filter
        const segment = (cls.segment?.name || '').toLowerCase();
        if (segment && segment !== 'music') return false;
        const genre = (cls.genre?.name || '').toLowerCase();
        const sub = (cls.subGenre?.name || '').toLowerCase();
        if (NON_MUSIC_HINTS.some((h) => genre.includes(h) || sub.includes(h))) {
          return false;
        }
        return true;
      })
      .map((ev) => {
        const venue = ev?._embedded?.venues?.[0] || {};
        const attractions = ev?._embedded?.attractions || [];
        const priceRange = ev?.priceRanges?.[0] || null;
        return {
          id: ev.id || '',
          name: ev.name || '',
          venue: venue.name || '',
          city: venue.city?.name || '',
          state: venue.state?.stateCode || venue.state?.name || '',
          country: venue.country?.countryCode || venue.country?.name || '',
          date: ev?.dates?.start?.localDate || '',
          endDate: ev?.dates?.end?.localDate || '',
          ticketUrl: ev.url || '',
          image:
            (ev.images || []).find((i) => i.ratio === '16_9' && i.width >= 640)?.url ||
            (ev.images || [])[0]?.url ||
            '',
          priceMin: priceRange?.min ?? null,
          priceMax: priceRange?.max ?? null,
          priceCurrency: priceRange?.currency || '',
          lineup: attractions.map((a) => a.name).filter(Boolean),
        };
      });
  } catch (err) {
    console.warn('[Melo] Ticketmaster festivals fetch failed', err.message);
    return [];
  }
}

// ===== TICKETMASTER — All music events in a city =====
// Powers the Discover page's "who's playing in [city]" search. Unlike
// fetchFestivals (Festival classification only) this pulls ALL music
// events in a city, sorted by date. Captures price ranges + ticket URL
// so users see what tickets cost and how to get them.
// Per docs/initiatives/2026-05-21-trip-discovery.md (instant-search v1).
// Shared mapper: a raw TM Discovery event → Melo's event shape.
function mapTmDiscoveryEvent(ev) {
  const venue = ev?._embedded?.venues?.[0] || {};
  const attractions = ev?._embedded?.attractions || [];
  const priceRange = ev?.priceRanges?.[0] || null;
  return {
    id: ev.id || '',
    artist: attractions[0]?.name || ev.name || '',
    name: ev.name || '',
    venue: venue.name || '',
    city: venue.city?.name || '',
    state: venue.state?.stateCode || venue.state?.name || '',
    country: venue.country?.countryCode || venue.country?.name || '',
    date: ev?.dates?.start?.localDate || '',
    ticketUrl: ev.url || '',
    image:
      (ev.images || []).find((i) => i.ratio === '16_9' && i.width >= 640)?.url ||
      (ev.images || [])[0]?.url ||
      '',
    priceMin: priceRange?.min ?? null,
    priceMax: priceRange?.max ?? null,
    priceCurrency: priceRange?.currency || '',
    lineup: attractions.map((a) => a.name).filter(Boolean),
  };
}

// General Discover search — by city, artist (keyword), and/or genre.
// Powers the City / Artist / Genre tabs on the Discover page. Pass any
// combination; at least one of city/keyword/genre is required.
//   * genre  → TM classificationName (e.g. 'Rock', 'Hip-Hop/Rap');
//              keeps it a real music-genre filter.
//   * keyword→ artist/band name match (TM keyword).
//   * city   → metro filter (optionally with stateCode).
// `classificationName` defaults to 'music' so non-genre searches stay
// musical; a genre value replaces it (the genre name is itself under
// the Music segment, so results remain music events).
export async function searchEvents(opts = {}) {
  const { city, keyword, genre, stateCode, startDateTime, endDateTime, size = 50 } = opts;
  if (!city && !keyword && !genre) return [];
  const key = import.meta.env.VITE_TICKETMASTER_KEY;
  if (!key) {
    if (!_tmNoKeyWarned) {
      console.warn(
        '[Melo] VITE_TICKETMASTER_KEY not set — Discover search will be ' +
          'empty. Add a free key to .env.local.'
      );
      _tmNoKeyWarned = true;
    }
    return [];
  }

  try {
    const params = new URLSearchParams({
      apikey: key,
      classificationName: genre || 'music',
      sort: 'date,asc',
      size: String(size),
    });
    if (keyword) params.set('keyword', keyword);
    if (city) params.set('city', city);
    if (stateCode) params.set('stateCode', stateCode);
    if (startDateTime) params.set('startDateTime', startDateTime);
    if (endDateTime) params.set('endDateTime', endDateTime);

    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Ticketmaster ${res.status}`);
    const data = await res.json();
    return (data?._embedded?.events || []).map(mapTmDiscoveryEvent);
  } catch (err) {
    console.warn('[Melo] Ticketmaster search failed', err.message);
    return [];
  }
}

// Back-compat wrapper — city-only search (used by the original Discover
// city box and any caller passing a bare city string).
export async function fetchEventsByCity(city, opts = {}) {
  if (!city || !city.trim()) return [];
  return searchEvents({ city: city.trim(), ...opts });
}

// ===== MUSICBRAINZ — Artist Bio & Genres =====
const MB_HEADERS = { 'User-Agent': 'Melo/1.0.0 (concert-tracker-app)' };

export async function fetchArtistBio(artistName) {
  if (!artistName) return null;

  // Check sessionStorage cache
  const cacheKey = `melo_bio_${artistName.toLowerCase().trim()}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {}

  try {
    // Step 1: Search for artist
    const searchUrl = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(artistName)}&fmt=json&limit=1`;
    const searchRes = await fetch(searchUrl, { headers: MB_HEADERS });
    if (!searchRes.ok) throw new Error(`MB search ${searchRes.status}`);
    const searchData = await searchRes.json();

    if (!searchData.artists?.[0]) return null;
    const artist = searchData.artists[0];
    const mbid = artist.id;

    // Small delay to respect rate limits
    await new Promise((r) => setTimeout(r, 500));

    // Step 2: Get detailed info with genres
    const detailUrl = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=genres+url-rels&fmt=json`;
    const detailRes = await fetch(detailUrl, { headers: MB_HEADERS });
    if (!detailRes.ok) throw new Error(`MB detail ${detailRes.status}`);
    const detail = await detailRes.json();

    const bio = {
      name: detail.name || artistName,
      disambiguation: detail.disambiguation || '',
      type: detail.type || '',
      country: detail.country || '',
      beginYear: detail['life-span']?.begin?.split('-')[0] || '',
      endYear: detail['life-span']?.ended ? detail['life-span']?.end?.split('-')[0] || '' : '',
      active: !detail['life-span']?.ended,
      genres: (detail.genres || [])
        .sort((a, b) => (b.count || 0) - (a.count || 0))
        .slice(0, 6)
        .map((g) => g.name),
      urls: (detail.relations || [])
        .filter((r) => r.type === 'official homepage' || r.type === 'social network')
        .slice(0, 3)
        .map((r) => ({ type: r.type, url: r.url?.resource || '' })),
    };

    // Cache in sessionStorage
    try { sessionStorage.setItem(cacheKey, JSON.stringify(bio)); } catch {}

    return bio;
  } catch (err) {
    console.warn('[Melo] MusicBrainz fetch failed for', artistName, err.message);
    return null;
  }
}

// ===== iTunes Search — 30-sec song previews + deep links =====
// Free, no auth, CORS-enabled. Returns 30s preview .m4a + Apple Music URL.
// We also build a Spotify search-deep-link as a sibling fallback button.
const PREVIEW_CACHE_KEY = 'melo_preview_cache';

function getPreviewCache() {
  try { return JSON.parse(localStorage.getItem(PREVIEW_CACHE_KEY) || '{}'); }
  catch { return {}; }
}
function setPreviewCacheEntry(key, val) {
  const cache = getPreviewCache();
  cache[key] = val;
  try { localStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

export async function fetchSongPreview(artist, song) {
  if (!artist || !song) return null;
  const cacheKey = `${artist}|${song}`.toLowerCase().trim();
  const cached = getPreviewCache()[cacheKey];
  if (cached !== undefined) return cached; // null cached = "no preview found"

  try {
    const term = encodeURIComponent(`${artist} ${song}`);
    const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=5`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`iTunes ${res.status}`);
    const data = await res.json();
    // Pick the best match by artist name similarity
    const aLow = artist.toLowerCase();
    const sLow = song.toLowerCase();
    const best = (data.results || []).find((r) =>
      r.artistName?.toLowerCase().includes(aLow) ||
      aLow.includes(r.artistName?.toLowerCase() || '')
    ) || (data.results || [])[0];

    if (!best?.previewUrl) {
      setPreviewCacheEntry(cacheKey, null);
      return null;
    }
    const result = {
      previewUrl: best.previewUrl,
      appleMusicUrl: best.trackViewUrl || '',
      artwork: best.artworkUrl100?.replace('100x100', '600x600') || '',
      trackName: best.trackName || song,
      artistName: best.artistName || artist,
      // Build a Spotify search deep-link (no auth needed)
      spotifySearchUrl: `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${song}`)}`,
    };
    setPreviewCacheEntry(cacheKey, result);
    return result;
  } catch (err) {
    console.warn('[Melo] iTunes preview fetch failed', artist, song, err.message);
    return null;
  }
}

// ===== DISCOVERY — Similar artist events =====
export async function fetchDiscoveryEvents(genreArtistMap, seenArtists, topCities) {
  const genres = Object.keys(genreArtistMap);
  const candidates = [];

  genres.forEach((genre) => {
    const artists = genreArtistMap[genre] || [];
    artists.forEach((a) => {
      if (!seenArtists.has(a)) candidates.push(a);
    });
  });

  // Pick up to 6 candidates
  const selected = candidates.slice(0, 6);
  const events = [];

  for (let i = 0; i < selected.length; i++) {
    const artistEvents = await fetchUpcomingEvents(selected[i]);
    // Prefer events in user's top cities
    const relevant = artistEvents.filter((ev) =>
      topCities.some((c) => ev.city?.toLowerCase().includes(c.toLowerCase()))
    );
    if (relevant.length > 0) {
      events.push(...relevant.slice(0, 1));
    } else if (artistEvents.length > 0) {
      events.push(artistEvents[0]);
    }
    if (events.length >= 4) break;
    if (i < selected.length - 1) await new Promise((r) => setTimeout(r, 200));
  }

  return events.slice(0, 4);
}

// ===== SHOW DAY — weather, showtime, directions, venue rules =====
// Powers the "Show Day" card on ShowDetail for upcoming shows (and the
// day-of notification deep link). Per
// docs/initiatives/2026-06-10-preshow-postshow-experience.md.

// --- Weather via Open-Meteo (free, keyless, CORS-open) ---
// Geocode the city once, then pull the daily forecast for the show
// date. Forecasts exist ~15 days out; beyond that we return null and
// the card simply omits weather. Module-level cache: one lookup per
// (city, date) per session.
const weatherCache = new Map();

const WMO_WEATHER = [
  { codes: [0], emoji: '☀️', label: 'Clear' },
  { codes: [1], emoji: '🌤️', label: 'Mostly clear' },
  { codes: [2], emoji: '⛅', label: 'Partly cloudy' },
  { codes: [3], emoji: '☁️', label: 'Overcast' },
  { codes: [45, 48], emoji: '🌫️', label: 'Foggy' },
  { codes: [51, 53, 55, 56, 57], emoji: '🌦️', label: 'Drizzle' },
  { codes: [61, 63, 65, 66, 67], emoji: '🌧️', label: 'Rain' },
  { codes: [71, 73, 75, 77], emoji: '🌨️', label: 'Snow' },
  { codes: [80, 81, 82], emoji: '🌧️', label: 'Showers' },
  { codes: [85, 86], emoji: '🌨️', label: 'Snow showers' },
  { codes: [95, 96, 99], emoji: '⛈️', label: 'Thunderstorms' },
];

function wmoToWeather(code) {
  const m = WMO_WEATHER.find((w) => w.codes.includes(code));
  return m || { emoji: '🌡️', label: '' };
}

export async function fetchShowWeather(city, dateStr) {
  if (!city || !dateStr) return null;
  const cacheKey = `${city.toLowerCase()}|${dateStr}`;
  if (weatherCache.has(cacheKey)) return weatherCache.get(cacheKey);

  try {
    // Open-Meteo's daily forecast covers ~15 days ahead.
    const showDay = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((showDay - today) / 86400000);
    if (diff < 0 || diff > 15) return null;

    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
    );
    if (!geoRes.ok) return null;
    const geo = await geoRes.json();
    const loc = geo?.results?.[0];
    if (!loc) return null;

    const params = new URLSearchParams({
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      temperature_unit: 'fahrenheit',
      timezone: 'auto',
      start_date: dateStr,
      end_date: dateStr,
    });
    const wxRes = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!wxRes.ok) return null;
    const wx = await wxRes.json();
    const d = wx?.daily;
    if (!d || !d.time || d.time.length === 0) return null;

    const { emoji, label } = wmoToWeather(d.weather_code?.[0]);
    const result = {
      emoji,
      label,
      hi: Math.round(d.temperature_2m_max?.[0]),
      lo: Math.round(d.temperature_2m_min?.[0]),
      rainPct: d.precipitation_probability_max?.[0] ?? null,
    };
    weatherCache.set(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

// --- Showtime via Ticketmaster ---
// Look up the event's local start time for artist+date, preferring a
// venue-name match when several events land on the same day. Returns a
// formatted string ("7:30 PM") or null — plenty of shows (especially
// non-TM venues) won't resolve, and the card just omits the chip.
export async function fetchEventStartTime(artist, venue, dateStr) {
  const key = import.meta.env.VITE_TICKETMASTER_KEY;
  if (!key || !artist || !dateStr) return null;
  try {
    const params = new URLSearchParams({
      apikey: key,
      keyword: artist,
      classificationName: 'music',
      size: '20',
      sort: 'date,asc',
    });
    const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const events = (data?._embedded?.events || []).filter(
      (ev) => ev?.dates?.start?.localDate === dateStr && ev?.dates?.start?.localTime
    );
    if (events.length === 0) return null;

    const vlc = (venue || '').toLowerCase();
    const match =
      events.find((ev) => {
        const evVenue = (ev?._embedded?.venues?.[0]?.name || '').toLowerCase();
        return vlc && evVenue && (evVenue.includes(vlc) || vlc.includes(evVenue));
      }) || events[0];

    const t = match.dates.start.localTime; // "19:30:00"
    const [hh, mm] = t.split(':').map(Number);
    if (Number.isNaN(hh)) return null;
    const ampm = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
  } catch {
    return null;
  }
}

// --- Link builders ---
// Apple Maps opens natively on iOS; the query form needs no
// coordinates. Bag-policy info isn't in any API — a targeted search is
// the honest, always-works answer.
export function appleMapsUrl(venue, city) {
  const q = [venue, city].filter(Boolean).join(', ');
  return `https://maps.apple.com/?q=${encodeURIComponent(q)}`;
}

export function venuePolicySearchUrl(venue, city) {
  const q = `${[venue, city].filter(Boolean).join(' ')} bag policy entry rules`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
