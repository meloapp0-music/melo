import { useEffect, useState } from 'react';
import {
  peekArtistImageUrl,
  resolveArtistImageUrl,
} from '../services/artistImageService';

/**
 * Deezer artist image with optional show poster fallback while loading / on miss.
 */
export function useArtistImage(artistName, fallbackUri) {
  const initial = peekArtistImageUrl(artistName);
  const [deezerUri, setDeezerUri] = useState(initial);

  useEffect(() => {
    const cached = peekArtistImageUrl(artistName);
    if (cached) {
      setDeezerUri(cached);
      return undefined;
    }
    setDeezerUri(null);
    let cancelled = false;
    resolveArtistImageUrl(artistName).then((url) => {
      if (!cancelled) {
        setDeezerUri(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [artistName]);

  const displayUri = deezerUri || fallbackUri || null;
  const hasPhoto = Boolean(displayUri);

  return { deezerUri, displayUri, fallbackUri, hasPhoto };
}
