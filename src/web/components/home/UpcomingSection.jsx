import { useMemo } from 'react';
import SectionLabel from '../melo/SectionLabel';
import StubVintage from '../melo/StubVintage';
import FitText from '../FitText';
import { getArtistGradient, isAttended, daysUntil } from '../../store';

// UPCOMING — ported VERBATIM from the base44 prototype (Stubs,
// src/components/home/UpcomingSection.jsx). Every number below — 290, 112,
// 0.88, 0.44em, 46%, top:185, contrast(1.45) — is the prototype's, copied
// rather than re-derived.
//
// The previous version of this file was a Tailwind re-interpretation of the
// same design, and it had drifted: 92px instead of 112 on the numeral, 10px
// instead of 13 on DAYS UNTIL, 32px instead of 16 of page padding, venue and
// city left-aligned instead of centred, and an ADMIT ONE line the prototype
// doesn't have. None of those were decisions; they were translation losses,
// and they compound into a visibly different screen.
//
// The only thing changed on the way across is the data source: the prototype
// reads a fixture, this reads the real show and the user's own photographs.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

const BLOCK_H = 290;

// Parsed by parts — `new Date('2026-10-22')` is UTC midnight, which renders
// as the 21st for anyone west of Greenwich.
const parts = (iso) => String(iso || '').split('-').map(Number);

