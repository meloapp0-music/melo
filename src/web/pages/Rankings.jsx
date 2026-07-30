import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../App';
import { getArtistGradient, formatDate, isAttended } from '../store';
import { getRankings, saveRankings, getPositions } from '../lib/db/rankings';
import { rankedOrder, meloScore, scoreText } from '../lib/ranking';

function getRandomPair(shows, seen) {
  if (shows.length < 2) return null;
  const shuffled = [...shows].sort(() => Math.random() - 0.5);
  for (let i = 0; i < shuffled.length; i++) {
    for (let j = i + 1; j < shuffled.length; j++) {
      const key = [shuffled[i].id, shuffled[j].id].sort().join('-');
      if (!seen.has(key)) return [shuffled[i], shuffled[j]];
    }
  }
  return [shuffled[0], shuffled[1]];
}

export default function Rankings() {
  const { shows, navigate, setSelectedShow, getArtistImage, session, openOverlay } = useApp();
  const userId = session?.user?.id;
  const attended = shows.filter(isAttended);
  const [elo, setElo] = useState({});
  // The TRUE order, from binary-insertion placement at log time. Where a show
  // has a position, it wins outright — ELO is an estimate over random pairs and
  // this is an answer the user actually gave. See lib/ranking.js.
  const [positions, setPositions] = useState({});
  const [seen, setSeen] = useState(new Set());
  const [pair, setPair] = useState(null);

  // Load rankings from Supabase on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [map, pos] = await Promise.all([getRankings(), getPositions()]);
        if (cancelled) return;
        setElo(map);
        setPositions(pos);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Melo] getRankings failed', err);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const refreshPair = useCallback(() => {
    setPair(getRandomPair(attended, seen));
  }, [attended, seen]);

  useEffect(() => {
    if (!pair && attended.length >= 2) refreshPair();
  }, [attended.length]);

  const handleVote = (winnerId, loserId) => {
    const K = 32;
    const wElo = elo[winnerId] || 1200;
    const lElo = elo[loserId] || 1200;
    const expected = 1 / (1 + Math.pow(10, (lElo - wElo) / 400));
    const newElo = {
      ...elo,
      [winnerId]: Math.round(wElo + K * (1 - expected)),
      [loserId]: Math.round(lElo + K * (0 - (1 - expected))),
    };
    setElo(newElo);
    // Fire-and-forget; only persist the two that changed.
    if (userId) {
      saveRankings(
        { [winnerId]: newElo[winnerId], [loserId]: newElo[loserId] },
        userId,
      ).catch((err) => console.error('[Melo] saveRankings failed', err));
    }
    const key = [winnerId, loserId].sort().join('-');
    setSeen((prev) => new Set([...prev, key]));
    setPair(getRandomPair(attended, new Set([...seen, key])));
  };

  // Placed shows first, in the order the user gave; anything never placed
  // trails behind by score. Falls back to pure ELO order for a library that
  // predates ranking entirely.
  const hasPlacements = Object.keys(positions).length > 0;
  const ranked = hasPlacements
    ? rankedOrder(attended, positions).map((s) => ({ ...s, elo: elo[s.id] || 1200 }))
    : [...attended].map((s) => ({ ...s, elo: elo[s.id] || 1200 })).sort((a, b) => b.elo - a.elo);

  const getMedal = (i) => {
    if (i === 0) return 'gold';
    if (i === 1) return 'silver';
    if (i === 2) return 'bronze';
    return '';
  };

  const bgStyle = (artist) => {
    const img = getArtistImage(artist);
    return img
      ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: getArtistGradient(artist) };
  };

  // Shows that have never been placed. The log-time duel only ever sees NEW
  // shows, so without this a library logged before ranking existed stays
  // ordered by the compressed 1–10 score this was meant to replace.
  const unplaced = attended.filter((s) => !positions[s.id]);

  return (
    <div className="page page-top">
      {unplaced.length > 0 && (
        <div className="backlog-card">
          <div className="backlog-head">
            {hasPlacements ? 'Finish your ranking' : 'Rank your shows'}
          </div>
          <div className="backlog-sub">
            {unplaced.length} {unplaced.length === 1 ? 'show has' : 'shows have'} never been
            placed. A few taps each and every one gets a real score.
          </div>
          <button
            className="backlog-cta"
            onClick={() => openOverlay('rank', { queue: unplaced.slice(0, 10) })}
          >
            {unplaced.length > 10 ? 'Rank the next 10' : `Rank ${unplaced.length === 1 ? 'it' : 'them'}`} →
          </button>
        </div>
      )}

      {/* Battle Section */}
      {attended.length >= 2 && pair && (
        <div className="rank-battle">
          <h2 className="rank-battle-title">Battle Mode</h2>
          <p className="rank-battle-sub">Pick the better show</p>
          <div className="rank-battle-cards">
            <div
              className="rank-battle-card"
              onClick={() => handleVote(pair[0].id, pair[1].id)}
            >
              <div className="gradient-bg" style={bgStyle(pair[0].artist)} />
              <div className="rank-battle-card-overlay" />
              <div className="rank-battle-card-info">
                <div className="rank-battle-card-artist">{pair[0].artist}</div>
                <div className="rank-battle-card-venue">{pair[0].venue}</div>
              </div>
            </div>
            <div className="rank-vs">VS</div>
            <div
              className="rank-battle-card"
              onClick={() => handleVote(pair[1].id, pair[0].id)}
            >
              <div className="gradient-bg" style={bgStyle(pair[1].artist)} />
              <div className="rank-battle-card-overlay" />
              <div className="rank-battle-card-info">
                <div className="rank-battle-card-artist">{pair[1].artist}</div>
                <div className="rank-battle-card-venue">{pair[1].venue}</div>
              </div>
            </div>
          </div>
          <button className="rank-skip" onClick={refreshPair}>
            Skip
          </button>
        </div>
      )}

      {/* Rankings List */}
      <div className="rank-section" style={{ padding: '24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3>Leaderboard</h3>
          <button className="back-btn" onClick={() => navigate('you')}>
            <svg viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            You
          </button>
        </div>
        <div className="rank-list">
          {ranked.map((show, i) => (
            <div
              key={show.id}
              className={`rank-item ${getMedal(i)}`}
              onClick={() => setSelectedShow(show)}
            >
              <div className={`rank-position ${getMedal(i)}`}>
                {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
              </div>
              <div className="rank-thumb" style={bgStyle(show.artist)} />
              <div className="rank-info">
                <div className="rank-artist">{show.artist}</div>
                <div className="rank-meta">
                  {show.venue} &middot; {formatDate(show.date)}
                </div>
              </div>
              <div className="rank-elo">
                {positions[show.id]
                  ? scoreText(meloScore(positions[show.id], Object.keys(positions).length))
                  : <span className="rank-unplaced">–</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
