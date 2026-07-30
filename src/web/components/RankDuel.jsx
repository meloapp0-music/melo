// RankDuel — "which was better?", asked at the right moment.
// ==========================================================
// Opens right after a show is logged, while the user is still thinking about
// it, and binary-searches it into their ranked library in 2–5 taps.
//
// This replaces asking for a number. A 1–10 score compresses — nobody goes to
// shows they expect to hate — so libraries cluster at 8–10 and the resulting
// "order" is mostly ties. A comparison is easy and honest, and ⌈log₂(n+1)⌉ of
// them place a show exactly. The algorithm is in lib/ranking.js; this is only
// the surface. docs/initiatives/2026-07-28-ia-simplification.md

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate, isAttended } from '../store';
import { savePositions } from '../lib/db/rankings';
import {
  startPlacement, nextOpponent, answer, isPlaced, place, placementIndex, remaining,
  rankedOrder, toPositions,
} from '../lib/ranking';
import { track } from '../lib/analytics';

export default function RankDuel({ show, onClose }) {
  const { shows, getArtistImage, session, showToast, rankPositions, setRankPositions } = useApp();
  const userId = session?.user?.id || null;

  const [state, setState] = useState(null);
  const [done, setDone] = useState(null); // { rank, total } once placed
  const [saving, setSaving] = useState(false);

  // The library this show is being placed into — everything else attended.
  const others = useMemo(
    () => (shows || []).filter((s) => isAttended(s) && s.id !== show?.id),
    [shows, show?.id]
  );

  // Positions are already in app state (loaded with everything else), so the
  // duel opens instantly instead of showing a spinner at the exact moment the
  // user is being asked to make a snap judgement.
  useEffect(() => {
    const ordered = rankedOrder(others, rankPositions || {}).map((s) => s.id);
    setState(startPlacement(ordered, show.id));
    track('rank_duel_started', { library_size: ordered.length });
    // Deliberately once per mount: re-running mid-placement would restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = useMemo(() => Object.fromEntries(others.map((s) => [s.id, s])), [others]);
  const opponentId = state ? nextOpponent(state) : null;
  const opponent = opponentId ? byId[opponentId] : null;

  // Commit the placement. Also runs on "good enough" — `lo` is always the best
  // current guess, so an early exit is a real answer, not a discarded one.
  const commit = async (s) => {
    if (saving) return;
    setSaving(true);
    const ordered = place(s);
    const rank = placementIndex(s) + 1;
    // The show this one just pushed down — i.e. the best night it beat.
    const displacedId = ordered[rank]; // rank is 1-based, so this is the next one down
    setDone({ rank, total: ordered.length, displaced: byId[displacedId]?.artist || '' });
    track('rank_duel_finished', { questions: s.asked, rank, total: ordered.length, early: !isPlaced(s) });
    // Update app state immediately so the leaderboard, the receipt and the
    // "Where it ranks" recap cut are correct before the round-trip lands.
    setRankPositions?.(toPositions(ordered));
    try {
      await savePositions(ordered, userId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Melo] savePositions failed', err);
      showToast?.({ message: 'Couldn’t save that ranking — it’ll re-ask next time.' });
    } finally {
      setSaving(false);
    }
  };

  const vote = (candidateWon) => {
    const next = answer(state, candidateWon);
    setState(next);
    if (isPlaced(next)) commit(next);
  };

  const bg = (s) => {
    const img = s?.artist ? getArtistImage(s.artist) : null;
    return img
      ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: getArtistGradient(s?.artist || '') };
  };

  if (!show) return null;

  // ---- Result ----
  if (done) {
    // The line has to earn its place under a 108px numeral — repeating "#4 of
    // 8" underneath it says nothing. Name the show it just displaced instead:
    // that's the concrete fact the user doesn't already have on screen.
    const beat = done.displaced;
    const line = done.rank === 1
      ? 'A new number one. Nothing you’ve seen beats it.'
      : beat
        ? `Better than ${beat}${done.rank <= 3 ? ' — top three material.' : '.'}`
        : done.rank === done.total
          ? 'Every other night edged it out.'
          : 'Placed.';
    return (
      <div className="duel-overlay">
        <div className="duel-result">
          <div className="duel-result-rank">#{done.rank}</div>
          <div className="duel-result-of">of {done.total} shows</div>
          <div className="duel-result-line">{line}</div>
          <button className="duel-done" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  // ---- Placing ----
  // No opponent means an empty library — the first show ever is #1 by
  // definition, so there's nothing to ask. Commit and get out of the way.
  if (state && !opponent) {
    if (!done && !saving) commit(state);
    return null;
  }
  if (!state || !opponent) return null;

  const left = remaining(state);

  return (
    <div className="duel-overlay">
      <button className="duel-skip" onClick={onClose}>Skip</button>

      <div className="duel-head">
        <div className="duel-title">Which was better?</div>
        <div className="duel-sub">
          {left <= 1 ? 'Last one' : `About ${left} more`} · placing {show.artist}
        </div>
      </div>

      <div className="duel-cards">
        <button className="duel-card" onClick={() => vote(true)} disabled={saving}>
          <span className="duel-card-bg" style={bg(show)} />
          <span className="duel-card-scrim" />
          <span className="duel-card-tag">just logged</span>
          <span className="duel-card-info">
            <span className="duel-card-artist">{show.artist}</span>
            <span className="duel-card-meta">
              {[show.venue, show.date ? formatDate(show.date) : ''].filter(Boolean).join(' · ')}
            </span>
          </span>
        </button>

        <div className="duel-vs">VS</div>

        <button className="duel-card" onClick={() => vote(false)} disabled={saving}>
          <span className="duel-card-bg" style={bg(opponent)} />
          <span className="duel-card-scrim" />
          <span className="duel-card-info">
            <span className="duel-card-artist">{opponent.artist}</span>
            <span className="duel-card-meta">
              {[opponent.venue, opponent.date ? formatDate(opponent.date) : ''].filter(Boolean).join(' · ')}
            </span>
          </span>
        </button>
      </div>

      {/* An early exit still places the show — at the best guess so far — so
          this is "close enough", not "discard what I just told you". */}
      <button className="duel-enough" onClick={() => commit(state)} disabled={saving}>
        Good enough — place it here
      </button>
    </div>
  );
}
