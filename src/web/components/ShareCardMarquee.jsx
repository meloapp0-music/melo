// Marquee — theatre billboard; artist in lights, setlist as the bill.
import { vibeStyle } from '../store';
import { fmtDate } from '../lib/shareCardKit';
import { Wordmark, QrCode, MoreLink } from './ShareCardParts';

const OUTFIT = "'Outfit', sans-serif";
const DM = "'DM Sans', sans-serif";

export default function ShareCardMarquee({ show, format = '9x16', flags, anim, handle, onMore }) {
  const tall = format === '9x16';
  const amber = '#F4A261';
  const setlist = show.setlist || [];
  const tracks = setlist.slice(0, tall ? 6 : 4);
  const Bulbs = ({ n, vert }) => (
    <div style={{ display: 'flex', flexDirection: vert ? 'column' : 'row',
                  justifyContent: 'space-between', ...(vert ? { height: '100%' } : { width: '100%' }) }}>
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className={anim ? 'mc-bulb' : ''} style={{ width: tall ? 14 : 11, height: tall ? 14 : 11,
          borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #fff, #FFC75F 55%, #E8573A)',
          boxShadow: '0 0 11px rgba(255,199,95,0.9)', animationDelay: (i * 0.11) + 's' }} />
      ))}
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden',
      background: 'radial-gradient(110% 55% at 50% 0%, rgba(232,87,58,0.4), transparent 55%), linear-gradient(165deg,#2A1D13,#140C07)' }}>
      <div style={{ position: 'absolute', inset: tall ? 40 : 30, border: `3px solid ${amber}`, borderRadius: 30,
        boxShadow: '0 0 45px rgba(244,162,97,0.4), inset 0 0 55px rgba(244,162,97,0.12)' }} />
      <div style={{ position: 'absolute', left: tall ? 72 : 56, right: tall ? 72 : 56, top: tall ? 56 : 44 }}><Bulbs n={tall ? 15 : 11} /></div>
      <div style={{ position: 'absolute', left: tall ? 72 : 56, right: tall ? 72 : 56, bottom: tall ? 56 : 44 }}><Bulbs n={tall ? 15 : 11} /></div>
      <div style={{ position: 'absolute', top: tall ? 74 : 58, bottom: tall ? 74 : 58, left: tall ? 56 : 44 }}><Bulbs n={tall ? 26 : 16} vert /></div>
      <div style={{ position: 'absolute', top: tall ? 74 : 58, bottom: tall ? 74 : 58, right: tall ? 56 : 44 }}><Bulbs n={tall ? 26 : 16} vert /></div>

      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', textAlign: 'center', color: '#fff',
        padding: tall ? '112px 100px 104px' : '82px 78px 78px' }}>
        <div>
          <div style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: tall ? 22 : 18, letterSpacing: '0.3em',
                        color: amber, marginBottom: tall ? 26 : 16 }}>★ NOW SHOWING ★</div>
          <h1 style={{ fontFamily: OUTFIT, fontWeight: 800, textTransform: 'uppercase', color: '#fff',
            fontSize: (show.artist || '').length > 13 ? (tall ? 94 : 66) : (tall ? 124 : 88), letterSpacing: '-0.03em',
            lineHeight: 0.9, margin: 0, textShadow: '0 0 42px rgba(244,162,97,0.85), 0 6px 30px rgba(0,0,0,0.5)' }}>{show.artist}</h1>
          {(flags.venue || flags.date) && (
            <div style={{ marginTop: tall ? 22 : 14, fontFamily: DM, fontWeight: 600, fontSize: tall ? 30 : 24,
                          color: 'rgba(255,255,255,0.9)' }}>
              {flags.venue && <span>{show.venue}{show.city ? ` · ${show.city}` : ''}</span>}
              {flags.venue && flags.date && show.date && <span>{'  ·  '}</span>}
              {flags.date && show.date && <span>{fmtDate(show.date)}</span>}
            </div>
          )}
        </div>

        {flags.setlist && tracks.length > 0 && (
          <div>
            <div style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: tall ? 19 : 16, letterSpacing: '0.24em',
                          color: amber, marginBottom: tall ? 16 : 10 }}>— THE BILL —</div>
            {tracks.map((t, i) => (
              <div key={i} style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: tall ? 38 : 28,
                letterSpacing: '-0.02em', color: '#fff', padding: tall ? '7px 0' : '5px 0' }}>{t}</div>
            ))}
            {setlist.length > tracks.length && (
              <MoreLink n={setlist.length - tracks.length} label="more"
                color={amber} size={tall ? 22 : 18} pad={tall ? 8 : 5} ls="0.06em" onMore={onMore} />
            )}
          </div>
        )}

        <div>
          {flags.vibes && (show.vibes || []).length > 0 && (
            <div style={{ display: 'inline-flex', gap: 16, padding: '12px 28px', borderRadius: 999,
                          border: `2px solid ${amber}`, marginBottom: tall ? 28 : 18 }}>
              {show.vibes.map((v, i) => (
                <span key={v} style={{ fontFamily: OUTFIT, fontWeight: 800, fontSize: tall ? 26 : 21,
                  letterSpacing: '0.05em', textTransform: 'uppercase', color: vibeStyle(v).color || amber }}>
                  {v}{i < show.vibes.length - 1 ? '  ·' : ''}</span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <QrCode size={tall ? 116 : 100} dark="#140C07" />
            <div style={{ textAlign: 'left' }}>
              <Wordmark size={tall ? 38 : 32} color="#fff" />
              <div style={{ fontFamily: DM, fontWeight: 600, fontSize: 21, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>melo.show{handle ? ` · @${handle}` : ''}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
