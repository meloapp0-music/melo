// lib/recapCuts.js — the sixteen recap cuts.
// ==========================================
// Ground truth for this file is the design handoff's PROTOTYPE, not its prose:
// every scene below mirrors a real `[data-scene]` in `Melo Recap.dc.html` —
// same order, same `data-dur`, same copy shape. (An earlier pass paraphrased the
// README's headings and invented four cuts that weren't in the design. Don't.)
//
// A cut is just a scene-list builder over one show. The same reel engine and the
// same Canvas exporter render all of them, so adding a cut = adding an entry to
// CUTS. Every cut declares `needs` — the floor it requires — which drives the
// handoff's fallback ladder (§3c) in `pickAutoCut`.
//
// THE CENTRAL PRODUCT CONSTRAINT (handoff line 6): a recap must be worth looking
// forward to *whether or not the user shot any photos or video*. Most people put
// the phone down at a great show. So the FIRST five cuts here render from
// structured data alone — setlist, score, vibes, note, venue, who you went with,
// and where the night ranks. They work for every show ever logged, including
// ones backfilled from years ago, which is also what makes them the only cuts
// that work on day one for a brand-new user. They are the floor, not a fallback.
//
// docs/initiatives/2026-07-16-show-recap-reel.md

import { formatDate, getArtistGradient, getYear, isAttended } from '../store';
import { buildScenes as buildBeatDrop, scoreVerdict } from './recap';

const scoreLabel = (s) => (Number.isInteger(s) ? String(s) : Number(s).toFixed(1));
const ORDINAL = ['', '1ST', '2ND', '3RD'];
const ordinal = (n) => ORDINAL[n] || `${n}TH`;
const yr2 = (d) => (d ? `’${String(getYear(d)).slice(2)}` : '');

/** Everything a cut might need, derived once. `ctx.shows` is the user's whole
 *  library — the ranking, receipt and stub-drawer cuts are ABOUT the collection,
 *  so they can't be built from the single show alone. */
function bits(show, ctx = {}) {
  const songs = (show.setlist || []).filter(Boolean);
  const photos = (show.photos || []).filter(Boolean);
  const videos = (show.videos || []).filter(Boolean);
  const buddies = (show.buddies || []).filter(Boolean);
  const vibes = (show.vibes || []).filter(Boolean);
  return {
    show,
    artist: show.artist || 'The show',
    songs, photos, videos, buddies, vibes,
    notes: (show.notes || '').trim(),
    grad: getArtistGradient(show.artist || ''),
    dateLabel: show.date ? formatDate(show.date) : '',
    venue: show.venue || '',
    city: show.city || '',
    where: [show.venue, show.city].filter(Boolean).join(' · '),
    verdict: scoreVerdict(show.score),
    score: show.score,
    all: (ctx.shows || []).filter(isAttended),
  };
}

/** Media pool for a cut: clips first (they carry the energy), then photos.
 *  Cycles, so a ten-beat countdown built from three clips still fills every
 *  beat rather than falling back to a flat gradient two-thirds of the way in. */
function pool(b) {
  const items = [...b.videos.map((v) => ({ video: v })), ...b.photos.map((p) => ({ media: p }))];
  return (i) => (items.length ? items[i % items.length] : {});
}

// ===========================================================================
// 1. NO-CAMERA CUTS (5) — the floor. Zero media required.
// ===========================================================================

