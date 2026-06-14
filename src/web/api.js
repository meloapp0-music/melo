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
        // Note: Ticketmaster's `venue.url` points to the Ticketmaster
        // venue listing, NOT the official venue website. We deliberately
        // don't capture it here. ShowDetail resolves the official URL
        // on demand via Wikipedia/Wikidata in `lookupVenueUrl`.
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
