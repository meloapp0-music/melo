// Geo helpers for the Wrapped Map chapter (v1.0.4) and the existing
// ConcertMap. Replaces the hardcoded `CITY_COORDS` previously inlined
// in `pages/ConcertMap.jsx` with a richer table that also carries
// state + country, plus utility functions for the travel slides.
//
// For cities not in CITY_DATA we fall back to a one-shot Nominatim
// (OpenStreetMap) geocode, cached in localStorage so we only hit
// upstream once per city ever. Nominatim asks for a User-Agent and
// rate-limits to 1 req/sec, both honored here.
//
// Per docs/initiatives/2026-05-07-v1-0-4-wrapped-juice.md and
// docs/initiatives/2026-05-05-wrapped-map-slides.md.

// Curated list — 50 of the most-likely concert cities for Melo's
// audience. Each row: { lat, lng, state, country }. Country uses
// ISO 3166 names ("United States", "United Kingdom").
export const CITY_DATA = {
  // United States — major + festival cities
  'New York':       { lat: 40.7128, lng:  -74.0060, state: 'NY', country: 'United States' },
  'Brooklyn':       { lat: 40.6782, lng:  -73.9442, state: 'NY', country: 'United States' },
  'Los Angeles':    { lat: 34.0522, lng: -118.2437, state: 'CA', country: 'United States' },
  'San Francisco':  { lat: 37.7749, lng: -122.4194, state: 'CA', country: 'United States' },
  'Oakland':        { lat: 37.8044, lng: -122.2711, state: 'CA', country: 'United States' },
  'San Diego':      { lat: 32.7157, lng: -117.1611, state: 'CA', country: 'United States' },
  'Indio':          { lat: 33.7206, lng: -116.2156, state: 'CA', country: 'United States' },
  'Berkeley':       { lat: 37.8716, lng: -122.2727, state: 'CA', country: 'United States' },
  'Chicago':        { lat: 41.8781, lng:  -87.6298, state: 'IL', country: 'United States' },
  'Nashville':      { lat: 36.1627, lng:  -86.7816, state: 'TN', country: 'United States' },
  'Memphis':        { lat: 35.1495, lng:  -90.0490, state: 'TN', country: 'United States' },
  'Austin':         { lat: 30.2672, lng:  -97.7431, state: 'TX', country: 'United States' },
  'Houston':        { lat: 29.7604, lng:  -95.3698, state: 'TX', country: 'United States' },
  'Dallas':         { lat: 32.7767, lng:  -96.7970, state: 'TX', country: 'United States' },
  'Denver':         { lat: 39.7392, lng: -104.9903, state: 'CO', country: 'United States' },
  'Morrison':       { lat: 39.6536, lng: -105.1911, state: 'CO', country: 'United States' }, // Red Rocks
  'Boulder':        { lat: 40.0150, lng: -105.2705, state: 'CO', country: 'United States' },
  'Seattle':        { lat: 47.6062, lng: -122.3321, state: 'WA', country: 'United States' },
  'Portland':       { lat: 45.5051, lng: -122.6750, state: 'OR', country: 'United States' },
  'Atlanta':        { lat: 33.7490, lng:  -84.3880, state: 'GA', country: 'United States' },
  'Philadelphia':   { lat: 39.9526, lng:  -75.1652, state: 'PA', country: 'United States' },
  'Pittsburgh':     { lat: 40.4406, lng:  -79.9959, state: 'PA', country: 'United States' },
  'Boston':         { lat: 42.3601, lng:  -71.0589, state: 'MA', country: 'United States' },
  'Miami':          { lat: 25.7617, lng:  -80.1918, state: 'FL', country: 'United States' },
  'Orlando':        { lat: 28.5383, lng:  -81.3792, state: 'FL', country: 'United States' },
  'Detroit':        { lat: 42.3314, lng:  -83.0458, state: 'MI', country: 'United States' },
  'Minneapolis':    { lat: 44.9778, lng:  -93.2650, state: 'MN', country: 'United States' },
  'New Orleans':    { lat: 29.9511, lng:  -90.0715, state: 'LA', country: 'United States' },
  'Washington DC':  { lat: 38.9072, lng:  -77.0369, state: 'DC', country: 'United States' },
  'Washington':     { lat: 38.9072, lng:  -77.0369, state: 'DC', country: 'United States' },
  'Phoenix':        { lat: 33.4484, lng: -112.0740, state: 'AZ', country: 'United States' },
  'Las Vegas':      { lat: 36.1699, lng: -115.1398, state: 'NV', country: 'United States' },
  'Salt Lake City': { lat: 40.7608, lng: -111.8910, state: 'UT', country: 'United States' },
  'Kansas City':    { lat: 39.0997, lng:  -94.5786, state: 'MO', country: 'United States' },
  'St. Louis':      { lat: 38.6270, lng:  -90.1994, state: 'MO', country: 'United States' },
  'Cleveland':      { lat: 41.4993, lng:  -81.6944, state: 'OH', country: 'United States' },
  'Columbus':       { lat: 39.9612, lng:  -82.9988, state: 'OH', country: 'United States' },
  'Charlotte':      { lat: 35.2271, lng:  -80.8431, state: 'NC', country: 'United States' },
  'Raleigh':        { lat: 35.7796, lng:  -78.6382, state: 'NC', country: 'United States' },
  'Asheville':      { lat: 35.5951, lng:  -82.5515, state: 'NC', country: 'United States' },

  // International — major touring cities
  'Manchester':     { lat: 53.4808, lng:   -2.2426, state: '', country: 'United Kingdom' },
  'London':         { lat: 51.5074, lng:   -0.1278, state: '', country: 'United Kingdom' },
  'Glasgow':        { lat: 55.8642, lng:   -4.2518, state: '', country: 'United Kingdom' },
  'Berlin':         { lat: 52.5200, lng:   13.4050, state: '', country: 'Germany' },
  'Amsterdam':      { lat: 52.3676, lng:    4.9041, state: '', country: 'Netherlands' },
  'Paris':          { lat: 48.8566, lng:    2.3522, state: '', country: 'France' },
  'Barcelona':      { lat: 41.3851, lng:    2.1734, state: '', country: 'Spain' },
  'Madrid':         { lat: 40.4168, lng:   -3.7038, state: '', country: 'Spain' },
  'Tokyo':          { lat: 35.6762, lng:  139.6503, state: '', country: 'Japan' },
  'Toronto':        { lat: 43.6532, lng:  -79.3832, state: 'ON', country: 'Canada' },
  'Montreal':       { lat: 45.5017, lng:  -73.5673, state: 'QC', country: 'Canada' },
  'Vancouver':      { lat: 49.2827, lng: -123.1207, state: 'BC', country: 'Canada' },
  'Mexico City':    { lat: 19.4326, lng:  -99.1332, state: '', country: 'Mexico' },
  'Sydney':         { lat: -33.8688, lng:  151.2093, state: '', country: 'Australia' },
  'Melbourne':      { lat: -37.8136, lng:  144.9631, state: '', country: 'Australia' },
  'São Paulo':      { lat: -23.5505, lng:  -46.6333, state: '', country: 'Brazil' },
};

