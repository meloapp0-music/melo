/**
 * Bandsintown public REST API (app_id only, no API key).
 * @see https://help.artists.bandsintown.com/en/articles/9516493-bandsintown-api
 */

const APP_ID = 'melo';

function buildArtistPath(artistName) {
  const q = String(artistName ?? '').trim();
  if (!q.length) {
    return null;
  }
  return encodeURIComponent(q);
}

function pickTicketUrl(raw) {
  const offers = raw?.offers;
  if (Array.isArray(offers)) {
    const withUrl = offers.find((o) => o?.url && String(o.url).startsWith('http'));
    if (withUrl) {
      return withUrl.url;
    }
  }
  const u = raw?.url;
  if (typeof u === 'string' && u.startsWith('http')) {
    return u;
  }
  return '';
}

function normalizeEvent(raw, queriedArtist) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const dtStr = raw.datetime || raw.starts_at || raw.start_time;
  if (!dtStr) {
    return null;
  }
  const dt = new Date(dtStr);
  if (Number.isNaN(dt.getTime())) {
    return null;
  }
  const venue = raw.venue || {};
  const lineup = Array.isArray(raw.lineup) ? raw.lineup : [];
  const headliner =
    lineup[0]?.name ||
    raw.artist?.name ||
    raw.artist_name ||
    queriedArtist;
  const artist = String(headliner || queriedArtist || '').trim();
  if (!artist) {
    return null;
  }
  const id = raw.id != null ? String(raw.id) : `${artist}-${dtStr}-${venue.name || ''}`;
  return {
    artist,
    city: String(venue.city || '').trim(),
    country: String(venue.country || '').trim(),
    datetime: dt.toISOString(),
    description: String(raw.description || '').trim(),
    id,
    lineup: lineup.map((l) => ({ id: l?.id, name: l?.name })).filter((l) => l.name),
    region: String(venue.region || '').trim(),
    ticketUrl: pickTicketUrl(raw),
    title: String(raw.title || '').trim(),
    venueName: String(venue.name || '').trim(),
  };
}

/**
 * @param {string} artistName
 * @param {AbortSignal} [signal]
 */
export async function fetchBandsintownUpcomingEvents(artistName, signal) {
  const path = buildArtistPath(artistName);
  if (!path) {
    return [];
  }
  const url = `https://rest.bandsintown.com/artists/${path}/events?app_id=${APP_ID}&date=upcoming`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Melo/1.0 (concert tracker; +https://melo.app)',
    },
    signal,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) {
    if (Array.isArray(data?.events)) {
      data = data.events;
    } else {
      return [];
    }
  }
  const queried = String(artistName).trim();
  return data
    .map((row) => normalizeEvent(row, queried))
    .filter(Boolean);
}
