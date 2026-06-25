// Poster — editorial gig-poster, photo-forward. The default style for shows WITH
// photos; falls back to a generative field + big soundbar motif when none.
import { vibeStyle } from '../store';
import { themeField, fmtDate } from '../lib/shareCardKit';
import { Wordmark, Equalizer, QrCode, MoreLink } from './ShareCardParts';
import ShareCardPhotos from './ShareCardPhotos';

const OUTFIT = "'Outfit', sans-serif";
const DM = "'DM Sans', sans-serif";

export default function ShareCardPoster({ show, theme = 'artist', format = '9x16',
                                          photos, flags, anim, onMore }) {
  const tall = format === '9x16';
  const setlist = show.setlist || [];
  const tracks = setlist.slice(0, tall ? 6 : 4);
  const field = themeField(theme, show);
  const hasPhotos = photos && (show.photos || []).length > 0;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {hasPhotos ? (
        <ShareCardPhotos show={show} layout="hero" on={true} theme={theme} anim={anim} radius={0} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: field.base }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: hasPhotos
        ? 'linear-gradient(180deg, rgba(20,12,7,0.78) 0%, rgba(20,12,7,0.28) 34%, rgba(20,12,7,0.45) 64%, rgba(20,12,7,0.92) 100%)'
        : 'linear-gradient(180deg, rgba(20,12,7,0.62) 0%, rgba(20,12,7,0.12) 32%, rgba(20,12,7,0.30) 60%, rgba(20,12,7,0.9) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'overlay',
        background: 'radial-gradient(140% 90% at 50% 0%, rgba(255,255,255,0.12), rgba(255,255,255,0) 55%)' }} />
      {!hasPhotos && (
        <div className={anim ? 'mc-float' : ''} style={{ position: 'absolute', inset: 0,
              display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <Equalizer bars={9} w={tall ? 28 : 20} gap={tall ? 20 : 15} h={tall ? 380 : 240} anim={anim}
            grad="linear-gradient(180deg, rgba(255,255,255,0.6), rgba(255,255,255,0.18))" />
        </div>
      )}

      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column',
                    padding: tall ? '60px 58px 52px' : '44px 50px 42px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Wordmark size={tall ? 42 : 36} color="#fff" />
          <span style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: 19,
                         letterSpacing: '0.22em', color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>I WAS THERE</span>
        </div>

        <h1 style={{ fontFamily: OUTFIT, fontWeight: 800, textTransform: 'uppercase', color: '#fff',
                     fontSize: (show.artist || '').length > 13 ? (tall ? 90 : 68) : (tall ? 124 : 92),
                     letterSpacing: '-0.04em', lineHeight: 0.9, margin: tall ? '34px 0 0' : '22px 0 0',
                     textShadow: '0 10px 50px rgba(0,0,0,0.5)' }}>{show.artist}</h1>

        {flags.setlist && tracks.length > 0 && (
          <div style={{ marginTop: tall ? 50 : 28 }}>
            <div style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: 20,
                          letterSpacing: '0.24em', color: '#F4A261', marginBottom: 18 }}>THE SETLIST</div>
            {tracks.map((t, i) => (
              <div key={i} className={anim ? 'mc-reveal' : ''}
                style={{ display: 'flex', alignItems: 'baseline', gap: 22, padding: tall ? '14px 0' : '9px 0',
                         borderTop: '1.5px solid rgba(255,255,255,0.18)', animationDelay: (0.08 * i + 0.1) + 's' }}>
                <span style={{ fontFamily: OUTFIT, fontWeight: 800, fontSize: tall ? 30 : 23,
                               color: 'rgba(255,255,255,0.5)', minWidth: tall ? 56 : 44 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: tall ? 46 : 34,
                               lineHeight: 1.05 }}>{t}</span>
              </div>
            ))}
            {setlist.length > tracks.length && (
              <MoreLink n={setlist.length - tracks.length} label="more"
                color="rgba(255,255,255,0.62)" size={tall ? 28 : 21} pad={tall ? 16 : 10} ls="0.02em" onMore={onMore} />
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
          <div>
            {flags.venue && (
              <div style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: tall ? 34 : 27, letterSpacing: '0.02em' }}>{show.venue}</div>
            )}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, fontFamily: DM,
                          fontWeight: 600, fontSize: tall ? 25 : 21, color: 'rgba(255,255,255,0.82)',
                          letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {flags.venue && show.city && <span>{show.city}</span>}
              {flags.date && show.date && <span>· {fmtDate(show.date)}</span>}
            </div>
            {flags.vibes && (show.vibes || []).length > 0 && (
              <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
                {show.vibes.map((v) => {
                  const c = vibeStyle(v).color || '#F4A261';
                  return <span key={v} style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: tall ? 22 : 18,
                    letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fff', background: c,
                    borderRadius: 999, padding: '8px 18px' }}>{v}</span>;
                })}
              </div>
            )}
            <div style={{ marginTop: tall ? 26 : 16 }}>
              <Equalizer bars={9} w={9} gap={7} h={tall ? 50 : 38} anim={anim} />
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <QrCode size={tall ? 152 : 128} dark="#140C07" />
            <div style={{ fontFamily: DM, fontWeight: 600, fontSize: 21, color: 'rgba(255,255,255,0.82)', marginTop: 10 }}>get melo</div>
          </div>
        </div>
      </div>
    </div>
  );
}
