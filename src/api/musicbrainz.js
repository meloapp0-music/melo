const MB_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Melo/1.0 (https://github.com/melo-app; hello@melo.app)';

export function buildArtistSubtitle(artist) {
  const parts = [];
  if (artist.country) {
    parts.push(artist.country);
  }
  if (artist.disambiguation) {
    parts.push(artist.disambiguation);
  }
  const tagName = artist.tags?.[0]?.name;
  if (tagName) {
    parts.push(tagName);
  }
  return parts.length ? parts.join(' · ') : '';
}

export async function searchArtists(query, signal) {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }
  const url = `${MB_BASE}/artist?query=${encodeURIComponent(q)}&fmt=json&limit=12`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal,
  });
  if (!res.ok) {
    throw new Error(`MusicBrainz ${res.status}`);
  }
  const data = await res.json();
  const artists = data.artists;
  return Array.isArray(artists) ? artists : [];
}

/**
 * Short artist blurb: annotation when present, else a compact line from MB fields.
 */
export async function fetchArtistBioSummary(artistName, signal) {
  const q = String(artistName ?? '').trim();
  if (q.length < 2) {
    return null;
  }
  const found = await searchArtists(q, signal);
  const mbid = found[0]?.id;
  if (!mbid) {
    return null;
  }
  const url = `${MB_BASE}/artist/${mbid}?fmt=json&inc=annotation+tags`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal,
  });
  if (!res.ok) {
    return null;
  }
  const artist = await res.json();
  let ann = artist.annotation;
  if (ann && typeof ann === 'object' && typeof ann.text === 'string') {
    ann = ann.text;
  }
  if (typeof ann === 'string' && ann.trim()) {
    return ann.trim();
  }
  const name = artist.name || q;
  const country = artist.country;
  const type = artist.type;
  const begin = artist['life-span']?.begin;
  const tags = Array.isArray(artist.tags)
    ? artist.tags
        .slice(0, 4)
        .map((t) => t.name)
        .filter(Boolean)
    : [];
  const parts = [];
  if (type === 'Group') {
    parts.push(`${name} is a musical group`);
  } else {
    parts.push(`${name} is a musical artist`);
  }
  if (country) {
    parts.push(`associated with ${country}`);
  }
  if (begin) {
    parts.push(`active since ${begin}`);
  }
  if (tags.length) {
    parts.push(`often tagged: ${tags.join(', ')}`);
  }
  const sentence = `${parts.join(', ')}.`;
  return sentence.length > 24 ? sentence : null;
}
