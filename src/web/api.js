// ============================
// Melo API Integration Layer
// ============================

import { supabase } from './lib/supabase';
import { resolveCity, haversineMiles } from './lib/geo';

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
// v2 stores a record { url, id, verified } instead of a bare URL string:
// `id` is the chosen Deezer artist and `verified` means we confirmed it against
// the user's own setlist (see fetchArtistImage's disambiguation). Bumping the
// key also abandons v1's unverified guesses in one shot — a name like "Goose"
// resolves by fan count to the wrong band, and that wrong URL was already
// cached on-device; v2 forces a clean, setlist-checked re-resolve.
const IMG_CACHE_KEY = 'melo_image_cache.v2';

function getImageCache() {
  try { return JSON.parse(localStorage.getItem(IMG_CACHE_KEY) || '{}'); }
  catch { return {}; }
}

function getImageRecord(artist) {
  if (!artist) return null;
  const rec = getImageCache()[artist.toLowerCase().trim()];
  if (!rec) return null;
  // Tolerate a stray v1-shaped string, just in case.
  return typeof rec === 'string' ? { url: rec, verified: false } : rec;
}

function setImageCacheEntry(artist, rec) {
  const cache = getImageCache();
  cache[artist.toLowerCase().trim()] = rec;
  try { localStorage.setItem(IMG_CACHE_KEY, JSON.stringify(cache)); }
  catch { /* ignore quota */ }
}

