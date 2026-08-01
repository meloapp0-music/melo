// RankDuel — "which would you relive?", asked at the right moment.
// ================================================================
// Opens right after a show is logged, while the user is still thinking about
// it, and binary-searches it into their ranked library in 2–5 taps.
//
// THE WORDING IS THE POINT. Beli asks "which was better?" — a quality
// judgement, which is fine for restaurants and wrong here: it reads as scoring
// the artist rather than remembering the night, and that's the thing people
// object to about ranking music. "Which would you relive?" asks the same
// question of the same data and gets a better answer, because it's what people
// are actually comparing — the mediocre band on the night you fell in love
// beats the technically better show you saw alone, and everyone knows it.
//
// This replaces asking for a number. A 1–10 score compresses — nobody goes to
// shows they expect to hate — so libraries cluster at 8–10 and the resulting
// "order" is mostly ties. A comparison is easy and honest, and ⌈log₂(n+1)⌉ of
// them place a show exactly. The algorithm is in lib/ranking.js; this is only
// the surface. docs/initiatives/2026-07-28-ia-simplification.md

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate, isAttended, festivalKey } from '../store';
import { savePositions, getPositions } from '../lib/db/rankings';
import {
  startPlacement, nextOpponent, answer, isPlaced, place, placementIndex, remaining,
  rankedEntities, toPositions, meloScore, scoreText, bucketOf,
  entityKeyOf, OUTING_SCOPE,
} from '../lib/ranking';
import { track } from '../lib/analytics';

/**
 * Places ENTITIES, not show rows — a twelve-act festival is one thing to rank.
 *
 *   show / queue  — the entities to place. Each is a show; its festival (if any)
 *                   is what actually gets ranked.
 *   scope         — 'outing' (default) ranks festivals and standalone shows
 *                   together. 'festival:<key>' ranks the sets inside one
 *                   festival against each other only.
 *   pool          — the shows this scope ranks among. Defaults to the whole
 *                   attended library; a festival scope passes its own sets.
 */
