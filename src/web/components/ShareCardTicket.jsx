// Ticket — collectible stub: warm bleed framing a cream ticket with a photo
// window, setlist, perforation, barcode + serial, and the scan lockup.
import { themeField, fmtDate } from '../lib/shareCardKit';
import { Wordmark, VibeRow, ScanLockup, MoreLink } from './ShareCardParts';
import ShareCardPhotos from './ShareCardPhotos';

const OUTFIT = "'Outfit', sans-serif";
const DM = "'DM Sans', sans-serif";

export default function ShareCardTicket({ show, theme = 'ember', format = '9x16',
                                          photos, flags, anim, handle, onMore }) {
  const tall = format === '9x16';
  const field = themeField(theme, show);
  const setlist = show.setlist || [];
  const tracks = setlist.slice(0, tall ? 6 : 4);
  const artist = show.artist || '';
  const perf = (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center',
                  gap: 14, margin: tall ? '4px 0 30px' : '2px 0 18px' }}>
      <span style={{ flex: 1, height: 0, borderTop: '3px dashed rgba(61,44,30,0.22)' }} />
      <span style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: 20, letterSpacing: '0.22em',
                     color: 'rgba(61,44,30,0.4)', textTransform: 'uppercase' }}>Admit one · GA</span>
      <span style={{ flex: 1, height: 0, borderTop: '3px dashed rgba(61,44,30,0.22)' }} />
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, background: field.base, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: tall ? 30 : 26, background: '#FAF8F5',
                    borderRadius: 44, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    padding: tall ? '58px 56px 48px' : '40px 46px 36px',
                    boxShadow: '0 30px 80px rgba(61,44,30,0.4)' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
          background: 'radial-gradient(120% 60% at 50% -10%, rgba(232,87,58,0.10), transparent 60%),'
                    + 'radial-gradient(80% 50% at 110% 110%, rgba(244,162,97,0.10), transparent 60%)' }} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Wordmark size={tall ? 44 : 38} color="#3D2C1E" />
            <span style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: 20, letterSpacing: '0.16em',
                           color: '#E8573A', border: '2.5px solid #E8573A', borderRadius: 999, padding: '8px 18px' }}>I WAS THERE</span>
          </div>

          <div style={{ position: 'relative', width: '100%', height: tall ? 548 : 340,
                        marginTop: tall ? 32 : 22, borderRadius: 28, overflow: 'hidden',
                        boxShadow: 'inset 0 0 0 2px rgba(61,44,30,0.08)' }}>
            <ShareCardPhotos show={show} layout={tall ? 'grid' : 'stack'} on={photos}
              theme={theme} anim={anim} radius={18} />
            {flags.rating && show.score != null && (
              <div style={{ position: 'absolute', top: 18, right: 18, background: 'rgba(255,255,255,0.85)',
                            backdropFilter: 'blur(12px)', borderRadius: 18, padding: '10px 16px',
                            fontFamily: OUTFIT, fontWeight: 800, fontSize: 30, color: '#3D2C1E',
                            display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#FFC75F' }}>★</span>{show.score}
              </div>
            )}
          </div>

          <h1 style={{ fontFamily: OUTFIT, fontWeight: 800,
                       fontSize: artist.length > 13 ? (tall ? 92 : 68) : (tall ? 116 : 84),
                       letterSpacing: '-0.035em', lineHeight: 0.98, color: '#3D2C1E',
                       margin: tall ? '30px 0 0' : '20px 0 0' }}>{artist}</h1>
          {flags.venue && (
            <div style={{ fontFamily: DM, fontWeight: 600, fontSize: tall ? 34 : 28, color: '#6B5A4E',
                          marginTop: 16, lineHeight: 1.25 }}>{show.venue}{show.city ? ` · ${show.city}` : ''}</div>
          )}
          {flags.date && show.date && (
            <span style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: tall ? 32 : 26, color: '#E8573A', marginTop: 8 }}>{fmtDate(show.date)}</span>
          )}
          {flags.vibes && (show.vibes || []).length > 0 && (
            <VibeRow vibes={show.vibes} solid={false} size={tall ? 30 : 24} style={{ marginTop: tall ? 24 : 16 }} />
          )}

          {flags.setlist && tracks.length > 0 && (
            <div style={{ marginTop: tall ? 30 : 18 }}>
              <div style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: 19, letterSpacing: '0.2em',
                            color: '#9B8A7E', textTransform: 'uppercase', marginBottom: tall ? 12 : 8 }}>Setlist</div>
              {tracks.map((t, i) => (
                <div key={i} className={anim ? 'mc-reveal' : ''} style={{ display: 'flex', alignItems: 'baseline',
                             gap: 16, padding: tall ? '9px 0' : '6px 0',
                             borderTop: i ? '1px solid rgba(61,44,30,0.10)' : 'none',
                             animationDelay: (0.05 * i + 0.1) + 's' }}>
                  <span style={{ fontFamily: OUTFIT, fontWeight: 800, fontSize: tall ? 24 : 19,
                                 color: '#E8573A', minWidth: tall ? 42 : 32 }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: tall ? 37 : 27,
                                 letterSpacing: '-0.02em', color: '#3D2C1E', lineHeight: 1.08 }}>{t}</span>
                </div>
              ))}
              {setlist.length > tracks.length && (
                <MoreLink n={setlist.length - tracks.length}
                  label={setlist.length - tracks.length === 1 ? 'more song' : 'more songs'}
                  color="#9B8A7E" size={tall ? 23 : 18} pad={tall ? 10 : 7} ls="0.04em" onMore={onMore} />
              )}
            </div>
          )}

          <div style={{ flex: 1, minHeight: 16 }} />
          {perf}

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 34 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'stretch', gap: tall ? 3 : 2, height: tall ? 76 : 56 }}>
                {Array.from({ length: tall ? 40 : 30 }).map((_, i) => {
                  const seed = (i * 13 + (artist.charCodeAt(i % (artist.length || 1)) || 5)) % 7;
                  return <span key={i} style={{ width: (seed % 3) + 2, background: '#3D2C1E', opacity: seed === 0 ? 0.18 : 1 }} />;
                })}
              </div>
              <div style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: tall ? 19 : 16,
                            letterSpacing: '0.13em', color: '#3D2C1E', marginTop: 14 }}>
                NO. {(show.date || '').replace(/-/g, '')} · {(show.city || '').toUpperCase()}
              </div>
              <div style={{ fontFamily: DM, fontWeight: 500, fontSize: tall ? 18 : 15,
                            color: 'rgba(61,44,30,0.55)', marginTop: 5 }}>General admission · one night only</div>
            </div>
            <ScanLockup size={tall ? 150 : 128} align="col" handle={handle} />
          </div>
        </div>
      </div>
    </div>
  );
}
