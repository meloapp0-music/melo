// The Bill — the leaderboard as a letterpress gig poster.
// =======================================================
// Rank is expressed by TYPE SIZE, the way a real concert bill works: headliner
// enormous, support smaller, undercard in a dense block at the foot. No rank
// numbers, no crowns, no podium — the poster carries no scores at all, which
// is what makes it worth posting rather than worth glancing at.
//
// A second view, THE RANKING, is a plain numbered list WITH scores. The poster
// is for looking at; the list is for finding a specific show. Without it there
// would be nowhere in the app to see your ranked order with the numbers on it.
//
// WHY THE LINE-BREAKING AND SIZING HAPPEN HERE AND NOT IN A DESIGN TOOL:
// every generated version of this screen either clipped the headline at the
// margin or overflowed tier 2, five rounds running, because fitting type to a
// width means measuring rendered text and no generator can. FitText measures.
// `posterLines` decides where a long name breaks so each line can then fill
// the sheet — "RADIOHEAD" becomes RADIO / HEAD, which is the effect that makes
// it read as one broken name rather than two words.

import { useMemo, useState } from 'react';
import FitText from './FitText';
import { meloScore, scoreText } from '../lib/ranking';

const LABEL = 'font-sans uppercase tracking-[0.4em] text-[10px] font-black text-muted-foreground';

/** Display name for an entity — a festival is one thing, not its lineup. */
const nameOf = (e) => (e.isFestival ? e.festival : e.lead?.artist) || 'Unknown';

/**
 * Break a name into `want` balanced lines so each can be fitted to the full
 * width. A single long word is split near its midpoint (RADIOHEAD -> RADIO /
 * HEAD); multi-word names break at the word boundary closest to balanced.
 */
