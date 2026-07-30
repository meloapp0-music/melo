// Binary-insertion ranking.
// =========================
// The placement algorithm is the whole Beli edition — if it puts shows in the
// wrong slot the leaderboard, the "Where it ranks" recap cut and the receipt
// all lie in the same direction and nothing obviously breaks. So it gets an
// exhaustive test: every insertion position for every list size up to 30 is
// checked against a known-correct ordering.
//
//   node src/web/lib/__tests__/ranking.test.mjs
//
// docs/initiatives/2026-07-28-ia-simplification.md
import {
  startPlacement, nextOpponent, answer, isPlaced, place, placementIndex,
  remaining, toPositions, rankedOrder, rankOf,
} from '../ranking.js';

let fail = 0;
const ok = (n, c, x = '') => { console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : `  ${x}`}`); if (!c) fail++; };
const quiet = (c) => { if (!c) fail++; return c; };

console.log('BASIC PLACEMENT');
{
  // An empty library: nothing to compare against, so it's placed immediately.
  const s = startPlacement([], 'a');
  ok('first ever show needs no questions', isPlaced(s) && nextOpponent(s) === null);
  ok('...and lands at #1', place(s).join() === 'a');
}
{
  const s = startPlacement(['x'], 'new');
  ok('one existing show → exactly one question', !isPlaced(s) && nextOpponent(s) === 'x');
  ok('candidate wins → goes above', place(answer(s, true)).join() === 'new,x');
  ok('candidate loses → goes below', place(answer(s, false)).join() === 'x,new');
}

console.log('\nEXHAUSTIVE — every position, every list size 0..30');
{
  let worstQuestions = 0;
  let bad = 0;
  for (let n = 0; n <= 30; n++) {
    // Existing list is 'best' → 'worst': index 0 is the best night.
    const list = Array.from({ length: n }, (_, i) => `s${i}`);
    // The truth we're searching for: the candidate belongs at index `target`.
    for (let target = 0; target <= n; target++) {
      let s = startPlacement(list, 'NEW');
      let guard = 0;
      while (!isPlaced(s)) {
        const opp = nextOpponent(s);
        const oppIndex = list.indexOf(opp);
        // Oracle: the candidate beats every show at or after `target`.
        s = answer(s, oppIndex >= target);
        if (++guard > 50) break;
      }
      worstQuestions = Math.max(worstQuestions, s.asked);
      const expected = [...list];
      expected.splice(target, 0, 'NEW');
      if (place(s).join() !== expected.join()) { bad++; if (bad < 4) console.log(`      n=${n} target=${target} got ${place(s).join()}`); }
      if (placementIndex(s) !== target) bad++;
    }
  }
  ok('every insertion lands exactly right (496 cases)', bad === 0, `${bad} wrong`);
  ok(`worst case ≤ 5 questions for ≤30 shows (was ${worstQuestions})`, worstQuestions <= 5);
}

console.log('\nQUESTION COUNT SCALES LOGARITHMICALLY');
for (const [n, cap] of [[7, 3], [31, 5], [100, 7], [1000, 10]]) {
  const list = Array.from({ length: n }, (_, i) => `s${i}`);
  let s = startPlacement(list, 'NEW');
  let guard = 0;
  while (!isPlaced(s) && guard++ < 60) s = answer(s, list.indexOf(nextOpponent(s)) >= n); // always loses → worst case
  ok(`${n} shows → ${s.asked} questions (≤ ${cap})`, s.asked <= cap);
}

console.log('\nEARLY EXIT ("good enough")');
{
  const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  let s = startPlacement(list, 'NEW');
  s = answer(s, true); // better than the midpoint
  ok('mid-placement index is a usable guess', placementIndex(s) >= 0 && placementIndex(s) <= list.length);
  ok('placing early still yields a complete list', place(s).length === list.length + 1);
  ok('...containing the candidate exactly once', place(s).filter((x) => x === 'NEW').length === 1);
  ok('remaining() counts down', remaining(startPlacement(list, 'N')) > remaining(s));
  ok('remaining() is 0 once placed', remaining({ lo: 3, hi: 3 }) === 0);
}

console.log('\nPOSITIONS + ORDER');
{
  ok('toPositions is 1-based and dense',
    JSON.stringify(toPositions(['x', 'y', 'z'])) === '{"x":1,"y":2,"z":3}');

  const shows = [
    { id: 'a', score: 7 }, { id: 'b', score: 10 }, { id: 'c', score: 9 }, { id: 'd', score: 0 },
  ];
  // b and a explicitly ranked; c and d never placed.
  const pos = { b: 1, a: 2 };
  const order = rankedOrder(shows, pos).map((s) => s.id);
  ok('placed shows lead, in stored order', order.slice(0, 2).join() === 'b,a', order.join());
  ok('unplaced fall to the back, best score first', order.slice(2).join() === 'c,d', order.join());
  ok('rankOf finds a placed show', rankOf(shows, pos, 'a') === 2);
  ok('rankOf finds an unplaced show', rankOf(shows, pos, 'c') === 3);
  ok('rankOf returns 0 for a stranger', rankOf(shows, pos, 'zz') === 0);
  ok('no positions at all → pure score order',
    rankedOrder(shows, {}).map((s) => s.id).join() === 'b,c,a,d');
}

console.log('\nEDGE CASES');
{
  ok('candidate already in the list is not duplicated',
    place(startPlacement(['a', 'b'], 'a')).filter((x) => x === 'a').length === 1);
  ok('answering after placement is a no-op', (() => {
    const s = startPlacement([], 'x');
    return answer(s, true) === s;
  })());
  ok('null/undefined inputs do not throw', (() => {
    try { rankedOrder(null, null); toPositions(null); startPlacement(null, 'x'); return true; }
    catch { return false; }
  })());
  ok('placement never mutates the input list', (() => {
    const list = ['a', 'b', 'c'];
    const s = startPlacement(list, 'N');
    place(answer(s, true));
    return list.join() === 'a,b,c';
  })());
}

console.log(`\n${fail ? '❌' : '✅'} ${fail} failed\n`);
process.exit(fail ? 1 : 0);
