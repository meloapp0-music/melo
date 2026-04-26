import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = '@melo/deezerArtist/';

const memory = new Map();
const inflight = new Map();

function normKey(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function peekArtistImageUrl(artistName) {
  const key = normKey(artistName);
  if (!key) {
    return null;
  }
  return memory.get(key) ?? null;
}

async function readStorage(key) {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) {
      return null;
    }
    const { url } = JSON.parse(raw);
    return typeof url === 'string' && url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

async function writeStorage(key, url) {
  try {
    await AsyncStorage.setItem(
      STORAGE_PREFIX + key,
      JSON.stringify({ url, t: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

async function fetchDeezerPicture(artistName) {
  const q = String(artistName ?? '').trim();
  if (!q) {
    return null;
  }
  const res = await fetch(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}`,
  );
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  const first = data?.data?.[0];
  return (
    first?.picture_xl ||
    first?.picture_big ||
    first?.picture_medium ||
    null
  );
}

/**
 * Resolve Deezer artist picture_xl (cached in memory + AsyncStorage).
 */
export async function resolveArtistImageUrl(artistName) {
  const key = normKey(artistName);
  if (!key) {
    return null;
  }
  if (memory.has(key)) {
    return memory.get(key);
  }

  const stored = await readStorage(key);
  if (stored) {
    memory.set(key, stored);
    return stored;
  }

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = fetchDeezerPicture(artistName)
    .then((url) => {
      if (url) {
        memory.set(key, url);
        writeStorage(key, url);
      }
      return url;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
