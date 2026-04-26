export const CURRENT_USER_FIRST_NAME = 'Aidan';

export const stats = {
  cities: 8,
  totalShows: 47,
  uniqueArtists: 23,
};

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export const recentlySeenShows = [
  {
    artist: 'The National',
    date: isoDaysAgo(5),
    id: '1',
    imageUrl:
      'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=400&h=500&fit=crop',
    score: 9.2,
    venue: 'Red Rocks Amphitheatre',
  },
  {
    artist: 'Phoebe Bridgers',
    date: isoDaysAgo(12),
    id: '2',
    imageUrl:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=500&fit=crop',
    score: 8.7,
    venue: 'Greek Theatre',
  },
  {
    artist: 'Fred again..',
    date: isoDaysAgo(3),
    id: '3',
    imageUrl:
      'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&h=500&fit=crop',
    score: 9.5,
    venue: 'Warehouse Project',
  },
  {
    artist: 'Big Thief',
    date: isoDaysAgo(30),
    id: '4',
    imageUrl:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=500&fit=crop',
    score: 8.4,
    venue: 'Brooklyn Steel',
  },
];

export const topRatedShow = {
  artist: 'Radiohead',
  date: 'Sat, Jun 14 · 2025',
  id: 'top',
  imageUrl:
    'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&h=600&fit=crop',
  score: 9.8,
  venue: 'Madison Square Garden',
};

export const thisWeekShows = recentlySeenShows.filter((s) => {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return new Date(s.date).getTime() >= weekAgo;
});
