// Home — ported from the Sleek design (project e0ITdp4pfIU).
// ==========================================================
// THREE STATES, one screen. Which one renders is decided by the data, per
// Aidan's mapping:
//
//   tonight   — a show you're going to today   -> "Home (Tonight)"  v4
//   ordinary  — an upcoming show, not today    -> "Home"            v29
//   newUser   — nothing logged at all          -> "Home (New User)" v4
//
// They are not variations on a hero: the sections genuinely differ. Tonight
// carries an UNLOGGED capture prompt and a "2026 so far" strip that the
// ordinary state doesn't have; the new-user state replaces almost everything
// with an invitation and a two-step explainer. Ported as designed rather than
// unified, because the differences are the point.
//
// The three NIGHT variants — Home (Night), Home (Night, Ordinary), Home
// (Night, New User) — are NOT implemented. The app has no dark mode at all:
// no prefers-color-scheme rules, no theme attribute, nothing to switch on.
// That's a prerequisite, not a detail of this screen.
//
// Deliberate deviations from the export:
//
//   * THE GRAIN. The export overlays a paper texture from Sleek's CDN. A
//     remote image on every screen is unacceptable in an app used in venues
//     with no signal — App.css already applies an inline SVG grain to <body>.
//   * THE WORDMARK. The export sets "melo" in italic Playfair; the shipped
//     mark is <MeloWordmark> and CLAUDE.md requires the component. The face is
//     still an open decision — three values in :root if the serif wins.
//   * THE DOORS COUNTDOWN. Tonight's design shows "HOURS 03 / MINS 14". Melo
//     holds no showtime on the show record — ShowDayInfo fetches one on demand
//     on the detail screen, and it isn't persisted. Rather than invent a doors
//     time on the home screen, that slot carries the date and a LIVE marker.
//     Restoring the real countdown means persisting showtime, not editing here.
//   * THE PAPER. Tonight and New User specify #FAF7F0 while Home v29 specifies
//     #FDFCF6. Both use bg-background — a two-value difference in the same
//     token across three exports is drift, not intent.

import { useMemo } from 'react';
import { useApp } from '../App';
import { isGoing, isAttended, daysUntil } from '../store';
import { MeloWordmark } from '../components/MeloLogo';
import Icon from '../components/Icon';
import FriendsFeed from '../components/FriendsFeed';
import GetStarted from '../components/GetStarted';
import WrappedReady from '../components/WrappedReady';
import OnThisDay from '../components/OnThisDay';
import TasteNudge from '../components/TasteNudge';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Parsed by parts throughout — `new Date('2026-10-22')` is UTC midnight, which
// renders as the 21st for anyone west of Greenwich.
const parts = (iso) => String(iso || '').split('-').map(Number);
const splitDate = (iso) => {
  const [y, m, d] = parts(iso);
  return y && m && d ? { day: `${d} ${MONTHS[m - 1]}`, year: String(y) } : { day: '', year: '' };
};
const weekday = (iso) => {
  const [y, m, d] = parts(iso);
  return y && m && d ? DAYS[new Date(y, m - 1, d).getDay()] : '';
};

const LABEL = 'font-sans uppercase tracking-[0.4em] text-[10px] font-black text-muted-foreground';
const META = 'font-sans uppercase tracking-[0.3em] text-[9px] font-black text-muted-foreground';
const PILL = 'bg-accent text-white rounded-full font-sans font-black uppercase tracking-[0.4em] shadow-lg shadow-accent/20 active:scale-95 transition-transform';
const PRINT = 'bg-white p-1 shadow-sm border border-black/5 transform';

