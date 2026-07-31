// Camera-roll backfill: clustering photos into candidate shows.
// =============================================================
// The night-rollover rule is the load-bearing bit. A photo at 00:47 belongs to
// the PREVIOUS evening's show, and getting that wrong files half a user's
// backfilled library on the wrong date — silently, since nothing errors.
//
//   node src/web/lib/__tests__/photo-clusters.test.mjs
//
// docs/initiatives/2026-07-30-camera-roll-backfill.md
import {
  showDateOf, concertScore, clusterPhotos, withoutLogged, likelyShows,
} from '../photoClusters.js';
import { parseExif } from '../exif.js';

let fail = 0;
const ok = (n, c, x = '') => { console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : `  ${x}`}`); if (!c) fail++; };

/** A photo taken at a local wall-clock time. */
const at = (y, mo, d, h, mi = 0, extra = {}) => ({
  file: { name: `${h}-${mi}.jpg` },
  takenAt: new Date(y, mo - 1, d, h, mi),
  lat: null, lon: null, exact: true, ...extra,
});

console.log('NIGHT ROLLOVER — which night does a photo belong to?');
{
  ok('an 9pm photo is that evening', showDateOf(new Date(2025, 8, 14, 21, 0)) === '2025-09-14');
  ok('a 00:47 photo is the PREVIOUS evening', showDateOf(new Date(2025, 8, 15, 0, 47)) === '2025-09-14');
  ok('a 4:59am photo is still the previous evening', showDateOf(new Date(2025, 8, 15, 4, 59)) === '2025-09-14');
  ok('a 5:00am photo is its own day', showDateOf(new Date(2025, 8, 15, 5, 0)) === '2025-09-15');
  ok('rollover crosses a month boundary', showDateOf(new Date(2025, 9, 1, 1, 0)) === '2025-09-30');
  ok('rollover crosses a year boundary', showDateOf(new Date(2026, 0, 1, 2, 0)) === '2025-12-31');
}

console.log('\nCLUSTERING');
{
  // One gig: 8:30pm through 00:30am, spanning midnight.
  const gig = [
    at(2025, 9, 14, 20, 30), at(2025, 9, 14, 21, 15), at(2025, 9, 14, 22, 40),
    at(2025, 9, 15, 0, 20),
  ];
  const c = clusterPhotos(gig);
  ok('a night spanning midnight is ONE cluster', c.length === 1, `got ${c.length}`);
  ok('...dated to the evening it started', c[0].date === '2025-09-14');
  ok('...holding every photo', c[0].photos.length === 4);

  // Two separate nights.
  const two = clusterPhotos([...gig, at(2025, 9, 20, 21, 0), at(2025, 9, 20, 22, 0)]);
  ok('separate nights split', two.length === 2);
  ok('newest night first', two[0].date === '2025-09-20');

  // Back-to-back nights that are close in wall-clock time still split: a 1am
  // finish and an 8pm start the next day are 19h apart, but a 1am finish and a
  // 4am... this is the case the date check (not just the gap) catches.
  const backToBack = clusterPhotos([
    at(2025, 9, 14, 23, 30), at(2025, 9, 15, 1, 0),   // night of the 14th
    at(2025, 9, 15, 20, 0), at(2025, 9, 15, 23, 0),   // night of the 15th
  ]);
  ok('consecutive nights are two clusters', backToBack.length === 2, `got ${backToBack.length}`);
  ok('...correctly dated', backToBack.map((x) => x.date).sort().join() === '2025-09-14,2025-09-15');

  ok('a long daytime gap splits', clusterPhotos([at(2025, 9, 14, 9, 0), at(2025, 9, 14, 20, 0)]).length === 2);
  ok('photos without a date are dropped',
    clusterPhotos([{ takenAt: null }, at(2025, 9, 14, 21, 0)]).length === 1);
  ok('empty input is safe', clusterPhotos([]).length === 0 && clusterPhotos(null).length === 0);
}

console.log('\nIS IT A CONCERT?');
{
  const score = (photos) => {
    const c = clusterPhotos(photos)[0];
    return c ? c.confidence : 0;
  };
  const gig = score([
    at(2025, 9, 14, 20, 30), at(2025, 9, 14, 21, 0), at(2025, 9, 14, 21, 40),
    at(2025, 9, 14, 22, 20), at(2025, 9, 14, 23, 10), at(2025, 9, 15, 0, 5),
  ]);
  const brunch = score([at(2025, 9, 14, 11, 0), at(2025, 9, 14, 11, 30), at(2025, 9, 14, 12, 15)]);
  const oneSnap = score([at(2025, 9, 14, 21, 0)]);

  ok(`an evening burst scores high (${gig})`, gig >= 0.8, String(gig));
  ok(`a midday cluster scores low (${brunch})`, brunch < 0.45, String(brunch));
  ok(`a single night photo is not enough (${oneSnap})`, oneSnap < 0.7, String(oneSnap));
  ok('gig outranks brunch by a wide margin', gig - brunch > 0.4);
  ok('likelyShows keeps the gig and drops the brunch', (() => {
    const all = clusterPhotos([
      at(2025, 9, 14, 20, 30), at(2025, 9, 14, 21, 30), at(2025, 9, 14, 22, 30), at(2025, 9, 14, 23, 30),
      at(2025, 9, 20, 11, 0), at(2025, 9, 20, 11, 20),
    ]);
    const keep = likelyShows(all).map((c) => c.date);
    return keep.length === 1 && keep[0] === '2025-09-14';
  })());
}

console.log('\nDON’T RE-PROPOSE WHAT’S ALREADY LOGGED');
{
  const clusters = clusterPhotos([
    at(2025, 9, 14, 21, 0), at(2025, 9, 14, 22, 0),
    at(2025, 9, 20, 21, 0), at(2025, 9, 20, 22, 0),
  ]);
  const left = withoutLogged(clusters, [{ date: '2025-09-14' }]);
  ok('a night already in the library is dropped', left.length === 1 && left[0].date === '2025-09-20');
  ok('no library → nothing dropped', withoutLogged(clusters, []).length === 2);
  ok('null library is safe', withoutLogged(clusters, null).length === 2);
}

console.log('\nSOFT DATES + GPS');
{
  const mixed = clusterPhotos([
    at(2025, 9, 14, 21, 0),
    at(2025, 9, 14, 22, 0, { exact: false }),
  ])[0];
  ok('one fallback timestamp makes the whole cluster soft', mixed.exact === false);

  const located = clusterPhotos([
    at(2025, 9, 14, 21, 0, { lat: 41.9, lon: -87.6 }),
    at(2025, 9, 14, 22, 0, { lat: 41.7, lon: -87.8 }),
  ])[0];
  ok('GPS averages when present', Math.abs(located.lat - 41.8) < 0.001 && Math.abs(located.lon - -87.7) < 0.001);
  ok('GPS is null when the OS stripped it', clusterPhotos([at(2025, 9, 14, 21, 0)])[0].lat === null);
}

console.log('\nEXIF PARSER — reads a REAL segment (not just "doesn’t crash")');
{
  // Hand-build a minimal JPEG carrying an EXIF APP1 with DateTimeOriginal and
  // GPS. Asserting only that garbage doesn't throw would pass on a parser that
  // never parses anything — this is the test that proves it works.
  const tiff = new Uint8Array(178);
  const dv = new DataView(tiff.buffer);
  const LE = true;
  dv.setUint16(0, 0x4949, false);   // "II" little-endian
  dv.setUint16(2, 42, LE);
  dv.setUint32(4, 8, LE);           // IFD0 at 8

  dv.setUint16(8, 2, LE);           // IFD0: 2 entries
  // ExifIFD pointer
  dv.setUint16(10, 0x8769, LE); dv.setUint16(12, 4, LE); dv.setUint32(14, 1, LE); dv.setUint32(18, 38, LE);
  // GPS IFD pointer
  dv.setUint16(22, 0x8825, LE); dv.setUint16(24, 4, LE); dv.setUint32(26, 1, LE); dv.setUint32(30, 56, LE);
  dv.setUint32(34, 0, LE);          // no next IFD

  dv.setUint16(38, 1, LE);          // ExifIFD: 1 entry
  // DateTimeOriginal, ASCII[20], stored at 110
  dv.setUint16(40, 0x9003, LE); dv.setUint16(42, 2, LE); dv.setUint32(44, 20, LE); dv.setUint32(48, 110, LE);
  dv.setUint32(52, 0, LE);

  dv.setUint16(56, 4, LE);          // GPS IFD: 4 entries
  // LatRef "N" (inline)
  dv.setUint16(58, 0x0001, LE); dv.setUint16(60, 2, LE); dv.setUint32(62, 2, LE);
  tiff[66] = 'N'.charCodeAt(0); tiff[67] = 0;
  // Lat = 41° 52' 30"  → 41.875
  dv.setUint16(70, 0x0002, LE); dv.setUint16(72, 5, LE); dv.setUint32(74, 3, LE); dv.setUint32(78, 130, LE);
  // LonRef "W" (inline)
  dv.setUint16(82, 0x0003, LE); dv.setUint16(84, 2, LE); dv.setUint32(86, 2, LE);
  tiff[90] = 'W'.charCodeAt(0); tiff[91] = 0;
  // Lon = 87° 37' 48"  → 87.63, negated by the W ref
  dv.setUint16(94, 0x0004, LE); dv.setUint16(96, 5, LE); dv.setUint32(98, 3, LE); dv.setUint32(102, 154, LE);
  dv.setUint32(106, 0, LE);

  const stamp = '2025:09:14 21:04:33\0';
  for (let i = 0; i < stamp.length; i++) tiff[110 + i] = stamp.charCodeAt(i);
  const rational = (off, pairs) => pairs.forEach(([n, d], i) => {
    dv.setUint32(off + i * 8, n, LE); dv.setUint32(off + i * 8 + 4, d, LE);
  });
  rational(130, [[41, 1], [52, 1], [30, 1]]);
  rational(154, [[87, 1], [37, 1], [48, 1]]);

  // Wrap in JPEG: SOI + APP1(size, "Exif\0\0", tiff)
  const app1Size = 2 + 6 + tiff.length;
  const jpeg = new Uint8Array(2 + 2 + app1Size);
  const jv = new DataView(jpeg.buffer);
  jv.setUint16(0, 0xffd8, false);
  jv.setUint16(2, 0xffe1, false);
  jv.setUint16(4, app1Size, false);
  jpeg.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6); // "Exif\0\0"
  jpeg.set(tiff, 12);

  const got = parseExif(jpeg.buffer);
  ok('reads DateTimeOriginal', got.takenAt instanceof Date, String(got.takenAt));
  ok('...to the right local instant',
    got.takenAt && got.takenAt.getFullYear() === 2025 && got.takenAt.getMonth() === 8
    && got.takenAt.getDate() === 14 && got.takenAt.getHours() === 21 && got.takenAt.getMinutes() === 4,
    String(got.takenAt));
  ok('reads GPS latitude', Math.abs(got.lat - 41.875) < 1e-6, String(got.lat));
  ok('...and negates longitude for a W reference', Math.abs(got.lon - -87.63) < 1e-6, String(got.lon));
  ok('that photo dates to the night of the 14th', showDateOf(got.takenAt) === '2025-09-14');
}

console.log('\nEXIF PARSER — never throws, whatever it is handed');
{
  ok('empty buffer', parseExif(new ArrayBuffer(0)).takenAt === null);
  ok('not a JPEG', parseExif(new Uint8Array([1, 2, 3, 4, 5, 6]).buffer).takenAt === null);
  ok('JPEG header but no EXIF', parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 4, 0, 0]).buffer).takenAt === null);
  ok('truncated mid-segment', parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]).buffer).takenAt === null);
  ok('garbage does not throw', (() => {
    try {
      const b = new Uint8Array(512).map(() => Math.floor(Math.random() * 256));
      b[0] = 0xff; b[1] = 0xd8;
      parseExif(b.buffer);
      return true;
    } catch { return false; }
  })());
}

console.log(`\n${fail ? '❌' : '✅'} ${fail} failed\n`);
process.exit(fail ? 1 : 0);
