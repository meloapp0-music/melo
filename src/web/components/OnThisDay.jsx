// OnThisDay — the anniversary card on Home.
// =========================================
// The push is the reach; this is the home. A notification nobody taps still has
// to land somewhere, and the ~360 days a year with no show are exactly when
// someone opens the app with nothing to do.
//
// Renders only when today actually is an anniversary, so it's absent almost
// always — which is what keeps it feeling like a find rather than furniture.
//
// docs/initiatives/2026-07-30-anniversaries.md

import { useMemo } from 'react';
import { useApp } from '../App';
import { isAttended, getArtistGradient, formatDate } from '../store';
import { pickAnniversary, agoLabel } from '../lib/anniversary';
import { track } from '../lib/analytics';

export default function OnThisDay() {
  const { shows, dayStamp, getArtistImage, setSelectedShow, openOverlay } = useApp();

  // `dayStamp` is App's local-calendar day key, refreshed on every foreground —
  // so this rolls over at midnight instead of freezing at mount, which matters
  // for a card whose entire premise is the date.
  const hit = useMemo(
    () => pickAnniversary((shows || []).filter(isAttended)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shows, dayStamp]
  );

  if (!hit) return null;
  const { show, years } = hit;
  const img = getArtistImage(show.artist);
  const bg = img
    ? { backgroundImage: `url("${img}")` }
    : { background: getArtistGradient(show.artist) };

  const open = () => {
    track('anniversary_opened', { years, source: 'home_card' });
    // Straight to the reel on its own cut — the card promised a memory, so it
    // should deliver the memory, not a detail page with a button on it.
    openOverlay('show', { show });
    openOverlay('recap', { show, cutId: 'anniversary' });
  };

  return (
    <button className="otd-card" onClick={open} style={bg}>
      <span className="otd-scrim" aria-hidden="true" />
      <span className="otd-body">
        <span className="otd-eyebrow">On this day</span>
        <span className="otd-head">{agoLabel(years)} tonight</span>
        <span className="otd-sub">
          You saw <b>{show.artist}</b>
          {show.venue ? ` at ${show.venue}` : ''} · {formatDate(show.date)}
        </span>
        <span className="otd-cta">▶  Relive it</span>
      </span>
    </button>
  );
}
