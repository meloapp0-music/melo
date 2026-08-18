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
import { isGoing, isAttended, daysUntil, getArtistGradient } from '../store';
import { MeloWordmark } from '../components/MeloLogo';
import Icon from '../components/Icon';
import FitText from '../components/FitText';
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
// "You were at Geese on Saturday" only makes sense while the weekday still
// points at a night you remember. The unlogged show can be any age — the
// design's example happened to be three days old — and "on Wednesday" for
// something five months back is nonsense. Inside a week: the weekday. Beyond
// it: the date.
const whenPhrase = (iso) => {
  const [y, m, d] = parts(iso);
  if (!y || !m || !d) return '';
  const ago = -daysUntil(iso);
  return ago >= 0 && ago <= 6 ? weekday(iso) : `${MONTHS[m - 1]} ${d}`;
};

const LABEL = 'font-sans uppercase tracking-[0.4em] text-[10px] font-black text-muted-foreground';
const META = 'font-sans uppercase tracking-[0.3em] text-[9px] font-black text-muted-foreground';
const PILL = 'bg-accent text-white rounded-full font-sans font-black uppercase tracking-[0.4em] shadow-lg shadow-accent/20 active:scale-95 transition-transform';
const PRINT = 'bg-white p-1 shadow-sm border border-black/5 transform';

