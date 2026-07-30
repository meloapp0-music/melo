// QuickLog ↔ LogShow payload parity.
// ==================================
// Two sheets now write show rows. If they drift, a quick-logged show reads
// differently everywhere downstream — the recap cuts, the receipt, the feed —
// and the failure is silent because a missing key just reads as an empty
// field. QuickLog's original version wrote the string literal 'attended'
// instead of SHOW_STATUS.ATTENDED and omitted festival/openers/venueUrl/videos.
//
//   node src/web/lib/__tests__/log-parity.test.mjs
//
// docs/initiatives/2026-07-28-ia-simplification.md
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const R = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(R, p), 'utf8');

/** Keys of the first object literal after `marker`. */
function keysAfter(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`marker not found: ${marker}`);
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) { end = i; break; } }
  }
  const body = src.slice(open + 1, end);
  // Top-level keys only, and both forms: `key: value` AND the ES6 shorthand
  // `key,` — which both files use, so a colon-only match under-reports.
  return new Set(
    [...body.matchAll(/^\s{0,6}([a-zA-Z_$][\w$]*)\s*(?::|,\s*$)/gm)].map((m) => m[1])
  );
}

const full = keysAfter(read('pages/LogShow.jsx'), 'const payload = {');
const quick = keysAfter(read('components/QuickLog.jsx'), 'const saved = await addShow({');
quick.delete('id');           // QuickLog mints the id; LogShow's db layer does
quick.delete('createdAt');    // same

let fail = 0;
const ok = (n, c, x = '') => { console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : `  ${x}`}`); if (!c) fail++; };

console.log('PAYLOAD PARITY');
const missing = [...full].filter((k) => !quick.has(k));
ok(`QuickLog writes every field LogShow writes (${full.size})`, missing.length === 0, `missing: ${missing.join(', ')}`);
const extra = [...quick].filter((k) => !full.has(k));
ok('QuickLog writes no field LogShow doesn’t', extra.length === 0, `extra: ${extra.join(', ')}`);

console.log('\nNO STRING-LITERAL STATUS');
const qsrc = read('components/QuickLog.jsx');
ok('uses SHOW_STATUS, not the literal', /SHOW_STATUS\.ATTENDED/.test(qsrc) && !/status:\s*'attended'/.test(qsrc));

console.log('\nFUNNEL PARITY');
const lsrc = read('pages/LogShow.jsx');
for (const ev of ['show_log_started', 'show_log_abandoned', 'show_logged']) {
  ok(`${ev} fires from both sheets`, qsrc.includes(ev) && lsrc.includes(ev));
}
ok("QuickLog tags surface: 'quick'", /surface:\s*'quick'/.test(qsrc));
ok("LogShow tags surface: 'full'", /surface:\s*'full'/.test(lsrc));

console.log('\nDATE DEFAULT');
ok('yesterday is built from LOCAL parts, not toISOString',
  /getFullYear\(\)/.test(qsrc) && !/Date\.now\(\)\s*-\s*86400000\).toISOString/.test(qsrc));

console.log(`\n${fail ? '❌' : '✅'} ${fail} failed\n`);
process.exit(fail ? 1 : 0);
