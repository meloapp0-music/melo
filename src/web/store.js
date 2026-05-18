// Pure helpers + constants. Data persistence (load/save) moved to
// src/web/lib/db/* after the Supabase migration. See
// docs/initiatives/2026-04-17-backend-and-social.md.

// Style data for every vibe, including the six retired in v1.0.5.
// Kept so a show logged with an older vibe still renders with its
// original colour — `vibeStyle()` resolves any name, current or
// retired. The logging picker only offers the trimmed `VIBES`.
const VIBE_STYLES = {
  Euphoric: { color: '#FF6B6B', bg: '#FFF0F0' },
  Intimate: { color: '#845EC2', bg: '#F3EEFF' },
  'High Energy': { color: '#FF9671', bg: '#FFF3ED' },
  Chill: { color: '#00C9A7', bg: '#E8FFF8' },
  Emotional: { color: '#4B7BE5', bg: '#EDF2FF' },
  'Mind-Blowing': { color: '#FFC75F', bg: '#FFF8E7' },
  Rowdy: { color: '#C4E538', bg: '#F5FFDB' },
  Transcendent: { color: '#D65DB1', bg: '#FCF0F8' },
  Nostalgic: { color: '#FF8066', bg: '#FFF0ED' },
  Groovy: { color: '#00D2FC', bg: '#E6FAFF' },
  Raw: { color: '#C34A36', bg: '#FBEEED' },
  Dreamy: { color: '#A98FE7', bg: '#F5F0FF' },
  Chaotic: { color: '#FF4757', bg: '#FFEDED' },
  Spiritual: { color: '#7EC8E3', bg: '#EFF8FC' },
  Legendary: { color: '#E8573A', bg: '#FFF0EC' },
};

// The vibes offered when logging a show. Trimmed 15 → 9 in v1.0.5 to
// cut redundancy (Euphoric/Transcendent/Mind-Blowing/Legendary all
// meant "peak"; High Energy/Rowdy/Chaotic all "intense"). See
// docs/initiatives/2026-05-15-v1-0-5-favorite-and-vibes.md.
export const VIBES = [
  'Euphoric', 'Intimate', 'High Energy', 'Chill', 'Emotional',
  'Rowdy', 'Transcendent', 'Nostalgic', 'Groovy',
].map((name) => ({ name, ...VIBE_STYLES[name] }));

// Style lookup for ANY vibe name — current or retired. Display
// surfaces use this so legacy shows keep their colour.
export const vibeStyle = (name) => VIBE_STYLES[name] || {};

export const CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Nashville', 'Austin',
  'San Francisco', 'Denver', 'Seattle', 'Portland', 'Atlanta',
  'Philadelphia', 'Boston', 'Miami', 'Brooklyn', 'Dallas',
  'Detroit', 'Minneapolis', 'New Orleans', 'Washington DC', 'Phoenix',
  'Morrison', 'Manchester', 'Indio',
  'London', 'Berlin', 'Tokyo', 'Paris', 'Toronto', 'Melbourne',
];

export const VENUES_BY_CITY = {
  'New York': ['Madison Square Garden', 'Radio City Music Hall', 'Terminal 5', 'Brooklyn Steel', 'Webster Hall', 'Beacon Theatre', 'Irving Plaza'],
  'Los Angeles': ['The Forum', 'Hollywood Bowl', 'Greek Theatre', 'The Wiltern', 'Troubadour', 'The Roxy', 'Crypto.com Arena'],
  'Chicago': ['United Center', 'Metro', 'Thalia Hall', 'The Riviera', 'House of Blues', 'Soldier Field'],
  'Nashville': ['Ryman Auditorium', 'Bridgestone Arena', 'The Bluebird Cafe', 'Exit/In', 'Marathon Music Works'],
  'Austin': ['ACL Live', 'Stubb\'s', 'Mohawk', 'Emo\'s', 'The Continental Club'],
  'San Francisco': ['The Fillmore', 'Bill Graham Civic', 'The Warfield', 'Great American Music Hall', 'The Independent'],
  'Denver': ['Red Rocks Amphitheatre', 'Mission Ballroom', 'Ogden Theatre', 'Gothic Theatre', 'Ball Arena'],
  'Seattle': ['The Showbox', 'Neumos', 'Paramount Theatre', 'Climate Pledge Arena', 'The Crocodile'],
  'Portland': ['Crystal Ballroom', 'Wonder Ballroom', 'Doug Fir Lounge', 'Revolution Hall'],
  'Atlanta': ['The Tabernacle', 'The Fox Theatre', 'Variety Playhouse', 'Terminal West', 'State Farm Arena'],
  'Brooklyn': ['Barclays Center', 'Brooklyn Steel', 'Music Hall of Williamsburg', 'Elsewhere', 'Brooklyn Mirage', 'Pioneer Works'],
  'Morrison': ['Red Rocks Amphitheatre'],
  'Manchester': ['Warehouse Project', 'Manchester Arena', 'Albert Hall'],
  'London': ['O2 Arena', 'Brixton Academy', 'Royal Albert Hall', 'Roundhouse', 'Electric Ballroom'],
  'Berlin': ['Berghain', 'Tempodrom', 'Lido', 'SO36', 'Columbiahalle'],
  'Tokyo': ['Budokan', 'Shibuya O-East', 'Liquidroom', 'Zepp Tokyo'],
};

