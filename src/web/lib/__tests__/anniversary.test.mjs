// Anniversary date logic.
// =======================
// Off-by-one-day bugs here are the worst kind: the push fires, the copy reads
// "one year ago tonight", and it's the wrong night. Nothing errors. So the
// month/day matching, the timezone avoidance and the leap-day fallback all get
// pinned explicitly.
//
//   node src/web/lib/__tests__/anniversary.test.mjs
//
// docs/initiatives/2026-07-30-anniversaries.md
import {
  localDate, yearsAgo, anniversariesOn, pickAnniversary, agoLabel,
} from '../anniversary.js';

let fail = 0;
const ok = (n, c, x = '') => { console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : `  ${x}`}`); if (!c) fail++; };

console.log('MATCHING');
ok('same day, one year back', yearsAgo('2025-08-01', '2026-08-01') === 1);
ok('same day, ten years back', yearsAgo('2016-08-01', '2026-08-01') === 10);
ok('a different day is not an anniversary', yearsAgo('2025-08-02', '2026-08-01') === 0);
ok('a different month is not an anniversary', yearsAgo('2025-09-01', '2026-08-01') === 0);
ok('TODAY is not an anniversary of itself', yearsAgo('2026-08-01', '2026-08-01') === 0);
ok('a FUTURE show never is', yearsAgo('2027-08-01', '2026-08-01') === 0);
ok('malformed input is safe',
  yearsAgo('', '2026-08-01') === 0 && yearsAgo(null, '2026-08-01') === 0 && yearsAgo('2025', '2026-08-01') === 0);
ok('a full timestamp still matches on its date part',
  yearsAgo('2025-08-01T20:00:00Z', '2026-08-01') === 1);

console.log('\nTIMEZONE — the bug this file exists to avoid');
{
  // new Date('2025-08-01') is midnight UTC, i.e. July 31 in every US timezone.
  // A Date-based implementation would resurface this show a day early.
  const naive = new Date('2025-08-01');
  const naiveLocalDay = naive.getDate();
  ok(`Date() would read 2025-08-01 as day ${naiveLocalDay} locally`, true);
  ok('string comparison is unaffected by that', yearsAgo('2025-08-01', '2026-08-01') === 1);
  ok('...and does NOT fire a day early', yearsAgo('2025-08-01', '2026-07-31') === 0);
}

console.log('\nLEAP DAY');
ok('Feb 29 matches Feb 29 in a leap year', yearsAgo('2024-02-29', '2028-02-29') === 4);
ok('Feb 29 falls back to Feb 28 in a non-leap year', yearsAgo('2024-02-29', '2027-02-28') === 3);
ok('...but NOT in a leap year (it has its own 29th)', yearsAgo('2024-02-29', '2028-02-28') === 0);
ok('a normal Feb 28 show is unaffected', yearsAgo('2025-02-28', '2026-02-28') === 1);
ok('2000 counts as a leap year (÷400)', yearsAgo('1996-02-29', '2000-02-28') === 0);
ok('1900 does not (÷100 but not ÷400)', yearsAgo('1896-02-29', '1900-02-28') === 4);

console.log('\nlocalDate() IS LOCAL, NOT UTC');
{
  const d = new Date(2026, 7, 1, 23, 30); // Aug 1, 23:30 local
  ok('late-evening local date does not roll forward', localDate(d) === '2026-08-01', localDate(d));
  ok('zero-pads month and day', localDate(new Date(2026, 0, 5)) === '2026-01-05');
}

console.log('\nPICKING THE ONE TO SURFACE');
{
  const shows = [
    { id: 'a', artist: 'Bare', date: '2025-08-01' },
    { id: 'b', artist: 'Rich', date: '2025-08-01', photos: ['p', 'q'], setlist: ['x', 'y', 'z'] },
    { id: 'c', artist: 'Other', date: '2025-09-01' },
  ];
  ok('only today’s anniversaries are considered',
    anniversariesOn(shows, '2026-08-01').map((a) => a.show.id).join() === 'a,b'
    || anniversariesOn(shows, '2026-08-01').map((a) => a.show.id).join() === 'b,a');
  ok('the richest night wins', pickAnniversary(shows, '2026-08-01').show.id === 'b');

  // A milestone year beats raw richness — "ten years ago" is its own feeling.
  const withMilestone = [
    { id: 'rich', date: '2025-08-01', photos: ['a', 'b', 'c'], setlist: ['1', '2', '3', '4'] },
    { id: 'ten', date: '2016-08-01' },
  ];
  ok('a 10-year milestone outranks a richer 1-year',
    pickAnniversary(withMilestone, '2026-08-01').show.id === 'ten');

  ok('no anniversaries → null', pickAnniversary(shows, '2026-03-03') === null);
  ok('empty library → null', pickAnniversary([], '2026-08-01') === null);
  ok('null library → null', pickAnniversary(null, '2026-08-01') === null);
}

console.log('\nCOPY');
ok('one year reads as a phrase, not "1 years"', agoLabel(1) === 'One year ago');
ok('plural years', agoLabel(5) === '5 years ago');

console.log(`\n${fail ? '❌' : '✅'} ${fail} failed\n`);
process.exit(fail ? 1 : 0);
