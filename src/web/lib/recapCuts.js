// lib/recapCuts.js — the recap "cut" registry.
// ============================================
// The design handoff specifies ELEVEN cuts across three tiers (Quick / Style /
// Memory). Rather than eleven separate players, every cut is just a different
// scene-list builder over the same show data, rendered by the same reel engine
// and the same Canvas exporter. Adding a cut = adding one entry here.
//
// Each scene carries a `theme` that both renderers understand:
//   'dark'  — full-bleed photo/clip behind cinematic caps (Beat drop, Cinematic)
//   'paper' — aged ticket-stub paper, Oswald print, the NUMERIC score (the one
//             place the number belongs, per the handoff's verdict-word rule)
//   'diary' — cream journal page, Caveat handwriting, tape-mounted photo
//
// docs/initiatives/2026-07-16-show-recap-reel.md

import { formatDate, getArtistGradient } from '../store';
import { buildScenes as buildBeatDrop, scoreVerdict } from './recap';

const scoreLabel = (s) => (Number.isInteger(s) ? String(s) : Number(s).toFixed(1));

function showBits(show) {
  return {
    artist: show.artist || 'The show',
    songs: (show.setlist || []).filter(Boolean),
    photos: (show.photos || []).filter(Boolean),
    videos: (show.videos || []).filter(Boolean),
    grad: getArtistGradient(show.artist || ''),
    dateLabel: show.date ? formatDate(show.date) : '',
    where: [show.venue, show.city].filter(Boolean).join(' · '),
    verdict: scoreVerdict(show.score),
    score: show.score,
  };
}

// ---------------------------------------------------------------------------
// CINEMATIC — slow zooms, heavy letterbox, long holds, no flash. The opposite
// of Beat drop: it breathes. (Handoff: "slow zooms (filmZoom), letterboxes".)
// ---------------------------------------------------------------------------
function buildCinematic(show) {
  const { artist, songs, photos, videos, grad, dateLabel, where, verdict, score } = showBits(show);
  const media = [...videos.map((v) => ({ video: v })), ...photos.map((p) => ({ media: p }))];
  const bg = (i) => (media.length ? media[i % media.length] : {});
  const scenes = [];
  let n = 0;
  const push = (s) => scenes.push({ id: `c${n++}`, grad, theme: 'dark', cinematic: true, ...s });

  push({ kind: 'title', dur: 2.6, big: artist, sub: [where, dateLabel].filter(Boolean).join('  ·  '), ...bg(0) });
  songs.slice(0, 5).forEach((song, i) => {
    push({ kind: 'beat', dur: 2.4, label: song, kb: i % 2 === 0 ? 1 : -1, layout: 'lower', ...bg(i + 1) });
  });
  if (verdict) push({ kind: 'score', dur: 2.6, label: 'Your verdict', big: verdict, score: scoreLabel(score), ...bg(1) });
  push({ kind: 'outro', dur: 2.8, big: `${artist}.`, sub: 'Kept forever.', ...bg(0) });
  return scenes;
}

// ---------------------------------------------------------------------------
// TICKET STUBS — aged paper, Oswald print, brick ink, a "RATED 9.8" stamp.
// Per the handoff this is the ONE cut where the numeric score appears.
// End card: "Every stub, kept forever."
// ---------------------------------------------------------------------------
function buildStubs(show) {
  const { artist, songs, photos, videos, grad, dateLabel, where, score } = showBits(show);
  const media = [...videos.map((v) => ({ video: v })), ...photos.map((p) => ({ media: p }))];
  const scenes = [];
  let n = 0;
  const push = (s) => scenes.push({ id: `t${n++}`, grad, theme: 'paper', ...s });

  push({ kind: 'stub-open', dur: 2.0, big: 'ADMIT ONE', sub: 'Your collection' });
  push({
    kind: 'stub', dur: 2.6, big: artist,
    rows: [['VENUE', show.venue || '—'], ['DATE', dateLabel || '—'], ['CITY', show.city || '—']],
    tag: `STUB No. ${String((show.id || '0').replace(/\D/g, '').slice(-3) || '001').padStart(3, '0')}`,
    ...(media[0] || {}),
  });
  if (songs.length) {
    push({ kind: 'stub-list', dur: 2.6, big: 'THE SET', rows: songs.slice(0, 6).map((s, i) => [String(i + 1).padStart(2, '0'), s]) });
  }
  // The number, stamped — the handoff's structural exception to verdict words.
  if (score > 0) push({ kind: 'stub-stamp', dur: 2.2, big: `RATED ${scoreLabel(score)}`, sub: where });
  push({ kind: 'stub-end', dur: 2.4, big: 'Every stub,', sub: 'kept forever.' });
  return scenes;
}

// ---------------------------------------------------------------------------
// DEAR DIARY — handwritten journal on cream, tape-mounted photos.
// End card: "melo remembers, so you don't have to."
// ---------------------------------------------------------------------------
function buildDiary(show) {
  const { artist, songs, photos, videos, grad, dateLabel, verdict, score } = showBits(show);
  const media = [...videos.map((v) => ({ video: v })), ...photos.map((p) => ({ media: p }))];
  const scenes = [];
  let n = 0;
  const push = (s) => scenes.push({ id: `d${n++}`, grad, theme: 'diary', ...s });

  push({ kind: 'diary', dur: 2.2, big: dateLabel || 'That night', sub: `${artist}.` });
  push({ kind: 'diary', dur: 2.4, big: 'the entry I keep re-reading…', ...(media[0] || {}) });
  (show.notes ? [show.notes] : songs.slice(0, 2).map((s) => `${s} — still hear it`)).slice(0, 2)
    .forEach((line, i) => push({ kind: 'diary', dur: 2.4, big: line, ...(media[(i + 1) % Math.max(media.length, 1)] || {}) }));
  if (score > 0) push({ kind: 'diary-score', dur: 2.2, big: 'my score, no notes:', sub: scoreLabel(score), verdict });
  push({ kind: 'diary', dur: 2.6, big: 'melo remembers,', sub: "so you don't have to." });
  return scenes;
}

// ---------------------------------------------------------------------------
// The registry. `exportable` marks cuts whose Canvas renderer exists today —
// the picker still offers the others in-app; only the MP4 button is gated.
// ---------------------------------------------------------------------------
export const CUTS = [
  {
    id: 'beatdrop', name: 'Beat drop', tier: 'Quick cuts', default: true, exportable: true,
    blurb: 'Fast cuts, big type, on the beat', build: buildBeatDrop,
  },
  {
    id: 'cinematic', name: 'Cinematic', tier: 'Style cuts', exportable: true,
    blurb: 'Slow zooms, letterboxed, lets it breathe', build: buildCinematic,
  },
  {
    id: 'stubs', name: 'Ticket stubs', tier: 'Memory cuts', exportable: false,
    blurb: 'Aged paper, print type, your rating stamped', build: buildStubs,
  },
  {
    id: 'diary', name: 'Dear diary', tier: 'Memory cuts', exportable: false,
    blurb: 'Handwritten, tape-mounted, personal', build: buildDiary,
  },
];

export const TIERS = ['Quick cuts', 'Style cuts', 'Memory cuts'];
export const DEFAULT_CUT = 'beatdrop';
export const getCut = (id) => CUTS.find((c) => c.id === id) || CUTS[0];
export const buildCut = (id, show) => getCut(id).build(show);
