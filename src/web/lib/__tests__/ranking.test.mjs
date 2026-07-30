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
  remaining, toPositions, rankedOrder, rankOf, meloScore, meloScores, scoreText, displayScore,
  BUCKETS, BUCKET_IDS, bucketOf, bucketScore,
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

console.log('\nMELO SCORE (derived from rank, not typed in)');
{
  ok('#1 of many is the top of the scale', meloScore(1, 40) === 9.9);
  ok('a lone show sits high but not at the top', meloScore(1, 1) === 9.5);
  ok('score falls monotonically down the list', (() => {
    for (const n of [2, 3, 7, 20, 60, 200]) {
      let prev = Infinity;
      for (let r = 1; r <= n; r++) {
        const v = meloScore(r, n);
        if (v > prev) return false;
        prev = v;
      }
    }
    return true;
  })());
  ok('never exceeds 9.9 or drops below 6.5', (() => {
    for (const n of [1, 2, 5, 40, 500]) {
      for (let r = 1; r <= n; r++) {
        const v = meloScore(r, n);
        if (v > 9.9 || v < 6.5) return false;
      }
    }
    return true;
  })());
  // The point of the growing spread: three shows in, you know your third-best
  // is third — you do NOT know it was a bad night.
  ok('a small library stays tight (3 shows → worst is 9.2, not 6.5)', meloScore(3, 3) === 9.2);
  ok('a big library uses the full range', meloScore(50, 50) === 6.5);
  ok('always one decimal place', scoreText(9) === '9.0' && scoreText(8.44) === '8.4');
  ok('null in, null out', meloScore(0, 10) === null && meloScore(3, 0) === null && scoreText(null) === '—');

  const shows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const map = meloScores(shows, { a: 2, b: 1, c: 3 });
  ok('meloScores follows the stored order, not array order',
    map.b === 9.9 && map.a === 9.6 && map.c === 9.2, JSON.stringify(map));
}

console.log('\nBUCKETS — the coarse call, and the partition it enforces');
{
  ok('scores classify into three buckets',
    bucketOf({ score: 10 }) === 'loved' && bucketOf({ score: 8 }) === 'loved'
    && bucketOf({ score: 7 }) === 'fine' && bucketOf({ score: 5 }) === 'fine'
    && bucketOf({ score: 4 }) === 'meh' && bucketOf({ score: 1 }) === 'meh');
  ok('unrated is null, not a bucket', bucketOf({ score: 0 }) === null && bucketOf({}) === null);
  ok('a bare number classifies too (no wrapper needed)', bucketOf(9) === 'loved');
  ok('every bucket round-trips through its stored score',
    BUCKET_IDS.every((id) => bucketOf({ score: bucketScore(id) }) === id));

  // A library already partitioned: 3 loved, 3 fine, 2 meh.
  const lib = ['L1','L2','L3','F1','F2','F3','M1','M2'];
  const bOf = (id) => (id[0] === 'L' ? 'loved' : id[0] === 'F' ? 'fine' : 'meh');

  // A new "fine" show can only land inside the fine block: indices 3..6.
  const s = startPlacement(lib, 'NEW', { bucket: 'fine', bucketOf: bOf });
  ok('search window is confined to the bucket', s.lo === 3 && s.hi === 6, `lo=${s.lo} hi=${s.hi}`);
  ok('it never offers a cross-bucket comparison', bOf(nextOpponent(s)) === 'fine');

  // Every landing spot inside the block, and nothing outside it.
  let violations = 0;
  for (const [bucket, expectRange] of [['loved', [0, 3]], ['fine', [3, 6]], ['meh', [6, 8]]]) {
    for (let target = expectRange[0]; target <= expectRange[1]; target++) {
      let st = startPlacement(lib, 'NEW', { bucket, bucketOf: bOf });
      let guard = 0;
      while (!isPlaced(st) && guard++ < 20) {
        st = answer(st, lib.indexOf(nextOpponent(st)) >= target);
      }
      const idx = placementIndex(st);
      if (idx < expectRange[0] || idx > expectRange[1]) violations++;
      // And the resulting list must still be bucket-ordered.
      const out = place(st).map((id) => (id === 'NEW' ? bucket : bOf(id)));
      const ranks = out.map((b) => BUCKET_IDS.indexOf(b));
      if (ranks.some((v, i) => i && v < ranks[i - 1])) violations++;
    }
  }
  ok('placement stays in-bucket AND keeps the list partitioned', violations === 0, `${violations} violations`);

  // A brand-new bucket with no members yet still gets a valid slot.
  const empty = startPlacement(['L1','L2'], 'NEW', { bucket: 'meh', bucketOf: bOf });
  ok('a bucket with no members needs no questions', isPlaced(empty));
  ok('...and lands after every better bucket', place(empty).join() === 'L1,L2,NEW');
  const top = startPlacement(['F1','M1'], 'NEW', { bucket: 'loved', bucketOf: bOf });
  ok('a first "loved" show goes straight to #1', isPlaced(top) && place(top)[0] === 'NEW');

  // The payoff: fewer questions.
  const big = Array.from({ length: 60 }, (_, i) => (i < 20 ? `L${i}` : i < 40 ? `F${i}` : `M${i}`));
  const bOf2 = (id) => (id[0] === 'L' ? 'loved' : id[0] === 'F' ? 'fine' : 'meh');
  const count = (opts) => {
    let st = startPlacement(big, 'NEW', opts);
    let g = 0;
    while (!isPlaced(st) && g++ < 40) st = answer(st, false);
    return st.asked;
  };
  const withB = count({ bucket: 'fine', bucketOf: bOf2 });
  const without = count({});
  ok(`60 shows: ${withB} questions bucketed vs ${without} unbucketed`, withB < without);

  ok('no bucket opts → searches the whole list (back-compat)',
    startPlacement(lib, 'NEW').hi === lib.length);
}

console.log('\nDISPLAY RESOLUTION (what number a surface actually shows)');
{
  const shows = [{ id: 'a', score: 9 }, { id: 'b', score: 7 }, { id: 'c', score: 8 }];
  const map = meloScores(shows, { a: 1, b: 2 });
  ok('a ranked show shows the DERIVED score', displayScore(shows[0], map) === 9.9);
  ok('an unranked show falls back to what was typed', displayScore(shows[2], map) === 8);
  ok('unranked with no score shows nothing', displayScore({ id: 'z' }, map) === null);
  ok('a zero score is treated as unrated, not as 0.0', displayScore({ id: 'z', score: 0 }, map) === null);
  // A friend's show: their positions are RLS-private, so the map is empty and
  // the number must be the one THEY typed.
  ok('with no map at all, everything falls back', displayScore({ id: 'q', score: 8.5 }, {}) === 8.5);
  ok('null show does not throw', displayScore(null, map) === null);

  ok('only PLACED shows count toward the denominator',
    Object.keys(map).length === 2 && map.b === 9.6, JSON.stringify(map));
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