export default function Home() {
  const {
    shows, dayStamp, setSelectedShow, navigate, openOverlay, getArtistImage,
  } = useApp();

  const { state, tonight, next, unlogged, year } = useMemo(() => {
    const all = shows || [];
    const going = all.filter(isGoing);
    const upcoming = going
      .filter((s) => daysUntil(s.date) >= 0)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const tonightShow = upcoming.find((s) => daysUntil(s.date) === 0) || null;

    // "You were at Turnstile on Saturday" — a show you said you were going to,
    // whose date has passed, that never became a logged memory. The capture
    // prompt the whole app runs on.
    const missed = going
      .filter((s) => daysUntil(s.date) < 0)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;

    const thisYear = new Date().getFullYear();
    const attendedThisYear = all.filter(
      (s) => isAttended(s) && parts(s.date)[0] === thisYear,
    );

    return {
      state: all.length === 0 ? 'newUser' : tonightShow ? 'tonight' : 'ordinary',
      tonight: tonightShow,
      next: upcoming[0] || null,
      unlogged: missed,
      year: {
        label: thisYear,
        shows: attendedThisYear.length,
        cities: new Set(attendedThisYear.map((s) => (s.city || '').trim()).filter(Boolean)).size,
        artists: new Set(attendedThisYear.map((s) => (s.artist || '').trim()).filter(Boolean)).size,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shows, dayStamp]);

  const Header = (
    <div className="relative z-10 pb-12">
      <div className="absolute inset-0 h-48 bg-gradient-to-b from-accent/10 via-accent/5 to-transparent pointer-events-none" />
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
          <Icon name="ph:magnifying-glass" size={20} />
        </button>
      </header>
    </div>
  );

  const shell = (children) => (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background pb-12 relative selection:bg-accent/30">
      {Header}
      {/* Conditional surfaces the design never drew a state for. They render
          nothing on an ordinary day, so they can't disturb it. */}
      <div className="px-8 relative z-10"><WrappedReady /><GetStarted /><TasteNudge /></div>
      {children}
    </div>
  );

  // ---- NEW USER --------------------------------------------------------
  if (state === 'newUser') {
    return shell(
      <>
        <section className="mt-4 px-8 relative z-10">
          <div className="bg-card border border-border p-10 rounded-sm mb-10 flex flex-col items-center text-center shadow-sm">
            <div className="size-24 bg-secondary rounded-full flex items-center justify-center text-muted-foreground mb-8 border border-border">
              <Icon name="ph:camera-plus" size={36} />
            </div>
            <h2 className="font-serif italic text-4xl tracking-tight text-foreground mb-4">
              Start your archive.
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-10 px-4">
              Log your first concert memory to start building your private keepsake of live music.
            </p>
            <button
              type="button"
              onClick={() => openOverlay('quicklog', {})}
              className={`${PILL} px-12 py-4 text-[10px]`}
            >
              Log a show
            </button>
          </div>
        </section>

        <section className="mt-10 px-8 relative z-10 opacity-60">
          <p className={`${LABEL} mb-4`}>Unlogged</p>
          <div className="py-8 border-y border-dashed border-border flex items-center justify-center">
            <p className="font-serif italic text-lg text-muted-foreground/60">
              No recent shows detected.
            </p>
          </div>
        </section>

        <section className="mt-10 px-8 relative z-10 opacity-60">
          <p className={`${LABEL} mb-4`}>On this day</p>
          <div className="py-8 border-b border-dashed border-border flex items-center justify-center">
            <p className="font-serif italic text-lg text-muted-foreground/60">
              Archive a show to see past memories.
            </p>
          </div>
        </section>

        <section className="mt-12 px-8 relative z-10 pb-40">
          <p className={`${LABEL} mb-10`}>Building your collection</p>
          <div className="space-y-12">
            {[
              ['01', 'Preserve', 'Log shows in four taps. Add photos, notes, and setlists to your personal vault.'],
              ['02', 'Revisit', 'Experience auto-generated recaps and cinematic reels of your greatest nights.'],
            ].map(([n, title, copy]) => (
              <div key={n} className="flex gap-6">
                <span className="font-sans font-extrabold text-3xl text-foreground tabular-nums">{n}</span>
                <div>
                  <h3 className="font-sans font-black text-[10px] uppercase tracking-[0.4em] text-foreground mb-2">
                    {title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </>,
    );
  }

  // ---- TONIGHT ---------------------------------------------------------
  if (state === 'tonight') {
    const img = (tonight.photos || [])[0] || getArtistImage(tonight.artist);
    const uImg = unlogged ? ((unlogged.photos || [])[0] || getArtistImage(unlogged.artist)) : null;
    return shell(
      <>
        <section className="mt-4 px-8 relative z-10">
          <div className="flex justify-between items-center mb-3">
            <p className={LABEL}>The next memory</p>
            <span className="font-sans uppercase tracking-[0.4em] text-[10px] font-black text-accent">
              ● Live
            </span>
          </div>
          <div className="mb-4">
            <h2 className="font-serif italic text-8xl tracking-tighter leading-none text-foreground">
              Tonight
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setSelectedShow(tonight)}
            className="w-full text-left bg-card border border-border overflow-hidden rounded-sm mb-10 flex flex-col shadow-sm active:scale-[0.99] transition-transform"
          >
            {img && (
              <div className="relative w-full aspect-[16/10] bg-muted">
                <img src={img} alt="" className="w-full h-full object-cover grayscale opacity-80" />
              </div>
            )}
            <div className="p-6">
              <div className="mb-8 min-w-0">
                <h3 className="font-serif italic text-4xl tracking-tighter text-foreground truncate">
                  {tonight.artist}
                </h3>
                <p className={`${LABEL} mt-2 truncate`}>
                  {[tonight.venue, tonight.city].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="pt-6 border-t border-border flex justify-between items-center">
                {/* Where the design puts HOURS/MINS. No showtime is stored, so
                    this carries the date rather than a fabricated countdown. */}
                <div className="flex flex-col">
                  <span className="font-sans uppercase tracking-[0.4em] text-[8px] font-black text-muted-foreground mb-1">
                    Doors
                  </span>
                  <span className="text-3xl font-sans font-extrabold tabular-nums text-foreground">
                    {splitDate(tonight.date).day}
                  </span>
                </div>
                <span className={`${PILL} px-8 py-3 text-[9px]`}>Ticket</span>
              </div>
            </div>
          </button>
        </section>

        {unlogged && (
          <section className="mt-10 px-8 relative z-10">
            <p className={`${LABEL} mb-3`}>Unlogged</p>
            <div className="flex items-center gap-6">
              {uImg && (
                <div className="shrink-0">
                  <div className={`${PRINT} -rotate-2`}>
                    <img src={uImg} alt="" className="size-16 object-cover" />
                  </div>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-tight text-foreground mb-1">
                  You were at <span className="font-serif italic font-semibold">{unlogged.artist}</span>
                  {weekday(unlogged.date) ? ` on ${weekday(unlogged.date)}.` : '.'}
                </p>
                <p className={`${META} truncate`}>
                  {[unlogged.venue, unlogged.city].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openOverlay('log', { editingShow: unlogged })}
                className={`${PILL} px-5 py-2.5 text-[8px] shrink-0`}
              >
                Log show
              </button>
            </div>
          </section>
        )}

        <section className="mt-10 px-8 relative z-10"><OnThisDay /></section>

        <section className="mt-10 px-8 relative z-10">
          <p className={`${LABEL} mb-3`}>In your circle</p>
          <FriendsFeed />
        </section>

        <section className="mt-10 px-8 relative z-10 pb-40">
          <p className={`${LABEL} mb-4`}>{year.label} so far</p>
          <div className="flex justify-between items-baseline">
            {[[year.shows, 'Shows'], [year.cities, 'Cities'], [year.artists, 'Artists']].map(
              ([n, label]) => (
                <div key={label} className="flex items-baseline gap-2">
                  <span className="text-2xl font-sans font-extrabold tabular-nums text-foreground">
                    {String(n).padStart(2, '0')}
                  </span>
                  <span className="font-sans uppercase tracking-[0.4em] text-[8px] font-black text-muted-foreground">
                    {label}
                  </span>
                </div>
              ),
            )}
          </div>
        </section>
      </>,
    );
  }

  // ---- ORDINARY --------------------------------------------------------
  const nextDate = splitDate(next?.date);
  const days = next ? daysUntil(next.date) : null;
  return shell(
    <main className="space-y-16 mt-16 relative z-10">
      {next && (
        <section className="px-8">
          <div className="flex justify-between items-center mb-6">
            <p className={`${LABEL} italic`}>Upcoming</p>
            <div className="flex items-center gap-2">
              <span className="font-sans font-extrabold text-xs text-foreground tabular-nums">
                {days}
              </span>
              <span className="font-sans uppercase tracking-[0.4em] text-[8px] font-black text-muted-foreground">
                {days === 1 ? 'Day to go' : 'Days to go'}
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
              <p className={`${LABEL} mt-1 italic truncate`}>
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

      <OnThisDay />

      <section className="px-8">
        <p className={`${LABEL} mb-8 italic`}>The Circle</p>
        <FriendsFeed />
      </section>
    </main>,
  );
}
