/**
 * Public Deezer API — artist search for hero imagery (no API key).
 */
export async function fetchDeezerArtistPicture(artistName, signal) {
  const q = String(artistName ?? '').trim();
  if (q.length < 1) {
    return null;
  }
  const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}&limit=1`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  const first = data?.data?.[0];
  if (!first) {
    return null;
  }
  return first.picture_xl || first.picture_big || first.picture_medium || null;
}
