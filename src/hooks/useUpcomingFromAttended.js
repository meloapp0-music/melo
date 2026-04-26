import { useCallback, useEffect, useState } from 'react';
import { fetchBandsintownUpcomingEvents } from '../api/bandsintown';

const BATCH = 4;
const MAX_ARTISTS = 48;

async function runBatched(artists, signal, onBatch) {
  for (let i = 0; i < artists.length; i += BATCH) {
    if (signal.aborted) {
      return;
    }
    const slice = artists.slice(i, i + BATCH);
    await onBatch(slice);
  }
}

function uniqueArtistNames(attended) {
  const seen = new Set();
  const out = [];
  if (!Array.isArray(attended)) {
    return out;
  }
  for (const s of attended) {
    const n = String(s?.artist ?? '').trim();
    if (!n) {
      continue;
    }
    const key = n.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(n);
    if (out.length >= MAX_ARTISTS) {
      break;
    }
  }
  return out;
}

function mergeAndSort(allRows) {
  const byId = new Map();
  const now = Date.now() - 60 * 1000;
  for (const row of allRows) {
    const t = new Date(row.datetime).getTime();
    if (Number.isNaN(t) || t < now) {
      continue;
    }
    if (!byId.has(row.id)) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.datetime) - new Date(b.datetime),
  );
}

export function useUpcomingFromAttended(attended) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const artists = uniqueArtistNames(attended);
  const artistsKey = artists.join('\u0001');

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (artists.length === 0) {
      setEvents([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const ac = new AbortController();
    const collected = [];

    (async () => {
      setLoading(true);
      setError(null);
      try {
        await runBatched(artists, ac.signal, async (batch) => {
          const settled = await Promise.allSettled(
            batch.map((name) =>
              fetchBandsintownUpcomingEvents(name, ac.signal),
            ),
          );
          for (const r of settled) {
            if (r.status === 'fulfilled' && Array.isArray(r.value)) {
              collected.push(...r.value);
            }
          }
        });
        if (!ac.signal.aborted) {
          setEvents(mergeAndSort(collected));
        }
      } catch (e) {
        if (!ac.signal.aborted) {
          setError(e);
          setEvents([]);
        }
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => ac.abort();
  }, [artistsKey, refreshKey]);

  return { artists, error, events, loading, refetch };
}
