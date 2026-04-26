const GEO_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Melo/1.0 (https://github.com/melo-app)';

const memoryCache = new Map();

/**
 * Geocode a city (city + optional country) to lat/lng. Cached in memory.
 */
export async function geocodeCity(city, country, signal) {
  const q = [city, country].filter(Boolean).join(', ').trim();
  if (!q) {
    return null;
  }
  const key = q.toLowerCase();
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }
  const url = `${GEO_BASE}?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    signal,
  });
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  const hit = (Array.isArray(data) && data[0]) || null;
  if (!hit) {
    return null;
  }
  const lat = parseFloat(hit.lat);
  const lon = parseFloat(hit.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }
  const out = { lat, lng: lon };
  memoryCache.set(key, out);
  return out;
}
