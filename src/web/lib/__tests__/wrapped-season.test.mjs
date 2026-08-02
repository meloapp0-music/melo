// Wrapped season gating.
// ======================
// The lock is the feature — anticipation is what makes the unlock worth
// posting about — so the boundary has to be exact. An off-by-one here either
// spoils the moment early or withholds someone's year after it opened.
//
//   node src/web/lib/__tests__/wrapped-season.test.mjs
//
// docs/initiatives/2026-07-31-wrapped-season.md
import {
  localDate, unlockDate, isUnlocked, daysUntilUnlock, isUnlockDay, seasonLabel,
} from '../wrappedSeason.js';

let fail = 0;
const ok = (n, c, x = '') => { console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : `  ${x}`}`); if (!c) fail++; };

console.log('THE BOUNDARY');
ok('unlock date is Dec 1 of that year', unlockDate(2026) === '2026-12-01');
ok('locked the day before', isUnlocked(2026, '2026-11-30') === false);
ok('OPEN on the day itself', isUnlocked(2026, '2026-12-01') === true);
ok('still open the day after', isUnlocked(2026, '2026-12-02') === true);
ok('open all through the season', isUnlocked(2026, '2026-12-31') === true);

console.log('\nPAST AND FUTURE YEARS');
ok('a past year is always available', isUnlocked(2025, '2026-03-15') === true);
ok('...even in January', isUnlocked(2025, '2026-01-01') === true);
ok('a future year never is', isUnlocked(2027, '2026-12-25') === false);
ok('the current year mid-summer is locked', isUnlocked(2026, '2026-07-31') === false);
ok('null/0 year is not unlocked', isUnlocked(0, '2026-12-01') === false && isUnlocked(null, '2026-12-01') === false);

console.log('\nCOUNTDOWN');
ok('one day out', daysUntilUnlock(2026, '2026-11-30') === 1);
ok('a week out', daysUntilUnlock(2026, '2026-11-24') === 7);
ok('zero once unlocked', daysUntilUnlock(2026, '2026-12-01') === 0);
ok('zero for a past year', daysUntilUnlock(2025, '2026-05-05') === 0);
// Crossing a month boundary is where naive date maths usually breaks.
ok('counts correctly across the Oct→Dec gap', daysUntilUnlock(2026, '2026-10-01') === 61);

console.log('\nTHE ONE DAY THE PUSH FIRES');
ok('unlock day is exactly Dec 1', isUnlockDay('2026-12-01') === true);
ok('not Nov 30', isUnlockDay('2026-11-30') === false);
ok('not Dec 2 — the moment is one day, not a window', isUnlockDay('2026-12-02') === false);
ok('holds in a different year too', isUnlockDay('2027-12-01') === true);

console.log('\nLABEL');
ok('a locked current year still reads "So Far"', seasonLabel(2026, '2026-08-01') === 'So Far');
ok('once open it reads "Wrapped"', seasonLabel(2026, '2026-12-01') === 'Wrapped');
ok('past years read "Wrapped"', seasonLabel(2025, '2026-08-01') === 'Wrapped');

console.log('\nlocalDate IS LOCAL');
{
  const lateEvening = new Date(2026, 11, 1, 23, 45); // Dec 1, 23:45 local
  ok('late on unlock day is still unlock day', localDate(lateEvening) === '2026-12-01', localDate(lateEvening));
  ok('...so the season opens on time locally', isUnlocked(2026, localDate(lateEvening)) === true);
}

console.log(`\n${fail ? '❌' : '✅'} ${fail} failed\n`);
process.exit(fail ? 1 : 0);