export const GENRES = [
  'Rock', 'Pop', 'Hip-Hop', 'R&B', 'Electronic', 'Indie',
  'Jazz', 'Country', 'Metal', 'Folk', 'Alternative', 'Classical',
  'Punk', 'Soul', 'Blues', 'Latin', 'Reggae', 'World',
];

// ===== Show status =====
// Three-tier model added 2026-04-20 (see initiative
// 2026-04-20-going-tier.md). Source of truth is `show.status`. The
// legacy `show.wishlist` boolean is still written as a compat shadow
// (true when status==='wishlist', false otherwise) so any reader we
// missed degrades gracefully. Readers should always go through the
// helpers below — never branch on `show.wishlist` directly in new code.
export const SHOW_STATUS = {
  ATTENDED: 'attended',
  GOING: 'going',
  WISHLIST: 'wishlist',
};

export const getShowStatus = (s) =>
  s?.status || (s?.wishlist ? SHOW_STATUS.WISHLIST : SHOW_STATUS.ATTENDED);

export const isAttended = (s) => getShowStatus(s) === SHOW_STATUS.ATTENDED;
export const isGoing    = (s) => getShowStatus(s) === SHOW_STATUS.GOING;
export const isWishlist = (s) => getShowStatus(s) === SHOW_STATUS.WISHLIST;

// Placeholder id — ignored by the Supabase data layer (the DB assigns
// a uuid), kept for backwards compatibility with call sites that still
// set `id` in-flight before the round-trip.
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function getArtistGradient(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 35 + Math.abs((hash >> 8) % 20)) % 360;
  const s1 = 55 + Math.abs((hash >> 4) % 25);
  const l1 = 35 + Math.abs((hash >> 6) % 15);
  return `linear-gradient(135deg, hsl(${h1}, ${s1}%, ${l1}%), hsl(${h2}, ${s1 + 10}%, ${l1 - 5}%))`;
}

// Build a Ticketmaster search URL for a logged show (Wishlist or Going).
// We can't deep-link to a specific event without storing its TM event
// id, so we compose the search query that's most likely to surface the
// right show.
//
// Earlier cuts joined [artist, venue, city, year] which produced
// over-specified queries like "Goose Red Rocks Amphitheater Morrison
// 2026" — TM's search treats that as 5 required tokens and returns
// nothing. The right shape is two tokens, what a human would type:
//   - artist + venue (full venue name, no stripping — "United Center"
//     stays "United Center" so we don't collapse to "United")
//   - or artist + city if venue isn't recorded
//   - or just artist as last resort
export function ticketmasterSearchUrl(show) {
  if (!show || !show.artist) return 'https://www.ticketmaster.com/';
  const parts = show.venue
    ? [show.artist, show.venue]
    : [show.artist, show.city].filter(Boolean);
  const q = parts.join(' ');
  return `https://www.ticketmaster.com/search?q=${encodeURIComponent(q)}`;
}

