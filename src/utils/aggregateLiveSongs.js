function norm(s) {
  return (s || '').trim().toLowerCase();
}

function linesFromShow(show) {
  const raw = show?.setlist;
  if (Array.isArray(raw)) {
    return raw.flatMap((line) => String(line ?? '').split(/\r?\n/));
  }
  if (typeof raw === 'string') {
    return raw.split(/\r?\n/);
  }
  return [];
}

export function aggregateLiveSongs(attended) {
  const map = new Map();
  for (const show of attended) {
    const artist = show.artist?.trim() ?? '';
    if (!artist) {
      continue;
    }
    for (const line of linesFromShow(show)) {
      const title = String(line).trim();
      if (!title) {
        continue;
      }
      const key = `${norm(artist)}|||${norm(title)}`;
      const ts = new Date(show.date).getTime();
      const occ = {
        city: show.city ?? '',
        date: show.date,
        showId: show.id,
        venue: show.venue ?? '',
      };
      if (!map.has(key)) {
        map.set(key, {
          artist,
          count: 0,
          key,
          lastHeard: show.date,
          occurrences: [],
          title,
        });
      }
      const entry = map.get(key);
      entry.count += 1;
      entry.occurrences.push(occ);
      if (!Number.isNaN(ts) && ts > new Date(entry.lastHeard).getTime()) {
        entry.lastHeard = show.date;
      }
    }
  }
  for (const entry of map.values()) {
    entry.occurrences.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }
  return [...map.values()];
}

export function countShowsWithSetlists(attended) {
  let n = 0;
  for (const show of attended) {
    const lines = linesFromShow(show).map((l) => String(l).trim()).filter(Boolean);
    if (lines.length > 0) {
      n += 1;
    }
  }
  return n;
}

export const SONG_SORT = {
  artistAZ: 'artistAZ',
  mostSeen: 'mostSeen',
  recent: 'recent',
};

/** Flat list sort (no artist grouping) for Song Tracking sections. */
export function sortSongs(entries, sortKey) {
  const list = [...entries];
  switch (sortKey) {
    case SONG_SORT.recent:
      list.sort((a, b) => {
        const tb = new Date(b.lastHeard).getTime();
        const ta = new Date(a.lastHeard).getTime();
        if (tb !== ta) {
          return tb - ta;
        }
        return a.title.localeCompare(b.title);
      });
      break;
    case SONG_SORT.artistAZ:
      list.sort((a, b) => {
        const ca = a.artist.localeCompare(b.artist);
        if (ca !== 0) {
          return ca;
        }
        return a.title.localeCompare(b.title);
      });
      break;
    case SONG_SORT.mostSeen:
    default:
      list.sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return a.title.localeCompare(b.title);
      });
  }
  return list;
}

export function sortAndGroupSongs(entries, sortKey) {
  const list = [...entries];
  switch (sortKey) {
    case SONG_SORT.recent:
      list.sort((a, b) => {
        const tb = new Date(b.lastHeard).getTime();
        const ta = new Date(a.lastHeard).getTime();
        if (tb !== ta) {
          return tb - ta;
        }
        return a.title.localeCompare(b.title);
      });
      break;
    case SONG_SORT.artistAZ:
      list.sort((a, b) => {
        const ca = a.artist.localeCompare(b.artist);
        if (ca !== 0) {
          return ca;
        }
        return a.title.localeCompare(b.title);
      });
      break;
    case SONG_SORT.mostSeen:
    default:
      list.sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return a.title.localeCompare(b.title);
      });
  }

  const byArtist = new Map();
  for (const e of list) {
    if (!byArtist.has(e.artist)) {
      byArtist.set(e.artist, []);
    }
    byArtist.get(e.artist).push(e);
  }

  let artists = [...byArtist.keys()];
  if (sortKey === SONG_SORT.recent) {
    artists.sort((A, B) => {
      const maxB = Math.max(
        ...byArtist.get(B).map((s) => new Date(s.lastHeard).getTime()),
      );
      const maxA = Math.max(
        ...byArtist.get(A).map((s) => new Date(s.lastHeard).getTime()),
      );
      if (maxB !== maxA) {
        return maxB - maxA;
      }
      return A.localeCompare(B);
    });
  } else if (sortKey === SONG_SORT.mostSeen) {
    artists.sort((A, B) => {
      const sumB = byArtist.get(B).reduce((s, x) => s + x.count, 0);
      const sumA = byArtist.get(A).reduce((s, x) => s + x.count, 0);
      if (sumB !== sumA) {
        return sumB - sumA;
      }
      return A.localeCompare(B);
    });
  } else {
    artists.sort((a, b) => a.localeCompare(b));
  }

  return artists.map((artist) => {
    let data = [...byArtist.get(artist)];
    if (sortKey === SONG_SORT.mostSeen) {
      data.sort(
        (a, b) =>
          b.count - a.count || a.title.localeCompare(b.title),
      );
    } else if (sortKey === SONG_SORT.recent) {
      data.sort((a, b) => {
        const tb = new Date(b.lastHeard).getTime();
        const ta = new Date(a.lastHeard).getTime();
        if (tb !== ta) {
          return tb - ta;
        }
        return a.title.localeCompare(b.title);
      });
    } else {
      data.sort((a, b) => a.title.localeCompare(b.title));
    }
    return { artist, count: data.length, data, title: artist };
  });
}

export function filterSongsByQuery(entries, query) {
  const q = norm(query);
  if (!q) {
    return entries;
  }
  return entries.filter(
    (e) =>
      norm(e.title).includes(q) || norm(e.artist).includes(q),
  );
}

export function pickMostSeenSong(entries) {
  if (!entries.length) {
    return null;
  }
  return [...entries].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.title.localeCompare(b.title);
  })[0];
}