// --- The setlist ------------------------------------------------------------
// Radial #43271A → #0a0807. EQ title → songs roll past like film credits →
// the encore held out on its own card → the tally.
function buildSetlist(show, ctx) {
  const b = bits(show, ctx);
  const s = [];
  let n = 0;
  const push = (x) => s.push({ id: `sl${n++}`, theme: 'setlist', grad: b.grad, ...x });

  push({ kind: 'eq-title', dur: 2.1, eyebrow: b.dateLabel, big: 'The songs\nthey played' });

  // The encore is held OUT of the roll and revealed on its own card, so the
  // songs everyone waited for land instead of scrolling by at credits speed.
  const hasEncore = b.songs.length >= 5;
  const body = hasEncore ? b.songs.slice(0, -2) : b.songs;
  const encore = hasEncore ? b.songs.slice(-2) : [];

  if (body.length) {
    push({ kind: 'roll', dur: 3.6, rows: body.slice(0, 22).map((song, i) => [String(i + 1).padStart(2, '0'), song]) });
  }
  if (encore.length) push({ kind: 'encore', dur: 2.4, eyebrow: 'Encore', rows: encore });
  // Both stats stay NUMERIC — the design pairs "22 Songs" with "2:14 Runtime",
  // and a venue name set at 34px amber reads as a mistake next to a count.
  push({
    kind: 'tally', dur: 2.2,
    stats: [
      [String(b.songs.length), b.songs.length === 1 ? 'Song' : 'Songs'],
      encore.length ? [String(encore.length), 'Encore'] : b.score > 0 ? [scoreLabel(b.score), 'Your score'] : null,
    ].filter(Boolean),
    big: b.verdict ? `And you still call it\n${b.verdict.toLowerCase()}.` : 'Every one of them,\nkept.',
  });
  return s;
}

// --- The receipt ------------------------------------------------------------
// Thermal paper #F6F1E7, Oswald throughout, scanline texture, dotted leaders.
// Only lines we can genuinely fill get printed. The design's mock shows TIME ON
// FEET and MILES TRAVELLED; Melo stores neither, and a receipt with invented
// totals is worth less than a short honest one.
function buildReceipt(show, ctx) {
  const b = bits(show, ctx);
  const s = [];
  let n = 0;
  const push = (x) => s.push({ id: `rc${n++}`, theme: 'receipt', ...x });

  const year = getYear(show.date);
  const seen = b.all.filter((o) => (o.artist || '').toLowerCase() === b.artist.toLowerCase()).length;
  const ofYear = b.all
    .filter((o) => getYear(o.date) === year)
    .sort((x, y) => String(x.date).localeCompare(String(y.date)))
    .findIndex((o) => o.id === show.id) + 1;

  const items = [
    b.songs.length ? ['SONGS PLAYED', String(b.songs.length)] : null,
    seen > 1 ? ['TIMES SEEN', ordinal(seen)] : null,
    b.buddies.length ? ['WENT WITH', `${b.buddies.length} FRIEND${b.buddies.length === 1 ? '' : 'S'}`] : null,
    ofYear > 0 ? [`SHOW NO. OF ${year}`, String(ofYear).padStart(2, '0')] : null,
    b.vibes.length ? ['THE VIBE', b.vibes[0].toUpperCase()] : null,
    b.score > 0 ? ['YOUR SCORE', `${scoreLabel(b.score)} / 10`] : null,
  ].filter(Boolean);

  push({
    kind: 'receipt-head', dur: 2.2, big: 'MELO\nSHOW\nRECEIPT',
    rows: [b.artist.toUpperCase(), b.where.toUpperCase(), b.dateLabel.toUpperCase()].filter(Boolean),
  });
  if (items.length) push({ kind: 'receipt-items', dur: 3.0, eyebrow: 'ITEMISED', rows: items });
  if (b.verdict) push({ kind: 'receipt-total', dur: 2.3, eyebrow: 'TOTAL', big: b.verdict.toUpperCase(), sub: 'ONE UNREPEATABLE NIGHT' });
  push({
    kind: 'receipt-foot', dur: 2.0, big: 'NO REFUNDS\nNO REGRETS',
    sub: `SHOW ${String(b.all.length || 1).padStart(3, '0')} · KEPT FOREVER`,
  });
  return s;
}

