// YearScope — the year carried from Stats into a destination page.
// ================================================================
// Stats' tiles show YEAR-SCOPED numbers ("3 Shows" in 2024), so the page a tile
// opens has to show that same year or the number is a lie. `navigate(page, {
// year })` sets the scope and every other navigate clears it (see App.jsx), so
// it can't leak into a page opened from the nav bar later.
//
// The banner is not decoration: a silently filtered page is worse than no
// filter, because a user who sees 3 artists and owns 80 assumes data loss. It
// always states the scope and always offers the way out.

import { useMemo } from 'react';
import { useApp } from '../App';
import { getYear } from '../store';

/** Filter a show list to the active Stats year. Returns the list untouched when
 *  there's no scope, so callers can use it unconditionally. */
export function useYearScope(shows) {
  const { statsYear } = useApp();
  const scoped = useMemo(() => {
    if (!statsYear) return shows;
    return shows.filter((s) => s?.date && getYear(s.date) === statsYear);
  }, [shows, statsYear]);
  return { scoped, statsYear };
}

/** Renders nothing when unscoped. */
export default function YearScopeBanner() {
  const { statsYear, setStatsYear } = useApp();
  if (!statsYear) return null;
  return (
    <div className="yearscope">
      <span className="yearscope-txt">
        Showing <b>{statsYear}</b>
      </span>
      <button type="button" className="yearscope-clear" onClick={() => setStatsYear(null)}>
        Show all time
      </button>
    </div>
  );
}
