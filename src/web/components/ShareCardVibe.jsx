// Vibe card — mood words as artwork over an artist word-wash. The default style
// for shows without photos. Ported pixel-faithfully from the design handoff and
// wired to the real show model (artist/venue/city/date/vibes/setlist/score).
import { vibeStyle } from '../store';
import { themeField, fmtDate } from '../lib/shareCardKit';
import { Wordmark, Equalizer, QrCode, MoreLink } from './ShareCardParts';

const OUTFIT = "'Outfit', sans-serif";
const DM = "'DM Sans', sans-serif";

export default function ShareCardVibe({ show, theme = 'vibe', format = '9x16',
                                        flags, anim, handle, onMore }) {
  const tall = format === '9x16';
  const field = themeField(theme === 'ember' ? 'vibe' : theme, show);
  const vibes = show.vibes || [];
  const setlist = show.setlist || [];
  // Background wash repeats the ARTIST name; the vibe lives in the bottom band.
  const wline = ((show.artist || 'melo') + '   ·   ').repeat(5);
  const rows = tall ? [0, 1, 2, 3, 4] : [0, 1, 2];
  const accent = vibeStyle(vibes[0]).color || '#F4A261';
  const cap = tall ? 6 : 4;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: field.base }}>
      {/* word wash */}
      <div className={anim ? 'mc-drift' : ''} style={{ position: 'absolute', top: '-12%', left: '-25%',
                    width: '150%', transform: 'rotate(-8deg)', pointerEvents: 'none' }}>
        {rows.map((r) => (
          <div key={r} style={{ whiteSpace: 'nowrap', fontFamily: OUTFIT,
            fontWeight: 800, fontSize: tall ? 168 : 150, lineHeight: 1.04, letterSpacing: '-0.04em',
            color: r % 2 ? 'transparent' : 'rgba(255,255,255,0.06)',
            WebkitTextStroke: r % 2 ? '2px rgba(255,255,255,0.10)' : '0',
            marginLeft: r % 2 ? '-6%' : '0' }}>{wline}</div>
        ))}
      </div>
      {/* bottom scrim */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(to top, rgba(10,6,16,0.85) 0%, rgba(10,6,16,0.5) 22%, rgba(10,6,16,0.08) 46%, rgba(10,6,16,0) 62%)' }} />

      {/* content — artist + setlist lead; the mood is a bold bottom band */}
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column',
                    justifyContent: 'space-between', padding: tall ? '60px 58px 52px' : '44px 50px 40px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Wordmark size={tall ? 44 : 38} color="#fff" />
          <span style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: 19,
                         letterSpacing: '0.22em', color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>I WAS THERE</span>
        </div>

        {/* HERO — the show itself */}
        <div>
          <h1 style={{ fontFamily: OUTFIT, fontWeight: 800, color: '#fff',
                       fontSize: (show.artist || '').length > 13 ? (tall ? 106 : 78) : (tall ? 132 : 98),
                       letterSpacing: '-0.04em', lineHeight: 0.92, margin: 0,
                       textShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>{show.artist}</h1>
          {(flags.venue || flags.date) && (
            <div style={{ marginTop: 18, fontFamily: DM, fontWeight: 600,
                          fontSize: tall ? 33 : 26, color: 'rgba(255,255,255,0.92)' }}>
              {flags.venue && <span>{show.venue}{show.city ? ` · ${show.city}` : ''}</span>}
              {flags.venue && flags.date && show.date && <span style={{ opacity: 0.5 }}>{'  ·  '}</span>}
              {flags.date && show.date && <span style={{ color: '#F4A261' }}>{fmtDate(show.date)}</span>}
            </div>
          )}
        </div>

        {/* SETLIST — prominent tracklist */}
        {flags.setlist && setlist.length > 0 && (
          <div>
            <div style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: tall ? 21 : 17,
                          letterSpacing: '0.2em', color: 'rgba(255,255,255,0.55)', marginBottom: tall ? 14 : 9 }}>THE SETLIST</div>
            {setlist.slice(0, cap).map((t, i) => (
              <div key={i} className={anim ? 'mc-reveal' : ''} style={{ display: 'flex', alignItems: 'baseline', gap: 18,
                           padding: tall ? '11px 0' : '7px 0', borderTop: i ? '1px solid rgba(255,255,255,0.12)' : 'none',
                           animationDelay: (0.06 * i + 0.1) + 's' }}>
                <span style={{ fontFamily: OUTFIT, fontWeight: 800, fontSize: tall ? 26 : 21,
                               color: accent, minWidth: tall ? 46 : 34 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: tall ? 42 : 31,
                               letterSpacing: '-0.02em', color: '#fff', lineHeight: 1.04 }}>{t}</span>
              </div>
            ))}
            {setlist.length > cap && (
              <MoreLink n={setlist.length - cap} label="more"
                color="rgba(255,255,255,0.62)" size={tall ? 24 : 19} pad={tall ? 11 : 8} ls="0.04em" onMore={onMore} />
            )}
          </div>
        )}

        {/* MOOD BAND + footer */}
        <div>
          {flags.vibes && vibes.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
                          borderTop: '1.5px solid rgba(255,255,255,0.16)', paddingTop: tall ? 24 : 16 }}>
              <div>
                <div style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: tall ? 18 : 15,
                              letterSpacing: '0.24em', color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>THE VIBE</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: tall ? 22 : 15 }}>
                  {vibes.map((v) => {
                    const c = vibeStyle(v).color || '#fff';
                    return <span key={v} style={{ fontFamily: OUTFIT, fontWeight: 800,
                      fontSize: tall ? 64 : 46, lineHeight: 0.98, letterSpacing: '-0.035em', color: c,
                      textTransform: 'uppercase', textShadow: `0 0 55px ${c}66` }}>{v}</span>;
                  })}
                </div>
              </div>
              <div className={anim ? 'mc-float' : ''} style={{ flex: '0 0 auto' }}>
                <Equalizer bars={6} w={tall ? 13 : 10} gap={tall ? 9 : 7} h={tall ? 76 : 54} anim={anim}
                  grad="linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.4))" />
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginTop: tall ? 30 : 20 }}>
            <span style={{ fontFamily: DM, fontWeight: 600, fontSize: 24,
                           color: 'rgba(255,255,255,0.7)' }}>melo.show{handle ? ` · @${handle}` : ''}</span>
            <QrCode size={tall ? 138 : 120} dark="#241a2e" />
          </div>
        </div>
      </div>
    </div>
  );
}