// --- Where it ranks ---------------------------------------------------------
// "Of all 47 shows you've ever logged…" → the giant gradient rank numeral →
// the top-5 board with this show highlighted → the closing line.
function buildRanks(show, ctx) {
  const b = bits(show, ctx);
  const s = [];
  let n = 0;
  const push = (x) => s.push({ id: `rk${n++}`, theme: 'ranks', ...x });

  const scored = b.all.filter((o) => o.score > 0).sort((x, y) => y.score - x.score);
  const rank = scored.findIndex((o) => o.id === show.id) + 1;
  const board = scored.slice(0, 5).map((o, i) => ({
    pos: i + 1, artist: o.artist, score: scoreLabel(o.score), me: o.id === show.id,
  }));

  push({ kind: 'rank-intro', dur: 1.9, big: `Of all ${b.all.length} shows\nyou’ve ever\nlogged…` });
  if (rank > 0) push({ kind: 'rank-hero', dur: 2.3, big: `#${rank}`, sub: 'All time' });
  if (board.length) push({ kind: 'rank-board', dur: 2.9, eyebrow: 'Your top 5', board });
  push({
    kind: 'rank-outro', dur: 2.1,
    big: rank === 1 ? 'Nothing you’ve\nseen beats it.'
      : rank > 0 && rank <= 3 ? 'Top three\nmaterial.'
        : rank > 0 && rank <= 5 ? 'Top five\nof all time.'
          : rank > 0 ? 'One for the\ncollection.' : 'One for the\ncollection.',
    sub: rank > 1 && rank <= 5 ? `Only ${rank - 1} show${rank === 2 ? '' : 's'} to go.` : '',
  });
  return s;
}

// --- The gig poster ---------------------------------------------------------
// Ochre stock #EADFC6, Oswald condensed, rules-and-type. Brick inverse card,
// then "YOU WERE THERE" with a rotated overprint stamp set BELOW the headline
// so it never covers type (the handoff calls this out explicitly).
function buildPoster(show, ctx) {
  const b = bits(show, ctx);
  const s = [];
  let n = 0;
  const push = (x) => s.push({ id: `pp${n++}`, theme: 'poster', ...x });

  // The design splits COLD / PLAY across two lines. Multi-word names break on
  // their own spaces; a long single word splits in half; a short one stays put.
  const up = b.artist.toUpperCase();
  const words = up.split(/\s+/);
  const lines = words.length > 1
    ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')]
    : up.length > 5 ? [up.slice(0, Math.ceil(up.length / 2)), up.slice(Math.ceil(up.length / 2))] : [up];

  push({
    kind: 'poster-main', dur: 2.4, eyebrow: (show.tour || '').toUpperCase(), lines,
    rows: [b.venue.toUpperCase(), b.city.toUpperCase(), b.dateLabel.toUpperCase()].filter(Boolean),
  });
  push({
    kind: 'poster-inverse', dur: 2.2, eyebrow: 'ONE NIGHT ONLY',
    big: b.songs.length ? `${b.songs.length}\nSONGS` : 'ONE\nNIGHT',
    sub: b.vibes.length ? b.vibes.map((v) => v.toUpperCase()).join(' · ') : '',
  });
  push({ kind: 'poster-stamp', dur: 2.3, big: 'YOU WERE\nTHERE', stamp: b.buddies.length ? `+${b.buddies.length}` : 'GA' });
  push({
    kind: 'poster-foot', dur: 2.1, eyebrow: `SHOW No. ${String(b.all.length || 1).padStart(3, '0')}`,
    big: 'Print it. Frame it.\nYou earned it.',
  });
  return s;
}

// --- In your words ----------------------------------------------------------
// The vibes animate in as pills in their OWN colors, then the logged note set as
// a large pull quote, then the verdict word.
function buildWords(show, ctx) {
  const b = bits(show, ctx);
  const s = [];
  let n = 0;
  const push = (x) => s.push({ id: `wd${n++}`, theme: 'words', ...x });

  const count = b.vibes.length;
  const spelled = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'][count] || String(count);
  push({
    kind: 'words-intro', dur: 1.9, eyebrow: 'The night you logged',
    big: count ? `${spelled} word${count === 1 ? '' : 's'}\nyou picked.` : 'In your\nown words.',
  });
  if (count) push({ kind: 'words-pills', dur: 2.7, pills: b.vibes });
  if (b.notes) push({ kind: 'words-quote', dur: 2.7, big: b.notes, sub: '— your note' });
  if (b.verdict) push({ kind: 'words-verdict', dur: 2.2, eyebrow: 'Your verdict', big: b.verdict.toUpperCase() });
  return s;
}

// ===========================================================================
// 2. QUICK CUTS — Beat drop (lib/recap.js), Top 10 moments, Real time
// ===========================================================================

