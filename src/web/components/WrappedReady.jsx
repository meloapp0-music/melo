// WrappedReady — the moment the season opens.
// ===========================================
// Spotify Wrapped's reach comes from everyone posting inside the same 48
// hours. A year-in-review sitting quietly on a profile page gets none of that.
// This is the announcement: for the first two weeks of December, the year you
// just finished is the first thing on Home.
//
// Two weeks, not forever — a permanent banner is furniture, and the urgency is
// the mechanic. After that it goes back to being a card in the Wrapped archive.
//
// docs/initiatives/2026-07-31-wrapped-season.md

import { useMemo, useState } from 'react';
import { useApp } from '../App';
import { isAttended, getYear } from '../store';
import { isUnlocked, localDate, unlockDate } from '../lib/wrappedSeason';
import { track } from '../lib/analytics';

/** How long the announcement stays up once the season opens. */
const WINDOW_DAYS = 14;

export default function WrappedReady() {
  const { shows, dayStamp, setWrappedYear } = useApp();
  const [dismissed, setDismissed] = useState(() => {
    try { return !!localStorage.getItem(`melo_wrapped_seen_${new Date().getFullYear()}`); } catch { return false; }
  });

  const info = useMemo(() => {
    const today = localDate();
    const year = Number(today.slice(0, 4));
    if (!isUnlocked(year, today)) return null;

    // Only for the first fortnight of the season.
    const since = Math.round(
      (new Date(`${today}T00:00:00`) - new Date(`${unlockDate(year)}T00:00:00`)) / 86400000
    );
    if (since > WINDOW_DAYS) return null;

    const count = (shows || []).filter((s) => isAttended(s) && getYear(s.date) === year).length;
    // A Wrapped with nothing in it is a worse moment than no moment.
    if (count < 2) return null;
    return { year, count };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shows, dayStamp]);

  if (!info || dismissed) return null;

  const open = () => {
    track('wrapped_opened', { year: info.year, source: 'season_card' });
    try { localStorage.setItem(`melo_wrapped_seen_${info.year}`, '1'); } catch { /* ignore */ }
    setDismissed(true);
    setWrappedYear(info.year);
  };

  return (
    <button className="wrapready-card" onClick={open}>
      <span className="wrapready-glow" aria-hidden="true" />
      <span className="wrapready-body">
        <span className="wrapready-eyebrow">It’s here</span>
        <span className="wrapready-head">Your {info.year} Wrapped</span>
        <span className="wrapready-sub">{info.count} shows. One story.</span>
        <span className="wrapready-cta">▶  Watch it</span>
      </span>
    </button>
  );
}