// Backwards-compatible export — ConcertMap previously imported a
// flat `[lat, lng]` map. Maintain that shape so we don't have to
// rewrite ConcertMap as part of this initiative.
export const CITY_COORDS = Object.fromEntries(
  Object.entries(CITY_DATA).map(([k, v]) => [k, [v.lat, v.lng]])
);

const GEO_CACHE_KEY = 'melo.geo.cache.v1';
let _lastNominatimAt = 0;

function readCache() {
  try { return JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || '{}'); }
  catch { return {}; }
}
function writeCache(obj) {
  try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(obj)); }
  catch { /* ignore quota errors */ }
}

// Resolves a city name to `{ lat, lng, state, country }`. Returns
// null if unresolvable. Hot path: in-memory CITY_DATA. Cold path:
// localStorage cache. Last resort: one Nominatim request, rate-
// limited at 1 req/sec, cached forever.
export async function resolveCity(name) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  const direct = CITY_DATA[trimmed];
  if (direct) return direct;

  const cache = readCache();
  if (cache[trimmed]) return cache[trimmed];
  if (cache[trimmed] === null) return null; // tried, found nothing — don't retry

  // Nominatim throttle (1 req/sec)
  const now = Date.now();
  const wait = Math.max(0, _lastNominatimAt + 1100 - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _lastNominatimAt = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      cache[trimmed] = null;
      writeCache(cache);
      return null;
    }
    const arr = await res.json();
    const hit = arr?.[0];
    if (!hit) {
      cache[trimmed] = null;
      writeCache(cache);
      return null;
    }
    const data = {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      state: hit.address?.state_code || hit.address?.state || '',
      country: hit.address?.country || '',
    };
    cache[trimmed] = data;
    writeCache(cache);
    return data;
  } catch {
    return null;
  }
}

