const SETLIST_BASE = 'https://api.setlist.fm/rest/1.0';

function parseEventDate(ddMmYyyy) {
  if (!ddMmYyyy || typeof ddMmYyyy !== 'string') {
    return null;
  }
  const [d, m, y] = ddMmYyyy.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) {
    return null;
  }
  return new Date(y, m - 1, d);
}

function collectSongs(setlist) {
  const songs = [];
  const setsRaw = setlist?.sets?.set;
  const sets = Array.isArray(setsRaw) ? setsRaw : setsRaw ? [setsRaw] : [];
  for (const st of sets) {
    const songRaw = st?.song;
    const songList = Array.isArray(songRaw) ? songRaw : songRaw ? [songRaw] : [];
    for (const song of songList) {
      if (song?.name && song.tape !== true) {
        songs.push(song.name);
      }
    }
  }
  return songs;
}

export async function fetchLatestSetlist(mbid, apiKey, signal) {
  if (!apiKey || !mbid) {
    return null;
  }
  const url = `${SETLIST_BASE}/artist/${mbid}/setlists?p=1`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'x-api-key': apiKey,
    },
    signal,
  });
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  const list = data.setlist;
  const first = Array.isArray(list) ? list[0] : list;
  if (!first) {
    return null;
  }
  const venue = first.venue?.name ?? '';
  const city = first.venue?.city?.name ?? '';
  const date = parseEventDate(first.eventDate);
  const setlistText = collectSongs(first).join('\n');
  return { city, date, setlistText, venue };
}
