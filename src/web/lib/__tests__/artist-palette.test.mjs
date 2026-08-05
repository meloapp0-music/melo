// The artist palette.
// ===================
// Every un-photographed show, avatar and detail hero paints getArtistGradient,
// and every one of those surfaces puts cream text or a dark scrim on top. So
// the invariant that actually matters is not "is it pretty" but "can you still
// read the text" — a swatch that drifts light breaks seven files at once and
// the build stays green, because Vite doesn't type-check and CSS never throws.
//
// The other invariant is stability: an artist's colour must be the same today,
// tomorrow, and on someone else's phone.
//
//   node src/web/lib/__tests__/artist-palette.test.mjs
//
// docs/initiatives/2026-08-03-artist-palette.md
import { getArtistGradient, artistBackground } from '../../store.js';

let fail = 0;
const ok = (n, c, x = '') => { console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : `  ${x}`}`); if (!c) fail++; };

// hsl(216 44% 28%) → [216, 44, 28]
const stops = (css) => [...css.matchAll(/hsl\((\d+) (\d+)% (\d+)%\)/g)]
  .map((m) => ({ h: +m[1], s: +m[2], l: +m[3] }));

const NAMES = [
  'Radiohead', 'The 1975', 'Fleet Foxes', 'Rosalía', 'Phoebe Bridgers',
  'Bon Iver', 'Coachella', 'Primavera Sound', 'Fred Again..', 'FKA Twigs',
  'Four Tet', 'Beyoncé', 'Caroline Polachek', 'black midi', 'JPEGMAFIA',
  'Sufjan Stevens', 'Big Thief', 'Turnstile', 'MJ Lenderman', 'Wednesday',
];

console.log('LEGIBILITY — the one thing that can regress');
{
  // Cream text sits on these. The old generator floored at 20% and capped at
  // 42%; the curated palette has to honour the same band or the scrim stops
  // being enough.
  let worst = null;
  for (const n of NAMES) {
    for (const s of stops(getArtistGradient(n))) {
      if (!worst || s.l > worst.l) worst = { ...s, n };
    }
  }
  ok('no stop is lighter than 42%', worst.l <= 42, `${worst.n} → l=${worst.l}%`);

  let lightest = null;
  for (const n of NAMES) {
    for (const s of stops(getArtistGradient(n))) {
      if (!lightest || s.l < lightest.l) lightest = { ...s, n };
    }
  }
  ok('no stop is darker than 20%', lightest.l >= 20, `${lightest.n} → l=${lightest.l}%`);
}

console.log('\nCONTRAST — cream text on the bare swatch, no scrim');
{
  // The lightness band above is a proxy; this is the actual thing that
  // matters. Some surfaces (rank thumbs, avatars, the stats row) paint the
  // gradient with no scrim at all, so every stop has to clear AA on its own.
  const hslToRgb = (h, s, l) => {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
  };
  const lum = (rgb) => {
    const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (rgb) => (1 + 0.05) / (lum(rgb) + 0.05);

  let worst = { ratio: Infinity };
  for (const n of NAMES) {
    for (const s of stops(getArtistGradient(n))) {
      const r = contrast(hslToRgb(s.h, s.s, s.l));
      if (r < worst.ratio) worst = { ratio: r, n, css: `hsl(${s.h} ${s.s}% ${s.l}%)` };
    }
  }
  ok('every swatch clears WCAG AA (4.5:1) for white text',
    worst.ratio >= 4.5, `worst: ${worst.css} (${worst.n}) → ${worst.ratio.toFixed(2)}:1`);
}

console.log('\nSTABILITY — a colour must not drift between sessions');
ok('same name, same gradient', getArtistGradient('Radiohead') === getArtistGradient('Radiohead'));
ok('...across many names', NAMES.every((n) => getArtistGradient(n) === getArtistGradient(n)));
ok('different names differ somewhere',
  new Set(NAMES.map(getArtistGradient)).size > 1);

console.log('\nVARIETY — the reason this change exists');
{
  // The old generator was locked to hues 8–44°, so a full drawer was eight
  // shades of the same orange. This is the assertion that would have failed
  // before the rewrite.
  const hues = new Set(NAMES.map((n) => stops(getArtistGradient(n))[0].h));
  ok('20 artists span more than the old 8–44° band',
    [...hues].some((h) => h > 44), `hues: ${[...hues].sort((a, b) => a - b).join(', ')}`);
  ok('at least 5 distinct base colours appear', hues.size >= 5, `got ${hues.size}`);
  ok('cool colours are reachable', [...hues].some((h) => h >= 150 && h <= 240));
  ok('warm colours are still reachable', [...hues].some((h) => h <= 44));
}

console.log('\nEDGE CASES');
ok('empty name returns a gradient', /^linear-gradient/.test(getArtistGradient('')));
ok('no argument returns a gradient', /^linear-gradient/.test(getArtistGradient()));
ok('empty name is still in the legible band',
  stops(getArtistGradient('')).every((s) => s.l >= 20 && s.l <= 42));
ok('a very long name is fine', /^linear-gradient/.test(getArtistGradient('x'.repeat(500))));
ok('unicode names are fine', /^linear-gradient/.test(getArtistGradient('Sigur Rós — Ágætis byrjun')));

console.log('\nartistBackground — photo over gradient');
{
  const withImg = artistBackground('Radiohead', 'https://x/y.jpg');
  ok('photo comes first in the layer stack', withImg.background.startsWith('url("https://x/y.jpg")'));
  ok('gradient is the base layer under it', withImg.background.includes('linear-gradient'));
  const noImg = artistBackground('Radiohead', '');
  ok('no photo → gradient alone', noImg.background === getArtistGradient('Radiohead'));
  ok('missing img argument → gradient alone', artistBackground('Radiohead').background === getArtistGradient('Radiohead'));
}

console.log(`\n${fail ? '❌' : '✅'} ${fail} failed\n`);
process.exit(fail ? 1 : 0);
