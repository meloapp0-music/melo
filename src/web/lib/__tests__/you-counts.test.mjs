// Confirm the merge kept Stats' math and that the resulting number CHANGE is
// the one we predicted (festivals collapse; festival stages excluded).
import { groupIntoOutings, festivalKey, isAttended } from '../../store.js';

const shows = [
  { id:'1', artist:'Coldplay', date:'2025-09-14', venue:'Rose Bowl', city:'Pasadena', status:'attended', score:9.8 },
  // A three-set festival: three rows, ONE night out.
  { id:'2', artist:'Goose',   date:'2025-04-12', venue:'Sahara Tent', city:'Indio', festival:'Coachella', status:'attended', score:9 },
  { id:'3', artist:'Tame',    date:'2025-04-12', venue:'Mojave Tent', city:'Indio', festival:'Coachella', status:'attended', score:8 },
  { id:'4', artist:'Doja',    date:'2025-04-13', venue:'Main Stage',  city:'Indio', festival:'Coachella', status:'attended', score:9 },
  { id:'5', artist:'Wishlist', date:'2026-01-01', venue:'X', city:'Y', status:'wishlist' },
];
const attended = shows.filter(isAttended);

// OLD Profile math
const profileShows = attended.length;
const profileVenues = new Set(attended.map(s=>s.venue).filter(Boolean)).size;

// Stats math (what You.jsx now uses)
const statsShows = groupIntoOutings(attended).length;
const venues = new Set();
attended.forEach(s => { if (s.venue && !festivalKey(s)) venues.add(s.venue); });
const statsVenues = venues.size;

console.log(`  Profile "Shows":  ${profileShows}   (raw rows)`);
console.log(`  You/Stats "Shows": ${statsShows}   (festival = one outing)`);
console.log(`  Profile "Venues": ${profileVenues}   (every venue string, incl. festival stages)`);
console.log(`  You/Stats "Venues": ${statsVenues}   (festival stages excluded)`);

let fail = 0;
const ok = (n,c) => { console.log(`  ${c?'✓':'✗'} ${n}`); if(!c) fail++; };
console.log('');
ok('the two pages really did disagree', profileShows !== statsShows && profileVenues !== statsVenues);
ok('You collapses the festival (4 rows -> fewer outings)', statsShows < profileShows);
ok('You excludes festival stages from Venues', statsVenues === 1);
ok('wishlist rows are excluded from both', attended.length === 4);
console.log(`\n${fail?'❌':'✅'} ${fail} failed\n`);
process.exit(fail?1:0);
