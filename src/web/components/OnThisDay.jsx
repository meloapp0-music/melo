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
// The gradient fallback and the formatted date both went with the old card —
// the ported block shows the year alone, and omits the print entirely rather
// than filling it with a generated gradient that isn't a photograph.
import { isAttended } from '../store';
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
  const img = (show.photos || [])[0] || getArtistImage(show.artist);
  const year = String(show.date || '').slice(0, 4);

  const open = () => {
    track('anniversary_opened', { years, source: 'home_card' });
    // Straight to the reel on its own cut — the card promised a memory, so it
    // should deliver the memory, not a detail page with a button on it.
    openOverlay('show', { show });
    openOverlay('recap', { show, cutId: 'anniversary' });
  };

  // Ported from the Sleek design's "One year ago" block. It was a full-bleed
  // photo card with a scrim; the design makes it a line of the user's own
  // writing with the photograph beside it as a small tilted print. The note
  // leads because the note is the memory — the photo is evidence.
  return (
    <section className="px-8">
      <p className="font-sans uppercase tracking-[0.4em] text-[10px] font-black text-muted-foreground mb-8 italic">
        {agoLabel(years)}
      </p>
      <button
        type="button"
        onClick={open}
        className="w-full flex items-center gap-8 text-left active:scale-95 transition-transform"
      >
        <div className="flex-1 space-y-4 min-w-0">
          <p className="font-serif italic text-3xl text-foreground">{year}</p>
          <p className="font-serif italic text-xl leading-snug text-foreground line-clamp-2">
            {/* The note if they wrote one, otherwise the fact of the night.
                A blank quote mark would be worse than no quote at all. */}
            {show.notes?.trim()
              ? `“${show.notes.trim()}”`
              : <>You saw <b>{show.artist}</b>{show.venue ? ` at ${show.venue}` : ''}</>}
          </p>
        </div>
        {img && (
          <div className="shrink-0">
            <div className="bg-white p-1.5 shadow-md border border-border rotate-3">
              <img src={img} alt="" className="size-20 object-cover" />
            </div>
          </div>
        )}
      </button>
    </section>
  );
}