// --- Top 10 moments ---------------------------------------------------------
// The countdown, and the most watchable format in the set: people stay to see
// #1. Title (1.0s) → ten 0.64s beats, each a clip with a HUGE rank numeral
// top-left and the moment's name bottom-left → verdict (0.95s).
function buildTop10(show, ctx) {
  const b = bits(show, ctx);
  const m = pool(b);
  const s = [];
  let n = 0;
  const push = (x) => s.push({ id: `t1${n++}`, theme: 'dark', grad: b.grad, ...x });

  // #1 is the closer — the song the night ended on is the one people remember,
  // so the countdown climbs backwards through the last ten of the set.
  const moments = b.songs.length ? b.songs.slice(-10) : b.vibes.length ? b.vibes : ['The whole thing'];
  const count = Math.min(10, moments.length);

  push({ kind: 'countdown-title', dur: 1.0, eyebrow: `${b.artist} · the countdown`, big: `TOP ${count}\nMOMENTS` });
  // r counts DOWN 10→1 while i counts up 0→9, so rank 1 must land on the LAST
  // song of the set (moments[count - 1]), not the first.
  for (let r = count; r >= 1; r -= 1) {
    const i = count - r;
    push({
      kind: 'countdown', dur: r === 1 ? 1.0 : 0.64, rank: String(r), label: moments[i],
      flash: r === 1 ? 0.5 : 0.28, kb: i % 2 === 0 ? 1 : -1, ...m(i),
    });
  }
  push({ kind: 'score', dur: 0.95, label: 'and the verdict?', big: (b.verdict || 'Kept forever').toUpperCase(), ...m(count) });
  return s;
}

