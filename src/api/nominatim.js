const USER_AGENT = 'Melo/1.0 (https://github.com/melo-app)';

function pickCity(addr) {
  if (!addr || typeof addr !== 'object') {
    return '';
  }
  return (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.city_district ||
    addr.county ||
    ''
  );
}

function venueLabel(hit) {
  const name = hit.name?.trim();
  if (name) {
    return name;
  }
  const parts = String(hit.display_name || '').split(',');
  return parts[0]?.trim() || hit.display_name || '';
}

function subtitleLine(hit) {
  const addr = hit.address || {};
  const city = pickCity(addr);
  const region = addr.state || addr.region || '';
  const country = addr.country || '';
  const tail = [city, region, country].filter(Boolean).join(', ');
  if (tail) {
    return tail;
  }
  return String(hit.display_name || '').trim();
}

/**
 * OpenStreetMap Nominatim search (no API key). Use sparingly (usage policy).
 */
export async function searchVenues(query, signal) {
  const q = String(query ?? '').trim();
  if (q.length < 2) {
    return [];
  }
  const url =
    `https://nominatim.openstreetmap.org/search?` +
    `format=json&limit=5&addressdetails=1&` +
    `q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    signal,
  });
  if (!res.ok) {
    return [];
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map((hit, i) => {
    const city = pickCity(hit.address || {});
    return {
      city: city || '',
      id: String(hit.place_id ?? hit.osm_id ?? i),
      label: venueLabel(hit),
      subtitle: subtitleLine(hit),
    };
  });
}

export async function searchCities(query, signal) {
  const q = String(query ?? '').trim();
  if (q.length < 2) {
    return [];
  }
  const url =
    `https://nominatim.openstreetmap.org/search?` +
    `format=json&limit=5&featuretype=city&` +
    `q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    signal,
  });
  if (!res.ok) {
    return [];
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map((hit, i) => ({
    id: String(hit.place_id ?? hit.osm_id ?? i),
    label: pickCity(hit.address || {}) || String(hit.display_name || '').split(',')[0]?.trim() || '',
    subtitle: subtitleLine(hit),
  }));
}

export async function searchVenuesByCity(query, city, signal) {
  const q = String(query ?? '').trim();
  const cityValue = String(city ?? '').trim();
  if (q.length < 2 || cityValue.length < 2) {
    return [];
  }
  const url =
    `https://nominatim.openstreetmap.org/search?` +
    `q=${encodeURIComponent(q)}+${encodeURIComponent(cityValue)}&format=json&limit=5&addressdetails=1`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    signal,
  });
  if (!res.ok) {
    return [];
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map((hit, i) => ({
    id: String(hit.place_id ?? hit.osm_id ?? i),
    label: venueLabel(hit),
    subtitle: subtitleLine(hit),
  }));
}