export default function RankDuel({ show, queue, scope = OUTING_SCOPE, pool, onClose }) {
  const { shows, getArtistImage, session, showToast, rankPositions, setRankPositions } = useApp();
  const userId = session?.user?.id || null;
  const isFestivalScope = scope !== OUTING_SCOPE;

  const line = useMemo(() => (queue?.length ? queue : [show]).filter(Boolean), [queue, show]);
  const [round, setRound] = useState(0);
  const current = line[round] || null;

  const [state, setState] = useState(null);
  const [done, setDone] = useState(null); // { rank, total, displaced } once placed
  const [saving, setSaving] = useState(false);

  // Live positions for THIS scope. Placing entity #2 of a queue has to see where
  // #1 landed, so it's re-read each round rather than captured once. A festival
  // scope starts from its own stored order, fetched on mount.
  const posRef = useRef(isFestivalScope ? {} : (rankPositions || {}));
  const [ready, setReady] = useState(!isFestivalScope);
  useEffect(() => {
    if (!isFestivalScope) return undefined;
    let gone = false;
    getPositions(scope)
      .then((p) => { if (!gone) { posRef.current = p || {}; setReady(true); } })
      .catch(() => { if (!gone) setReady(true); }); // empty order is a valid start
    return () => { gone = true; };
  }, [scope, isFestivalScope]);

  // The shows this scope ranks among.
  const universe = useMemo(
    () => (pool?.length ? pool : (shows || []).filter(isAttended)),
    [pool, shows]
  );
  // At outing scope the candidate is its ENTITY; inside a festival, each set is
  // ranked as itself.
  const keyOf = useMemo(
    () => (isFestivalScope ? (s) => s.id : entityKeyOf),
    [isFestivalScope]
  );
  const byKey = useMemo(() => {
    const m = {};
    universe.forEach((s) => { const k = keyOf(s); if (!m[k]) m[k] = s; });
    return m;
  }, [universe, keyOf]);

  useEffect(() => {
    if (!current || !ready) return;
    const currentKey = keyOf(current);
    // ONLY entities that already hold a position are comparison candidates.
    //
    // This is correctness, not tidiness: binary search requires a sorted list.
    // Unplaced entities have no true order, so interleaving them by score would
    // hand the search an unsorted array and it would confidently return the
    // wrong slot. The ranked set builds up from nothing instead — the first is
    // #1 unopposed, the second costs one question.
    const placed = universe.filter((s) => keyOf(s) !== currentKey && posRef.current[keyOf(s)]);
    const ordered = isFestivalScope
      ? placed.map((s) => s.id).sort((a, b) => posRef.current[a] - posRef.current[b])
      : rankedEntities(placed, posRef.current).map((e) => e.key);

    // Confine the search to the bucket picked at log time: fewer questions, and
    // it never asks whether a night you loved beat one you didn't — a
    // comparison with no useful answer. See lib/ranking.js BUCKETS.
    setState(startPlacement(ordered, currentKey, {
      bucket: bucketOf(current),
      bucketOf: (k) => bucketOf(byKey[k]),
    }));
    setDone(null);
    track('rank_duel_started', { library_size: ordered.length, queued: line.length, scope });
    // Keyed on round/ready only — re-running mid-placement would restart the
    // search under the user's fingers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, ready]);

  const opponentKey = state ? nextOpponent(state) : null;
  const opponent = opponentKey ? byKey[opponentKey] : null;
  // A festival opponent shows its festival name, not the first act's.
  const nameOf = (s) => {
    if (isFestivalScope || !s) return s?.artist || '';
    return festivalKey(s) ? (s.festival || '').trim() || s.artist : s.artist;
  };

  // Commit the placement. Also runs on "good enough" — `lo` is always the best
  // current guess, so an early exit is a real answer, not a discarded one.
  const commit = async (s) => {
    if (saving) return;
    setSaving(true);
    const ordered = place(s);
    const rank = placementIndex(s) + 1;
    // The entity this one just pushed down — i.e. the best night it beat.
    const displacedKey = ordered[rank]; // rank is 1-based, so this is the next one down
    setDone({
      rank,
      total: ordered.length,
      displaced: nameOf(byKey[displacedKey]),
      // Within a festival the number would collide with the outing's score, so
      // that scope reports a RANK only. One score per outing.
      score: isFestivalScope ? null : meloScore(rank, ordered.length),
    });
    track('rank_duel_finished', { questions: s.asked, rank, total: ordered.length, early: !isPlaced(s), scope });
    // Update state immediately so the leaderboard, the receipt and the "Where it
    // ranks" recap cut are correct before the round-trip lands — and so the NEXT
    // entity in the queue searches against the updated order.
    const nextPositions = toPositions(ordered);
    posRef.current = nextPositions;
    if (!isFestivalScope) setRankPositions?.(nextPositions);
    try {
      await savePositions(ordered, userId, scope);
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

  if (!current || !ready) return null;

  const more = line.length - 1 - round; // shows still queued behind this one

  // ---- Result ----
  if (done) {
    // The line has to earn its place under a huge numeral — repeating "#4 of 8"
    // underneath says nothing. Name the show it just displaced instead: that's
    // the concrete fact the user doesn't already have on screen.
    const beat = done.displaced;
    const blurb = done.rank === 1
      ? 'A new number one. Nothing you’ve seen beats it.'
      : beat
        ? `Better than ${beat}${done.rank <= 3 ? ' — top three material.' : '.'}`
        : done.rank === done.total
          ? 'Every other night edged it out.'
          : 'Placed.';
    return (
      <div className="duel-overlay">
        <div className="duel-result">
          {/* The score is the headline now — it's the number that shows up
              everywhere else — with the rank as its provenance underneath. */}
          <div className="duel-result-score">
            {done.score != null ? scoreText(done.score) : `#${done.rank}`}
          </div>
          <div className="duel-result-of">
            {done.score != null
              ? `#${done.rank} of ${done.total} outings`
              : `of ${done.total} sets`}
          </div>
          <div className="duel-result-line">{blurb}</div>
          {more > 0 ? (
            <>
              <button className="duel-done" onClick={() => setRound((r) => r + 1)}>
                Next show →
              </button>
              <button className="duel-enough" onClick={onClose}>
                {more} left — finish later
              </button>
            </>
          ) : (
            <button className="duel-done" onClick={onClose}>Done</button>
          )}
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
        <div className="duel-title">Which would you relive?</div>
        <div className="duel-sub">
          {left <= 1 ? 'Last one' : `About ${left} more`} · placing {nameOf(current)}
          {more > 0 && <span className="duel-queue"> · {more} to go</span>}
        </div>
      </div>

      <div className="duel-cards">
        <button className="duel-card" onClick={() => vote(true)} disabled={saving}>
          <span className="duel-card-bg" style={bg(current)} />
          <span className="duel-card-scrim" />
          {line.length === 1 && <span className="duel-card-tag">just logged</span>}
          <span className="duel-card-info">
            <span className="duel-card-artist">{nameOf(current)}</span>
            <span className="duel-card-meta">
              {[current.venue, current.date ? formatDate(current.date) : ''].filter(Boolean).join(' · ')}
            </span>
          </span>
        </button>

        <div className="duel-vs">VS</div>

        <button className="duel-card" onClick={() => vote(false)} disabled={saving}>
          <span className="duel-card-bg" style={bg(opponent)} />
          <span className="duel-card-scrim" />
          <span className="duel-card-info">
            <span className="duel-card-artist">{nameOf(opponent)}</span>
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