// --- Real time --------------------------------------------------------------
// "minute by minute" — the arc of the night, one 0.55s beat per song.
//
// ASSUMPTION, stated because it's the one place a cut infers rather than reports:
// Melo stores a show's DATE but no start time, so the clock runs from a 8:00 PM
// nominal downbeat at ~4.5 minutes a song. It reads as the SHAPE of the night,
// which is true, rather than a claim about any given minute. If show start times
// ever land in the schema, delete `clock()` and use them.
function buildRealTime(show, ctx) {
  const b = bits(show, ctx);
  const m = pool(b);
  const s = [];
  let n = 0;
  const push = (x) => s.push({ id: `rt${n++}`, theme: 'dark', grad: b.grad, ...x });

  const clock = (mins) => {
    const t = 20 * 60 + mins;
    const h = Math.floor(t / 60) % 24;
    return `${((h + 11) % 12) + 1}:${String(t % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  };
  const beats = (b.songs.length ? b.songs : b.vibes).slice(0, 9);

  push({ kind: 'clock-title', dur: 0.9, eyebrow: [b.dateLabel, b.venue].filter(Boolean).join(' · '), big: 'minute\nby minute' });
  push({ kind: 'clock', dur: 0.55, time: clock(0), label: 'lights go dark', ...m(0) });
  beats.forEach((label, i) => push({ kind: 'clock', dur: 0.55, time: clock(4 + Math.round(i * 4.5)), label, flash: 0.22, ...m(i + 1) }));
  push({
    kind: 'score', dur: 0.95, big: (b.verdict || 'Kept forever').toUpperCase(),
    label: `${Math.max(2, Math.round((beats.length * 4.5 + 20) / 60))} hrs · one unforgettable night`,
    ...m(beats.length + 1),
  });
  return s;
}

// ===========================================================================
// 3. MEMORY CUTS — Ticket stubs (with THE DRAWER), One year ago, Dear diary
// ===========================================================================

// --- Ticket stub collection -------------------------------------------------
// Aged paper, Oswald, brick red. Scene 4 is THE DRAWER: the fan of stubs from
// your other shows, rotated -14° / -4° / +6°, under "The ones you'll never throw
// out". It's the one scene in the whole set that's about the COLLECTION rather
// than the night — the digital ticket killed the shoebox, and this puts it back.
function buildStubs(show, ctx) {
  const b = bits(show, ctx);
  const s = [];
  let n = 0;
  const push = (x) => s.push({ id: `st${n++}`, theme: 'stub', ...x });

  push({ kind: 'stub-open', dur: 2.3, eyebrow: 'ADMIT ONE', big: 'Your collection', sub: 'Every stub you\never saved' });
  push({
    // No `tag` here — the eyebrow already says ADMIT ONE, and printing it twice
    // put the two labels on top of each other in the stub's top row.
    kind: 'stub-card', dur: 2.6, eyebrow: 'ADMIT ONE · NO REFUNDS', big: b.artist, sub: show.tour || '',
    rows: [b.venue ? ['Venue', b.venue] : null, b.dateLabel ? ['Date', b.dateLabel] : null].filter(Boolean),
  });
  if (b.photos.length) {
    push({
      kind: 'stub-photo', dur: 2.5, media: b.photos[0],
      tag: `STUB No. ${String((show.id || '1').replace(/\D/g, '').slice(-3) || '001').padStart(3, '0')}`,
      big: b.notes ? b.notes.slice(0, 60) : `${b.artist.toLowerCase()}. still not over it.`,
    });
  }

  const others = b.all
    .filter((o) => o.id !== show.id)
    .sort((x, y) => String(y.date).localeCompare(String(x.date)))
    .slice(0, 2)
    .map((o) => ({ artist: o.artist, where: [o.venue, yr2(o.date)].filter(Boolean).join(' · ') }));
  if (others.length) {
    push({
      kind: 'stub-drawer', dur: 2.4, big: 'The ones you’ll\nnever throw out',
      stubs: [...others, { artist: b.artist, where: [b.venue, yr2(show.date)].filter(Boolean).join(' · '), me: true }],
    });
  }

  // The number, stamped — the handoff's structural exception to verdict words.
  if (b.score > 0) push({ kind: 'stub-rating', dur: 2.2, eyebrow: 'SHOW RATING', big: scoreLabel(b.score), sub: b.verdict.toUpperCase() });
  push({ kind: 'stub-end', dur: 2.4, big: 'Every stub,\nkept forever.', sub: 'MELO.SHOW' });
  return s;
}

// --- One year ago tonight ---------------------------------------------------
// The anniversary cut, and the reason the app gets opened on the ~360 days a
// year nobody is at a show. Radial #43271A → #160d07 interstitials.
function buildAnniversary(show, ctx) {
  const b = bits(show, ctx);
  const m = pool(b);
  const s = [];
  let n = 0;
  const push = (x) => s.push({ id: `an${n++}`, theme: 'dark', grad: b.grad, ...x });

  const yrs = show.date ? Math.max(1, new Date().getFullYear() - getYear(show.date)) : 1;
  push({
    kind: 'title', dur: 2.4, eyebrow: 'On this day',
    big: `${yrs === 1 ? '1 year ago' : `${yrs} years ago`}\ntonight`, sub: `you were at ${b.artist}`,
  });
  if (b.photos[0]) push({ kind: 'beat', dur: 2.5, label: 'You were here.', media: b.photos[0], layout: 'lower' });
  if (b.videos[0]) push({ kind: 'beat', dur: 2.5, label: 'The night you\nlost your voice.', video: b.videos[0], layout: 'lower' });
  if (b.songs.length) push({ kind: 'beat', dur: 2.4, label: `${b.songs[b.songs.length - 1]}.`, kb: -1, layout: 'lower', ...m(1) });

  if (b.score > 0) {
    const yearShows = b.all.filter((o) => o.score > 0 && getYear(o.date) === getYear(show.date)).sort((x, y) => y.score - x.score);
    const first = yearShows[0]?.id === show.id;
    push({
      kind: 'score', dur: 2.3, big: b.verdict.toUpperCase(), sub: scoreLabel(b.score),
      label: first ? `And still\nyour #1 show of ${getYear(show.date)}` : 'And still',
      ...m(2),
    });
  }
  push({ kind: 'outro', dur: 2.5, big: 'Some nights you\nkeep forever.', sub: 'melo.show' });
  return s;
}

