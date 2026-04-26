/**
 * Normalize the `friends` field from a logged show: comma-split strings,
 * trim tokens, dedupe within the same show.
 */
export function parseFriendsFromShow(show) {
  const raw = show?.friends;
  if (raw == null) {
    return [];
  }
  let tokens = [];
  if (Array.isArray(raw)) {
    tokens = raw.map((s) => String(s).trim()).filter(Boolean);
  } else if (typeof raw === 'string') {
    tokens = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [...new Set(tokens)];
}

/**
 * Aggregate distinct attended shows per friend name, sorted by show count desc.
 */
export function aggregateConcertBuddies(attended) {
  const byName = new Map();

  for (const show of attended ?? []) {
    const names = parseFriendsFromShow(show);
    for (const name of names) {
      if (!byName.has(name)) {
        byName.set(name, new Map());
      }
      byName.get(name).set(show.id, show);
    }
  }

  return [...byName.entries()]
    .map(([name, idToShow]) => {
      const shows = [...idToShow.values()].sort(
        (a, b) => new Date(b.date) - new Date(a.date),
      );
      return {
        name,
        showCount: shows.length,
        shows,
      };
    })
    .sort((a, b) => {
      if (b.showCount !== a.showCount) {
        return b.showCount - a.showCount;
      }
      return a.name.localeCompare(b.name);
    });
}

export function filterBuddiesByName(buddies, query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return buddies;
  }
  return buddies.filter((b) => b.name.toLowerCase().includes(q));
}
