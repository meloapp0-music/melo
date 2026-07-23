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

// A show's score → the one-word verdict the reveal lands on. Mirrors the design
// (9.8 → "Unreal"). Only rated shows get a score scene.
export function scoreVerdict(score) {
  if (score == null || score <= 0) return '';
  if (score >= 9.5) return 'Unreal';
  if (score >= 9) return 'Incredible';
  if (score >= 8) return 'Unforgettable';
  if (score >= 7) return 'A great night';
  if (score >= 5) return 'Worth it';
  return 'One for the books';
}

const scoreLabel = (s) => (Number.isInteger(s) ? String(s) : s.toFixed(1));

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
  const push = (s) => scenes.push({ id: `s${n++}`, grad, ...s });

  // --- Intro -------------------------------------------------------------
  push({ kind: 'title', dur: 1.6, big: 'melo made you a recap', flash: 0.4, ...bg(0) });
  push({ kind: 'intro', dur: 2.4, label: artist, sub: [where, dateLabel].filter(Boolean).join('  ·  '), ...bg(1) });

  // --- The montage: one cinematic beat per song -------------------------
  // Short holds, big Oswald caps, a light flash on entry — the "reel" feel.
  songs.forEach((song, i) => {
    push({
      kind: 'beat',
      dur: i === songs.length - 1 ? 1.5 : 1.15,
      label: song,
      flash: 0.5,
      ...bg(i + 2),
    });
  });

  // If there were no songs, weave the media on its own so the reel isn't empty.
  if (!songs.length && media.length) {
    media.slice(0, 5).forEach((m, i) => push({ kind: 'beat', dur: 1.3, ...m, flash: 0.4 }));
  }

  // A vibe accent (the user's own words for the night), if any.
  const vibes = (show.vibes || []).filter(Boolean).slice(0, 3);
  if (vibes.length) {
    push({ kind: 'vibes', dur: 1.9, big: vibes.join('  ·  '), ...bg(songs.length + 2) });
  }

  // --- Score reveal ------------------------------------------------------
  const verdict = scoreVerdict(show.score);
  if (verdict) {
    push({ kind: 'score', dur: 2.2, label: 'Your score', big: scoreLabel(show.score), sub: verdict, flash: 0.6, ...bg(0) });
  }

  // --- Outro -------------------------------------------------------------
  push({ kind: 'outro', dur: 2.4, big: `${artist}.`, sub: 'Kept forever.', ...bg(1) });

  return scenes;
}
