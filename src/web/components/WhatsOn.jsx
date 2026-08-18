import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { searchEvents } from '../api';
import { inferHomeCity, isAttended, SHOW_STATUS, generateId } from '../store';
import Icon from './Icon';

// WHAT'S ON — the only discovery surface on Home.
// ==============================================
// Home's magnifying glass routes to the Discover page, but a 40px grey circle
// in a corner is not a discovery affordance; nobody finds it. This is the
// visible entry point, and it sits SECOND so the top of the page is one idea:
// the future you already own, then the future you could.
//
// OFFLINE CONTRACT — the reason this component looks defensive.
// This is the ONLY section on Home that needs a network. Every other one
// renders from the local show list, which is why Home works in a venue with
// no signal, and that has to stay true. So:
//
//   * nothing renders until real rows arrive — no skeleton, no spinner
//   * a failed or empty fetch renders NOTHING, and leaves no gap
//   * `searchEvents` already swallows its own errors and returns [], so a
//     dead network is indistinguishable here from a quiet week
//
// The user never learns that a request failed, because on this screen that
// isn't information they can act on.

const LABEL = 'font-sans uppercase tracking-[0.4em] text-[10px] font-black text-muted-foreground';
const META = 'font-sans uppercase tracking-[0.3em] text-[9px] font-black text-muted-foreground';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const ROWS = 3;

// Cached for the session. Home mounts on every tab switch, and without this
// each one would spend another Ticketmaster call against a 5,000/day budget
// the presale sweep is already drawing on.
let cache = { city: null, rows: null };

export default function WhatsOn() {
  const { shows, profile, addShow, showToast, navigate } = useApp();
  const city = (profile?.homeCity || inferHomeCity(shows || [])).trim();
  const [rows, setRows] = useState(() => (cache.city === city ? cache.rows : null));
  const [saved, setSaved] = useState(() => new Set());

  useEffect(() => {
    if (!city) { setRows(null); return undefined; }
    if (cache.city === city && cache.rows) { setRows(cache.rows); return undefined; }
    let gone = false;
    (async () => {
      const start = new Date();
      const end = new Date();
      end.setDate(end.getDate() + 60);
      const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
      const evs = await searchEvents({
        city,
        startDateTime: iso(start),
        endDateTime: iso(end),
        size: 20,
      });
      if (gone) return;
      // Drop anything already in the drawer — suggesting a show the user has
      // told us they're going to reads as the app not paying attention.
      const mine = new Set(
        (shows || []).map((s) => `${(s.artist || '').toLowerCase()}|${s.date}`),
      );
      const next = evs
        .filter((e) => e.artist && e.date && !mine.has(`${e.artist.toLowerCase()}|${e.date}`))
        .slice(0, ROWS);
      cache = { city, rows: next };
      setRows(next);
    })();
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  // No city, no network, nothing on: render nothing at all.
  if (!rows || rows.length === 0) return null;

  const save = async (ev) => {
    if (saved.has(ev.id)) return;
    setSaved((s) => new Set(s).add(ev.id));
    try {
      await addShow({
        id: generateId(),
        artist: ev.artist,
        venue: ev.venue,
        city: ev.city,
        date: ev.date,
        status: SHOW_STATUS.WISHLIST,
        wishlist: true,
      });
      showToast?.({ message: `${ev.artist} saved to your list` });
    } catch {
      // Put the button back rather than lying about it.
      setSaved((s) => { const n = new Set(s); n.delete(ev.id); return n; });
      showToast?.({ message: 'Could not save that one' });
    }
  };

  const dateParts = (iso) => {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    return y && m && d ? { month: MONTHS[m - 1], day: String(d) } : { month: '', day: '' };
  };

  return (
    <section className="px-8">
      <div className="flex items-baseline justify-between">
        <p className={LABEL}>What&rsquo;s on</p>
        <p className={LABEL}>{city}</p>
      </div>

      <div className="mt-4">
        {rows.map((ev, i) => {
          const { month, day } = dateParts(ev.date);
          const on = saved.has(ev.id);
          return (
            <div
              key={ev.id || `${ev.artist}-${ev.date}`}
              className={`flex items-center gap-4 py-4 ${i === rows.length - 1 ? '' : 'border-b border-border'}`}
            >
              <div className="w-10 shrink-0 flex flex-col items-center gap-1">
                <span className={META}>{month}</span>
                <span className="font-mono font-bold text-[15px] leading-none text-foreground">{day}</span>
              </div>

              {/* Suggestions read LIGHTER than the countdown above them — 22px
                  against its 92px. They are someone else's idea, not your plan. */}
              <div className="flex-1 min-w-0">
                <p className="font-serif italic text-[22px] leading-tight text-foreground truncate">
                  {ev.artist}
                </p>
                <p className={`${META} truncate mt-1`}>{ev.venue}</p>
              </div>

              <button
                type="button"
                onClick={() => save(ev)}
                aria-label={on ? `${ev.artist} saved` : `Save ${ev.artist}`}
                className={`size-11 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-transform ${
                  on ? 'bg-accent text-foreground' : 'border border-foreground text-foreground'
                }`}
              >
                <Icon name={on ? 'ph:check-bold' : 'ph:plus-bold'} size={18} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => navigate('festivals')}
          className={`${LABEL} flex items-center gap-1.5 py-3 active:scale-95 transition-transform`}
        >
          See everything
          <Icon name="ph:arrow-right" size={12} />
        </button>
      </div>
    </section>
  );
}
