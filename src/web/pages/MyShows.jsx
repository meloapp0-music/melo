// The Drawer — ported from the Sleek design (project e0ITdp4pfIU, "Shows" v14).
// =============================================================================
// A shoebox of ticket stubs: rotated cards in the artist's colour, stacked with
// a slight overlap, newest on top.
//
// THE ONE THING THAT COULDN'T BE COPIED. The export positions its three stubs
// absolutely at hardcoded offsets — top-0, top-[280px], top-[480px] inside a
// min-h-[900px] box. That cannot render 38 shows, and it breaks the moment a
// stub's content changes height (a festival stub is taller than a single show).
// So the stack is normal flow with a negative top margin, which reproduces the
// overlap and the rotation while working for any number of items of any height.
// The look is ported; the layout mechanism is not.
//
// THE CREAM STUB. The design's topmost card is cream with dark text, a dashed
// rule and an ADMIT ONE badge, while the ones beneath are dark with white text.
// Nothing in the export says why, and the same arrangement appears in
// drawer-full-night — top card cream, rest coloured. Read here as "the most
// recent night is the ticket in your hand": the first stub gets the cream
// treatment, everything below it gets its artist colour. That also keeps the
// palette honest, since getArtistGradient deliberately contains no light
// swatch — every one of its eight is dark enough for white text.
//
// KEPT AGAINST THE DESIGN: the Attended / Wishlist / Going tabs. The export
// draws only the attended stack, and removing the tabs would leave shows you're
// going to and shows you want with no route to them anywhere in the app. That's
// a functional regression rather than a styling choice, so they stay — restyled
// into the design's language rather than deleted.
//
// DROPPED: the grid/list view toggle, the genre chips, favourites-only and
// festivals-only filters. All recoverable from git.

import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../App';
import { scoreText } from '../lib/ranking';
import YearScopeBanner, { useYearScope } from '../components/YearScope';
import Icon from '../components/Icon';
import {
  getArtistGradient, formatDate, daysUntil,
  SHOW_STATUS, getShowStatus, groupIntoOutings,
} from '../store';

// Honest "how soon" label for a future-dated show. Empty for anything past, so
// it never clutters the attended stack.
function upcomingLabel(dateStr) {
  if (!dateStr) return '';
  const d = daysUntil(dateStr);
  if (d < 0) return '';
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d <= 14) return `In ${d} days`;
  if (d <= 60) return `In ${Math.round(d / 7)} weeks`;
  return `In ${Math.round(d / 30)} months`;
}

// Deterministic per-index tilt, so the stack looks laid down by hand and a
// given show always sits at the same angle across renders.
// rotate-N / -rotate-N, NOT rotate-[Ndeg]. Tailwind v4 takes a bare number as
// degrees and does not compile the bracketed form — the export uses
// rotate-[-4deg] etc., which works under the browser CDN build it ships with
// and silently produces nothing here. Six values so a long drawer doesn't
// visibly repeat, all odd angles so no two adjacent stubs look parallel.
const TILTS = ['rotate-1', '-rotate-3', 'rotate-2', '-rotate-2', 'rotate-3', '-rotate-1'];

const LABEL = 'font-sans uppercase tracking-[0.4em] text-[10px] font-black text-muted-foreground';
const STUB_META = 'font-sans uppercase tracking-[0.3em] text-[8px] font-black opacity-60';

const TABS = [
  [SHOW_STATUS.ATTENDED, 'Preserved'],
  [SHOW_STATUS.GOING, 'Going'],
  [SHOW_STATUS.WISHLIST, 'Wishlist'],
];

