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

// ===== SETLIST.FM — Real Setlists =====
// Goes through our `setlistfm-proxy` Edge Function so the user's API
// key never touches the client. The function decrypts the per-user
// key from `user_settings.setlist_fm_key_encrypted` and forwards the
// request with an `x-api-key` header. (See migration 0003 + the
// 2026-04-20-pre-launch-sprint initiative.)
//
// `apiKey` parameter is kept for backwards compatibility with callers
// — we now treat it as a "has key?" hint only. The actual auth
// happens server-side via the user's session JWT.
//
// `opts` can include `city`, `year`, `venue` to filter results — same
// contract as before.
export async function fetchSetlists(artistName, apiKey, opts = {}) {
  if (!artistName) return [];
  // Fast bail for callers that still pass an empty hint — the
  // server would 400 anyway with "no setlist.fm key configured".
  if (apiKey === '' || apiKey === null || apiKey === undefined) return [];

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

    return (data.setlist || [])
      .filter((s) => s.sets?.set?.length > 0)
      .slice(0, 10)
      .map((s) => {
        const songs = [];
        (s.sets?.set || []).forEach((set) => {
          (set.song || []).forEach((song) => {
            if (song.name) songs.push(song.name);
          });
        });
        const eventDate = s.eventDate; // dd-MM-yyyy
        const parts = eventDate ? eventDate.split('-') : [];
        const isoDate =
          parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : '';
        return {
          artist: s.artist?.name || artistName,
          venue: s.venue?.name || '',
          city: s.venue?.city?.name || '',
          state: s.venue?.city?.stateCode || '',
          country: s.venue?.city?.country?.code || '',
          date: isoDate,
          displayDate: eventDate,
          songs,
          songCount: songs.length,
          tour: s.tour?.name || '',
        };
      });
  } catch (err) {
    console.warn('[Melo] Setlist.fm fetch failed for', artistName, err.message);
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
      return {
        artist: attractions[0]?.name || artistName,
        venue: venue.name || '',
        city: venue.city?.name || '',
        state: venue.state?.stateCode || venue.state?.name || '',
        country: venue.country?.countryCode || venue.country?.name || '',
        date: ev?.dates?.start?.localDate || '',
        ticketUrl: ev.url || '',
        lineup: attractions.map((a) => a.name).filter(Boolean),
      };
    });
  } catch (err) {
    console.warn('[Melo] Ticketmaster fetch failed for', artistName, err.message);
    return [];
  }
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
// Festival classification. The `attractions` array becomes the
// festival lineup — we map it into `lineup: string[]` so the Festivals
// page can intersect it with the user's top artists for a
// "3 of your artists playing" badge.
//
// Params (all optional): `{ city, stateCode, size }`.
// Degrades gracefully without VITE_TICKETMASTER_KEY (returns []),
// matching `fetchUpcomingEvents`.
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

  try {
    const params = new URLSearchParams({
      apikey: key,
      classificationName: 'Festival',
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

    return events.map((ev) => {
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
