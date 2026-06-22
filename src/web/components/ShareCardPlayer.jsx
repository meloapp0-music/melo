// Player — music-player UI; the night rendered as a track with transport controls.
import { vibeStyle, getArtistGradient } from '../store';
import { fmtDate } from '../lib/shareCardKit';
import { Wordmark, Equalizer, QrCode, MoreLink } from './ShareCardParts';
import ShareCardPhotos from './ShareCardPhotos';

const OUTFIT = "'Outfit', sans-serif";
const DM = "'DM Sans', sans-serif";

export default function ShareCardPlayer({ show, theme = 'artist', format = '9x16',
                                          photos, flags, anim, handle, onMore }) {
  const tall = format === '9x16';
  const grad = getArtistGradient(show.artist || '');
  const setlist = show.setlist || [];
  const tracks = setlist.slice(0, tall ? 4 : 3);
  const hasPhotos = photos && (show.photos || []).length > 0;
  const Ico = ({ d, s = 44, fill = '#fff' }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={fill}><path d={d} /></svg>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'linear-gradient(180deg,#241a14,#120c08)' }}>
      <div style={{ position: 'absolute', inset: 0, background: grad, opacity: 0.28, filter: 'blur(90px)' }} />
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column',
        padding: tall ? '56px 54px 50px' : '40px 46px 38px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: 19, letterSpacing: '0.24em',
                         color: 'rgba(255,255,255,0.7)' }}>NOW PLAYING</span>
          <Wordmark size={tall ? 38 : 32} color="#fff" />
        </div>

        <div style={{ position: 'relative', width: '100%', height: tall ? 600 : 320, borderRadius: 26, overflow: 'hidden',
          margin: tall ? '36px 0 34px' : '22px 0 20px', boxShadow: '0 30px 70px rgba(0,0,0,0.5)' }}>
          {hasPhotos ? <ShareCardPhotos show={show} layout="hero" on={true} theme={theme} anim={anim} radius={0} /> : (
            <div style={{ position: 'absolute', inset: 0, background: grad, display: 'grid', placeItems: 'center' }}>
              <Equalizer bars={7} w={30} gap={22} h={tall ? 250 : 160} anim={anim}
                grad="linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.45))" />
            </div>
          )}
        </div>

        <h1 style={{ fontFamily: OUTFIT, fontWeight: 800, color: '#fff',
          fontSize: (show.artist || '').length > 13 ? (tall ? 74 : 56) : (tall ? 94 : 68), letterSpacing: '-0.035em',
          lineHeight: 0.96, margin: 0 }}>{show.artist}</h1>
        <div style={{ marginTop: 10, fontFamily: DM, fontWeight: 500, fontSize: tall ? 28 : 22, color: 'rgba(255,255,255,0.62)' }}>
          {flags.venue && <span>{show.venue}{show.city ? ` · ${show.city}` : ''}</span>}
          {flags.venue && flags.date && show.date && <span>{'  ·  '}</span>}
          {flags.date && show.date && <span>{fmtDate(show.date)}</span>}
        </div>

        <div style={{ marginTop: tall ? 26 : 16 }}>
          <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.18)', position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '84%', borderRadius: 999,
              background: 'linear-gradient(90deg,#F4A261,#E8573A)' }} />
            <div style={{ position: 'absolute', left: '84%', top: '50%', width: 16, height: 16, borderRadius: '50%',
              background: '#fff', transform: 'translate(-50%,-50%)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontFamily: DM,
                        fontSize: 19, color: 'rgba(255,255,255,0.5)' }}>
            <span>main set</span><span>encore</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: tall ? 40 : 28,
                      marginTop: tall ? 26 : 14 }}>
          <Ico d="M16.88 2.88 7 12l9.88 9.12V2.88zM6 3h2.4v18H6z" s={tall ? 40 : 32} fill="rgba(255,255,255,0.85)" />
          <div style={{ width: tall ? 96 : 74, height: tall ? 96 : 74, borderRadius: '50%',
            background: 'linear-gradient(135deg,#F4A261,#E8573A)', boxShadow: '0 8px 24px rgba(232,87,58,0.45)',
            display: 'grid', placeItems: 'center' }}>
            <Ico d="M8 5v14l11-7z" s={tall ? 44 : 34} />
          </div>
          <Ico d="M7.12 2.88 17 12l-9.88 9.12V2.88zM18 3h-2.4v18H18z" s={tall ? 40 : 32} fill="rgba(255,255,255,0.85)" />
        </div>

        <div style={{ flex: 1, minHeight: tall ? 18 : 8 }} />

        {flags.setlist && tracks.length > 0 && (
          <div>
            <div style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: tall ? 18 : 15, letterSpacing: '0.2em',
                          color: 'rgba(255,255,255,0.5)', marginBottom: tall ? 10 : 6 }}>FROM THE SET</div>
            {tracks.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: tall ? '11px 0' : '7px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: tall ? 32 : 24, color: '#fff' }}>{t}</span>
                <span style={{ fontFamily: DM, fontSize: tall ? 22 : 18, color: 'rgba(255,255,255,0.4)' }}>♪</span>
              </div>
            ))}
            {setlist.length > tracks.length && (
              <MoreLink n={setlist.length - tracks.length} label="more in the app"
                color="rgba(255,255,255,0.55)" size={tall ? 22 : 18} pad={tall ? 12 : 8} onMore={onMore} />
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: tall ? 26 : 16 }}>
          {flags.vibes && (show.vibes || []).length > 0 ? (
            <div style={{ display: 'flex', gap: 10 }}>
              {show.vibes.map((v) => {
                const c = vibeStyle(v).color || '#F4A261';
                return <span key={v} style={{ fontFamily: DM, fontWeight: 700, fontSize: tall ? 22 : 18,
                  padding: '7px 16px', borderRadius: 999, color: c, background: `${c}22`, border: `1.5px solid ${c}` }}>{v}</span>;
              })}
            </div>
          ) : <span style={{ fontFamily: DM, fontWeight: 600, fontSize: 22, color: 'rgba(255,255,255,0.7)' }}>melo.show{handle ? ` · @${handle}` : ''}</span>}
          <QrCode size={tall ? 124 : 108} dark="#140C07" />
        </div>
      </div>
    </div>
  );
}
