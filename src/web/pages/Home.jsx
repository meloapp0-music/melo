// Home — ported from the Sleek design (project e0ITdp4pfIU, "Home Feed" v3).
// ==========================================================================
// Markup carried across from the export rather than reinterpreted, then bound
// to real data.
//
// This is the RICHER of the two Home directions in the project. The minimal
// "Home" v29 was ported first and swapped out: it put the friends feed in a
// small section at the foot of the page, where here the feed is the body of
// the page and everything above it is a masthead. That matches what Melo is
// meant to be — the review is the social currency, so other people's writing
// about their nights should be most of what Home is.
//
// Three deliberate deviations from the export:
//
//   * THE GRAIN. The export overlays a paper texture from Sleek's CDN. A
//     remote image on every screen is unacceptable in an app used in venues
//     with no signal — App.css already applies an inline SVG grain to <body>.
//   * THE WORDMARK. The export sets "melo" in italic Playfair; the shipped
//     mark is <MeloWordmark> and CLAUDE.md requires the component. The face is
//     still an open decision — if the serif wins it's three values in :root.
//   * THE COUNTDOWN. The export shows "03:14 UNTIL DOORS". Melo doesn't hold a
//     door time on the show record (ShowDayInfo fetches it on demand, on the
//     detail screen), so an hours:minutes countdown here would be invented.
//     Days-to-go instead, in the same ember treatment.

import { useMemo } from 'react';
import { useApp } from '../App';
import { isAttended, isGoing, daysUntil, groupIntoOutings } from '../store';
import { MeloWordmark } from '../components/MeloLogo';
import Icon from '../components/Icon';
import FriendsFeed from '../components/FriendsFeed';
import GetStarted from '../components/GetStarted';
import WrappedReady from '../components/WrappedReady';
import OnThisDay from '../components/OnThisDay';
import TasteNudge from '../components/TasteNudge';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "22 Oct" from YYYY-MM-DD, parsed by parts. `new Date('2026-10-22')` is UTC
// midnight, which renders as the 21st for anyone west of Greenwich.
function shortDate(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]}` : '';
}

const LABEL = 'font-sans uppercase tracking-[0.4em] text-[10px] font-black text-muted-foreground';

export default function Home() {
  const { shows, dayStamp, setSelectedShow, navigate } = useApp();

  const next = useMemo(() => (
    (shows || [])
      .filter(isGoing)
      .filter((s) => daysUntil(s.date) >= 0)
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [shows, dayStamp]);

  // Outings, not shows — a festival weekend is one outing, which is the whole
  // point of the entity keying in lib/ranking.js. Counting rows here would
  // disagree with You and with the leaderboard.
  const stats = useMemo(() => {
    const attended = (shows || []).filter(isAttended);
    return {
      outings: groupIntoOutings(attended).length,
      cities: new Set(attended.map((s) => (s.city || '').trim()).filter(Boolean)).size,
      artists: new Set(attended.map((s) => (s.artist || '').trim()).filter(Boolean)).size,
    };
  }, [shows]);

  const days = next ? daysUntil(next.date) : null;
  const heading = days === 0 ? 'Tonight' : days === 1 ? 'Tomorrow' : 'Up Next';

  return (
    <div className="min-h-screen bg-background pb-56 relative overflow-y-auto selection:bg-accent/30">
      {/* The warm top wash — the one place ember appears without being an
          action, and what stops bone paper reading as flat white at the head
          of the page. */}
      <div className="absolute inset-0 h-64 bg-gradient-to-b from-accent/10 via-accent/5 to-transparent pointer-events-none" />

      <div className="relative z-10">
        <header className="px-8 pt-16 flex justify-between items-baseline relative">
          <div>
            <MeloWordmark size={44} color="var(--foreground)" />
            <p className={`${LABEL} mt-2`}>The Archive · Vol. 01</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('festivals')}
            aria-label="Find shows"
            className="size-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground border border-border active:scale-95 transition-transform"
          >
            <Icon name="ph:magnifying-glass-bold" size={18} />
          </button>
        </header>
      </div>

      <section className="mt-16 px-8 relative z-10">
        {/* Conditional surfaces the design never drew a state for. They render
            nothing on an ordinary day, so they can't disturb it. */}
        <WrappedReady />
        <GetStarted />
        <TasteNudge />

        <p className={`${LABEL} mb-8`}>Your Archive</p>

        {next && (
          <div className="mb-20">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-serif italic text-7xl tracking-tighter leading-none text-foreground">
                {heading}
              </h2>
              <div className="flex flex-col items-end">
                <span className="font-sans font-extrabold text-2xl text-accent tabular-nums">
                  {days === 0 ? '—' : days}
                </span>
                <span className="font-sans uppercase tracking-[0.4em] text-[8px] font-black text-accent">
                  {days === 0 ? 'Doors soon' : days === 1 ? 'Day to go' : 'Days to go'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedShow(next)}
              className="w-full text-left bg-card border border-border p-6 rounded-sm flex flex-col gap-6 active:scale-[0.99] transition-transform"
            >
              <div className="min-w-0">
                <h3 className="font-serif italic text-4xl tracking-tighter text-foreground truncate">
                  {next.artist}
                </h3>
                <p className={`${LABEL} mt-2 truncate`}>
                  {[next.venue, next.city].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between items-center">
                <span className="font-serif italic text-lg text-foreground">
                  {shortDate(next.date)}
                </span>
                <span className="px-8 py-3 bg-accent text-background rounded-full font-sans font-black uppercase tracking-[0.4em] text-[9px]">
                  View Ticket
                </span>
              </div>
            </button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-8 mb-20 py-10 border-y border-border">
          {[
            [stats.outings, 'Outings'],
            [stats.cities, 'Cities'],
            [stats.artists, 'Artists'],
          ].map(([n, label], i) => (
            <div
              key={label}
              className={`flex flex-col items-center ${i === 1 ? 'border-x border-border' : ''}`}
            >
              <span className="text-3xl font-sans font-extrabold text-foreground tabular-nums">{n}</span>
              <span className="font-sans uppercase tracking-[0.4em] text-[8px] font-black text-muted-foreground mt-1 text-center">
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Renders only on an actual anniversary — absent almost every day. */}
        <OnThisDay />
      </section>

      <section className="relative z-10 px-8">
        <div className="flex items-center gap-4 mb-12">
          <p className={`${LABEL} whitespace-nowrap`}>Latest from friends</p>
          <div className="h-px flex-1 bg-border" />
        </div>
        <FriendsFeed />
      </section>
    </div>
  );
}