export default function UpcomingSection({ show, shows = [], onOpen }) {
  if (!show) return null;

  const days = Math.max(0, daysUntil(show.date));
  const isToday = days === 0;
  const artistColor = getArtistGradient(show.artist);

  // The print is the user's own photo from the last time they were at this
  // venue — a real shot of the room, not the artist. No photo, no print.
  const photo = useMemo(() => {
    const key = (v) => (v || '').trim().toLowerCase();
    const past = (shows || [])
      .filter((s) => isAttended(s) && key(s.venue) === key(show.venue)
        && Array.isArray(s.photos) && s.photos.length
        && (s.date || '') < (show.date || ''))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return past[0]?.photos?.[0] || null;
  }, [shows, show.venue, show.date]);

  const [, m, d] = parts(show.date);
  const month = m ? MONTHS[m - 1] : '';
  const day = d ? String(d) : '';
  const weekday = (() => {
    const [y, mm, dd] = parts(show.date);
    return y && mm && dd ? WEEKDAYS[new Date(y, mm - 1, dd).getDay()] : '';
  })();

  // Small ticket stub, pinned over the print's bottom-left corner.
  const stub = (
    <div
      style={{
        width: 96,
        minHeight: 100,
        boxSizing: 'border-box',
        border: '5px solid #FFFFFF',
        outline: '1px solid #E5E3DF',
        boxShadow: '0 8px 18px rgba(26,25,24,0.20)',
        background: artistColor,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '9px 6px',
      }}
    >
      <StubVintage inset={5} />
      <SectionLabel style={{ color: '#FFFFFF' }}>{month}</SectionLabel>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 36, fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>
        {day}
      </span>
      <SectionLabel style={{ color: '#FFFFFF' }}>{weekday}</SectionLabel>
    </div>
  );

  if (photo) {
    return (
      <section
        onClick={onOpen}
        style={{ position: 'relative', width: '100%', height: BLOCK_H, background: '#FDFCF6', overflow: 'visible' }}
      >
        {/* PRINT — right 46%, full block height, bleeds off the right edge.
            High-contrast B&W newsprint with grain at 4%. */}
        <div style={{ position: 'absolute', right: 0, top: 0, width: '46%', height: BLOCK_H, backgroundImage: `url(${photo})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'grayscale(1) contrast(1.45) brightness(1.12)', zIndex: 0 }} />
        <div style={{ position: 'absolute', right: 0, top: 0, width: '46%', height: BLOCK_H, backgroundImage: GRAIN, opacity: 0.04, mixBlendMode: 'multiply', pointerEvents: 'none', zIndex: 1 }} />

        {/* Top-left paper wash — pushes the lightest area of the print behind
            the number where it crosses the seam, so the numeral stays readable. */}
        <div style={{ position: 'absolute', right: 0, top: 0, width: '46%', height: BLOCK_H, background: 'linear-gradient(135deg, rgba(253,252,246,0.85) 0%, rgba(253,252,246,0) 42%)', pointerEvents: 'none', zIndex: 2 }} />

        {/* Bottom dissolve into paper — no hard edge, no black band. */}
        <div style={{ position: 'absolute', right: 0, top: 0, width: '46%', height: BLOCK_H, background: 'linear-gradient(to bottom, transparent 74%, #FDFCF6 100%)', pointerEvents: 'none', zIndex: 2 }} />

        {/* TICKET STUB — pinned over the print's bottom-left corner, tilted 3°.
            Raised so the rotation keeps its lowest point at or above the
            print's bottom edge; it never crosses into the section below. */}
        <div style={{ position: 'absolute', left: '54%', top: 185, transformOrigin: 'top left', transform: 'rotate(3deg)', zIndex: 5 }}>
          {stub}
        </div>

        {/* COUNTDOWN NUMBER — left-aligned, fully inside the type column so it
            never overlaps the print. */}
        <div style={{ position: 'absolute', left: 16, right: '50%', top: -12, zIndex: 4 }}>
          {isToday ? (
            <div style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 700, fontSize: 64, lineHeight: 0.9, color: '#1A1918' }}>
              Tonight
            </div>
          ) : (
            <div style={{ textAlign: 'left', fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 800, fontSize: 112, lineHeight: 0.88, color: '#1A1918', whiteSpace: 'nowrap' }}>
              {days}
            </div>
          )}
        </div>

        {/* DAYS UNTIL — sits immediately under the countdown number, reads as
            part of it. */}
        <div style={{ position: 'absolute', left: 16, top: 96, zIndex: 4 }}>
          <SectionLabel color="#1A1918" style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.44em', lineHeight: '18px' }}>
            {days === 1 ? 'DAY UNTIL' : 'DAYS UNTIL'}
          </SectionLabel>
        </div>

        {/* SHOW BLOCK — artist + venue + city, vertically centred in the space
            below the countdown so the gap above and below reads as deliberate. */}
        <div style={{ position: 'absolute', left: 16, right: '50%', top: 168, zIndex: 4 }}>
          <FitText as="div" min={24} max={28} fill={0.99} style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', lineHeight: 1.05, color: '#1A1918' }}>
            {show.artist}
          </FitText>
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <SectionLabel color="#1A1918" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.34em' }}>
              {(show.venue || '').toUpperCase()}
            </SectionLabel>
            {show.city && (
              <div style={{ marginTop: 3 }}>
                <SectionLabel color="#1A1918" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.34em' }}>
                  {show.city.toUpperCase()}
                </SectionLabel>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // No photo — the print is omitted entirely, the type column becomes full
  // width, and no extra height is reserved.
  return (
    <section onClick={onOpen} style={{ padding: '20px 16px 0', background: '#FDFCF6' }}>
      {isToday ? (
        <div style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 700, fontSize: 64, lineHeight: 0.9, color: '#1A1918' }}>
          Tonight
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 800, fontSize: 96, lineHeight: 0.82, color: '#1A1918' }}>
            {days}
          </span>
          <SectionLabel color="#1A1918">{days === 1 ? 'DAY UNTIL' : 'DAYS UNTIL'}</SectionLabel>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <FitText as="div" min={24} max={30} fill={0.99} style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', lineHeight: 1.05, color: '#1A1918' }}>
          {show.artist}
        </FitText>
      </div>
      <div style={{ marginTop: 8 }}>
        <SectionLabel color="#1A1918" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.32em' }}>
          {(show.venue || '').toUpperCase()}
        </SectionLabel>
        {show.city && (
          <div style={{ marginTop: 2 }}>
            <SectionLabel color="#1A1918" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.32em' }}>
              {show.city.toUpperCase()}
            </SectionLabel>
          </div>
        )}
      </div>
    </section>
  );
}
