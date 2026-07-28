// lib/recap.js — turn one logged show into a "melo made you a recap" reel.
// ======================================================================
// A pure function (no React, no DOM) so the same scene list can drive BOTH the
// in-app RecapReel and, later, the deterministic Canvas frame render for the MP4
// export (Phase 2 — see docs/initiatives/2026-07-16-show-recap-reel.md).
//
// The flagship "montage" treatment from the Melo Recap design, wired to real
// data: intro → a cinematic beat per setlist song (Ken-Burns over the user's own
// photos/clips) → the score reveal → outro. Degrades gracefully — a show with no
// setlist still gets a short recap from its vibes/media.

import { formatDate, getArtistGradient } from '../store';

// A show's score → the VERDICT WORD the reveal lands on.
//
// PRODUCT RULE (design handoff §"Verdict words"): on a recap the score renders
// as a word, NOT a number — "UNREAL", not "9.8". The numeric score stays only
// on ticket-stub cuts, where it belongs structurally. Anchors come from the
// handoff (9.5+ = UNREAL, 9.0 = ONE FOR THE BOOKS); the rest fill the scale.
export function scoreVerdict(score) {
  if (score == null || score <= 0) return '';
  if (score >= 9.5) return 'Unreal';
  if (score >= 9) return 'One for the books';
  if (score >= 8) return 'Unforgettable';
  if (score >= 7) return 'A great night';
  if (score >= 5) return 'Worth it';
  return 'Been better';
}

const scoreLabel = (s) => (Number.isInteger(s) ? String(s) : s.toFixed(1));

// Fit-to-width beat type. Short song titles get HUGE; long ones stay readable.
// Shared by RecapReel (CSS px) and recapFrame (canvas px) so the in-app reel
// and the export can't drift apart.
export function beatScale(label) {
  const len = String(label || '').length;
  if (len <= 8) return 1.5;
  if (len <= 14) return 1.15;
  if (len <= 22) return 0.95;
  return 0.8;
}

// Whether a show has enough to make a reel sing. Surfaced as the gate on the
// "Recap" entry point — a bare show with nothing to montage isn't worth it.
export function canRecap(show) {
  if (!show) return false;
  const songs = (show.setlist || []).filter(Boolean).length;
  const media = (show.photos || []).length + (show.videos || []).length;
  return songs >= 3 || media >= 2 || (show.score || 0) > 0;
}

/** Build the ordered scene list for a show.
 *  Scene: { id, kind, dur, label?, sub?, big?, media?, video?, flash?, grad } */
export function buildScenes(show) {
  const artist = show.artist || 'The show';
  const photos = (show.photos || []).filter(Boolean);
  const videos = (show.videos || []).filter(Boolean);
  const media = [...videos.map((v) => ({ video: v })), ...photos.map((p) => ({ media: p }))];
  const songs = (show.setlist || []).filter(Boolean).slice(0, 8); // the montage core
  const grad = getArtistGradient(artist);
  const dateLabel = show.date ? formatDate(show.date) : '';
  const where = [show.venue, show.city].filter(Boolean).join(' · ');

  // Rotate media across the song beats so every scene has a backdrop when we have
  // media; falls back to the artist gradient otherwise.
  const bg = (i) => (media.length ? media[i % media.length] : {});

  const scenes = [];
  let n = 0;
  // `theme` explicitly, not by renderer default — every other cut declares one,
  // and the Canvas exporter shouldn't have to guess which look a scene wants.
  const push = (s) => scenes.push({ id: `s${n++}`, grad, theme: 'dark', ...s });

  // --- Intro -------------------------------------------------------------
  push({ kind: 'title', dur: 1.4, big: 'melo made you a recap', flash: 0.4, ...bg(0) });
  push({ kind: 'intro', dur: 2.0, label: artist, sub: [where, dateLabel].filter(Boolean).join('  ·  '), ...bg(1) });

  // --- The montage: one beat per song ------------------------------------
  // Tempo is the whole feel ("boring" feedback, 2026-07-24): the design doc
  // cuts every 0.4–0.6s; a uniform 1.15s read as a slideshow. So: a varied,
  // tightening rhythm; alternating Ken-Burns direction (kb); alternating
  // layouts; a tape-style index chip; and both renderers add a punch-in on
  // every beat cut.
  const BEAT_DURS = [0.9, 0.7, 0.6, 0.55, 0.6, 0.55, 0.7, 0.6];
  songs.forEach((song, i) => {
    const last = i === songs.length - 1;
    push({
      kind: 'beat',
      dur: last ? 1.2 : (BEAT_DURS[i % BEAT_DURS.length]),
      label: song,
      tag: String(i + 1).padStart(2, '0'),        // "01" tape-label chip
      layout: i % 3 === 1 ? 'lower' : 'center',    // break the sameness
      kb: i % 2 === 0 ? 1 : -1,                    // alternate zoom direction
      flash: last ? 0.65 : 0.5,
      ...bg(i + 2),
    });
  });

  // If there were no songs, weave the media on its own so the reel isn't empty.
  if (!songs.length && media.length) {
    media.slice(0, 5).forEach((m, i) => push({
      kind: 'beat', dur: 0.8, kb: i % 2 === 0 ? 1 : -1, ...m, flash: 0.4,
    }));
  }

  // WHO YOU WERE WITH — the handoff lists this alongside setlist + score as core
  // recap content, and it's the share engine: a recap that names your friends is
  // one you send TO them. Buddies are free-text on the show, so no lookup.
  const people = (show.buddies || []).filter(Boolean).slice(0, 4);
  if (people.length) {
    const names = people.length <= 2
      ? people.join(' & ')
      : `${people.slice(0, 2).join(', ')} + ${people.length - 2} more`;
    push({ kind: 'people', dur: 1.8, label: 'With', big: names, flash: 0.35, ...bg(songs.length + 1) });
  }

  // A vibe accent (the user's own words for the night), if any.
  const vibes = (show.vibes || []).filter(Boolean).slice(0, 3);
  if (vibes.length) {
    push({ kind: 'vibes', dur: 1.9, big: vibes.join('  ·  '), ...bg(songs.length + 2) });
  }

  // --- Score reveal ------------------------------------------------------
  const verdict = scoreVerdict(show.score);
  if (verdict) {
    // The verdict WORD is the hero (product rule). `score` rides along so the
    // ticket-stub cut can stamp the number when that cut is built.
    push({
      kind: 'score', dur: 2.2, label: 'Your verdict', big: verdict,
      score: scoreLabel(show.score), flash: 0.6, ...bg(0),
    });
  }

  // --- Outro -------------------------------------------------------------
  push({ kind: 'outro', dur: 2.4, big: `${artist}.`, sub: 'Kept forever.', ...bg(1) });

  return scenes;
}
