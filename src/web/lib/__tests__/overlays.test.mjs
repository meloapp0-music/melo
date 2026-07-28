// Overlay stack regression tests. No test runner in this repo yet, so this is
// a plain script: `node src/web/lib/__tests__/overlays.test.mjs` (exit 1 = fail).
// Every case here is an invariant App.jsx depends on — see the comments.
import { overlayReducer as r, findOverlay } from '../overlays.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra='') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

const push = (s, t, p={}) => r(s, { type:'push', overlay:t, props:p });

console.log('\nSTACK BASICS');
let s = push(push([], 'venue', {venue:'Rose Bowl'}), 'show', {show:{id:'a'}});
ok('two pushes stack in order', s.map(o=>o.type).join(',') === 'venue,show');
ok('ids are unique', s[0].id !== s[1].id);

console.log('\nTHE REMOUNT INVARIANT (why ids, not indexes)');
const before = s[1].id;
const afterLowerClosed = r(s, { type:'closeId', id: s[0].id });
ok('closing a LOWER overlay keeps the upper one’s id stable',
   afterLowerClosed[0].id === before, `(${afterLowerClosed[0].id} vs ${before})`);
ok('...and it is the only one left', afterLowerClosed.length === 1);

console.log('\nATOMIC SET — the recap_ready case');
const deep = push(push(push([], 'venue'), 'artist'), 'show');
const recap = r(deep, { type:'set', list:[{type:'show',props:{show:{id:'z'}}},{type:'recap',props:{show:{id:'z'}}}] });
ok('set replaces the whole stack', recap.length === 2);
ok('show is under, recap on top', recap.map(o=>o.type).join(',') === 'show,recap');
ok('both carry the same show', recap[0].props.show.id === recap[1].props.show.id);
ok('set stamps fresh ids', recap[0].id !== recap[1].id);

console.log('\nCLOSE SEMANTICS');
const two = push(push([], 'show', {show:{id:'1'}}), 'recap', {show:{id:'1'}});
ok('closeType removes only that type', r(two,{type:'closeType',overlay:'recap'}).map(o=>o.type).join()==='show');
ok('closeType on an absent type is a no-op', r(two,{type:'closeType',overlay:'wrapped'}).length === 2);
ok('pop removes the top', r(two,{type:'pop'}).map(o=>o.type).join()==='show');
ok('pop on empty does not throw/underflow', r([],{type:'pop'}).length === 0);

console.log('\nCLEAR — the push-notification path');
ok('clear empties a deep stack', r(deep,{type:'clear'}).length === 0);
const empty = [];
ok('clear on empty returns the SAME array (no re-render)', r(empty,{type:'clear'}) === empty);

console.log('\nREADS');
ok('findOverlay finds by type', findOverlay(two,'recap').props.show.id === '1');
ok('findOverlay returns null when absent', findOverlay(two,'wrapped') === null);

console.log('\nIMMUTABILITY');
const orig = push([], 'show');
const snapshot = orig.length;
r(orig, {type:'push', overlay:'venue'}); r(orig,{type:'clear'}); r(orig,{type:'pop'});
ok('reducer never mutates its input', orig.length === snapshot);
ok('unknown action returns state unchanged', r(orig,{type:'nope'}) === orig);

console.log(`\n${fail ? '❌' : '✅'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