// The ticket stub. An upcoming show is a ticket; a past show is a photograph.
// One rule, two objects, and a user learns the language in a few seconds.
// Filled with the artist's own colour — every swatch in ARTIST_PALETTE is
// pinned to 20-42% lightness precisely so cream/white type on it is safe.
function Stub({ date, artist }) {
  const [y, m, d] = parts(date);
  if (!y || !m || !d) return null;
  const wd = DAYS[new Date(y, m - 1, d).getDay()].slice(0, 3);
  return (
    <div className="shrink-0 rotate-3 bg-white p-1.5 shadow-lg shadow-black/15">
      <div
        className="w-[92px] aspect-[3/4] flex flex-col items-center justify-center text-white"
        style={{ background: getArtistGradient(artist) }}
      >
        <span className="font-sans uppercase tracking-[0.3em] text-[9px] font-black">
          {MONTHS[m - 1].toUpperCase()}
        </span>
        <span className="font-sans font-extrabold text-[34px] leading-none tabular-nums mt-0.5">
          {d}
        </span>
        <span className="font-sans uppercase tracking-[0.3em] text-[9px] font-black mt-0.5">
          {wd.toUpperCase()}
        </span>
        <div className="w-8 border-t border-white/30 my-2" />
        <span className="font-sans uppercase tracking-[0.2em] text-[7px] font-black">
          Admit One
        </span>
      </div>
    </div>
  );
}

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
                  {whenPhrase(unlogged.date) ? ` on ${whenPhrase(unlogged.date)}.` : '.'}
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

        {/* Hidden at zero — see the ordinary state's copy. A user whose only
            show is the one happening tonight has attended none this year. */}
        {year.shows > 0 && (
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
        )}
      </>,
    );
  }

  // ---- ORDINARY --------------------------------------------------------
  const days = next ? daysUntil(next.date) : null;
  const uImg = unlogged ? ((unlogged.photos || [])[0] || getArtistImage(unlogged.artist)) : null;
  // The countdown's photograph is always one of the user's OWN, never a press
  // shot of the artist: a press photo is identical for every show by that
  // artist forever and is exactly what every other concert app puts here.
  //
  // Two chances at it, because "your photo of this venue" alone is far too
  // narrow — it needs a prior attended show AT THE SAME ROOM that you also
  // photographed, which for most people is never. Going back to see an artist
  // you've already seen is the far more common pattern in a concert log, so
  // that's the second pass. Both are personal; neither is stock.
  //
  //   1. your last night in THAT ROOM     -> "You were here"
  //   2. your last night with THAT ARTIST -> "You saw them"
  //   3. nothing at all, and no reserved height
  //
  // Plain const, not a hook: this branch sits after two early returns, so a
  // hook here would be conditional.
  const shot = (() => {
    const withPhotos = (shows || []).filter(
      (s) => isAttended(s) && Array.isArray(s.photos) && s.photos.length,
    );
    const newest = (list) =>
      [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null;
    const key = (v) => (v || '').trim().toLowerCase();
    const here = key(next?.venue)
      ? newest(withPhotos.filter((s) => key(s.venue) === key(next.venue)))
      : null;
    const them = key(next?.artist)
      ? newest(withPhotos.filter((s) => key(s.artist) === key(next.artist)))
      : null;
    const hit = here || them;
    if (!hit) return null;
    const [y, m] = parts(hit.date);
    return {
      src: hit.photos[0],
      caption: `${here ? 'You were here' : 'You saw them'} · ${
        m ? `${MONTHS[m - 1]} ` : ''
      }${y || ''}`.trim(),
    };
  })();
  return shell(
    <main className="space-y-16 mt-16 relative z-10">
      {next && (
        <section className="relative">
          {/* THE LEAD. This used to open with a 10px grey "UPCOMING" label and
              a 12px counter, while the other two Home states opened with a
              statement (`Tonight` at 96px, `Start your archive.` at 36px).
              That asymmetry is why the most-seen state read as a page in a
              magazine rather than a home screen. */}
          <button
            type="button"
            onClick={() => setSelectedShow(next)}
            className="w-full text-left px-8 flex justify-between items-start gap-5 active:scale-[0.99] transition-transform"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-3">
                <span className="font-serif italic text-[88px] leading-[0.78] tracking-tighter text-foreground tabular-nums">
                  {days}
                </span>
                <span className={LABEL}>{days === 1 ? 'Day until' : 'Days until'}</span>
              </div>
            </div>
            <Stub date={next.date} artist={next.artist} />
          </button>

          {/* The headline gets the FULL sheet width, not the ~187px left
              beside the stub. Measured, not guessed: a fixed size fits
              "Geese" and puts "Godspeed You! Black Emperor" 73px over the
              edge. The stub aligns to the countdown number above; the name
              runs the width of the page under both. */}
          <button
            type="button"
            onClick={() => setSelectedShow(next)}
            className="w-full text-left px-8 mt-6 block active:scale-[0.99] transition-transform"
          >
            <FitText
              as="h2"
              min={24}
              max={46}
              fill={0.99}
              className="font-serif italic tracking-tighter text-foreground leading-[0.95]"
            >
              {next.artist}
            </FitText>
          </button>

          {/* The venue line sits BELOW the row, not inside the left column.
              Beside a 92px stub the column is ~240px, and "The Wiltern · Los
              Angeles" at 10px/0.4em needs more than that — it truncated to
              "LOS ANGEL…". Full width, so it can't. */}
          <p className={`${LABEL} px-8 mt-3 truncate`}>
            {[next.venue, next.city].filter(Boolean).join(' · ')}
          </p>

          {/* THE PHOTOGRAPH SITS BELOW THE TYPE, NOT BEHIND IT.
              Seventeen rounds of trying to float this type over the image
              failed on exactly the case that matters: a dark venue interior.
              No cream wash survives every photo, because the photos aren't
              ours to control — and the house style already said so ("never
              full-bleed behind text"). It bleeds edge to edge and dissolves
              into the paper at both ends, so it reads as printed INTO the
              page rather than as a picture dropped on top of one. */}
          {shot && (
            <>
              <div className="relative mt-9 h-56 overflow-hidden">
                <img
                  src={shot.src}
                  alt=""
                  className="w-full h-full object-cover grayscale contrast-[1.15]"
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      'linear-gradient(to bottom, var(--bg) 0%, transparent 20%, transparent 68%, var(--bg) 100%)',
                  }}
                />
              </div>
              {/* Captioned, because an uncaptioned photo here is decoration —
                  the reader has no way to know it's their own, or why it's
                  this one. Two words turn it into a memory. */}
              <p className={`${META} px-8 mt-3 text-right`}>{shot.caption}</p>
            </>
          )}
        </section>
      )}

      {/* UNLOGGED. The capture prompt the whole archive runs on — a show you
          said you were going to, whose date has passed, that never became a
          memory. The design puts it here, second, directly under Upcoming; it
          had only been wired into the `tonight` state, so on an ordinary day —
          which is almost every day — nothing ever asked you to log anything. */}
      {unlogged && (
        <section className="px-8 relative">
          {/* The design floats a hairline midway between Upcoming and Unlogged
              at -top-10, against its own mt-20 gap. This main uses space-y-16,
              so -top-8 keeps the rule centred in the smaller gap. */}
          <div className="absolute -top-8 left-8 right-8 border-t border-border/60" />
          <p className={`${LABEL} mb-6`}>Unlogged</p>
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
                {whenPhrase(unlogged.date) ? ` on ${whenPhrase(unlogged.date)}.` : '.'}
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

      <OnThisDay />

      <section className="px-8">
        <p className={`${LABEL} mb-8 italic`}>The Circle</p>
        <FriendsFeed />
      </section>

      {/* YEAR SO FAR. Also design-specified here and also only wired into
          `tonight` — the state where you're least likely to be browsing.
          Hidden at zero: "00 SHOWS / 00 CITIES / 00 ARTISTS" reads as broken
          rather than as a beginning, and a new user who marks one show as
          going lands here with nothing attended yet. */}
      {year.shows > 0 && (
        <section className="px-8">
          <p className={`${LABEL} mb-6`}>{year.label} so far</p>
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
      )}
    </main>,
  );
}
