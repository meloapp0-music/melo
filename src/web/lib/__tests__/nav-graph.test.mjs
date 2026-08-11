// Static audit of Melo's navigation graph.
// =========================================
// Catches the class of bug that made the friend_request push land on Home: a
// navigate() target that resolves to nothing, or a drill-in page with no parent
// tab (which leaves the whole nav bar dark). Both are silent failures — the app
// builds, renders, and quietly goes to the wrong place.
//
// No test runner in this repo yet, so it's a plain script:
//   node src/web/lib/__tests__/nav-graph.test.mjs
//
// docs/initiatives/2026-07-28-ia-simplification.md
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const R = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Strip line comments, so prose ABOUT the old routing can't be mistaken for it.
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const read = (p) => strip(readFileSync(join(R, p), 'utf8'));

const app = read('App.jsx');
const nav = read('components/NavBar.jsx');

const TABS = JSON.parse(app.match(/const TABS = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
const ALIAS = Object.fromEntries(
  [...app.match(/PAGE_ALIAS = \{([^}]+)\}/)[1].matchAll(/(\w+):\s*'(\w+)'/g)].map((m) => [m[1], m[2]])
);
const routed = new Set([...app.matchAll(/subPage === '([a-z-]+)'/g)].map((m) => m[1]));
const switchTabs = new Set([...app.matchAll(/case '([a-z]+)': return/g)].map((m) => m[1]));
const navTabIds = [...nav.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]).filter((x) => x !== 'plus');
const parent = Object.fromEntries(
  [...nav.match(/SUBPAGE_PARENT = \{([\s\S]*?)\}/)[1].matchAll(/'?([a-z-]+)'?:\s*'([a-z]+)'/g)].map((m) => [m[1], m[2]])
);

const targets = new Set();
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).forEach((e) => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return walk(p);
  if (!e.name.endsWith('.jsx')) return;
  [...strip(readFileSync(p, 'utf8')).matchAll(/navigate\('([a-z-]+)'/g)].forEach((m) => targets.add(m[1]));
});
walk(join(R, 'pages'));
walk(join(R, 'components'));

let fail = 0;
const ok = (n, c, x = '') => { console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : `  ${x}`}`); if (!c) fail++; };

console.log('TABS');
// Five slots since the Sleek port: four tabs + the FAB. Leaderboard was
// promoted out of You (leaderboard.html lights ph:chart-bar-fill), so this is
// the new shape, not a regression.
ok('five slots: four tabs + the FAB', TABS.length === 4 && navTabIds.length === 4, JSON.stringify(navTabIds));
ok('NavBar ids match App TABS', navTabIds.every((t) => TABS.includes(t)), JSON.stringify({ navTabIds, TABS }));
ok('every tab renders something', TABS.every((t) => switchTabs.has(t) || t === 'home'), JSON.stringify([...switchTabs]));

console.log('\nEVERY navigate() TARGET RESOLVES');
for (const t of [...targets].sort()) {
  const r = ALIAS[t] || t;
  ok(`navigate('${t}')${ALIAS[t] ? ` → ${r}` : ''}`, r === 'log' || TABS.includes(r) || routed.has(r), '— resolves to NOTHING');
}

// You's stat tiles pass their destination as a prop (`to="artists"`), not as a
// navigate('…') literal, so the sweep above can't see them. They're the primary
// way into half these pages — check them explicitly.
console.log('\nYOU’S STAT TILES RESOLVE');
const you = read('pages/You.jsx');
const tileTargets = [...you.matchAll(/<Tile[^>]*\sto="([a-z-]+)"/g)].map((m) => m[1]);
ok('six tiles found', tileTargets.length === 6, JSON.stringify(tileTargets));
for (const t of tileTargets) {
  const r = ALIAS[t] || t;
  ok(`tile → ${t}`, TABS.includes(r) || routed.has(r), '— resolves to NOTHING');
}

console.log('\nNAV BAR STAYS LIT IN EVERY DRILL-IN');
for (const sp of [...routed].sort()) {
  if (sp === 'import-calendar') continue; // parked, unreachable by design
  ok(`'${sp}' → ${parent[sp] || '???'}`, !!parent[sp] && TABS.includes(parent[sp]), '— bar would go dark');
}

console.log('\nLEGACY NAMES STILL RESOLVE');
ok('alias stats → you', ALIAS.stats === 'you');
ok('alias profile → you', ALIAS.profile === 'you');
ok('map / songs / buddies are subPages now, not tabs',
  ['map', 'songs', 'buddies'].every((x) => routed.has(x) && !TABS.includes(x)));

console.log('\nPUSH DEEP LINKS');
ok("no live setTab('buddies') remains", !/setTab\('buddies'\)/.test(app));
ok('friend_request sets you + the buddies subPage',
  /friend_request[\s\S]{0,400}setTab\('you'\)[\s\S]{0,160}setSubPage\('buddies'\)/.test(app));
ok('recap_ready opens show AND recap atomically',
  /recap_ready[\s\S]{0,700}type: 'set'[\s\S]{0,240}'show'[\s\S]{0,100}'recap'/.test(app));

console.log(`\n${fail ? '❌' : '✅'} ${fail} failed\n`);
process.exit(fail ? 1 : 0);
