// Photo collage for the share cards — renders the show's real photos
// (show.photos[]) in hero / stack / grid layouts, with a generative warm field +
// equalizer watermark fallback when photos are off or the show has none.
import { themeField } from '../lib/shareCardKit';
import { Equalizer } from './ShareCardParts';

export default function ShareCardPhotos({ show, layout, on, theme, anim, radius = 24 }) {
  const photos = show.photos || [];
  const has = on && photos.length > 0;

  const frame = (url, st) => (
    <div style={{ backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center',
                  backgroundColor: '#1a1320', borderRadius: radius, ...st }} />
  );

  if (has) {
    if (layout === 'hero') {
      return (
        <div style={{ position: 'absolute', inset: 0 }}>
          {frame(photos[0], { position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 0 })}
        </div>
      );
    }
    if (layout === 'stack') {
      const p2 = photos[1] || photos[0];
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <div style={{ position: 'absolute', left: '4%', top: '6%', width: '52%', height: '70%',
                        transform: 'rotate(-5deg)', padding: 14, background: '#fff',
                        borderRadius: radius + 6, boxShadow: '0 18px 50px rgba(0,0,0,0.35)' }}>
            {frame(photos[0], { width: '100%', height: '100%' })}
          </div>
          <div style={{ position: 'absolute', right: '3%', bottom: '4%', width: '50%', height: '66%',
                        transform: 'rotate(6deg)', padding: 14, background: '#fff',
                        borderRadius: radius + 6, boxShadow: '0 18px 50px rgba(0,0,0,0.35)' }}>
            {frame(p2, { width: '100%', height: '100%' })}
          </div>
        </div>
      );
    }
    // grid (3-up): one tall left, two stacked right. Repeat photos if fewer than 3.
    const g = [photos[0], photos[1] || photos[0], photos[2] || photos[1] || photos[0]];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gridTemplateRows: '1fr 1fr',
                    gap: 14, width: '100%', height: '100%' }}>
        <div style={{ gridRow: '1 / 3' }}>{frame(g[0], { width: '100%', height: '100%' })}</div>
        {frame(g[1], { width: '100%', height: '100%' })}
        {frame(g[2], { width: '100%', height: '100%' })}
      </div>
    );
  }

  // generative fallback — warm field + big equalizer watermark
  const field = themeField(theme === 'ember' ? 'artist' : theme, show);
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden', background: field.base }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.16, display: 'grid', placeItems: 'center' }}>
        <Equalizer bars={7} w={26} gap={20} h={220} anim={anim}
          grad="linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.35))" />
      </div>
      <div style={{ position: 'absolute', inset: 0,
                    background: 'radial-gradient(120% 80% at 50% 120%, rgba(0,0,0,0.35), transparent 60%)' }} />
    </div>
  );
}