// --- Dear diary -------------------------------------------------------------
function buildDiary(show, ctx) {
  const b = bits(show, ctx);
  const s = [];
  let n = 0;
  const push = (x) => s.push({ id: `dy${n++}`, theme: 'diary', ...x });

  push({ kind: 'diary', dur: 2.4, eyebrow: b.dateLabel, big: `${b.artist}.`, sub: 'the entry I keep\nre-reading…' });
  if (b.photos[0]) push({ kind: 'diary', dur: 2.4, media: b.photos[0], big: b.notes ? b.notes.slice(0, 70) : 'I still can’t believe\nwe were that close ♡' });
  if (b.songs.length) push({ kind: 'diary', dur: 2.4, media: b.photos[1] || b.photos[0], big: `the whole place sang\n${b.songs[0]} back to him` });
  if (b.buddies.length) push({ kind: 'diary', dur: 2.2, big: `went with ${b.buddies.slice(0, 3).join(' & ')} ♡` });
  if (b.score > 0) push({ kind: 'diary-score', dur: 2.2, big: 'my score, no notes:', sub: scoreLabel(b.score), verdict: b.verdict.toLowerCase() });
  push({ kind: 'diary', dur: 2.4, big: 'melo remembers,\nso you don’t have to.', sub: 'melo.show' });
  return s;
}

// ===========================================================================
// 4. STYLE CUTS — "same night, four more looks": Fast-cut hype, Cinematic,
//    Scrapbook, VHS. (Plus Super 8, which the handoff files with this band.)
// ===========================================================================

/** All the looks share ONE spine — title, a beat per song, who you went with,
 *  the score, the end card — and differ only in pace, casing, theme and chrome.
 *  Building them from a single shaper is exactly what makes them read as the
 *  same night four ways instead of four unrelated reels. */
function look(show, ctx, o) {
  const b = bits(show, ctx);
  const m = pool(b);
  const s = [];
  let n = 0;
  const push = (x) => s.push({ id: `${o.key}${n++}`, theme: o.theme, grad: b.grad, ...x });
  const cased = (t) => (o.case === 'lower' ? String(t).toLowerCase() : o.case === 'upper' ? String(t).toUpperCase() : t);

  push({
    kind: 'title', dur: o.dur.title, eyebrow: cased(o.eyebrow(b)), big: cased(b.artist),
    sub: cased([b.venue, b.dateLabel].filter(Boolean).join(' · ')), ...(o.titleMedia ? m(0) : {}),
  });

  const beats = (b.songs.length ? b.songs : b.vibes.length ? b.vibes : ['the whole night']).slice(0, o.beats);
  beats.forEach((song, i) => push({
    kind: 'beat', dur: o.dur.beat(i), label: cased(song), kb: i % 2 === 0 ? 1 : -1,
    flash: o.flash, layout: o.layout, ...m(i + 1),
  }));

  if (b.buddies.length) {
    push({
      kind: 'beat', dur: o.dur.beat(0) * 1.1, label: cased(`with ${b.buddies.slice(0, 3).join(' & ')}`),
      layout: o.layout, ...m(beats.length + 1),
    });
  }
  if (b.verdict) {
    push({
      kind: 'score', dur: o.dur.score, label: cased(o.scoreLabel),
      big: o.case === 'lower' ? b.verdict.toLowerCase() : b.verdict.toUpperCase(),
      sub: o.showNumber ? scoreLabel(b.score) : (b.vibes[0] || ''), ...m(2),
    });
  }
  push({ kind: 'outro', dur: o.dur.outro, big: cased(`${b.artist}.`), sub: cased('Kept forever.'), ...(o.titleMedia ? m(0) : {}) });
  return s;
}

// Fast-cut hype — hard cuts 1.05–1.5s, white flash on EVERY cut.
const buildFastCut = (show, ctx) => look(show, ctx, {
  key: 'fc', theme: 'dark', beats: 10, flash: 0.5, titleMedia: false, showNumber: true,
  eyebrow: () => 'melo made you a recap', scoreLabel: 'Your score',
  dur: { title: 1.5, beat: (i) => 1.5 - (i % 4) * 0.13, score: 1.9, outro: 2.0 },
});

