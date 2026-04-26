const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=600&h=600&fit=crop';

export function newId() {
  return `show-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function showFromLogPayload(payload, existing) {
  const id = existing?.id ?? newId();
  const date = payload.date;
  const d = new Date(date);
  const year = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  const photos = Array.isArray(payload.photos)
    ? payload.photos.filter(Boolean)
    : existing?.photos ?? [];
  return {
    artist: payload.artist?.trim() ?? '',
    artistMbid: payload.artistMbid ?? existing?.artistMbid ?? null,
    city: payload.city?.trim() ?? '',
    country: payload.country?.trim() ?? existing?.country ?? '',
    date,
    friends: payload.friends ?? existing?.friends ?? [],
    genre: existing?.genre ?? payload.genre ?? 'Live',
    id,
    imageUrl: existing?.imageUrl ?? payload.imageUrl ?? FALLBACK_IMG,
    notes: payload.notes ?? '',
    photos,
    score: payload.score ?? null,
    setlist: payload.setlist ?? existing?.setlist ?? [],
    supportActs: payload.supportActs ?? existing?.supportActs ?? [],
    venue: payload.venue?.trim() ?? '',
    vibes: payload.vibes ?? existing?.vibes ?? [],
    year,
  };
}