export default function MyShows() {
  const { shows: allShows, setSelectedShow, setSelectedFestival, showScore } = useApp();
  const { scoped: shows } = useYearScope(allShows);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState(SHOW_STATUS.ATTENDED);

  useEffect(() => { setSearch(''); }, [activeTab]);

  const base = shows.filter((s) => getShowStatus(s) === activeTab);

  const filtered = useMemo(() => {
    let list = base;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        s.artist.toLowerCase().includes(q) ||
        s.venue.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q));
    }
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [base, search]);

  // Attended collapses festivals into one stub — a weekend is one outing, the
  // same entity rule the ranking system uses. Going/Wishlist have no festivals.
  const displayItems = useMemo(() => {
    if (activeTab !== SHOW_STATUS.ATTENDED) {
      return filtered.map((s) => ({ isFestival: false, key: s.id, show: s, date: s.date }));
    }
    return groupIntoOutings(filtered, showScore).sort((a, b) => new Date(b.date) - new Date(a.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, activeTab]);

  const total = displayItems.length;

  return (
    <div className="min-h-screen bg-background pb-56 relative overflow-x-hidden selection:bg-accent/30">
      <div className="fixed inset-x-0 top-0 h-64 bg-gradient-to-b from-accent/15 via-accent/5 to-transparent pointer-events-none z-[60]" />

      <div className="relative z-10">
        <header className="px-8 pt-20 flex justify-between items-baseline relative">
          <div>
            <h1 className="font-serif italic text-5xl tracking-tighter text-foreground">The Drawer</h1>
            <p className={`${LABEL} mt-2`}>
              {total} {total === 1 ? 'show' : 'shows'} preserved
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSearching((v) => !v)}
            aria-label="Search the drawer"
            aria-pressed={searching}
            className="size-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground border border-border active:scale-95 transition-transform shrink-0"
          >
            <Icon name={searching ? 'ph:x-bold' : 'ph:magnifying-glass'} size={20} />
          </button>
        </header>

        {searching && (
          <div className="px-8 mt-6">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Artist, venue or city"
              className="w-full bg-card border border-border rounded-sm px-5 py-4 font-serif italic text-xl text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-muted-foreground/40"
            />
          </div>
        )}

        {/* Not in the export. Kept because deleting it would leave Going and
            Wishlist shows unreachable from anywhere in the app. */}
        <div className="px-8 mt-8 flex gap-6">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`font-sans uppercase tracking-[0.3em] text-[9px] font-black pb-2 border-b transition-colors ${
                activeTab === id
                  ? 'text-foreground border-accent'
                  : 'text-muted-foreground border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <YearScopeBanner />

        {total === 0 ? (
          <div className="px-8 mt-20 py-16 border-y border-dashed border-border text-center">
            <p className="font-serif italic text-2xl text-muted-foreground/60">
              {search ? 'Nothing matches that.' : 'The drawer is empty.'}
            </p>
          </div>
        ) : (
          <div className="mt-16 px-8">
            {displayItems.map((item, i) => {
              const fest = item.isFestival;
              const show = item.show;
              const artist = fest ? item.festival : show.artist;
              const sc = fest ? item.score : showScore(show);
              const where = fest
                ? (item.shows?.[0]?.city || '')
                : [show.venue, show.city].filter(Boolean).join(' · ');
              const soon = upcomingLabel(fest ? item.dateStart : show.date);
              // Newest stub is the ticket in your hand — cream, dark ink.
              const cream = i === 0;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => (fest ? setSelectedFestival(item) : setSelectedShow(show))}
                  className={`block w-full text-left p-8 shadow-2xl rounded-sm border-l-[12px] active:scale-95 transition-transform ${TILTS[i % TILTS.length]} ${
                    i === 0 ? '' : '-mt-6'
                  } ${cream ? 'border-l-black/5' : 'border-l-black/20'}`}
                  style={{
                    background: cream ? 'var(--secondary)' : getArtistGradient(artist),
                    // Each stub must paint over the one below it, or the
                    // overlap reads as the stack being upside down.
                    position: 'relative',
                    zIndex: displayItems.length - i,
                  }}
                >
                  <div className={cream ? 'text-foreground space-y-12' : 'text-white/90 space-y-8'}>
                    <div
                      className={`flex justify-between items-start gap-4 pb-6 border-b ${
                        cream ? 'border-dashed border-foreground/20' : 'border-white/10'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-sans uppercase tracking-[0.4em] text-[8px] opacity-40 mb-1 font-black italic">
                          Archive Item #{String(total - i).padStart(3, '0')}
                        </p>
                        <h2
                          className={`font-serif italic uppercase tracking-tighter truncate ${
                            cream ? 'text-4xl' : 'text-3xl'
                          }`}
                        >
                          {artist}
                        </h2>
                      </div>
                      {cream ? (
                        <div className="px-3 py-1 border border-foreground font-sans font-black tracking-[0.3em] text-[7px] shrink-0">
                          Admit One
                        </div>
                      ) : sc > 0 ? (
                        <p className="font-serif italic text-xl opacity-30 shrink-0">{scoreText(sc)}</p>
                      ) : (
                        <Icon name="ph:check-circle-fill" size={18} className="opacity-30 shrink-0" />
                      )}
                    </div>

                    <div className="flex items-end justify-between gap-4">
                      <p
                        className={
                          cream
                            ? 'font-serif italic text-xl opacity-60 truncate'
                            : `${STUB_META} truncate`
                        }
                      >
                        {where || formatDate(fest ? item.dateStart : show.date)}
                        {fest && item.shows?.length ? ` · ${item.shows.length} acts` : ''}
                        {soon ? ` · ${soon}` : ''}
                      </p>
                      {cream && sc > 0 && (
                        <p className="font-serif italic text-3xl opacity-30 shrink-0">{scoreText(sc)}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