// Cinematic — slow zooms, heavy letterbox, lowercase, long holds, no flash.
const buildCinematic = (show, ctx) => look(show, ctx, {
  key: 'ci', theme: 'cinematic', beats: 5, flash: 0, titleMedia: true, layout: 'lower',
  case: 'lower', showNumber: true, eyebrow: (b) => b.where, scoreLabel: 'your score',
  dur: { title: 2.2, beat: () => 2.45, score: 2.0, outro: 2.2 },
});

// Scrapbook — cream paper #F1E6D2, taped snapshots, handwriting.
const buildScrapbook = (show, ctx) => look(show, ctx, {
  key: 'sb', theme: 'scrapbook', beats: 4, flash: 0, titleMedia: true, showNumber: true,
  case: 'lower', eyebrow: (b) => `🎫 ${b.where}`, scoreLabel: 'my rating',
  dur: { title: 1.8, beat: () => 1.9, score: 1.7, outro: 2.0 },
});

// VHS — tape jitter, scan lines, REC dot, all caps.
const buildVHS = (show, ctx) => look(show, ctx, {
  key: 'vh', theme: 'vhs', beats: 5, flash: 0, titleMedia: false, showNumber: true,
  case: 'upper', eyebrow: () => '● REC', scoreLabel: 'SCORE',
  dur: { title: 1.6, beat: (i) => 1.6 + (i % 2) * 0.15, score: 1.7, outro: 1.9 },
});

// Super 8 — film weave, grain, flicker, warm faded tint, "Reel 01".
const buildSuper8 = (show, ctx) => look(show, ctx, {
  key: 's8', theme: 'super8', beats: 3, flash: 0, titleMedia: false,
  case: 'lower', eyebrow: () => 'Reel 01', scoreLabel: 'the verdict',
  dur: { title: 1.9, beat: (i) => 2.1 + (i % 2) * 0.1, score: 2.0, outro: 2.3 },
});

// ===========================================================================
// THE REGISTRY
// ===========================================================================
// `needs` is the media floor, and it is REAL selection logic (handoff §3c): the
// generator picks the richest cut it can actually fill and silently upgrades
// when the user adds media later. Nobody should ever see an empty state where a
// recap belongs.
//
// `exportable` marks cuts whose Canvas renderer exists today. The picker still
// offers the rest in-app; only the MP4 button is gated.

export const CUTS = [
  // ---- No camera needed (always on) — the floor ----
  { id: 'setlist', name: 'The setlist', tier: 'No camera needed', needs: { songs: 3 }, exportable: false, blurb: 'Every song, rolling like credits', build: buildSetlist },
  { id: 'receipt', name: 'The receipt', tier: 'No camera needed', needs: {}, exportable: false, blurb: 'Your night, itemised and totalled', build: buildReceipt },
  { id: 'ranks', name: 'Where it ranks', tier: 'No camera needed', needs: { library: 3, score: true }, exportable: false, blurb: 'Against every show you’ve logged', build: buildRanks },
  { id: 'poster', name: 'The gig poster', tier: 'No camera needed', needs: {}, exportable: false, blurb: 'Print it. Frame it. You earned it.', build: buildPoster },
  { id: 'words', name: 'In your words', tier: 'No camera needed', needs: { words: true }, exportable: false, blurb: 'Your vibes, your note, your verdict', build: buildWords },

  // ---- Quick cuts ----
  { id: 'beatdrop', name: 'Beat drop', tier: 'Quick cuts', default: true, needs: { media: 2 }, exportable: true, blurb: 'Fast cuts, big type, on the beat', build: buildBeatDrop },
  { id: 'top10', name: 'Top 10 moments', tier: 'Quick cuts', needs: { media: 3, songs: 4 }, exportable: true, blurb: 'The countdown — every moment ranked', build: buildTop10 },
  { id: 'realtime', name: 'Real time', tier: 'Quick cuts', needs: { media: 3, songs: 4 }, exportable: true, blurb: 'The night, minute by minute', build: buildRealTime },

  // ---- Style cuts — "same night, four more looks" ----
  { id: 'fastcut', name: 'Fast-cut hype', tier: 'Style cuts', needs: { media: 3 }, exportable: true, blurb: 'Hard cuts, white flash, springy type', build: buildFastCut },
  { id: 'cinematic', name: 'Cinematic', tier: 'Style cuts', needs: { media: 1 }, exportable: true, blurb: 'Slow zooms, letterboxed, lets it breathe', build: buildCinematic },
  { id: 'scrapbook', name: 'Scrapbook', tier: 'Style cuts', needs: { media: 1 }, exportable: false, blurb: 'Taped snapshots on cream paper', build: buildScrapbook },
  { id: 'vhs', name: 'VHS', tier: 'Style cuts', needs: { media: 2 }, exportable: false, blurb: 'Tape jitter, scan lines, REC dot', build: buildVHS },
  { id: 'super8', name: 'Super 8', tier: 'Style cuts', needs: { media: 1 }, exportable: false, blurb: 'Film weave, grain, warm and faded', build: buildSuper8 },

  // ---- Memory cuts (resurface over time) ----
  { id: 'stubs', name: 'Ticket stubs', tier: 'Memory cuts', needs: {}, exportable: false, blurb: 'Aged paper, print type, your rating stamped', build: buildStubs },
  // media:1 as well as aged — this cut is built around "You were here", and on
  // a photoless show it collapses to a title and an end card.
  { id: 'anniversary', name: 'One year ago', tier: 'Memory cuts', needs: { media: 1, aged: true }, exportable: false, blurb: 'The memory that resurfaces on you', build: buildAnniversary },
  { id: 'diary', name: 'Dear diary', tier: 'Memory cuts', needs: { media: 1 }, exportable: false, blurb: 'Handwritten, tape-mounted, personal', build: buildDiary },
];

