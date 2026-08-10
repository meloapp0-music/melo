// Home — ported from the Sleek design (project e0ITdp4pfIU, "Home" v29).
// ======================================================================
// Markup carried across from the export rather than reinterpreted, then bound
// to real data. Earlier this session the design was hand-translated from
// screenshots and had to be reverted; the utility classes ARE the design, so
// they travel verbatim and only the content becomes dynamic.
//
// The design is three sections — Upcoming, One year ago, The Circle — where
// this page used to carry eight. What that dropped is listed at the bottom of
// this comment, because a port that quietly deletes features is worse than one
// that says so.
//
// Two deliberate deviations from the export, both for reasons the export
// couldn't know about:
//
//   * THE GRAIN. The export overlays a paper texture from Sleek's CDN. A
//     remote image on every screen is unacceptable in a Capacitor app that has
//     to work in a venue with no signal — App.css already applies an inline
//     SVG grain to <body>, which is the same effect with no request.
//   * THE WORDMARK. The export sets "melo" in italic Playfair. The shipped
//     mark is <MeloWordmark> (Outfit 300) and CLAUDE.md requires using that
//     component rather than typesetting wordmark text. The face is still an
//     open decision — if the serif wins, it's three values in :root
//     (--font-wordmark / --wordmark-weight / --wordmark-tracking), not an edit
//     here.
//
// DROPPED relative to the old Home, all recoverable from git:
//   * "Up Next" hero cards — collapsed into the single Upcoming row the design
//     specifies. Co-attendee avatars ("Going with Sam") went with them.
//   * "You're Going" rail — shows more than a week out have no home in the
//     design.
//   * "Upcoming Shows" — the Ticketmaster discovery rail. This is a real
//     feature loss; Festivals still owns discovery.
//   * The greeting hero, the streak chip, and the taste bell.

import { useMemo } from 'react';
import { useApp } from '../App';
import { isGoing, daysUntil, festivalKey } from '../store';
import { MeloWordmark } from '../components/MeloLogo';
import Icon from '../components/Icon';
import FriendsFeed from '../components/FriendsFeed';
import GetStarted from '../components/GetStarted';
import WrappedReady from '../components/WrappedReady';
import OnThisDay from '../components/OnThisDay';
import TasteNudge from '../components/TasteNudge';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "22 Oct" / "2026" from a YYYY-MM-DD string, split because the design sets
// them at different sizes. Parsed by parts rather than through Date() — a
// `new Date('2026-10-22')` is UTC midnight, which renders as the 21st for
// anyone west of Greenwich.
function splitDate(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return { day: '', year: '' };
  return { day: `${d} ${MONTHS[m - 1]}`, year: String(y) };
}

export default function Home() {
  const { shows, dayStamp, setSelectedShow, navigate } = useApp();

  // The design shows ONE upcoming show, so this is the soonest one you're
  // going to at any distance — not the within-a-week bucket the old hero used.
  const next = useMemo(() => {
    return (shows || [])
      .filter(isGoing)
      .filter((s) => daysUntil(s.date) >= 0)
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shows, dayStamp]);

  const nextDate = splitDate(next?.date);
  const days = next ? daysUntil(next.date) : null;

  return (
    <div className="min-h-screen bg-background pb-56 relative overflow-y-auto selection:bg-accent/30">
      {/* The warm top wash. Present on every screen in the design and the one
          place ember appears without being an action — it's what stops bone
          paper reading as flat white at the head of a page. */}
      <div className="fixed inset-x-0 top-0 h-64 bg-gradient-to-b from-accent/15 via-accent/5 to-transparent pointer-events-none z-[60]" />

      <div className="relative z-10">
        <header className="px-8 pt-20 flex justify-between items-baseline relative">
          <div>
            <MeloWordmark size={44} color="var(--foreground)" />
            <p className="font-sans uppercase tracking-[0.4em] text-[10px] font-black text-muted-foreground mt-2">
              The Archive · Vol. 01
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('festivals')}
            aria-label="Find shows"
            className="size-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground border border-border active:scale-95 transition-transform"
          >
            <Icon name="ph:magnifying-glass" size={20} />
          </button>
        </header>

        <main className="space-y-16 mt-16">
          {/* Conditional surfaces the design never drew a state for. They
              render nothing on an ordinary day, so they can't disturb it. */}
          <WrappedReady />
          <GetStarted />
          <TasteNudge />

          {next && (
            <section className="px-8">
              <div className="flex justify-between items-center mb-6">
                <p className="font-sans uppercase tracking-[0.4em] text-[10px] font-black text-muted-foreground italic">
                  Upcoming
                </p>
                <div className="flex items-center gap-2">
                  <span className="font-sans font-extrabold text-xs text-foreground tabular-nums">
                    {days}
                  </span>
                  <span className="font-sans uppercase tracking-[0.4em] text-[8px] font-black text-muted-foreground">
                    {days === 0 ? 'Tonight' : days === 1 ? 'Day to go' : 'Days to go'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedShow(next)}
                className="w-full py-8 border-y border-border flex justify-between items-center text-left active:scale-[0.98] transition-transform"
              >
                <div className="min-w-0">
                  <h2 className="font-serif italic text-3xl tracking-tight text-foreground truncate">
                    {next.artist}
                  </h2>
                  <p className="font-sans uppercase tracking-[0.4em] text-[10px] font-black text-muted-foreground mt-1 italic truncate">
                    {[next.venue, next.city].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="text-right shrink-0 pl-4">
                  <p className="font-serif italic text-xl text-foreground">{nextDate.day}</p>
                  <p className="font-sans uppercase tracking-[0.4em] text-[8px] font-black text-muted-foreground mt-1">
                    {nextDate.year}
                  </p>
                </div>
              </button>
            </section>
          )}

          {/* "One year ago" — OnThisDay owns its own anniversary matching and
              renders nothing on the ~360 days that aren't one. */}
          <OnThisDay />

          <section className="px-8 pb-40">
            <p className="font-sans uppercase tracking-[0.4em] text-[10px] font-black text-muted-foreground mb-8 italic">
              The Circle
            </p>
            <FriendsFeed />
          </section>
        </main>
      </div>
    </div>
  );
}