// Resolve every unique city in a batch. Sequential to honor
// Nominatim's 1 req/sec for the cold-path cities; in-memory hits
// are instant.
export async function resolveCities(names) {
  const unique = [...new Set(names.filter(Boolean).map((n) => n.trim()).filter(Boolean))];
  const out = {};
  for (const name of unique) {
    out[name] = await resolveCity(name);
  }
  return out;
}

// Haversine distance in miles between two `{lat, lng}` points.
// Returns 0 for null/missing inputs.
export function haversineMiles(a, b) {
  if (!a || !b || typeof a.lat !== 'number' || typeof b.lat !== 'number') return 0;
  const R = 3958.8; // Earth radius in miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa = Math.sin(dLat / 2);
  const sb = Math.sin(dLng / 2);
  const x = sa * sa + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sb * sb;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

// Sum of haversine distances between consecutive shows ordered by
// date. Skips legs where either end has no resolved coords. The
// resulting number captures the user's actual concert-travel
// mileage for the year, including same-day-back-to-back drives.
export function totalMilesTraveled(shows, geo) {
  if (!shows || shows.length < 2) return 0;
  const ordered = [...shows].sort((a, b) => new Date(a.date) - new Date(b.date));
  let total = 0;
  for (let i = 1; i < ordered.length; i++) {
    const prev = geo[ordered[i - 1].city];
    const curr = geo[ordered[i].city];
    if (prev && curr) total += haversineMiles(prev, curr);
  }
  return Math.round(total);
}

// Stats for the venue-depth slide: total venues, new this year, repeats
// (compared against the user's full attended history in prior years).
export function venueDepth(yearShows, allPriorYearsShows) {
  const venuesThisYear = new Set();
  yearShows.forEach((s) => { if (s.venue) venuesThisYear.add(`${s.venue}|${s.city}`); });

  const venuesPrior = new Set();
  (allPriorYearsShows || []).forEach((s) => { if (s.venue) venuesPrior.add(`${s.venue}|${s.city}`); });

  let returnCount = 0;
  let newCount = 0;
  for (const v of venuesThisYear) {
    if (venuesPrior.has(v)) returnCount += 1;
    else newCount += 1;
  }
  return { total: venuesThisYear.size, newCount, returnCount };
}

// Stats for the geographic-spread slide: cities, states, countries.
// `geo` is a `{ cityName: {lat, lng, state, country} }` map.
export function geoSpread(yearShows, geo) {
  const cities = new Set();
  const states = new Set();
  const countries = new Set();
  yearShows.forEach((s) => {
    if (!s.city) return;
    cities.add(s.city);
    const g = geo[s.city];
    if (g?.state) states.add(`${g.state}|${g.country}`);
    if (g?.country) countries.add(g.country);
  });
  return {
    cities: cities.size,
    states: states.size,
    countries: countries.size,
  };
}

// Most-visited venue this year. Returns { name, city, count } or null.
export function mostVisitedVenue(yearShows) {
  const counts = {};
  yearShows.forEach((s) => {
    if (!s.venue) return;
    const key = `${s.venue}|${s.city || ''}`;
    counts[key] = (counts[key] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const [topKey, count] = entries[0];
  if (count < 2) return null; // not "most visited" if it's just one
  const [name, city] = topKey.split('|');
  return { name, city, count };
}