// Picker order, per handoff §5.
export const TIERS = ['No camera needed', 'Quick cuts', 'Style cuts', 'Memory cuts'];
export const TIER_BADGE = { 'No camera needed': 'always on', 'Memory cuts': 'resurfaces over time' };
export const DEFAULT_CUT = 'beatdrop';
export const getCut = (id) => CUTS.find((c) => c.id === id) || CUTS[0];
export const buildCut = (id, show, ctx) => getCut(id).build(show, ctx);

/** Can this cut actually be FILLED by this show? The ladder's gate. */
export function cutEligible(cut, show, ctx = {}) {
  const n = cut.needs || {};
  const media = (show.photos || []).length + (show.videos || []).length;
  const songs = (show.setlist || []).filter(Boolean).length;
  const library = (ctx.shows || []).filter(isAttended).length;
  if (n.media && media < n.media) return false;
  if (n.songs && songs < n.songs) return false;
  if (n.library && library < n.library) return false;
  if (n.score && !(show.score > 0)) return false;
  if (n.words && !(show.vibes || []).length && !(show.notes || '').trim()) return false;
  // "One year ago" is a RESURFACING cut — it makes no sense on a show you logged
  // last week, so it only unlocks once the night is genuinely in the past.
  if (n.aged && show.date && getYear(show.date) >= new Date().getFullYear()) return false;
  return true;
}

/** The fallback ladder as real selection logic (handoff §3c).
 *  4+ clips → the quick cuts. 1–3 photos → the style/memory cuts. No media →
 *  the no-camera floor. Always returns something that can actually be filled. */
export function pickAutoCut(show, ctx = {}) {
  const clips = (show.videos || []).length;
  const media = clips + (show.photos || []).length;
  const order = clips >= 4 || media >= 4
    ? ['beatdrop', 'top10', 'realtime', 'fastcut', 'vhs']
    : media >= 1
      ? ['cinematic', 'scrapbook', 'super8', 'beatdrop', 'diary']
      : ['setlist', 'receipt', 'ranks', 'poster', 'words'];
  const hit = order.find((id) => cutEligible(getCut(id), show, ctx));
  if (hit) return hit;
  // Last resort: anything at all that fills. The receipt needs nothing but a
  // show, so this never actually returns undefined.
  return (CUTS.find((c) => cutEligible(c, show, ctx)) || getCut('receipt')).id;
}

/** Every cut, flagged with whether this show can fill it — for the picker. */
export const eligibleCuts = (show, ctx = {}) => CUTS.map((c) => ({ ...c, ok: cutEligible(c, show, ctx) }));