export function getCachedImage(artist) {
  return getImageRecord(artist)?.url || null;
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

// Normalize a track / song title for cross-referencing Deezer catalog against a
// user's logged setlist. Drops "(Live)"/"(feat. …)" parentheticals, "- Live at
// …" suffixes, and all punctuation so "Hunger­site" == "hungersite".
const normSong = (s) => (s || '')
  .toLowerCase()
  .replace(/\(.*?\)/g, ' ')
  .replace(/\s-\s.*$/, ' ')
  .replace(/[^a-z0-9]+/g, '');

// How many of `wantSet` (normalized setlist songs) appear in a Deezer artist's
// top tracks. The disambiguation signal: the RIGHT "Goose" is the one whose
// catalog actually contains the songs you heard. Fails soft to 0.
async function artistTrackOverlap(artistId, wantSet) {
  try {
    const target = `https://api.deezer.com/artist/${artistId}/top?limit=50`;
    const res = await fetch(`${CORS_PROXY}${encodeURIComponent(target)}`);
    if (!res.ok) return 0;
    const data = await res.json();
    const titles = new Set((data?.data || []).map((t) => normSong(t.title)).filter(Boolean));
    let n = 0;
    wantSet.forEach((w) => { if (titles.has(w)) n++; });
    return n;
  } catch { return 0; }
}

// Resolve an artist's photo from Deezer.
//
// The naive `data[0]` is wrong for any name shared by multiple artists: Deezer
// ranks by popularity, so "Goose" returns the Belgian dance-rock band (21k fans)
// ahead of the Connecticut jam band the user actually saw (1k fans). When the
// caller passes `songs` — the user's own logged setlist for this artist — we
// disambiguate by picking the same-name candidate whose catalog best matches
// those songs. Costs extra requests ONLY when the name is genuinely ambiguous
// (more than one exact-name hit) and a setlist is available.
export async function fetchArtistImage(artistName, { songs } = {}) {
  if (!artistName) return null;
  const rec = getImageRecord(artistName);
  // Reuse the cache unless it's an unverified guess AND we now have a setlist
  // that could correct it. A verified entry, or any entry when we have no songs
  // to check, is taken as-is.
  if (rec?.url && (rec.verified || !songs?.length)) return rec.url;

  try {
    const target = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=10`;
    const res = await fetch(`${CORS_PROXY}${encodeURIComponent(target)}`);
    if (!res.ok) throw new Error(`Deezer ${res.status}`);
    const data = await res.json();
    const candidates = (data?.data || []).filter((a) => a.picture_xl);
    if (!candidates.length) return null;

    // Prefer exact-name matches (Deezer's fuzzy search mixes in "Goose house",
    // "Silly Goose", etc.); fall back to the whole list if none match exactly.
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const nName = norm(artistName);
    const exact = candidates.filter((a) => norm(a.name) === nName);
    const pool = exact.length ? exact : candidates;

    let chosen = pool[0]; // default: Deezer's most popular exact match
    let verified = false;
    if (songs?.length && pool.length > 1) {
      const want = new Set(songs.map(normSong).filter(Boolean));
      if (want.size) {
        let best = 0;
        // Cap at 4 candidates — extra requests, and beyond the top few it's noise.
        for (const cand of pool.slice(0, 4)) {
          const overlap = await artistTrackOverlap(cand.id, want);
          if (overlap > best) { best = overlap; chosen = cand; verified = true; }
        }
      }
    }

    const url = chosen.picture_xl;
    setImageCacheEntry(artistName, { url, id: chosen.id, verified });
    return url;
  } catch (err) {
    console.warn('[Melo] Deezer fetch failed for', artistName, err.message);
  }
  return null;
}

// Batch-fetch images for multiple artists (non-blocking). `songsByArtist` maps
// an artist name to the songs the user has logged for them, so ambiguous names
// resolve to the act they actually saw (see fetchArtistImage). Omit it (e.g. for
// Ticketmaster upcoming artists, who have no setlist) to just take the top hit.
export async function prefetchArtistImages(artistNames, onUpdate, songsByArtist = {}) {
  const unique = [...new Set(artistNames)];
  const results = {};

  // Load already-resolved images from cache first.
  unique.forEach((name) => {
    const cached = getCachedImage(name);
    if (cached) results[name] = cached;
  });

  // A cached-but-unverified entry should still be re-checked once we have a
  // setlist for it, so it can be corrected — so "needs work" is more than just
  // "not in results".
  const needsResolve = unique.filter((name) => {
    const key = name?.toLowerCase().trim();
    const rec = getImageRecord(name);
    const hasSongs = (songsByArtist[name] || songsByArtist[key] || []).length > 0;
    return !rec?.url || (!rec.verified && hasSongs);
  });

  for (let i = 0; i < needsResolve.length; i++) {
    const name = needsResolve[i];
    const songs = songsByArtist[name] || songsByArtist[name?.toLowerCase().trim()] || [];
    const url = await fetchArtistImage(name, { songs });
    if (url) {
      results[name] = url;
      onUpdate?.({ ...results });
    }
    // Small delay between requests to be polite to APIs.
    if (i < needsResolve.length - 1) await new Promise((r) => setTimeout(r, 300));
  }

  return results;
}

// ===== VENUE IMAGES (Wikimedia Commons) =====
// Real venue photos, resolved on demand from Wikipedia's pageimages API
// (keyless, CORS via origin=*, unmetered — the same infra `lookupVenueUrl`
// already uses). ~90% coverage for arenas/amphitheatres/stadiums/festival
// grounds; small clubs with no Wikipedia article fall back to the gradient.
// Waterfall: Wikipedia pageimages -> Wikidata P18 -> null. Guarded by a
// coordinate + name-token check so we never render the wrong building (or a
// person/album that a fuzzy search happened to rank first).
// See docs/initiatives/2026-07-13-venue-photos.md.
const VENUE_IMG_KEY = 'melo_venue_image_cache.v1';
const VENUE_IMG_TTL = 1000 * 60 * 60 * 24 * 90; // 90 days — venue photos are stable

function getVenueImageCache() {
  try { return JSON.parse(localStorage.getItem(VENUE_IMG_KEY) || '{}'); }
  catch { return {}; }
}
function setVenueImageEntry(key, rec) {
  const c = getVenueImageCache();
  c[key] = rec;
  try { localStorage.setItem(VENUE_IMG_KEY, JSON.stringify(c)); }
  catch { /* ignore quota */ }
}
const venueImageKey = (name, city = '') => `${name}|${city}`.toLowerCase().trim();

// Sync getter — returns the cached record { url, source, credit, ts } or null.
// A negative-cache hit (url:'') returns null so the caller shows a gradient;
// a stale entry (past TTL) also returns null so it gets refetched.
export function getCachedVenueImage(name, city = '') {
  if (!name) return null;
  const rec = getVenueImageCache()[venueImageKey(name, city)];
  if (!rec) return null;
  if (Date.now() - (rec.ts || 0) > VENUE_IMG_TTL) return null;
  return rec.url ? rec : null;
}

// Significant name tokens (drop venue-type filler + articles) for the
// false-match guard — a candidate page must share one with the venue name.
const VENUE_STOPWORDS = new Set(['the', 'at', 'of', 'and', 'a', 'center', 'centre',
  'theatre', 'theater', 'arena', 'stadium', 'hall', 'club', 'tavern', 'room', 'live',
  'music', 'amphitheatre', 'amphitheater', 'pavilion', 'park', 'field', 'house', 'bar', 'lounge']);
function venueTokens(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 3 && !VENUE_STOPWORDS.has(w));
}
function venueNameOverlap(a, b) {
  const ta = new Set(venueTokens(a));
  if (!ta.size) return false;
  return venueTokens(b).some((w) => ta.has(w));
}
const stripTags = (s) => (s || '').replace(/<[^>]*>/g, '').trim();

// Filename heuristics to steer AWAY from sports-game shots and TOWARD concert
// or neutral-exterior photos. Melo is a concert app — a stadium mid-football
// game feels wrong. All scored files come from the venue's verified Wikipedia
// article, so this only re-ranks trusted candidates, it doesn't loosen safety.
const VP_SPORTS = /\b(game|games|match|matchup|nba|wnba|nfl|nhl|mlb|mls|ncaa|basketball|football|hockey|baseball|soccer|playoffs?|championship|finals?|scoreboard|wrestling|wwe|ufc|boxing|gridiron|tip ?off|face ?off|puck|dunk|touchdown|end ?zone|outfield|infield|home ?plate|rink|ice)\b/i;
const VP_CONCERT = /\b(concert|concerts|show|shows|performance|performing|perform|stage|live|tour|touring|gig|band|festival|crowd|audience|music|singer|singing|dj|lights?)\b/i;
const VP_NEUTRAL = /\b(exterior|entrance|facade|marquee|signage|night|evening|dusk|panorama|aerial|view|street|plaza|outside|frontage|skyline)\b/i;
const VP_JUNK_WORDS = /\b(logo|map|locator|location|icon|flag|seal|crest|diagram|floor ?plan|floorplan|blueprint|schematic|chart|graph|ticket|poster|banner|wordmark|nameplate|plaque)\b/i;
const VP_BAD_EXT = /\.(svg|ogg|oga|wav|mid|midi|pdf|gif|webm|tif|tiff)$/i;

// Wikidata "instance of" (P31) types that mean a fuzzy name match landed on the
// WRONG subject — a company HQ, an office tower, a disambiguation page — rather
// than the venue. Generic corporate venue names ("Wells Fargo Center") collide
// with same-named buildings/companies in the same city, which the coordinate
// guard can't separate. We only run this check on non-exact-name matches.
const VP_NON_VENUE_QIDS = new Set([
  'Q4830453', 'Q6881511', 'Q891723', 'Q783794', 'Q730038', 'Q22687', 'Q650241', // company / bank types
  'Q11303', 'Q1021645', 'Q11755880', // skyscraper / office building / high-rise
  'Q4167410', // Wikimedia disambiguation page
  'Q5', // human
  'Q482994', 'Q182832', // musical album / concert tour
]);

// Score a File: title. null = reject (sports or non-photo junk); higher is
// better. isLead nudges the article's prominent lead image on ties.
function scoreVenueFile(fileTitle, isLead) {
  if (!fileTitle) return null;
  if (VP_BAD_EXT.test(fileTitle)) return null;
  const t = fileTitle.replace(/^file:/i, '').replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ').toLowerCase();
  if (VP_JUNK_WORDS.test(t)) return null;
  if (VP_SPORTS.test(t)) return null;
  let s = 0;
  if (VP_CONCERT.test(t)) s += 3;
  if (VP_NEUTRAL.test(t)) s += 1;
  if (isLead) s += 0.5;
  return s;
}

// Best-effort license/credit for a Commons file, for the VenueDetail caption.
async function fetchWikimediaCredit(fileName, signal) {
  if (!fileName) return null;
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
      `&titles=${encodeURIComponent('File:' + fileName)}&prop=imageinfo` +
      `&iiprop=extmetadata&iiextmetadatafilter=LicenseShortName%7CArtist%7CLicenseUrl`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    const page = Object.values(data?.query?.pages || {})[0];
    const meta = page?.imageinfo?.[0]?.extmetadata || {};
    return {
      artist: stripTags(meta.Artist?.value) || '',
      license: stripTags(meta.LicenseShortName?.value) || '',
      licenseUrl: meta.LicenseUrl?.value || '',
      file: fileName,
    };
  } catch { return null; }
}

// Resolve ONE venue -> a photo record, or null (caller shows a gradient).
export async function fetchVenueImage(name, city = '', coords = null) {
  if (!name) return null;
  const key = venueImageKey(name, city);
  const hit = getCachedVenueImage(name, city);
  if (hit) return hit;
  // A fresh negative-cache entry means "already looked, found nothing" — bail
  // without a network call so we don't re-walk dead venues on every render.
  const raw = getVenueImageCache()[key];
  if (raw && !raw.url && Date.now() - (raw.ts || 0) <= VENUE_IMG_TTL) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const expected = coords || (city ? await resolveCity(city) : null);
    const query = city ? `${name} ${city}` : name;

    // Tier 1: one call gets lead thumbnail + coordinates + wikibase_item for
    // the top candidates. `query.pages` is keyed by pageid (unordered); sort
    // by `.index` to recover search rank.
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
      `&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=6&gsrnamespace=0` +
      `&prop=pageimages%7Ccoordinates%7Cpageprops&piprop=thumbnail%7Cname&pithumbsize=600` +
      `&colimit=6&ppprop=wikibase_item`;
    const res = await fetch(searchUrl, { signal: controller.signal });
    // Do NOT negative-cache an HTTP error. A search that genuinely finds nothing
    // returns 200 with no pages (handled below) — a non-OK here means 429/5xx,
    // i.e. exactly as transient as the network errors the outer catch declines
    // to cache. Rate-limiting is the likely failure mode too, since a full Your
    // Rooms load fires several Wikimedia requests per venue. Caching it would
    // pin the venue to a gradient for the 90-day TTL with nothing to retry it.
    if (!res.ok) return null;
    const data = await res.json();
    const pages = Object.values(data?.query?.pages || {})
      .sort((a, b) => (a.index || 0) - (b.index || 0));

    // Keep every candidate that passes the false-match guard, then choose:
    // an exact-name page that HAS a photo wins (the iconic shot + clean
    // credit), else the best-ranked page with a photo, else the best-ranked
    // page at all (its Wikidata item may still yield a Tier-2 photo).
    const passing = pages.filter((page) => {
      if (!venueNameOverlap(name, page.title)) return false; // wrong subject
      const c = page.coordinates?.[0];
      // A venue is a PLACE, so it must carry coordinates — a person, album,
      // tour, or concept that merely shares a word with the venue name carries
      // none. This runs even when the city is unknown: `city` is optional on a
      // show, and it used to be the ONLY structural check, so without it a
      // one-token name overlap was the entire guard.
      if (!c) return false;
      if (!expected) return true; // a real place, but no city to corroborate it
      return haversineMiles(
        { lat: expected.lat, lng: expected.lng },
        { lat: c.lat, lng: c.lon }
      ) <= 25; // right name, right city
    });
    if (!passing.length) { setVenueImageEntry(key, { url: '', ts: Date.now() }); return null; }

    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const nName = norm(name);
    const withThumb = passing.filter((p) => p.thumbnail?.source);
    const best =
      withThumb.find((p) => norm(p.title) === nName) ||
      withThumb[0] ||
      passing.find((p) => norm(p.title) === nName) ||
      passing[0];
    const chosen = {
      title: best.title,
      thumb: best.thumbnail?.source || '',
      file: best.pageimage || '',
      qid: best.pageprops?.wikibase_item || '',
    };

    // Non-exact match (a fuzzy / renamed / generic-corporate-name case) — verify
    // via Wikidata that we didn't land on a company HQ, office tower, or
    // disambiguation page.
    //
    // An exact-name match skips this to save a request, but ONLY when the
    // coordinate check actually ran (`expected`). With no city on the show
    // there's nothing corroborating the title, and short generic venue names
    // ("Forum", "Metro", "The Vic") collide with famous unrelated places that
    // do have coordinates — so those pay for the extra request.
    let p18Prefetched = '';
    if (chosen.qid && (norm(chosen.title) !== nName || !expected)) {
      try {
        const gRes = await fetch(
          `https://www.wikidata.org/wiki/Special:EntityData/${chosen.qid}.json`,
          { signal: controller.signal }
        );
        if (gRes.ok) {
          const gData = await gRes.json();
          const claims = gData?.entities?.[chosen.qid]?.claims || {};
          const types = (claims.P31 || []).map((c) => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);
          if (types.some((t) => VP_NON_VENUE_QIDS.has(t))) {
            setVenueImageEntry(key, { url: '', ts: Date.now() }); // wrong subject → gradient
            return null;
          }
          p18Prefetched = claims.P18?.[0]?.mainsnak?.datavalue?.value || '';
        }
      } catch { /* Wikidata unreachable — trust the name+coord guard and proceed */ }
    }

    let url = '';
    let source = 'wikipedia';
    let file = '';
    let credit = null;

    // Concert-biased selection: pull the venue article's whole image set and
    // score by filename so we skip sports-game shots and prefer concert /
    // neutral-exterior photos. The lead image is a scored candidate too, so a
    // plain exterior still wins when no concert photo exists. Every candidate
    // is on the verified article, so this doesn't loosen the false-match guard.
    const leadScore = chosen.thumb ? scoreVenueFile(chosen.file, true) : null;
    try {
      const imgsUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
        `&titles=${encodeURIComponent(chosen.title)}&prop=images&imlimit=80`;
      const iRes = await fetch(imgsUrl, { signal: controller.signal });
      if (iRes.ok) {
        const iData = await iRes.json();
        const page = Object.values(iData?.query?.pages || {})[0];
        const scored = (page?.images || [])
          .map((x) => x.title)
          .filter((tt) => /\.(jpe?g|png|webp)$/i.test(tt))
          .map((tt) => ({ title: tt, file: tt.replace(/^File:/i, ''), score: scoreVenueFile(tt, false) }))
          // Require a real concert/exterior signal (>= 1). A score-0 body image
          // has no positive signal and is often a logo or product shot — e.g.
          // The Salt Shed's only article image is the Morton Salt brand logo.
          // Better a clean gradient than a wrong picture. The editorial lead
          // image is exempt (handled via leadScore below).
          .filter((x) => x.score >= 1)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6);
        // Only bother fetching URLs if an article photo beats the lead's score.
        const topArticle = scored[0];
        if (topArticle && topArticle.score > (leadScore ?? -1)) {
          const titles = scored.map((x) => x.title).join('|');
          const infoUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
            `&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url%7Cextmetadata` +
            `&iiurlwidth=600&iiextmetadatafilter=LicenseShortName%7CArtist%7CLicenseUrl`;
          const infoRes = await fetch(infoUrl, { signal: controller.signal });
          if (infoRes.ok) {
            const infoData = await infoRes.json();
            const byTitle = {};
            Object.values(infoData?.query?.pages || {}).forEach((p) => {
              if (p.title) byTitle[p.title] = p.imageinfo?.[0];
            });
            for (const cand of scored) { // sorted best-first
              const ii = byTitle[cand.title];
              const u = ii?.thumburl || ii?.url;
              if (u) {
                url = u;
                file = cand.file;
                credit = {
                  artist: stripTags(ii?.extmetadata?.Artist?.value) || '',
                  license: stripTags(ii?.extmetadata?.LicenseShortName?.value) || '',
                  licenseUrl: ii?.extmetadata?.LicenseUrl?.value || '',
                  file: cand.file,
                };
                break;
              }
            }
          }
        }
      }
    } catch { /* fall back to the lead image below */ }

    // Fall back to the lead image if it's acceptable (not sports/junk) and we
    // didn't find a better article photo.
    if (!url && leadScore !== null) { url = chosen.thumb; file = chosen.file; }

    // Tier 2: no usable Wikipedia photo — try the Wikidata P18 building image
    // (reusing the entity we may have already fetched for the guard above).
    if (!url && chosen.qid) {
      try {
        let p18 = p18Prefetched;
        if (!p18 && norm(chosen.title) === nName) {
          const eRes = await fetch(
            `https://www.wikidata.org/wiki/Special:EntityData/${chosen.qid}.json`,
            { signal: controller.signal }
          );
          if (eRes.ok) {
            const eData = await eRes.json();
            p18 = eData?.entities?.[chosen.qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value || '';
          }
        }
        if (p18 && scoreVenueFile(p18, false) !== null) { // don't let P18 be a sports shot either
          url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p18)}?width=600`;
          source = 'wikidata';
          file = p18;
        }
      } catch { /* ignore — fall through to gradient */ }
    }
    if (!url) { setVenueImageEntry(key, { url: '', ts: Date.now() }); return null; }

    if (!credit) credit = await fetchWikimediaCredit(file, controller.signal);
    const rec = { url, source, credit, ts: Date.now() };
    setVenueImageEntry(key, rec);
    return rec;
  } catch {
    // Network error / abort — transient, so DON'T negative-cache; retry later.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Batch-resolve venue images (serial + staggered 300ms — Wikimedia etiquette).
// `venues`: [{ name, city, coords? }]. Calls onUpdate({...}) as each resolves.
export async function prefetchVenueImages(venues, onUpdate) {
  if (!venues?.length) return {};
  const results = {};
  const seen = new Set();
  const list = [];
  for (const v of venues) {
    if (!v?.name) continue;
    const key = venueImageKey(v.name, v.city || '');
    if (seen.has(key)) continue;
    seen.add(key);
    const cached = getCachedVenueImage(v.name, v.city || '');
    if (cached) { results[key] = cached; continue; }
    // Skip fresh negative-cache entries (already looked, found nothing).
    const raw = getVenueImageCache()[key];
    if (raw && Date.now() - (raw.ts || 0) <= VENUE_IMG_TTL) continue;
    list.push({ name: v.name, city: v.city || '', coords: v.coords || null, key });
  }
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    const rec = await fetchVenueImage(v.name, v.city, v.coords);
    if (rec) {
      results[v.key] = rec;
      onUpdate?.({ ...results });
    }
    if (i < list.length - 1) await new Promise((r) => setTimeout(r, 300));
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
  'coachella': { q: { venue: 'Empire Polo Club' }, city: 'Indio', state: 'CA' },
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

// Clean a Ticketmaster festival EVENT name into the festival's short name,
// e.g. "Austin City Limits Music Festival - Weekend One" → "Austin City
// Limits", "Coachella Music Festival - Weekend 1" → "Coachella".
function cleanFestivalEventName(name) {
  return String(name || '')
    .replace(/\s*[-–—:|(]?\s*(weekend|week|day)\s*(one|two|three|four|1|2|3|4|\d+).*$/i, '')
    .replace(/\s*[-–—:|]\s*(mon|tues|wednes|thurs|fri|satur|sun)day\b.*$/i, '')
    .replace(/\s+presented by.*$/i, '')
    .replace(/\s+music (and arts )?festival\b/i, '')
    .replace(/\s+festival\b/i, '')
    .replace(/\s+\b(19|20)\d{2}\b/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

// Friendly festival date range, e.g. "Jul 8 – 12, 2026" (same month) or
// "Jul 30 – Aug 2, 2026" (cross-month). Single day → "Jul 8, 2026".
function festivalRangeDisplay(start, end) {
  if (!start) return '';
  try {
    const s = new Date(start + 'T00:00:00');
    const md = { month: 'short', day: 'numeric' };
    if (!end || end === start) {
      return s.toLocaleDateString('en-US', { ...md, year: 'numeric' });
    }
    const e = new Date(end + 'T00:00:00');
    const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
    const startStr = s.toLocaleDateString('en-US', md);
    const endStr = sameMonth ? String(e.getDate()) : e.toLocaleDateString('en-US', md);
    return `${startStr} – ${endStr}, ${e.getFullYear()}`;
  } catch {
    return isoToDisplay(start);
  }
}

export async function searchFestivalByName(name, { year, futureOnly } = {}) {
  const label = (name || '').trim();
  if (!label) return [];

  let venue = '';
  let city = '';
  let state = '';
  let resolvedYear = year ? String(year) : '';
  let festStart = ''; // festival's own first/last day (from strict TM match),
  let festEnd = '';   // so we can offer the festival itself by its dates.
  let festMonths = null; // Set of 'MM' the festival runs in (from TM), to keep
                         // a year-round venue's other months out of Setlist.fm.
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
        // Forest"). An empty result here is correct, not a bug. Also drop
        // official "aftershow"/"afterparty" club gigs: they name-match the
        // festival but are separate small shows at OTHER venues, so including
        // them stamped aftershow acts onto the festival with the wrong dates.
        // Catches aftershow(s), afterparty/parties, after hours, after dark,
        // "afters", and pre-party — the common branding for the separate club
        // gigs around a festival. Deliberately NOT "afterlife"/"aftershock",
        // which are real event/festival names.
        const isAftershow = (name) =>
          /after[\s-]?(?:show|part|hour|dark)|\bafters\b|pre[\s-]?part/i.test(name || '');
        let pool = events.filter(
          (ev) => target && normalizeFestival(ev.name).includes(target) && !isAftershow(ev.name)
        );
        // STRICT year filter — keep ONLY the requested year, never fall back
        // to all editions. Ticketmaster is upcoming-only, so a PAST year
        // (e.g. Lollapalooza 2025) has zero TM events; the pool goes empty
        // and we fall through to Setlist.fm for the real historical lineup —
        // instead of silently stamping a FUTURE edition's acts and dates onto
        // it (the "Lollapalooza 2025 → 2026 artists" bug).
        if (year) {
          pool = pool.filter((ev) =>
            (ev?.dates?.start?.localDate || '').startsWith(String(year))
          );
        }
        // Isolate ONE edition. Bare "Lollapalooza" matches the Chicago, Berlin
        // and South American editions. Narrow to the curated VENUE when we
        // have one (Grant Park → main stage only), ELSE to the curated /
        // most-common CITY. Venue and city are ALTERNATIVES, not sequential:
        // once the venue narrows the pool we must NOT also city-filter it,
        // because TM often labels a venue by its borough/suburb ("Flushing",
        // not "New York"; "Allston", not "Boston") and an exact city match
        // would then wipe the correctly-narrowed pool to empty. The city
        // fallback is likewise guarded so a mismatch can never zero the pool.
        if (pool.length) {
          const evVenue = (ev) => ev?._embedded?.venues?.[0]?.name || '';
          const evCity = (ev) => ev?._embedded?.venues?.[0]?.city?.name || '';
          let narrowed = false;
          if (venue) {
            const vlc = venue.toLowerCase();
            const byVenue = pool.filter((ev) => evVenue(ev).toLowerCase().includes(vlc));
            if (byVenue.length) { pool = byVenue; narrowed = true; }
          }
          if (!narrowed) {
            let tgtCity = city;
            if (!tgtCity) {
              const counts = {};
              pool.forEach((ev) => { const c = evCity(ev); if (c) counts[c] = (counts[c] || 0) + 1; });
              tgtCity = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
            }
            if (tgtCity) {
              const byCity = pool.filter((ev) => evCity(ev).toLowerCase() === tgtCity.toLowerCase());
              if (byCity.length) pool = byCity;
            }
          }
        }
        pool.sort((a, b) =>
          (b?.dates?.start?.localDate || '').localeCompare(a?.dates?.start?.localDate || '')
        );
        // Resolve venue/city from the pool — edition-independent, so any
        // matched event does (used for the Setlist.fm search below).
        const primary = pool[0];
        if (primary && !venue && !city) {
          const v = primary?._embedded?.venues?.[0] || {};
          venue = v.name || '';
          city = v.city?.name || '';
          state = v.state?.stateCode || v.state?.name || '';
        }
        // The LINEUP, dates and resolvedYear come ONLY from direction-matching
        // events: Wishlist/Going wants UPCOMING, Attended wants PAST. TM is
        // upcoming-only, so on Attended this leaves no TM lineup and we rely on
        // Setlist.fm — never stamping a future edition's acts onto a past log
        // (the "no year typed on Attended → 2026 acts" bug).
        const todayIso = new Date().toISOString().slice(0, 10);
        const dirPool = futureOnly
          ? pool.filter((ev) => (ev?.dates?.start?.localDate || '') >= todayIso)
          : pool.filter((ev) => (ev?.dates?.start?.localDate || '') < todayIso);
        // Festival's own date span (first → last day of THIS edition). Cap the
        // end to the SAME YEAR as the start, so an early-on-sale next-year
        // edition at the same venue can't merge into a bogus >1-year span.
        // Anchor on the nearest direction-appropriate day, then take every
        // pool date within a festival-length window (16 days) of it — from the
        // FULL pool, so a festival already underway still shows its true first
        // day and a cross-year (NYE) edition isn't truncated, while a next-
        // year edition (~365 days away) can't merge into the span.
        const poolDates = pool.map((ev) => ev?.dates?.start?.localDate).filter(Boolean).sort();
        if (poolDates.length) festMonths = new Set(poolDates.map((d) => d.slice(5, 7)));
        const dirDates = dirPool.map((ev) => ev?.dates?.start?.localDate).filter(Boolean).sort();
        const anchor = futureOnly ? dirDates[0] : dirDates[dirDates.length - 1];
        if (anchor) {
          const dayGap = (a, b) =>
            Math.abs((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
          const edition = poolDates.filter((d) => dayGap(d, anchor) <= 16);
          festStart = edition[0] || anchor;
          festEnd = edition[edition.length - 1] || anchor;
        }
        if (!resolvedYear && festStart) resolvedYear = festStart.slice(0, 4);
        // Attended (past) search with no year: TM is upcoming-only, so dirPool
        // is empty and festStart never gets set — and Setlist.fm with no year
        // returns EVERY show ever at the venue (Zilker Park, Grant Park etc.
        // host events all year → "ACL" spanned a full calendar year). The
        // upcoming edition in `pool` tells us the festival's month, so default
        // to the MOST RECENT PAST edition (the user can type a year to override).
        if (!resolvedYear && !futureOnly && poolDates.length) {
          const monthDay = poolDates[0].slice(5); // 'MM-DD' of the soonest edition
          const y = new Date().getFullYear();
          resolvedYear = String(`${y}-${monthDay}` <= todayIso ? y : y - 1);
        }
        // Build the lineup from direction-matching events only. The name-match
        // above already excluded aftershows; here we also drop any attraction
        // that is just the festival's own name (the "thin" GA/VIP ticket event
        // some festivals list per day — verified live on Windy City Smokeout).
        dirPool.forEach((ev) => {
          const d = ev?.dates?.start?.localDate || '';
          (ev?._embedded?.attractions || []).forEach((a) => {
            // Drop the festival's OWN name listed as an attraction — exact
            // ("Windy City Smokeout") or the full official form ("Coachella
            // Valley Music and Arts Festival" starts with "coachella").
            const an = normalizeFestival(a.name);
            if (a.name && an && !an.startsWith(target)) {
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
    if (lineupSet.size) {
      rows = rows.filter((r) => lineupSet.has((r.artist || '').toLowerCase()));
    } else if (city) {
      // A venue name can be globally ambiguous — Shaky Knees' "Central Park"
      // also matches NYC's Central Park. With no TM lineup to filter by (a
      // past Attended search), constrain to the resolved city so another
      // city's shows aren't stamped as this festival. If this empties rows,
      // the city fallback below re-searches correctly.
      rows = rows.filter((r) => (r.city || '').toLowerCase().includes(city.toLowerCase()));
    }
  }
  if (!rows.length && city) {
    // City search is broader; if we have a Ticketmaster lineup, keep only those
    // acts (avoids stamping unrelated club shows as the festival).
    const cityRows = await searchPastShows({ city, year: resolvedYear || undefined });
    rows = lineupSet.size
      ? cityRows.filter((r) => lineupSet.has((r.artist || '').toLowerCase()))
      : cityRows;
  }

  // Sister festivals share a venue: Empire Polo Club hosts BOTH Coachella and
  // Stagecoach (same April), so a venue search returns both. Setlist.fm tags
  // the festival per setlist (mapSetlistRow → extractFestivalFromSetlist), so
  // when we have no TM lineup to filter by, drop any row EXPLICITLY tagged
  // with a DIFFERENT festival (Zach Bryan → "Stagecoach"), while keeping
  // untagged rows (assumed to be this festival, given the venue + month).
  if (!lineupSet.size && rows.length) {
    const t = normalizeFestival(label);
    rows = rows.filter((r) => {
      const rf = normalizeFestival(r.festival || '');
      return !rf || rf.includes(t) || t.includes(rf);
    });
  }

  // Constrain to the festival's month(s) (known from the upcoming TM edition)
  // so a year-round venue's OTHER events don't get returned as the festival —
  // uses a Set of months, so a festival that straddles a month boundary (e.g.
  // Lollapalooza, late Jul → early Aug) keeps its whole lineup. Guarded so it
  // can never wipe all rows.
  if (festMonths && festMonths.size && rows.length) {
    const inMonth = rows.filter((r) => festMonths.has((r.date || '').slice(5, 7)));
    if (inMonth.length) rows = inMonth;
  }

  // Stamp the festival label so everything groups together in the finder.
  rows = rows.map((r) => ({ ...r, festival: label }));

  // Drop non-upcoming rows BEFORE the dedup below — otherwise a lineup act
  // that also has a PAST setlist at this venue/year would populate `have` and
  // suppress its own future-dated row, silently dropping it from Wishlist.
  if (futureOnly) {
    const todayIso = new Date().toISOString().slice(0, 10);
    rows = rows.filter((r) => r.date && r.date >= todayIso);
  }

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
      displayDate: festivalRangeDisplay(date), // "Aug 2, 2026", not "02-08-2026"
      songs: [],
      songCount: 0,
      tour: '',
      festival: label,
    });
  });

  rows.sort(
    (a, b) =>
      (a.date || '').localeCompare(b.date || '') ||
      (a.artist || '').localeCompare(b.artist || '')
  );

  // Offer the festival ITSELF as the first, addable item on a Wishlist/Going
  // search — so a user can look up a festival and add it by its DATES even
  // before a single act is announced (that's the whole "look up a festival
  // date" case). Only when we resolved an upcoming date for it.
  if (futureOnly && festStart) {
    rows.unshift({
      artist: label,
      festival: label,
      venue,
      city,
      state,
      country: '',
      date: festStart,
      endDate: festEnd || festStart,
      displayDate: festivalRangeDisplay(festStart, festEnd),
      songs: [],
      songCount: 0,
      tour: '',
      isFestival: true, // renders a "🎪 Whole event" badge in the finder
    });
  }

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
      // Which attraction did the search actually match? On a festival event
      // attractions[0] is often the festival itself, so pick the one matching
      // what the user typed — else fall back to the first / the search term.
      const matched = attractions.find((a) =>
        (a.name || '').toLowerCase().includes(lcArtist) ||
        lcArtist.includes((a.name || '').toLowerCase())
      ) || attractions[0] || {};
      // Festival appearance? Detect by name or the TM "Festival" classification,
      // so a user can log a festival act by searching the ARTIST (the show is
      // tagged with the festival and groups into that festival's card).
      const isFest =
        /festival/i.test(ev.name || '') ||
        (ev.classifications || []).some((c) =>
          /festival/i.test(c?.genre?.name || '') || /festival/i.test(c?.subGenre?.name || '')
        );
      return {
        artist: matched.name || artistName,
        festival: isFest ? cleanFestivalEventName(ev.name) : '',
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