export function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getMonthYear(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function getYear(dateStr) {
  return new Date(dateStr + 'T00:00:00').getFullYear();
}

// ===== Streak Calculation =====
export function calculateStreak(shows) {
  const attended = shows.filter(isAttended);
  if (attended.length === 0) return { current: 0, longest: 0, atRisk: false };

  const monthsWithShows = new Set();
  attended.forEach((s) => {
    const d = new Date(s.date + 'T00:00:00');
    monthsWithShows.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  });

  // Current streak: count backwards from current month
  const now = new Date();
  let current = 0;
  let m = now.getMonth();
  let y = now.getFullYear();
  while (true) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    if (monthsWithShows.has(key)) {
      current++;
      m--;
      if (m < 0) { m = 11; y--; }
    } else {
      break;
    }
  }

  // Longest streak
  const sortedMonths = [...monthsWithShows].sort();
  let longest = 0;
  let run = 0;
  let prevKey = '';
  sortedMonths.forEach((key) => {
    const [yr, mo] = key.split('-').map(Number);
    if (prevKey) {
      const [py, pm] = prevKey.split('-').map(Number);
      const expected = pm === 12 ? `${py + 1}-01` : `${py}-${String(pm + 1).padStart(2, '0')}`;
      if (key === expected) { run++; } else { run = 1; }
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prevKey = key;
  });

  // At risk: current month has no shows and it's past the 20th
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const atRisk = current > 0 && !monthsWithShows.has(currentMonthKey) && now.getDate() > 20;

  return { current, longest, atRisk };
}

// ===== Wrapped Year =====
export function getWrappedYears(shows) {
  const years = new Set();
  shows.filter(isAttended).forEach((s) => {
    years.add(new Date(s.date + 'T00:00:00').getFullYear());
  });
  return [...years].sort((a, b) => b - a);
}

// "Wrapped" is a full-year retrospective, so it only fits a finished
// year. The current (in-progress) year is labelled "So Far" instead —
// it keeps the mid-year stat surface engaging without pretending the
// year is done. Per user request 2026-05-17.
export function wrappedLabel(year) {
  return year < new Date().getFullYear() ? 'Wrapped' : 'So Far';
}

// ===== Top artists (weighted) =====
// Ranks the user's favorite artists across both attended and Going
// shows. Powers the "N of your artists playing" badge on the
// Festivals page. Weighted so that a single 10/10 show can still
// compete with a few average-rated ones the user went back for.
//   - Each attended show contributes score+2 (so base weight = 7, a
//     10/10 = 12, a 0-scored "just logged" show still counts = 2).
//   - Each Going show contributes 5 — a clear "I like this artist
//     enough to buy a ticket" signal, slightly weaker than a real
//     attended show because we haven't seen them yet.
export function topArtists(shows, limit = 25) {
  const tally = {};
  shows.filter(isAttended).forEach((s) => {
    if (!s.artist) return;
    const weight = (s.score || 5) + 2;
    tally[s.artist] = (tally[s.artist] || 0) + weight;
  });
  shows.filter(isGoing).forEach((s) => {
    if (!s.artist) return;
    tally[s.artist] = (tally[s.artist] || 0) + 5;
  });
  return Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

// ===== Home city =====
// Most-common city across attended shows. Used by the Festivals page
// to default the `Near Me` toggle without requiring any user setup.
// Returns '' when there's no signal (new users).
export function inferHomeCity(shows) {
  const counts = {};
  shows.filter(isAttended).forEach((s) => {
    if (s.city) counts[s.city] = (counts[s.city] || 0) + 1;
  });
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : '';
}

// ===== Genre-to-Artist discovery map =====
export const DISCOVERY_ARTISTS = {
  Indie: ['Japanese Breakfast', 'Alex G', 'Snail Mail', 'Mitski', 'Beach House', 'Alvvays', 'Weyes Blood', 'MJ Lenderman'],
  Electronic: ['Caribou', 'Four Tet', 'Jamie xx', 'Floating Points', 'Bicep', 'Bonobo', 'ODESZA'],
  Alternative: ['Interpol', 'Fontaines D.C.', 'IDLES', 'Dry Cleaning', 'Squid', 'black midi'],
  'Hip-Hop': ['JID', 'Denzel Curry', 'Earl Sweatshirt', 'Vince Staples', 'Little Simz'],
  'R&B': ['Daniel Caesar', 'Steve Lacy', 'Ravyn Lenae', 'Jorja Smith', 'Dijon'],
  Pop: ['Charli XCX', 'Caroline Polachek', 'Rina Sawayama', 'Ethel Cain'],
  Rock: ['Turnstile', 'Mannequin Pussy', 'Geese', 'Militarie Gun'],
  Folk: ['Iron & Wine', 'Fleet Foxes', 'Adrianne Lenker', 'Waxahatchee'],
  Jazz: ['Nubya Garcia', 'Kamasi Washington', 'Makaya McCraven'],
};