export function posterLines(name, want = 2) {
  const s = String(name || '').trim();
  if (!s) return [''];
  if (want <= 1) return [s];

  const words = s.split(/\s+/);
  if (words.length === 1) {
    // One word: only worth splitting if it's long enough that a single line
    // would have to be set tiny to fit.
    if (s.length < 8) return [s];
    const mid = Math.round(s.length / 2);
    return [s.slice(0, mid), s.slice(mid)];
  }

  // Multi-word: choose the break that leaves the two lines closest in length.
  let best = 1;
  let bestDelta = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length;
    const b = words.slice(i).join(' ').length;
    const delta = Math.abs(a - b);
    if (delta < bestDelta) { bestDelta = delta; best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

/**
 * Deterministic per-name type treatment. Real bills mix condensed against wide
 * and italic against upright — but this is generated per user, so it must be
 * stable: the same artist always renders the same way and a poster never
 * reshuffles between opens. Same hash shape as getArtistGradient.
 */
function treatment(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % 2 === 0
    ? 'font-sans font-black uppercase tracking-tight'
    : 'font-serif italic font-semibold';
}

export default function TheBill({ entities, positions, placedCount, stats, onOpen }) {
  const [view, setView] = useState('bill');

  const tiers = useMemo(() => ({
    head: entities[0] || null,
    two: entities.slice(1, 3),
    three: entities.slice(3, 8),
    under: entities.slice(8),
  }), [entities]);

  if (!entities.length) return null;

  const Toggle = (
    <div className="flex items-center justify-between gap-4 px-8 pt-6 pb-8">
      <div className="flex border border-border rounded-sm overflow-hidden">
        {[['bill', 'The Bill'], ['ranking', 'The Ranking']].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`px-5 py-3 font-sans font-black uppercase tracking-[0.2em] text-[10px] transition-colors ${
              view === id ? 'bg-foreground text-background' : 'text-muted-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  if (view === 'ranking') {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-background pb-12 relative">
        {Toggle}
        <div className="px-8">
          {entities.map((e, i) => {
            const pos = positions[e.key];
            const score = pos ? scoreText(meloScore(pos, placedCount)) : null;
            return (
              <button
                key={e.key}
                type="button"
                onClick={() => onOpen?.(e)}
                className="w-full text-left flex items-baseline gap-5 py-5 border-b border-border active:scale-[0.99] transition-transform"
              >
                <span className="font-sans font-black tabular-nums text-[11px] text-muted-foreground w-7 shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-serif italic text-xl text-foreground truncate">
                    {nameOf(e)}
                    {e.isFestival && e.shows.length > 1 && (
                      <span className={`${LABEL} ml-3`}>{e.shows.length} acts</span>
                    )}
                  </span>
                  <span className={`${LABEL} block mt-1 truncate`}>
                    {[e.venue, e.city].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {score && (
                  <span className="font-serif italic text-xl text-muted-foreground/50 shrink-0">
                    {score}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- THE BILL -------------------------------------------------------
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background pb-10 relative">
      {Toggle}

      <div className="px-6 text-center">
        <p className={`${LABEL} mb-2`}>Melo Presents</p>
        <p className="font-serif italic text-3xl tracking-tight text-foreground mb-5">
          The All-Time Bill
        </p>

        {/* Headliner. Each line fitted independently so both fill the sheet
            edge to edge; leading is tight so the two read as one broken name. */}
        {tiers.head && (
          <button
            type="button"
            onClick={() => onOpen?.(tiers.head)}
            className="block w-full active:scale-[0.99] transition-transform"
          >
            {posterLines(nameOf(tiers.head)).map((line, i) => (
              <FitText
                key={i}
                className="font-sans font-black uppercase tracking-tight text-foreground"
                style={{ lineHeight: 0.82 }}
                max={140}
              >
                {line}
              </FitText>
            ))}
          </button>
        )}

        {/* Tier 2 — one line, both names and the dot, shrunk until they fit.
            Never stacked: on a bill, equal size means equal billing, so
            splitting them across lines reads as two different ranks. */}
        {tiers.two.length > 0 && (
          <>
            <div className="h-px bg-border my-5" />
            <FitText className="text-foreground" style={{ lineHeight: 1.1 }} max={40}>
              {tiers.two.map((e, i) => (
                <span key={e.key}>
                  {i > 0 && <span className="text-accent mx-3">·</span>}
                  <span
                    className={treatment(nameOf(e))}
                    onClick={(ev) => { ev.stopPropagation(); onOpen?.(e); }}
                  >
                    {nameOf(e)}
                  </span>
                </span>
              ))}
            </FitText>
          </>
        )}

        {/* Tier 3 — flows across lines, each name at a fixed middling size. */}
        {tiers.three.length > 0 && (
          <>
            <div className="h-px bg-border my-5" />
            <div className="flex flex-wrap justify-center items-baseline gap-x-5 gap-y-1">
              {tiers.three.map((e) => (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => onOpen?.(e)}
                  className={`${treatment(nameOf(e))} text-[22px] leading-tight text-foreground`}
                >
                  {nameOf(e)}
                </button>
              ))}
            </div>
          </>
        )}

        {/* The undercard — dense, justified, the way a festival poster lists
            everyone below the fold. */}
        {tiers.under.length > 0 && (
          <p className="mt-6 font-sans font-bold uppercase tracking-[0.08em] text-[10px] leading-[1.7] text-foreground/80">
            {tiers.under.map((e, i) => (
              <span key={e.key}>
                {i > 0 && <span className="text-muted-foreground/50 mx-1.5">·</span>}
                <span className={treatment(nameOf(e)).includes('serif') ? 'font-serif italic' : ''}>
                  {nameOf(e)}
                </span>
              </span>
            ))}
          </p>
        )}

        <div className="h-[3px] bg-foreground mt-7 mb-4" />

        <div className="flex items-baseline justify-between gap-3">
          <span className={LABEL}>{stats.shows} Shows</span>
          <span className={LABEL}>{stats.cities} Cities</span>
          {/* The year range carries the most weight of the three — it's how
              long they've been doing this, and it's the line worth posting. */}
          <span className="font-serif italic text-lg text-foreground">{stats.years}</span>
        </div>

        <p className="font-sans uppercase tracking-[0.3em] text-[8px] font-black text-muted-foreground/70 mt-3">
          {stats.pressed}
        </p>
      </div>
    </div>
  );
}
